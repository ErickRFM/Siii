import {createHash,randomUUID} from 'node:crypto';
import {and,eq,gt,isNull,or,sql} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {authThrottle,institutionInvitations,invitationDeliveryOutbox} from '../../../db/schema';
import {audit,type Transaction} from '@/shared/http/request-context';
import {clientIp} from '@/shared/auth/throttle';
import type {NextRequest} from 'next/server';
import {sealInvitationDelivery} from './delivery-seal';
import {newInvitationToken,hashInvitationToken,invitationLink} from './token';
import {emailSenderSnapshot} from '@/infrastructure/email/transactional';
import {can,canGrant,type Subject} from '@/shared/auth/capabilities';
import type {StoredGrant} from '@/shared/auth/institution-policy';
import {usableInvitation} from './state-policy';
export type Invitation=typeof institutionInvitations.$inferSelect;
export const invitationScope=(row:Invitation)=>({institutionId:row.institutionId,scopeType:row.scopeType,scopeId:row.scopeType==='program'?row.programId:row.scopeType==='campus'?row.campusId:null});
export function invitationActions(row:Invitation,subject:Subject,grants:readonly StoredGrant[],actorId:string,parentActive=true,now=new Date()){
 const canRevoke=usableInvitation(row,now)&&can(subject,'invitations.manage',{institutionId:row.institutionId,status:'active'},now);
 const original=grants.find(grant=>grant.id===row.issuerGrantId);
 const canResend=canRevoke&&parentActive&&row.createdBy===actorId&&!!original&&canGrant({...subject,grants:[original]},row.role,invitationScope(row),now,row.grantExpiresAt)
  &&row.lastRequestedAt.getTime()+60000<=now.getTime()&&(row.resendWindowAt.getTime()+3600000<=now.getTime()||row.resendCount<3);
 return {canRevoke,canResend};
}
export function invitationDto(row:Invitation,delivery?:{state:string;failureCode:string|null},actions={canResend:false,canRevoke:false}){
 return {id:row.id,email:row.email,role:row.role,...invitationScope(row),expiresAt:row.expiresAt,grantExpiresAt:row.grantExpiresAt,state:row.state,createdAt:row.createdAt,delivery:{state:delivery?.state??'queued',code:delivery?.failureCode??null},actions};
}
export async function budget(tx:Transaction,scope:'invitation_sender'|'invitation_accept_ip',value:string,now:Date){
 const key=createHash('sha256').update(scope+'\0'+value).digest('hex'),window=scope==='invitation_sender'?3600000:60000,limit=scope==='invitation_sender'?20:30;
 const [row]=await tx.insert(authThrottle).values({key,scope,expiresAt:new Date(now.getTime()+window*2),windowStartedAt:now}).onConflictDoUpdate({target:authThrottle.key,set:{expiresAt:new Date(now.getTime()+window*2)}}).returning();
 const reset=row.windowStartedAt.getTime()+window<=now.getTime(),failures=reset?0:row.failures;
 if(failures>=limit)return false;
 await tx.update(authThrottle).set({failures:failures+1,...(reset?{windowStartedAt:now}:{}),expiresAt:new Date(now.getTime()+window*2)}).where(eq(authThrottle.key,key));
 return true;
}
export async function recipientBudget(req:NextRequest,requestId:string){
 return db.transaction(async tx=>{
  const allowed=await budget(tx,'invitation_accept_ip',clientIp(req),new Date());
  if(!allowed)await audit(tx,{action:'invitation.consent.throttled',target:'invitation:unavailable',requestId});
  return allowed;
 });
}
export async function canonicalEmailLock(tx:Transaction,email:string){
 const key=createHash('sha256').update('siii:canonical-email\0'+email).digest('hex');
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
}
export async function candidate(invitationId:string,token:string){
 const [row]=await db.select().from(institutionInvitations).where(eq(institutionInvitations.id,invitationId)).limit(1);
 if(!row)return null;
 let digest:string;try{digest=hashInvitationToken(token,row.id,row.institutionId);}catch{return null;}
 return row.tokenHash===digest?row:null;
}
export async function queue(tx:Transaction,row:Invitation,token:string,now:Date){
 const eventId=randomUUID(),link=invitationLink(process.env.SIII_PUBLIC_ORIGIN??'',row.id,token);
 const payloadEncrypted=sealInvitationDelivery({eventId,to:row.email,subject:'Invitación institucional SIII',text:'Has recibido una invitación institucional. Para revisar y decidir voluntariamente: '+link+'\nLa invitación vence: '+row.expiresAt.toISOString()+'. Si no la esperabas, puedes rechazarla.'},eventId,row.institutionId);
 const sender=emailSenderSnapshot(),expiresAt=new Date(Math.min(row.expiresAt.getTime(),now.getTime()+23*3600000));
 await tx.insert(invitationDeliveryOutbox).values({id:eventId,invitationId:row.id,institutionId:row.institutionId,payloadEncrypted,senderEmail:sender?.from??null,replyToEmail:sender?.replyTo??null,expiresAt,createdAt:now,updatedAt:now,failureCode:sender?null:'EMAIL_NOT_CONFIGURED'});
 return {state:'queued',failureCode:sender?null:'EMAIL_NOT_CONFIGURED'};
}
export async function cancelQueued(tx:Transaction,invitationId:string,now:Date){
 await tx.update(invitationDeliveryOutbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(eq(invitationDeliveryOutbox.invitationId,invitationId),eq(invitationDeliveryOutbox.state,'queued')));
}
export async function lockInvitation(tx:Transaction,row:Invitation,token:string){
 const [current]=await tx.select().from(institutionInvitations).where(and(eq(institutionInvitations.id,row.id),eq(institutionInvitations.institutionId,row.institutionId),eq(institutionInvitations.tokenHash,hashInvitationToken(token,row.id,row.institutionId)),eq(institutionInvitations.state,'pending'),isNull(institutionInvitations.consumedAt),gt(institutionInvitations.expiresAt,new Date()))).for('update');
 return current??null;
}
export async function rotate(tx:Transaction,row:Invitation,now:Date){
 const token=newInvitationToken();
 const [updated]=await tx.update(institutionInvitations).set({tokenHash:hashInvitationToken(token,row.id,row.institutionId),updatedAt:now,lastRequestedAt:now,resendCount:row.resendWindowAt.getTime()+3600000<=now.getTime()?1:row.resendCount+1,resendWindowAt:row.resendWindowAt.getTime()+3600000<=now.getTime()?now:row.resendWindowAt}).where(eq(institutionInvitations.id,row.id)).returning();
 await cancelQueued(tx,row.id,now);await queue(tx,updated,token,now);return updated;
}
export async function deliveryState(tx:Transaction,invitationId:string){
 const rows=await tx.select({state:invitationDeliveryOutbox.state,failureCode:invitationDeliveryOutbox.failureCode,createdAt:invitationDeliveryOutbox.createdAt,id:invitationDeliveryOutbox.id}).from(invitationDeliveryOutbox).where(eq(invitationDeliveryOutbox.invitationId,invitationId));
 return rows.sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()||b.id.localeCompare(a.id))[0];
}
export const unconsumed=(now:Date)=>and(eq(institutionInvitations.state,'pending'),isNull(institutionInvitations.consumedAt),gt(institutionInvitations.expiresAt,now));
export const availableLease=(now:Date)=>or(isNull(invitationDeliveryOutbox.leaseUntil),sql`${invitationDeliveryOutbox.leaseUntil}<=${now}`);
