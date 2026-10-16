import {z} from 'zod';
import {NextRequest,NextResponse} from 'next/server';
import {and,eq,isNull} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {platformUsers,accountEmailVerifications,passwordResetRequests} from '../../../db/schema';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {clientIp} from '@/shared/auth/throttle';
import {lockMfaFactor,factorIsActive} from '@/shared/auth/mfa-session';
import {factorBlocked,recordFactorFailure,verifyFactor} from '@/shared/auth/mfa-proof';
import {hashPassword} from '@/shared/auth/password';
import {invalidatePrivileges} from '@/shared/auth/privilege-write';
import {audit,context} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {issuePasswordReset,resetBudget,resetCandidate,resetUsable,cancelResetOutbox} from './storage';
const proof=z.object({resetId:z.uuid(),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
const requestBody=z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254))}).strict();
const completeBody=proof.extend({newPassword:z.string().min(12).max(128),code:z.string().regex(/^\d{6}$/).optional(),recoveryCode:z.string().min(32).max(128).optional()}).strict().refine(value=>!(value.code&&value.recoveryCode));
const ok=(data:unknown,status=200)=>NextResponse.json({data},{status,headers:{'Cache-Control':'no-store'}});
const unavailable=()=>jsonError('RESET_UNAVAILABLE',404);
async function ip(req:NextRequest){return db.transaction(tx=>resetBudget(tx,'password_reset_ip',clientIp(req),new Date()));}
export const requestPasswordReset=withErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const generic=()=>ok({requested:true},202);
 const allowed=await ip(req),parsed=requestBody.safeParse(await req.json().catch(()=>null));if(!allowed||!parsed.success)return generic();
 const [hint]=await db.select({userId:accountEmailVerifications.userId}).from(accountEmailVerifications).where(eq(accountEmailVerifications.verifiedEmail,parsed.data.email));
 if(!hint){await db.transaction(tx=>resetBudget(tx,'password_reset_account',parsed.data.email,new Date()));return generic();}
 await db.transaction(async tx=>{await tx.select({id:platformUsers.id}).from(platformUsers).where(eq(platformUsers.id,hint.userId)).for('update');await issuePasswordReset(tx,hint.userId,context(req).requestId);});return generic();
});
export const previewPasswordReset=withErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);if(!await ip(req))return jsonError('RATE_LIMITED',429);
 const input=proof.safeParse(await req.json().catch(()=>null));if(!input.success)return unavailable();const hint=await resetCandidate(input.data.resetId,input.data.token);if(!hint)return unavailable();
 const result=await db.transaction(async tx=>{
  const [user]=await tx.select().from(platformUsers).where(eq(platformUsers.id,hint.userId)).for('share');if(!user?.isActive)return null;
  const factor=await lockMfaFactor(tx,user.id,'share');const [row]=await tx.select().from(passwordResetRequests).where(eq(passwordResetRequests.id,hint.id)).for('share');
  const [owner]=await tx.select({email:accountEmailVerifications.verifiedEmail}).from(accountEmailVerifications).where(eq(accountEmailVerifications.userId,user.id));
  if(!row||row.tokenHash!==hint.tokenHash||!resetUsable(row,new Date())||row.authVersion!==user.authVersion||owner?.email!==row.verifiedEmail)return null;
  return {resetId:row.id,expiresAt:row.expiresAt,mfaRequired:factorIsActive(factor)};
 });return result?ok(result):unavailable();
});
export const completePasswordReset=withErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);if(!await ip(req))return jsonError('RATE_LIMITED',429);
 const input=completeBody.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const hint=await resetCandidate(input.data.resetId,input.data.token);if(!hint||!resetUsable(hint,new Date()))return unavailable();
 const passwordHash=await hashPassword(input.data.newPassword);
 try{const result=await db.transaction(async tx=>{
  const [user]=await tx.select().from(platformUsers).where(eq(platformUsers.id,hint.userId)).for('update');if(!user?.isActive)return {error:'RESET_UNAVAILABLE',status:404};
  const factor=await lockMfaFactor(tx,user.id),[row]=await tx.select().from(passwordResetRequests).where(eq(passwordResetRequests.id,hint.id)).for('update');
  const [owner]=await tx.select({email:accountEmailVerifications.verifiedEmail}).from(accountEmailVerifications).where(eq(accountEmailVerifications.userId,user.id)).for('share');
  const now=new Date();if(!row||row.tokenHash!==hint.tokenHash||!resetUsable(row,now)||row.authVersion!==user.authVersion||owner?.email!==row.verifiedEmail)return {error:'RESET_UNAVAILABLE',status:404};
  if(factorIsActive(factor)){
   if(await factorBlocked(tx,factor!,now))return {error:'RATE_LIMITED',status:429};
   if(!await verifyFactor(tx,factor!,input.data,now)){
    const failures=await recordFactorFailure(tx,factor!,now);await tx.update(passwordResetRequests).set({attempts:row.attempts+1}).where(eq(passwordResetRequests.id,row.id));
    await audit(tx,{actorUserId:user.id,action:'auth.password.reset.factor.failed',target:'reset:'+row.id,requestId:context(req).requestId});return {error:failures>=5||row.attempts>=4?'RATE_LIMITED':'INVALID_MFA_CODE',status:failures>=5||row.attempts>=4?429:401};
   }
  }else if(input.data.code||input.data.recoveryCode)return {error:'INVALID_MFA_CODE',status:401};
  await tx.update(platformUsers).set({passwordHash,mustChangePassword:false}).where(eq(platformUsers.id,user.id));
  await tx.update(passwordResetRequests).set({state:'consumed',consumedAt:now}).where(eq(passwordResetRequests.id,row.id));
  const old=await tx.update(passwordResetRequests).set({state:'revoked',consumedAt:now}).where(and(eq(passwordResetRequests.userId,user.id),eq(passwordResetRequests.state,'pending'),isNull(passwordResetRequests.consumedAt))).returning({id:passwordResetRequests.id});
  await cancelResetOutbox(tx,[row.id,...old.map(value=>value.id)],now);await invalidatePrivileges(tx,user.id,now);
  await audit(tx,{actorUserId:user.id,action:'auth.password.reset.completed',target:'reset:'+row.id,requestId:context(req).requestId});return {data:{completed:true,requiresLogin:true}};
 });return 'error'in result?jsonError(result.error!,result.status!):ok(result.data);}catch(error){if(error instanceof Error&&['MFA_KEY_UNAVAILABLE','MFA_SECRET_INVALID'].includes(error.message))return jsonError(error.message,503);throw error;}
});
