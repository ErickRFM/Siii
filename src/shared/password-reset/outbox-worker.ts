import {randomUUID} from 'node:crypto';
import {and,eq,asc,or,isNull,lt,gt} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {platformUsers,accountEmailVerifications,passwordResetRequests,passwordResetOutbox} from '../../../db/schema';
import {audit,type Transaction} from '@/shared/http/request-context';
import {emailSenderSnapshot,sendFrozenTransactionalEmail,type TransactionalEmail,type FrozenEmailSender,type EmailResult} from '@/infrastructure/email/transactional';
import {openResetDelivery} from './delivery-seal';
import {resetUsable} from './storage';
import {claimableDelivery,nextDeliveryAttempt} from '@/shared/invitations/state-policy';
type Transport=(message:TransactionalEmail,sender:FrozenEmailSender)=>Promise<EmailResult>;
const leaseAvailable=(now:Date)=>or(isNull(passwordResetOutbox.leaseUntil),lt(passwordResetOutbox.leaseUntil,now));
async function claim(tx:Transaction,id:string,requestId:string){
 const [hint]=await tx.select().from(passwordResetOutbox).where(eq(passwordResetOutbox.id,id));if(!hint)return null;
 const [user]=await tx.select().from(platformUsers).where(eq(platformUsers.id,hint.userId)).for('update',{skipLocked:true});if(!user)return null;
 const [reset]=await tx.select().from(passwordResetRequests).where(and(eq(passwordResetRequests.id,hint.resetId),eq(passwordResetRequests.userId,user.id))).for('update');
 const [owner]=await tx.select({email:accountEmailVerifications.verifiedEmail}).from(accountEmailVerifications).where(eq(accountEmailVerifications.userId,user.id)).for('share');
 const now=new Date(),[event]=await tx.select().from(passwordResetOutbox).where(and(eq(passwordResetOutbox.id,id),eq(passwordResetOutbox.state,'queued'),leaseAvailable(now))).for('update',{skipLocked:true});if(!event)return null;
 if(event.expiresAt<=now||event.attempts>=8||!user.isActive||!reset||!resetUsable(reset,now)||reset.authVersion!==user.authVersion||owner?.email!==reset.verifiedEmail){
  await tx.update(passwordResetOutbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now,failureCode:'RESET_UNAVAILABLE'}).where(eq(passwordResetOutbox.id,id));await audit(tx,{action:'auth.password.reset.delivery.cancelled',target:'delivery:'+id,requestId});return null;
 }
 if(!claimableDelivery(event,now))return null;
 const sender=event.senderEmail&&event.replyToEmail?{from:event.senderEmail,replyTo:event.replyToEmail}:emailSenderSnapshot();
 if(!sender){await tx.update(passwordResetOutbox).set({nextAttemptAt:new Date(now.getTime()+300000),failureCode:'EMAIL_NOT_CONFIGURED',updatedAt:now}).where(eq(passwordResetOutbox.id,id));return null;}
 const leaseToken=randomUUID(),[leased]=await tx.update(passwordResetOutbox).set({senderEmail:sender.from,replyToEmail:sender.replyTo,attempts:event.attempts+1,leaseToken,leaseUntil:new Date(now.getTime()+60000),updatedAt:now}).where(eq(passwordResetOutbox.id,id)).returning();return {event:leased,sender,leaseToken};
}
export async function deliverPasswordResets(options:{limit?:number;transport?:Transport}={}){
 const limit=options.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_DELIVERY_LIMIT');
 const now=new Date(),requestId=randomUUID(),rows=await db.select({id:passwordResetOutbox.id}).from(passwordResetOutbox).where(and(eq(passwordResetOutbox.state,'queued'),or(lt(passwordResetOutbox.nextAttemptAt,now),eq(passwordResetOutbox.nextAttemptAt,now)),leaseAvailable(now))).orderBy(asc(passwordResetOutbox.nextAttemptAt),asc(passwordResetOutbox.id)).limit(limit);
 const totals={claimed:0,accepted:0,retried:0,failed:0};
 for(const row of rows){
  const leased=await db.transaction(tx=>claim(tx,row.id,requestId));if(!leased)continue;totals.claimed++;
  let result:EmailResult|{status:'failed';code:'PASSWORD_RESET_KEY_UNAVAILABLE'|'PASSWORD_RESET_DELIVERY_INVALID'};
  try{const message=openResetDelivery(leased.event.payloadEncrypted,leased.event.id,leased.event.userId);result=await(options.transport??((message,sender)=>sendFrozenTransactionalEmail(message,sender,undefined,'password-reset')))(message,leased.sender);}
  catch(error){result={status:'failed',code:error instanceof Error&&error.message==='PASSWORD_RESET_KEY_UNAVAILABLE'?'PASSWORD_RESET_KEY_UNAVAILABLE':'PASSWORD_RESET_DELIVERY_INVALID'};}
  const completed=await db.transaction(async tx=>{
   const now=new Date(),next=nextDeliveryAttempt(leased.event.attempts,leased.event.createdAt,now);
   const update=result.status==='accepted'?{state:'accepted' as const,providerMessageId:result.messageId,failureCode:null}:(result.status==='retryable'||result.status==='unconfigured')&&next&&next<leased.event.expiresAt?{state:'queued' as const,nextAttemptAt:next,failureCode:result.code}:{state:'failed' as const,failureCode:result.status==='retryable'?'RETRY_EXHAUSTED':result.code};
   const [updated]=await tx.update(passwordResetOutbox).set({...update,leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(eq(passwordResetOutbox.id,leased.event.id),eq(passwordResetOutbox.state,'queued'),eq(passwordResetOutbox.leaseToken,leased.leaseToken),gt(passwordResetOutbox.leaseUntil,now))).returning({state:passwordResetOutbox.state});if(updated)await audit(tx,{action:'auth.password.reset.delivery.'+updated.state,target:'delivery:'+leased.event.id,requestId});return updated;
  });
  if(completed?.state==='accepted')totals.accepted++;else if(completed?.state==='queued')totals.retried++;else if(completed?.state==='failed')totals.failed++;
 }
 return totals;
}
