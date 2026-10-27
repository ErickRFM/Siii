import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest,NextResponse } from 'next/server';
import { and,eq,desc } from 'drizzle-orm';
import { z } from 'zod';
import { tutoringCases,institutionalStudents,institutionalTeachers,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { tutorCreate,tutorDecision } from '@/modules/services/validation';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
async function identifier(c:Ctx){const p=await c.params;return z.uuid().safeParse(p.institutionId).success?p.institutionId:null;}
export const GET=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 // Case notes are sensitive; generic academic.read/academic.manage are not sufficient.
 const access=await authorizeInstitution(id,'users.manage');if(!access)return jsonError('FORBIDDEN',403);
 const rows=await domainTransaction(access,{permission:'users.manage'},async tx=>{
  const data=await tx.select().from(tutoringCases).where(eq(tutoringCases.institutionId,id)).orderBy(desc(tutoringCases.createdAt)).limit(200);
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:access.identity.id,action:'tutoring.notes.read',target:'tutoring:'+id,details:{after:{caseIds:data.map(row=>row.id)}}});return data;
 });
 return NextResponse.json({data:rows,truncated:rows.length===200},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const auth=await authorizeInstitution(id,'users.manage');if(!auth)return jsonError('FORBIDDEN',403);
 const parsed=tutorCreate.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const outcome=await domainTransaction(auth,{permission:'users.manage'},async tx=>{
  const [student]=await tx.select({id:institutionalStudents.id}).from(institutionalStudents).where(and(eq(institutionalStudents.id,parsed.data.studentId),eq(institutionalStudents.institutionId,id),eq(institutionalStudents.status,'active'))).limit(1);
  const [teacher]=await tx.select({id:institutionalTeachers.id}).from(institutionalTeachers).where(and(eq(institutionalTeachers.id,parsed.data.teacherId),eq(institutionalTeachers.institutionId,id),eq(institutionalTeachers.status,'active'))).limit(1);
  if(!student||!teacher)return null;
  const [row]=await tx.insert(tutoringCases).values({...parsed.data,institutionId:id}).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:auth.identity.id,action:'tutoring.case.create',target:'case:'+row.id});
  return row;
 });
 return outcome?NextResponse.json({data:outcome},{status:201,headers}):jsonError('STUDENT_OR_TUTOR_UNAVAILABLE',422);
});
export const PATCH=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const auth=await authorizeInstitution(id,'users.manage');if(!auth)return jsonError('FORBIDDEN',403);
 const parsed=tutorDecision.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const result=await domainTransaction(auth,{permission:'users.manage'},async tx=>{
  const [row]=await tx.select().from(tutoringCases).where(and(eq(tutoringCases.id,parsed.data.id),eq(tutoringCases.institutionId,id))).limit(1);
  if(!row)return {error:'NOT_FOUND',status:404} as const;
  if(!((row.status==='OPEN'&&parsed.data.status==='RESOLVED')||(row.status==='RESOLVED'&&parsed.data.status==='CLOSED')))
   return {error:'INVALID_CASE_TRANSITION',status:409} as const;
  const [changed]=await tx.update(tutoringCases).set({status:parsed.data.status,updatedAt:new Date()})
   .where(and(eq(tutoringCases.id,row.id),eq(tutoringCases.institutionId,id))).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:auth.identity.id,action:'tutoring.case.'+parsed.data.status.toLowerCase(),target:'case:'+changed.id});
  return {data:changed,status:200} as const;
 });
 return 'error'in result&&typeof result.error==='string'?jsonError(result.error,result.status):
 NextResponse.json({data:'data'in result?result.data:null},{headers});
});
