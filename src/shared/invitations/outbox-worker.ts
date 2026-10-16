import {randomUUID} from 'node:crypto';
import {and,eq,gt,lt,or,asc} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutions,institutionInvitations,invitationDeliveryOutbox,platformUsers,roleAssignments,institutionMemberships,mfaFactors} from '../../../db/schema';
import {audit,type Transaction} from '@/shared/http/request-context';
import {emailSenderSnapshot,sendFrozenTransactionalEmail,type EmailResult,type FrozenEmailSender,type TransactionalEmail} from '@/infrastructure/email/transactional';
import {openInvitationDelivery} from './delivery-seal';
import {claimableDelivery,nextDeliveryAttempt,usableInvitation} from './state-policy';
import {availableLease,invitationScope} from './storage';
import {lockScope} from '@/shared/auth/privilege-write';
import {factorIsActive} from '@/shared/auth/mfa-session';
import {storedGrant} from '@/shared/auth/institution-policy';
import {can,canGrant,type Subject} from '@/shared/auth/capabilities';
type Transport=(message:TransactionalEmail,sender:FrozenEmailSender)=>Promise<EmailResult>;
async function claim(tx:Transaction,eventId:string,requestId:string){
 const [hint]=await tx.select({event:invitationDeliveryOutbox,invite:institutionInvitations}).from(invitationDeliveryOutbox).innerJoin(institutionInvitations,eq(invitationDeliveryOutbox.invitationId,institutionInvitations.id)).where(eq(invitationDeliveryOutbox.id,eventId)).limit(1);
 if(!hint)return null;
 const [institution]=await tx.select({id:institutions.id}).from(institutions).where(eq(institutions.id,hint.invite.institutionId)).for('update',{skipLocked:true});if(!institution)return null;
 const [issuer]=await tx.select().from(platformUsers).where(eq(platformUsers.id,hint.invite.createdBy)).for('update',{skipLocked:true});if(!issuer)return null;
 const [factor]=await tx.select().from(mfaFactors).where(eq(mfaFactors.userId,issuer.id)).for('share');
 const [member]=await tx.select().from(institutionMemberships).where(eq(institutionMemberships.id,hint.invite.issuerMembershipId)).for('update');
 const [grant]=await tx.select().from(roleAssignments).where(eq(roleAssignments.id,hint.invite.issuerGrantId));
 const parent=await lockScope(tx,invitationScope(hint.invite));
 const [invite]=await tx.select().from(institutionInvitations).where(eq(institutionInvitations.id,hint.invite.id)).for('update');
 const now=new Date();
 const [event]=await tx.select().from(invitationDeliveryOutbox).where(and(eq(invitationDeliveryOutbox.id,eventId),eq(invitationDeliveryOutbox.state,'queued'),availableLease(now))).for('update',{skipLocked:true});
 if(!event)return null;
 if(event.expiresAt<=now||event.attempts>=8){
  await tx.update(invitationDeliveryOutbox).set({state:'failed',leaseToken:null,leaseUntil:null,updatedAt:now,failureCode:event.expiresAt<=now?'INVITATION_EXPIRED':'RETRY_EXHAUSTED'}).where(eq(invitationDeliveryOutbox.id,event.id));
  await audit(tx,{institutionId:event.institutionId,action:'invitation.delivery.failed',target:'delivery:'+event.id,requestId});return null;
 }
 if(!claimableDelivery(event,now))return null;
 const subject:Subject={id:issuer.id,active:issuer.isActive,mustChangePassword:issuer.mustChangePassword,grants:grant?[storedGrant(grant,hint.invite.institutionId)]:[]};
 const activeInstitution=(await tx.select({status:institutions.status}).from(institutions).where(eq(institutions.id,hint.invite.institutionId)))[0]?.status==='active';
 const valid=activeInstitution&&parent&&invite&&usableInvitation(invite,now)&&member?.status==='active'&&member.userId===issuer.id&&factorIsActive(factor)
  &&can(subject,'invitations.manage',{institutionId:hint.invite.institutionId,status:'active'},now)&&canGrant(subject,invite.role,invitationScope(invite),now,invite.grantExpiresAt);
 if(!valid){
  await tx.update(invitationDeliveryOutbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now,failureCode:'INVITATION_EXPIRED'}).where(eq(invitationDeliveryOutbox.id,event.id));
  await audit(tx,{institutionId:event.institutionId,action:'invitation.delivery.cancelled',target:'delivery:'+event.id,requestId});return null;
 }
 const sender=event.senderEmail&&event.replyToEmail?{from:event.senderEmail,replyTo:event.replyToEmail}:emailSenderSnapshot();
 if(!sender){
  await tx.update(invitationDeliveryOutbox).set({leaseToken:null,leaseUntil:null,nextAttemptAt:new Date(now.getTime()+300000),failureCode:'EMAIL_NOT_CONFIGURED',updatedAt:now}).where(eq(invitationDeliveryOutbox.id,event.id));
  return null;
 }
 const leaseToken=randomUUID();
 const [leased]=await tx.update(invitationDeliveryOutbox).set({senderEmail:sender.from,replyToEmail:sender.replyTo,leaseToken,leaseUntil:new Date(now.getTime()+60000),attempts:event.attempts+1,updatedAt:now}).where(eq(invitationDeliveryOutbox.id,event.id)).returning();
 return {event:leased,sender,leaseToken};
}
/** One bounded batch. Network runs after durable claim commit; completion is CAS-owned and cannot resurrect cancellation. */
export async function deliverInvitations(options:{limit?:number;transport?:Transport}={}){
 const limit=options.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('INVALID_DELIVERY_LIMIT');
 const requestId=randomUUID(),now=new Date(),candidates=await db.select({id:invitationDeliveryOutbox.id}).from(invitationDeliveryOutbox)
  .where(and(eq(invitationDeliveryOutbox.state,'queued'),or(lt(invitationDeliveryOutbox.nextAttemptAt,now),eq(invitationDeliveryOutbox.nextAttemptAt,now)),availableLease(now)))
  .orderBy(asc(invitationDeliveryOutbox.nextAttemptAt),asc(invitationDeliveryOutbox.id)).limit(limit);
 const totals={claimed:0,accepted:0,retried:0,failed:0};
 for(const candidate of candidates){
  const leased=await db.transaction(tx=>claim(tx,candidate.id,requestId));if(!leased)continue;totals.claimed++;
  let result:EmailResult|{status:'failed';code:'INVITATION_KEY_UNAVAILABLE'|'INVITATION_DELIVERY_INVALID'};
  try{
   const message=openInvitationDelivery(leased.event.payloadEncrypted,leased.event.id,leased.event.institutionId);
   result=await (options.transport??sendFrozenTransactionalEmail)(message,leased.sender);
  }catch(error){
   result={status:'failed',code:error instanceof Error&&error.message==='INVITATION_KEY_UNAVAILABLE'?'INVITATION_KEY_UNAVAILABLE':'INVITATION_DELIVERY_INVALID'};
  }
  const completed=await db.transaction(async tx=>{
   // Completion touches only this leased event, never acquires user/institution locks in reverse.
   const now=new Date(),next=nextDeliveryAttempt(leased.event.attempts,leased.event.createdAt,now);
   const update=result.status==='accepted'?{state:'accepted' as const,providerMessageId:result.messageId,failureCode:null}:
    (result.status==='retryable'||result.status==='unconfigured')&&next&&next<leased.event.expiresAt?{state:'queued' as const,nextAttemptAt:next,failureCode:result.code}:
    {state:'failed' as const,failureCode:result.status==='retryable'?'RETRY_EXHAUSTED':result.code};
   const [row]=await tx.update(invitationDeliveryOutbox).set({...update,leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(eq(invitationDeliveryOutbox.id,leased.event.id),eq(invitationDeliveryOutbox.state,'queued'),eq(invitationDeliveryOutbox.leaseToken,leased.leaseToken),gt(invitationDeliveryOutbox.leaseUntil,now))).returning({state:invitationDeliveryOutbox.state});
   if(row)await audit(tx,{institutionId:leased.event.institutionId,action:'invitation.delivery.'+row.state,target:'delivery:'+leased.event.id,requestId,details:{after:{state:row.state,attempts:leased.event.attempts}}});
   return row;
  });
  if(completed?.state==='accepted')totals.accepted++;else if(completed?.state==='queued')totals.retried++;else if(completed?.state==='failed')totals.failed++;
 }
 return totals;
}
