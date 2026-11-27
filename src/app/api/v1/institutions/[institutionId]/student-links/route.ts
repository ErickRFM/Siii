import {NextResponse,type NextRequest} from 'next/server';
import {and,desc,eq,isNull} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/infrastructure/database';
import {studentAccountLinks,institutionalStudents,institutionMemberships,platformUsers} from '../../../../../../../db/schema';
import {authorizeCapability} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {audit,context} from '@/shared/http/request-context';
import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';

export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
const LIMIT=200;
const revokeBody=z.strictObject({id:z.uuid(),reason:z.string().trim().min(3).max(500)});
const authorize=(institutionId:string)=>authorizeCapability(institutionId,'student.links.manage',{institutionId,status:'active'},true);

/** Active student ↔ account links (audit A3): the only place a wrong link can be corrected. */
export const GET=withDomainErrors(async(_req:NextRequest,{params}:Ctx)=>{
 const {institutionId}=await params;if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);
 if(!await authorize(institutionId))return jsonError('FORBIDDEN',403);
 const rows=await db.select({id:studentAccountLinks.id,createdAt:studentAccountLinks.createdAt,studentId:institutionalStudents.id,enrollmentNumber:institutionalStudents.enrollmentNumber,
  firstName:institutionalStudents.firstName,lastName:institutionalStudents.lastName,membershipId:institutionMemberships.id,username:platformUsers.username})
  .from(studentAccountLinks)
  .innerJoin(institutionalStudents,and(eq(institutionalStudents.id,studentAccountLinks.studentId),eq(institutionalStudents.institutionId,studentAccountLinks.institutionId)))
  .innerJoin(institutionMemberships,and(eq(institutionMemberships.id,studentAccountLinks.membershipId),eq(institutionMemberships.institutionId,studentAccountLinks.institutionId)))
  .innerJoin(platformUsers,eq(platformUsers.id,institutionMemberships.userId))
  .where(and(eq(studentAccountLinks.institutionId,institutionId),isNull(studentAccountLinks.revokedAt)))
  .orderBy(desc(studentAccountLinks.createdAt),desc(studentAccountLinks.id)).limit(LIMIT+1);
 return NextResponse.json({data:rows.slice(0,LIMIT),truncated:rows.length>LIMIT},{headers});
});

/** Revokes one active link with a reason. Companion authority stops on its next live check. */
export const PATCH=withDomainErrors(async(req:NextRequest,{params}:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await params;if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);
 const access=await authorize(institutionId);if(!access)return jsonError('FORBIDDEN',403);
 const parsed=revokeBody.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const {requestId}=context(req);
 const data=await domainTransaction(access,{capability:'student.links.manage'},async tx=>{
  const [row]=await tx.update(studentAccountLinks).set({revokedAt:new Date()})
   .where(and(eq(studentAccountLinks.id,parsed.data.id),eq(studentAccountLinks.institutionId,institutionId),isNull(studentAccountLinks.revokedAt))).returning();
  if(!row)return null;
  await audit(tx,{actorUserId:access.identity.id,institutionId,requestId,action:'student.link.revoked',target:'student_account_link:'+row.id,
   details:{before:{studentId:row.studentId,membershipId:row.membershipId},after:{revoked:true,reason:parsed.data.reason}}});
  return {id:row.id,revokedAt:row.revokedAt};
 });
 return data?NextResponse.json({data},{headers}):jsonError('LINK_NOT_ACTIVE',404);
});
