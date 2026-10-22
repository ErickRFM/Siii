import {randomUUID} from 'node:crypto';
import {and,eq,asc,or,isNull,lt,gt,lte} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {applicantProfiles,applicantVerificationOutbox as outbox} from '../../../db/schema';
import {audit,type Transaction} from '@/shared/http/request-context';
import {emailSenderSnapshot,sendFrozenTransactionalEmail,type TransactionalEmail,type FrozenEmailSender,type EmailResult} from '@/infrastructure/email/transactional';
import {nextDeliveryAttempt} from '@/shared/invitations/state-policy';
import {openApplicantDelivery} from './identity';

type Transport=(message:TransactionalEmail,sender:FrozenEmailSender)=>Promise<EmailResult>;
const leaseAvailable=(now:Date)=>or(isNull(outbox.leaseUntil),lt(outbox.leaseUntil,now));
async function claim(tx:Transaction,id:string,requestId:string){
 const [hint]=await tx.select().from(outbox).where(eq(outbox.id,id));if(!hint)return null;
 const [profile]=await tx.select().from(applicantProfiles).where(eq(applicantProfiles.id,hint.applicantId)).for('update',{skipLocked:true});if(!profile)return null;
 const now=new Date(),[event]=await tx.select().from(outbox).where(and(eq(outbox.id,id),eq(outbox.state,'queued'),leaseAvailable(now))).for('update',{skipLocked:true});if(!event)return null;
 if(event.expiresAt<=now||event.attempts>=8||profile.mailboxVerifiedAt||profile.verificationTokenHash!==event.tokenHash){
  await tx.update(outbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now,failureCode:'VERIFICATION_UNAVAILABLE'}).where(eq(outbox.id,id));return null;
 }
 if(event.nextAttemptAt>now)return null;
 const sender=event.senderEmail&&event.replyToEmail?{from:event.senderEmail,replyTo:event.replyToEmail}:emailSenderSnapshot();
 if(!sender){await tx.update(outbox).set({nextAttemptAt:new Date(now.getTime()+60000),failureCode:'EMAIL_NOT_CONFIGURED',updatedAt:now}).where(eq(outbox.id,id));return null;}
 const leaseToken=randomUUID(),[leased]=await tx.update(outbox).set({senderEmail:sender.from,replyToEmail:sender.replyTo,attempts:event.attempts+1,leaseToken,leaseUntil:new Date(now.getTime()+60000),updatedAt:now}).where(eq(outbox.id,id)).returning();
 await audit(tx,{action:'admissions.delivery.claimed',target:'delivery:'+id,requestId});return {event:leased,sender,leaseToken};
}
/** Provider acceptance alone never verifies an address. Expired/revoked proofs cannot authenticate. */
export async function deliverApplicantVerifications(options:{limit?:number;transport?:Transport}={}){
 const limit=options.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_DELIVERY_LIMIT');
 const now=new Date(),requestId=randomUUID(),rows=await db.select({id:outbox.id}).from(outbox).where(and(eq(outbox.state,'queued'),lte(outbox.nextAttemptAt,now),leaseAvailable(now))).orderBy(asc(outbox.nextAttemptAt),asc(outbox.id)).limit(limit);
 const totals={claimed:0,accepted:0,retried:0,failed:0};
 for(const row of rows){
  const leased=await db.transaction(tx=>claim(tx,row.id,requestId));if(!leased)continue;totals.claimed++;
  let result:EmailResult|{status:'failed';code:'DELIVERY_INVALID'|'DELIVERY_KEY_UNAVAILABLE'};
  try{const message=openApplicantDelivery(leased.event.payloadEncrypted,leased.event.id,leased.event.applicantId);result=await(options.transport??((message,sender)=>sendFrozenTransactionalEmail(message,sender,undefined,'admissions')))(message,leased.sender);}
  catch(error){result={status:'failed',code:error instanceof Error&&error.message==='DELIVERY_KEY_UNAVAILABLE'?'DELIVERY_KEY_UNAVAILABLE':'DELIVERY_INVALID'};}
  const completed=await db.transaction(async tx=>{
   const now=new Date(),next=nextDeliveryAttempt(leased.event.attempts,leased.event.createdAt,now);
   const update=result.status==='accepted'?{state:'accepted' as const,providerMessageId:result.messageId,failureCode:null}:(result.status==='retryable'||result.status==='unconfigured')&&next&&next<leased.event.expiresAt?{state:'queued' as const,nextAttemptAt:next,failureCode:result.code}:{state:'failed' as const,failureCode:result.status==='retryable'?'RETRY_EXHAUSTED':result.code};
   const [updated]=await tx.update(outbox).set({...update,leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(eq(outbox.id,leased.event.id),eq(outbox.state,'queued'),eq(outbox.leaseToken,leased.leaseToken),gt(outbox.leaseUntil,now))).returning({state:outbox.state});
   if(updated)await audit(tx,{action:'admissions.delivery.'+updated.state,target:'delivery:'+leased.event.id,requestId});return updated;
  });
  if(completed?.state==='accepted')totals.accepted++;else if(completed?.state==='queued')totals.retried++;else if(completed?.state==='failed')totals.failed++;
 }
 return totals;
}
