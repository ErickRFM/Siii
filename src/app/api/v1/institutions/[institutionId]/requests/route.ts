import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest,NextResponse } from 'next/server';
import { and,eq,desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { studentServiceRequests,institutionalStudents,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { requestCreate,requestDecision,nextRequestStatus } from '@/modules/services/validation';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
async function identifier(c:Ctx){const p=await c.params;return z.uuid().safeParse(p.institutionId).success?p.institutionId:null;}
export const GET=withDomainErrors(async (_req:NextRequest,c:Ctx)=>{
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 if(!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const rows=await db.select().from(studentServiceRequests).where(eq(studentServiceRequests.institutionId,id))
  .orderBy(desc(studentServiceRequests.createdAt)).limit(200);
 return NextResponse.json({data:rows,truncated:rows.length===200},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=requestCreate.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const result=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
  const [student]=await tx.select({id:institutionalStudents.id}).from(institutionalStudents)
   .where(and(eq(institutionalStudents.id,parsed.data.studentId),eq(institutionalStudents.institutionId,id),eq(institutionalStudents.status,'active'))).limit(1);
  if(!student)return null;
  const [row]=await tx.insert(studentServiceRequests).values({...parsed.data,institutionId:id}).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:access.identity.id,action:'service.request.submit',target:'request:'+row.id});
  return row;
 });
 return result?NextResponse.json({data:result},{status:201,headers}):jsonError('STUDENT_NOT_ACTIVE',422);
});
export const PATCH=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await identifier(c);if(!id)return jsonError('NOT_FOUND',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=requestDecision.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const result=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
  const [current]=await tx.select().from(studentServiceRequests).where(and(eq(studentServiceRequests.id,parsed.data.id),eq(studentServiceRequests.institutionId,id))).limit(1);
  if(!current)return {error:'NOT_FOUND',status:404} as const;
  if(!nextRequestStatus(current.status,parsed.data.status))return {error:'INVALID_STATUS_TRANSITION',status:409} as const;
  const [changed]=await tx.update(studentServiceRequests).set({status:parsed.data.status,decidedBy:access.identity.id,
    decisionReason:parsed.data.decisionReason,updatedAt:new Date()})
   .where(and(eq(studentServiceRequests.id,current.id),eq(studentServiceRequests.institutionId,id))).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:access.identity.id,action:'service.request.'+parsed.data.status.toLowerCase(),target:'request:'+changed.id,details:{before:{status:current.status,decisionReason:current.decisionReason},after:{status:changed.status,decisionReason:changed.decisionReason}}});
  return {data:changed,status:200} as const;
 });
 return 'error'in result&&typeof result.error==='string'?jsonError(result.error,result.status):
 NextResponse.json({data:'data'in result?result.data:null},{headers});
});
