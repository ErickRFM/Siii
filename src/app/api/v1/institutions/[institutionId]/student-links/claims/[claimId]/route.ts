import {NextResponse,type NextRequest} from 'next/server';
import {and,eq,isNull,or} from 'drizzle-orm';
import {z} from 'zod';
import {studentClaimRequests,institutionalStudents,studentAccountLinks,institutionMemberships} from '../../../../../../../../../db/schema';
import {authorizeCapability} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {audit,context} from '@/shared/http/request-context';
import {domainTransaction,withDomainErrors,DomainConflict} from '@/modules/consolidation/domain-boundary';

export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string;claimId:string}>};

const claimDecision=z.discriminatedUnion('decision',[
 z.object({decision:z.literal('approve')}).strict(),
 z.object({decision:z.literal('reject'),reason:z.string().trim().min(3).max(500)}).strict(),
]);

class ClaimUnavailable extends Error {}
class ClaimNotReviewable extends Error {constructor(readonly code:string){super(code)}}

/**
 * Control decision for a pending enrollment claim. Approval creates the same
 * student_account_links row the auto-link path creates, with the reviewer as linkedBy.
 * Everything is re-read under lock: stale, foreign, self-reviewed or already linked claims fail closed.
 */
export const PATCH=withDomainErrors(async(req:NextRequest,ctx:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId,claimId}=await ctx.params;
 if(!z.uuid().safeParse(institutionId).success||!z.uuid().safeParse(claimId).success)return jsonError('NOT_FOUND',404);
 const access=await authorizeCapability(institutionId,'student.links.manage',{institutionId,status:'active'},true);if(!access)return jsonError('FORBIDDEN',403);
 const parsed=claimDecision.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const input=parsed.data,{requestId}=context(req);
 try{
  const data=await domainTransaction(access,{capability:'student.links.manage'},async tx=>{
   const [claim]=await tx.select().from(studentClaimRequests)
    .where(and(eq(studentClaimRequests.id,claimId),eq(studentClaimRequests.institutionId,institutionId))).for('update');
   if(!claim||claim.verificationStatus!=='pending')throw new ClaimUnavailable();
   if(claim.applicantUserId===access.identity.id)throw new ClaimNotReviewable('SELF_REVIEW_NOT_ALLOWED');
   const now=new Date();
   if(input.decision==='reject'){
    await tx.update(studentClaimRequests).set({verificationStatus:'rejected',reviewedBy:access.identity.id,rejectionReason:input.reason,updatedAt:now}).where(eq(studentClaimRequests.id,claim.id));
    await audit(tx,{actorUserId:access.identity.id,institutionId,requestId,action:'student.claim.rejected',target:'student_claim:'+claim.id,
     details:{before:{verificationStatus:'pending'},after:{verificationStatus:'rejected'}}});
    return {claimId:claim.id,verificationStatus:'rejected' as const};
   }
   const [member]=await tx.select({id:institutionMemberships.id}).from(institutionMemberships)
    .where(and(eq(institutionMemberships.institutionId,institutionId),eq(institutionMemberships.userId,claim.applicantUserId),eq(institutionMemberships.status,'active'),isNull(institutionMemberships.deletedAt))).for('update');
   if(!member)throw new ClaimNotReviewable('APPLICANT_MEMBERSHIP_INACTIVE');
   const [student]=await tx.select({id:institutionalStudents.id,status:institutionalStudents.status}).from(institutionalStudents)
    .where(and(eq(institutionalStudents.institutionId,institutionId),eq(institutionalStudents.enrollmentNumber,claim.enrollmentNumber))).for('update');
   if(!student)throw new ClaimNotReviewable('STUDENT_NOT_FOUND');
   if(student.status!=='active')throw new ClaimNotReviewable('STUDENT_NOT_ACTIVE');
   const [existing]=await tx.select({id:studentAccountLinks.id}).from(studentAccountLinks)
    .where(and(eq(studentAccountLinks.institutionId,institutionId),isNull(studentAccountLinks.revokedAt),
     or(eq(studentAccountLinks.studentId,student.id),eq(studentAccountLinks.membershipId,member.id)))).for('update');
   if(existing)throw new DomainConflict('ALREADY_LINKED');
   const [link]=await tx.insert(studentAccountLinks).values({institutionId,membershipId:member.id,studentId:student.id,linkedBy:access.identity.id}).returning({id:studentAccountLinks.id});
   await tx.update(studentClaimRequests).set({verificationStatus:'approved',reviewedBy:access.identity.id,rejectionReason:null,updatedAt:now}).where(eq(studentClaimRequests.id,claim.id));
   await audit(tx,{actorUserId:access.identity.id,institutionId,requestId,action:'student.claim.approved',target:'student_claim:'+claim.id,
    details:{before:{verificationStatus:'pending'},after:{verificationStatus:'approved',linkId:link.id,studentId:student.id,membershipId:member.id}}});
   return {claimId:claim.id,verificationStatus:'approved' as const,linkId:link.id};
  });
  return NextResponse.json({data},{headers});
 }catch(error){
  if(error instanceof ClaimUnavailable)return jsonError('CLAIM_UNAVAILABLE',404);
  if(error instanceof ClaimNotReviewable)return jsonError(error.code,error.code==='SELF_REVIEW_NOT_ALLOWED'?403:422);
  const driver=(error as {cause?:{code?:string;constraint?:string}})?.cause??error as {code?:string;constraint?:string};
  if(driver?.code==='23505'&&['student_account_links_active_student_uidx','student_account_links_active_member_uidx'].includes(driver.constraint??''))return jsonError('ALREADY_LINKED',409);
  throw error;
 }
});
