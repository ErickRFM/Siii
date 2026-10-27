import 'server-only';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import {db,assertApplicationRole} from '@/infrastructure/database';
import {securityAuditLog} from '../../../db/schema';
import {audit,type Transaction} from '@/shared/http/request-context';
import {createHash} from 'node:crypto';
import type {AcademicAuthorityCredential} from './authority-signature';

export const authorityRequest=z.object({
 contract:z.literal('siii.academic_authority_request.v1'),institutionId:z.uuid(),kind:z.enum(['student','teacher']),
 externalId:z.string().min(2).max(32).regex(/^[A-Z0-9][A-Z0-9_-]+$/),
}).strict();
export type AuthorityRequest=z.infer<typeof authorityRequest>;
export class AcademicAuthorityError extends Error{
 constructor(readonly code:string,readonly status:number){super(code)}
}

/** A committed audit ID atomically reserves the nonce, including requests later denied. */
export async function reserveAcademicAuthority(credential:AcademicAuthorityCredential,requestId:string){
 await assertApplicationRole();
 const rows=await db.insert(securityAuditLog).values({id:credential.reservationId,institutionId:credential.institutionId,
  action:'companion.authority.requested',target:'academic-authority',requestId,
 }).onConflictDoNothing({target:securityAuditLog.id}).returning({id:securityAuditLog.id});
 return rows.length===1;
}

async function currentManifest(tx:Transaction,input:AuthorityRequest){
 const institution=(await tx.execute(sql`SELECT status FROM institutions WHERE id=${input.institutionId}::uuid`)).rows[0];
 if(!institution||institution.status!=='active')throw new AcademicAuthorityError('SOURCE_INSTITUTION_UNAVAILABLE',403);
 const subject=(await tx.execute(input.kind==='student'
  ?sql`SELECT s.id,s.status,s.program_id,p.status AS program_status FROM institutional_students s JOIN academic_programs p ON p.id=s.program_id AND p.institution_id=s.institution_id WHERE s.institution_id=${input.institutionId}::uuid AND s.enrollment_number=${input.externalId}`
  :sql`SELECT id,status,NULL::uuid AS program_id,'active'::text AS program_status FROM institutional_teachers WHERE institution_id=${input.institutionId}::uuid AND employee_number=${input.externalId}`)).rows[0];
 if(!subject)throw new AcademicAuthorityError('SOURCE_IDENTITY_UNAVAILABLE',404);
 if(subject.status!=='active'||subject.program_status!=='active')throw new AcademicAuthorityError('SOURCE_IDENTITY_REVOKED',403);
 const relation=input.kind==='student'
  ?sql`EXISTS(SELECT 1 FROM section_enrollments e WHERE e.institution_id=s.institution_id AND e.section_id=s.id AND e.student_id=${subject.id as string}::uuid AND e.status='enrolled') AND s.status='open'`
  :sql`EXISTS(SELECT 1 FROM section_teachers a WHERE a.institution_id=s.institution_id AND a.section_id=s.id AND a.teacher_id=${subject.id as string}::uuid AND a.revoked_at IS NULL) AND s.status<>'archived'`;
 const rows=(await tx.execute(sql`
  SELECT s.id AS section_id,v.source_version FROM academic_sections s
  JOIN academic_terms t ON t.id=s.term_id AND t.institution_id=s.institution_id
  JOIN academic_courses c ON c.id=s.course_id AND c.institution_id=s.institution_id
  LEFT JOIN academic_section_versions v ON v.section_id=s.id AND v.institution_id=s.institution_id
  WHERE s.institution_id=${input.institutionId}::uuid AND t.status='active' AND c.status='active' AND ${relation}
  ORDER BY s.id LIMIT 1001
 `)).rows;
 if(rows.length>1000)throw new AcademicAuthorityError('SOURCE_AUTHORITY_LIMIT_EXCEEDED',503);
 const sections=rows.map(row=>({sectionId:row.section_id as string,sourceVersion:Number(row.source_version)}));
 if(sections.some(s=>!Number.isSafeInteger(s.sourceVersion)||s.sourceVersion<1))throw new AcademicAuthorityError('SOURCE_SNAPSHOT_PENDING',503);
 const links=sql.identifier(input.kind==='student'?'student_account_links':'teacher_account_links');
 const subjectColumn=sql.identifier(input.kind==='student'?'student_id':'teacher_id');
 // A verified native identity may have no SIII login. Once linked in SIII, its full live authority applies.
 // Evaluate expiring grants last, using wall time rather than the transaction's start timestamp.
 const linkState=(await tx.execute(sql`
  SELECT count(*)::int AS total,coalesce(bool_or(l.revoked_at IS NULL AND m.status='active' AND m.deleted_at IS NULL AND u.is_active AND NOT u.must_change_password AND EXISTS(
   SELECT 1 FROM role_assignments r WHERE r.membership_id=m.id AND r.role::text=${input.kind} AND r.revoked_at IS NULL
   AND r.created_at<=clock_timestamp() AND (r.expires_at IS NULL OR r.expires_at>clock_timestamp()) AND (r.institution_id IS NULL OR r.institution_id=m.institution_id)
   AND (r.scope_type='institution' OR (${input.kind}='student' AND r.scope_type='program' AND r.scope_program_id=${subject.program_id as string|null}::uuid))
  )),false) AS allowed
  FROM ${links} l JOIN institution_memberships m ON m.id=l.membership_id AND m.institution_id=l.institution_id
  JOIN platform_users u ON u.id=m.user_id WHERE l.institution_id=${input.institutionId}::uuid AND l.${subjectColumn}=${subject.id as string}::uuid
 `)).rows[0] as {total:number;allowed:boolean};
 if(linkState.total>0&&!linkState.allowed)throw new AcademicAuthorityError('SOURCE_ACCOUNT_AUTHORITY_REVOKED',403);
 return {contract:'siii.academic_authority.v1' as const,institutionId:input.institutionId,kind:input.kind,externalId:input.externalId,
  verifiedAt:new Date().toISOString(),sections};
}

