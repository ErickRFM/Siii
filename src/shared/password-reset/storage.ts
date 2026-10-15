import {randomUUID,createHash} from 'node:crypto';
import {and,eq,inArray} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {platformUsers,accountEmailVerifications,passwordResetRequests,passwordResetOutbox,authThrottle} from '../../../db/schema';
import {audit,type Transaction} from '@/shared/http/request-context';
import {emailSenderSnapshot} from '@/infrastructure/email/transactional';
import {sealResetDelivery} from './delivery-seal';
import {newResetToken,hashResetToken,resetLink} from './token';
export const RESET_TTL_MS=30*60000;
export async function resetBudget(tx:Transaction,scope:'password_reset_account'|'password_reset_ip',value:string,now:Date){
 const key=createHash('sha256').update(scope+'\0'+value).digest('hex'),window=scope==='password_reset_account'?3600000:60000,limit=scope==='password_reset_account'?3:30;
 const [row]=await tx.insert(authThrottle).values({key,scope,windowStartedAt:now,expiresAt:new Date(now.getTime()+window*2)}).onConflictDoUpdate({target:authThrottle.key,set:{expiresAt:new Date(now.getTime()+window*2)}}).returning();
 const reset=row.windowStartedAt.getTime()+window<=now.getTime(),attempts=reset?0:row.failures;if(attempts>=limit)return false;
 await tx.update(authThrottle).set({failures:attempts+1,...(reset?{windowStartedAt:now}:{}),expiresAt:new Date(now.getTime()+window*2)}).where(eq(authThrottle.key,key));return true;
}
export async function cancelResetOutbox(tx:Transaction,ids:string[],now:Date){if(!ids.length)return;await tx.update(passwordResetOutbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(inArray(passwordResetOutbox.resetId,ids),eq(passwordResetOutbox.state,'queued')));}
/** Caller owns the user lock. Never use a tenant contact as global recovery authority. */
export async function issuePasswordReset(tx:Transaction,userId:string,requestId:string){
 const [user]=await tx.select().from(platformUsers).where(eq(platformUsers.id,userId));
 const [verified]=await tx.select().from(accountEmailVerifications).where(eq(accountEmailVerifications.userId,userId)).for('share');
 if(!user?.isActive||!verified)return false;
 const now=new Date();if(!await resetBudget(tx,'password_reset_account',verified.verifiedEmail,now))return false;
 const id=randomUUID(),eventId=randomUUID(),token=newResetToken(),expiresAt=new Date(now.getTime()+RESET_TTL_MS);
 let payloadEncrypted:string;
 try{payloadEncrypted=sealResetDelivery({eventId,to:verified.verifiedEmail,subject:'Restablecimiento de contraseña SIII',text:'Se solicitó restablecer tu contraseña. Solo tú decides la nueva contraseña. Revisa y confirma en: '+resetLink(process.env.SIII_PUBLIC_ORIGIN??'',id,token)+'\nEl enlace vence: '+expiresAt.toISOString()+'. Si no lo solicitaste, ignora este correo. Tu contraseña y segundo factor no han cambiado.'},eventId,userId);}
 catch(error){if(error instanceof Error&&['PASSWORD_RESET_KEY_UNAVAILABLE','INVALID_PUBLIC_ORIGIN'].includes(error.message)){await audit(tx,{action:'auth.password.reset.unconfigured',target:'user:'+userId,requestId});return false;}throw error;}
 const old=await tx.update(passwordResetRequests).set({state:'revoked',consumedAt:now}).where(and(eq(passwordResetRequests.userId,userId),eq(passwordResetRequests.state,'pending'))).returning({id:passwordResetRequests.id});await cancelResetOutbox(tx,old.map(row=>row.id),now);
 await tx.insert(passwordResetRequests).values({id,userId,verifiedEmail:verified.verifiedEmail,authVersion:user.authVersion,tokenHash:hashResetToken(token,id,userId,user.authVersion),expiresAt,createdAt:now});
 const sender=emailSenderSnapshot();await tx.insert(passwordResetOutbox).values({id:eventId,resetId:id,userId,payloadEncrypted,senderEmail:sender?.from??null,replyToEmail:sender?.replyTo??null,expiresAt,createdAt:now,updatedAt:now,failureCode:sender?null:'EMAIL_NOT_CONFIGURED'});
 await audit(tx,{action:'auth.password.reset.requested',target:'reset:'+id,requestId});return true;
}
export async function resetCandidate(id:string,token:string){
 const [row]=await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.id,id));if(!row)return null;
 try{return hashResetToken(token,row.id,row.userId,row.authVersion)===row.tokenHash?row:null;}catch{return null;}
}
export function resetUsable(row:typeof passwordResetRequests.$inferSelect,now:Date){return row.state==='pending'&&row.consumedAt===null&&row.expiresAt>now&&row.attempts<5;}
