import {personScheduleConflict} from '@/modules/scheduling/person-conflict';
import {domainTransaction,withDomainErrors,DomainConflict} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest,NextResponse } from 'next/server';
import { eq,and,desc,sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { academicSections,institutionalStudents,sectionEnrollments,gradePublications,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { registryCreate,registryUpdate,canEnroll } from '@/modules/registry/validation';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
const headers={'Cache-Control':'no-store'};
async function valid(ctx:Ctx){const {institutionId}=await ctx.params;return z.uuid().safeParse(institutionId).success?institutionId:null;}
function fail(e:unknown){const x=e as {code?:string;cause?:{code?:string}};const c=x.code??x.cause?.code;if(c==='23505')return jsonError('ALREADY_ENROLLED',409);if(c==='23503'||c==='23514')return jsonError('INSTITUTIONAL_CONSTRAINT',422);throw e;}
export const GET=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 if(!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const sectionId=req.nextUrl.searchParams.get('sectionId');
 if(sectionId&&!z.uuid().safeParse(sectionId).success)return jsonError('VALIDATION_ERROR',422);
 const data=await db.select().from(sectionEnrollments).where(and(eq(sectionEnrollments.institutionId,id),...(sectionId?[eq(sectionEnrollments.sectionId,sectionId)]:[]))).orderBy(desc(sectionEnrollments.createdAt)).limit(200);
 return NextResponse.json({data,truncated:data.length===200},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=registryCreate.enrollments.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 try{
  const result=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
    // Lock the section row, serializing concurrent enrollment requests into the same section.
    const locked=await tx.execute(sql`SELECT id FROM academic_sections WHERE id=${parsed.data.sectionId} AND institution_id=${id} FOR UPDATE`);
    if(!locked.rows.length)return {error:'SECTION_NOT_FOUND'} as const;
    const [section]=await tx.select().from(academicSections).where(and(eq(academicSections.id,parsed.data.sectionId),eq(academicSections.institutionId,id))).limit(1);
    const [student]=await tx.select().from(institutionalStudents).where(and(eq(institutionalStudents.id,parsed.data.studentId),eq(institutionalStudents.institutionId,id))).limit(1);
    if(!section||!student)return {error:'STUDENT_OR_SECTION_NOT_FOUND'} as const;
    const [total]=await tx.select({count:sql<number>`COUNT(*)::int`}).from(sectionEnrollments).where(and(eq(sectionEnrollments.sectionId,section.id),eq(sectionEnrollments.institutionId,id),eq(sectionEnrollments.status,'enrolled')));
    if(!canEnroll(student.status,section.status,total.count,section.capacity))return {error:'CAPACITY_OR_STATUS_BLOCKED'} as const;
    const [published]=await tx.select({id:gradePublications.id}).from(gradePublications).where(and(eq(gradePublications.institutionId,id),eq(gradePublications.sectionId,section.id))).limit(1);
    if(published)throw new DomainConflict('ACTA_ROSTER_FROZEN');
    if(await personScheduleConflict(tx,id,section.id,student.id,'student'))throw new DomainConflict('SCHEDULE_CONFLICT');
    const [row]=await tx.insert(sectionEnrollments).values({...parsed.data,institutionId:id}).returning();
    await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:id,action:'enrollment.create',target:'enrollment:'+row.id});
    return {data:row};
  });
  return 'data' in result?NextResponse.json({data:result.data},{status:201,headers}):jsonError(result.error,409);
 }catch(e){return fail(e)}
});
export const PATCH=withDomainErrors(async (req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await valid(ctx);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=registryUpdate.enrollments.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 try{
  const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
    const [candidate]=await tx.select().from(sectionEnrollments).where(and(eq(sectionEnrollments.id,parsed.data.id),eq(sectionEnrollments.institutionId,id))).limit(1);
    if(candidate){const [published]=await tx.select({id:gradePublications.id}).from(gradePublications).where(and(eq(gradePublications.institutionId,id),eq(gradePublications.sectionId,candidate.sectionId))).limit(1);if(published)throw new DomainConflict('ACTA_ROSTER_FROZEN');}
    const [row]=await tx.update(sectionEnrollments).set({status:'withdrawn',updatedAt:new Date()}).where(and(eq(sectionEnrollments.id,parsed.data.id),eq(sectionEnrollments.institutionId,id),eq(sectionEnrollments.status,'enrolled'))).returning();
    if(!row)return null;
    await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),actorUserId:access.identity.id,institutionId:id,action:'enrollment.withdraw',target:'enrollment:'+row.id});
    return row;
  });
  return data?NextResponse.json({data},{headers}):jsonError('NOT_ENROLLED',409);
 }catch(e){return fail(e)}
});
