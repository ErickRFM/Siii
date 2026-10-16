import {NextRequest,NextResponse} from 'next/server';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {loginBody} from '@/shared/auth/validation';
import {context,audit} from '@/shared/http/request-context';
import {credentials,credentialTransaction} from '@/shared/auth/credential-flow';
import {clientIp} from '@/shared/auth/throttle';
import {createSession} from '@/shared/auth/session-write';
import {SESSION_COOKIE,cookieOptions} from '@/shared/auth/session-policy';
import {issueMfaChallenge,MFA_CHALLENGE_COOKIE,withMfaErrors} from '@/shared/auth/mfa';
import {factorIsActive} from '@/shared/auth/mfa-session';
export const runtime='nodejs';
export const POST=withMfaErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const parsed=loginBody.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError('INVALID_CREDENTIALS',401);
 const {requestId}=context(req);
 const result=await credentialTransaction(async tx=>{
  const now=new Date();
  const decision=await credentials(tx,{...parsed.data,username:parsed.data.username.toLowerCase(),ip:clientIp(req),requestId,kind:'login'},now);
  if(decision.status!==200)return decision;
  if(factorIsActive(decision.factor))return issueMfaChallenge(tx,decision.user,decision.factor!,requestId);
  const session=await createSession(tx,decision.user.id,now);
  await audit(tx,{actorUserId:decision.user.id,action:'auth.login',target:'user:'+decision.user.id,requestId,details:{after:{sessionRevocations:session.revoked}}});
  return {status:200 as const,...session,mustChangePassword:decision.user.mustChangePassword};
 });
 if(result.status!==200)return jsonError(result.status===429?'RATE_LIMITED':'INVALID_CREDENTIALS',result.status);
 if('mfaRequired' in result){
  const response=NextResponse.json({mfaRequired:true,expiresAt:result.expires.toISOString()},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(MFA_CHALLENGE_COOKIE,result.token,cookieOptions(result.expires));
  response.cookies.set(SESSION_COOKIE,'',{...cookieOptions(),maxAge:0});
  return response;
 }
 const response=NextResponse.json({ok:true,mustChangePassword:result.mustChangePassword},{headers:{'Cache-Control':'no-store'}});
 response.cookies.set(SESSION_COOKIE,result.token,cookieOptions(result.expires));
 response.cookies.set(MFA_CHALLENGE_COOKIE,'',{...cookieOptions(),maxAge:0});
 return response;
});
