import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {and,eq,isNull,sql} from 'drizzle-orm';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/infrastructure/database';
import {applicantProfiles,applicantSessions,applicantVerificationOutbox,authThrottle} from '../../../db/schema';
import {audit,context,type Transaction} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {clientIp} from '@/shared/auth/throttle';
import {hashPassword,verifyPassword} from '@/shared/auth/password';
import {sealDelivery,openDelivery} from '@/shared/email/delivery-seal';
import {invitationLink} from '@/shared/invitations/token';
import {emailSenderSnapshot} from '@/infrastructure/email/transactional';
import {scheduleEmailDelivery} from '@/infrastructure/email/after-delivery';
import {applicantRegisterSchema,applicantLoginSchema} from './validation';

export const APPLICANT_COOKIE=process.env.NODE_ENV==='production'?'__Host-siii_applicant_session':'siii_applicant_session';
export const verificationTTL=30*60000,sessionTTL=8*3600000;
export const tokenHash=(token:string)=>createHash('sha256').update('SIII:applicant:v1\0'+token).digest('hex');
const sealConfig=()=>({purpose:'admissions' as const,keys:process.env.SIII_APPLICANT_EMAIL_KEYS,activeKeyId:process.env.SIII_APPLICANT_EMAIL_ACTIVE_KEY_ID});
export const openApplicantDelivery=(payload:string,eventId:string,applicantId:string)=>openDelivery(payload,eventId,applicantId,sealConfig());
export const applicantData=(profile:typeof applicantProfiles.$inferSelect)=>({id:profile.id,email:profile.email,firstName:profile.firstName,lastName:profile.lastName});
export const applicantOk=(data:unknown,status=200)=>NextResponse.json({data},{status,headers:{'Cache-Control':'no-store'}});
// Every browser mutation requires an explicit, same origin. No credential-in-URL fallback.
export const applicantOrigin=(req:NextRequest)=>!!req.headers.get('origin')&&assertSameOrigin(req);
const tokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const proofSchema=z.object({id:z.uuid(),token:tokenSchema,password:z.string().min(1).max(128)}).strict();