export async function academicAuthority(input:AuthorityRequest,requestId:string){
 return db.transaction(async tx=>{
  // Institution writers lock this row first; account changes serialize on user rows.
  // READ COMMITTED and the final live check also observe changes by independent maintenance.
  await tx.execute(sql`SELECT id FROM institutions WHERE id=${input.institutionId}::uuid FOR SHARE`);
  const links=sql.identifier(input.kind==='student'?'student_account_links':'teacher_account_links');
  const subjectTable=sql.identifier(input.kind==='student'?'institutional_students':'institutional_teachers');
  const subjectColumn=sql.identifier(input.kind==='student'?'student_id':'teacher_id');
  const externalColumn=sql.identifier(input.kind==='student'?'enrollment_number':'employee_number');
  await tx.execute(sql`SELECT u.id FROM platform_users u JOIN institution_memberships m ON m.user_id=u.id
   JOIN ${links} l ON l.membership_id=m.id AND l.institution_id=m.institution_id
   JOIN ${subjectTable} s ON s.id=l.${subjectColumn} AND s.institution_id=l.institution_id
   WHERE s.institution_id=${input.institutionId}::uuid AND s.${externalColumn}=${input.externalId}
   ORDER BY u.id FOR SHARE OF u`);
  const manifest=await currentManifest(tx,input);
  const subjectHash=createHash('sha256').update(input.institutionId+'\0'+input.kind+'\0'+input.externalId).digest('hex');
  await audit(tx,{institutionId:input.institutionId,action:'companion.authority.read',target:'academic-identity:'+subjectHash,requestId,
   details:{after:{kind:input.kind,sections:manifest.sections.length}}});
  const final=await currentManifest(tx,input);
  if(JSON.stringify(manifest.sections)!==JSON.stringify(final.sections))throw new AcademicAuthorityError('SOURCE_AUTHORITY_CHANGED',503);
  return final;
 },{isolationLevel:'read committed'});
}