/** One row lock serializes each privacy-preserving rate budget. Keys never persist PII. */
export async function applicantBudget(tx:Transaction,scope:'admissions_ip'|'admissions_account',value:string,window:number,limit:number){
 const now=new Date(),key=createHash('sha256').update(scope+'\0'+value).digest('hex');
 const [row]=await tx.insert(authThrottle).values({key,scope,windowStartedAt:now,expiresAt:new Date(now.getTime()+window*2)}).onConflictDoUpdate({target:authThrottle.key,set:{expiresAt:new Date(now.getTime()+window*2)}}).returning();
 const reset=row.windowStartedAt.getTime()+window<=now.getTime(),count=reset?0:row.failures;
 if(count>=limit)return false;
 await tx.update(authThrottle).set({failures:count+1,...(reset?{windowStartedAt:now}:{} )}).where(eq(authThrottle.key,key));return true;
}
async function budget(req:NextRequest,operation:string,email?:string){
 return db.transaction(async tx=>{
  if(!await applicantBudget(tx,'admissions_ip',clientIp(req),60000,100))return false;
  return !email||await applicantBudget(tx,'admissions_account',operation+':'+email,operation==='mail'?3600000:900000,operation==='mail'?3:10);
 });
}
/** Caller owns the profile lock. The bearer exists only in the encrypted mail payload. */
async function issueVerification(tx:Transaction,profile:typeof applicantProfiles.$inferSelect,requestId:string){
 const now=new Date(),expiresAt=new Date(now.getTime()+verificationTTL),token=randomBytes(32).toString('base64url'),eventId=randomUUID();
 const link=new URL(invitationLink(process.env.SIII_PUBLIC_ORIGIN??'',profile.id,token));link.pathname='/admissions/verify';
 const message={eventId,to:profile.email,subject:'Verifica tu correo de aspirante SIII',text:'Confirma que registraste esta cuenta de aspirante. Abre el enlace y escribe la contraseña que elegiste: '+link.toString()+'\nEl enlace vence: '+expiresAt.toISOString()+'. Si no solicitaste este registro, ignora el mensaje.'};
 const payloadEncrypted=sealDelivery(message,eventId,profile.id,sealConfig()),hash=tokenHash(token),sender=emailSenderSnapshot();
 await tx.update(applicantProfiles).set({verificationTokenHash:hash,verificationExpiresAt:expiresAt,updatedAt:now}).where(eq(applicantProfiles.id,profile.id));
 await tx.update(applicantVerificationOutbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(eq(applicantVerificationOutbox.applicantId,profile.id),eq(applicantVerificationOutbox.state,'queued')));
 await tx.insert(applicantVerificationOutbox).values({id:eventId,applicantId:profile.id,tokenHash:hash,payloadEncrypted,expiresAt,createdAt:now,updatedAt:now,senderEmail:sender?.from,replyToEmail:sender?.replyTo,failureCode:sender?null:'EMAIL_NOT_CONFIGURED'});
 await audit(tx,{action:'admissions.verification.requested',target:'applicant:'+profile.id,requestId});
}
const requested=()=>applicantOk({requested:true,message:'Si la cuenta puede verificarse, recibirás un correo. Revisa también correo no deseado.'},202);
export const registerApplicant=withErrors(async(req:NextRequest)=>{
 if(!applicantOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const input=applicantRegisterSchema.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('INVALID_INPUT',422);
 if(!await budget(req,'mail',input.data.email))return requested();
 const passwordHash=await hashPassword(input.data.password);
 try{
  await db.transaction(async tx=>{
   const {password:_,...data}=input.data;void _;
   const [profile]=await tx.insert(applicantProfiles).values({...data,passwordHash}).onConflictDoNothing().returning();
   if(profile)await issueVerification(tx,profile,context(req).requestId);
  });
 }catch(error){if(error instanceof Error&&['DELIVERY_KEY_UNAVAILABLE','INVALID_PUBLIC_ORIGIN'].includes(error.message))return jsonError('EMAIL_UNAVAILABLE',503);throw error;}
 scheduleEmailDelivery('admissions');return requested();
});
export const resendApplicantVerification=withErrors(async(req:NextRequest)=>{
 if(!applicantOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const input=applicantLoginSchema.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('INVALID_INPUT',422);
 if(!await budget(req,'mail',input.data.email))return requested();
 const [hint]=await db.select().from(applicantProfiles).where(sql`lower(btrim(${applicantProfiles.email})) = ${input.data.email}`);
 const valid=await verifyPassword(hint?.passwordHash,input.data.password);
 try{if(hint&&valid)await db.transaction(async tx=>{
  const [profile]=await tx.select().from(applicantProfiles).where(eq(applicantProfiles.id,hint.id)).for('update');
  if(!profile.mailboxVerifiedAt&&profile.passwordHash===hint.passwordHash)await issueVerification(tx,profile,context(req).requestId);
 });}catch(error){if(error instanceof Error&&['DELIVERY_KEY_UNAVAILABLE','INVALID_PUBLIC_ORIGIN'].includes(error.message))return jsonError('EMAIL_UNAVAILABLE',503);throw error;}
 scheduleEmailDelivery('admissions');return requested();
});
export const verifyApplicant=withErrors(async(req:NextRequest)=>{
 if(!applicantOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const input=proofSchema.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VERIFICATION_UNAVAILABLE',400);
 if(!await budget(req,'proof',input.data.id))return jsonError('RATE_LIMITED',429);
 const [hint]=await db.select().from(applicantProfiles).where(eq(applicantProfiles.id,input.data.id));
 const valid=await verifyPassword(hint?.passwordHash,input.data.password);
 const verified=await db.transaction(async tx=>{
  const [profile]=await tx.select().from(applicantProfiles).where(eq(applicantProfiles.id,input.data.id)).for('update');
  const now=new Date();
  if(!profile||!valid||profile.passwordHash!==hint?.passwordHash||profile.mailboxVerifiedAt||!profile.verificationExpiresAt||profile.verificationExpiresAt<=now||profile.verificationTokenHash!==tokenHash(input.data.token))return false;
  await tx.update(applicantProfiles).set({emailVerifiedAt:now,mailboxVerifiedAt:now,verificationTokenHash:null,verificationExpiresAt:null,updatedAt:now}).where(eq(applicantProfiles.id,profile.id));
  await tx.update(applicantVerificationOutbox).set({state:'cancelled',leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(eq(applicantVerificationOutbox.applicantId,profile.id),eq(applicantVerificationOutbox.state,'queued')));
  await audit(tx,{action:'admissions.email.verified',target:'applicant:'+profile.id,requestId:context(req).requestId});return true;
 });return verified?applicantOk({verified:true}):jsonError('VERIFICATION_UNAVAILABLE',400);
});
export const loginApplicant=withErrors(async(req:NextRequest)=>{
 if(!applicantOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const input=applicantLoginSchema.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('INVALID_INPUT',422);
 if(!await budget(req,'login',input.data.email))return jsonError('RATE_LIMITED',429);
 const [hint]=await db.select().from(applicantProfiles).where(sql`lower(btrim(${applicantProfiles.email})) = ${input.data.email}`);
 const valid=await verifyPassword(hint?.passwordHash,input.data.password),raw=randomBytes(32).toString('base64url');
 const profile=await db.transaction(async tx=>{
  if(!hint)return null;
  const [profile]=await tx.select().from(applicantProfiles).where(eq(applicantProfiles.id,hint.id)).for('update');
  if(!valid||profile.passwordHash!==hint.passwordHash||!profile.mailboxVerifiedAt){await audit(tx,{action:'admissions.login.denied',target:'applicant:'+profile.id,requestId:context(req).requestId});return null;}
  const now=new Date();
  // A new login revokes earlier sessions; cookie rotation cannot retain an older principal.
  await tx.update(applicantSessions).set({revokedAt:now}).where(and(eq(applicantSessions.applicantId,profile.id),isNull(applicantSessions.revokedAt)));
  await tx.insert(applicantSessions).values({applicantId:profile.id,tokenHash:tokenHash(raw),createdAt:now,expiresAt:new Date(now.getTime()+sessionTTL)});
  await audit(tx,{action:'admissions.login',target:'applicant:'+profile.id,requestId:context(req).requestId});return profile;
 });
 if(!profile)return jsonError('INVALID_CREDENTIALS_OR_UNVERIFIED',401);
 const response=applicantOk({applicant:applicantData(profile)});
 response.cookies.set(APPLICANT_COOKIE,raw,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:sessionTTL/1000});return response;
});
class ApplicantSessionExpired extends Error {}
/** Profile → session lock order matches login/revocation. A write holds both until commit. */
export async function withApplicant<T>(req:NextRequest,work:(tx:Transaction,profile:typeof applicantProfiles.$inferSelect,session:typeof applicantSessions.$inferSelect)=>Promise<T>){
 const raw=req.cookies.get(APPLICANT_COOKIE)?.value;if(!raw||!tokenSchema.safeParse(raw).success)return null;
 const [hint]=await db.select().from(applicantSessions).where(eq(applicantSessions.tokenHash,tokenHash(raw)));if(!hint)return null;
 try{return await db.transaction(async tx=>{
  const [profile]=await tx.select().from(applicantProfiles).where(eq(applicantProfiles.id,hint.applicantId)).for('share');
  const [session]=await tx.select().from(applicantSessions).where(eq(applicantSessions.id,hint.id)).for('update');
  if(!profile?.mailboxVerifiedAt||!session||session.revokedAt||session.expiresAt<=new Date()||session.tokenHash!==tokenHash(raw))return null;
  const result=await work(tx,profile,session);
  // Time can advance while waiting for catalog locks or transactional audit.
  // Throwing here rolls back writes and folio allocation; returning null would commit them.
  if(session.expiresAt<=new Date())throw new ApplicantSessionExpired();
  return result;
 });}catch(error){if(error instanceof ApplicantSessionExpired)return null;throw error;}
}
export const currentApplicant=withErrors(async(req:NextRequest)=>{
 const data=await withApplicant(req,async(_tx,profile)=>applicantData(profile));return data?applicantOk({applicant:data}):jsonError('UNAUTHORIZED',401);
});
export const logoutApplicant=withErrors(async(req:NextRequest)=>{
 if(!applicantOrigin(req))return jsonError('INVALID_ORIGIN',403);
 await withApplicant(req,async(tx,profile,session)=>{
  await tx.update(applicantSessions).set({revokedAt:new Date()}).where(eq(applicantSessions.id,session.id));
  await audit(tx,{action:'admissions.logout',target:'applicant:'+profile.id,requestId:context(req).requestId});return true;
 });
 const response=applicantOk({loggedOut:true});response.cookies.set(APPLICANT_COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});return response;
});
