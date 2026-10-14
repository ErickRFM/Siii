import {NextRequest,NextResponse} from 'next/server';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {loginBody} from '@/shared/auth/validation';
import {context,audit} from '@/shared/http/request-context';
import {withErrors} from '@/shared/http/route-errors';
import {credentials,credentialTransaction} from '@/shared/auth/credential-flow';
import {clientIp} from '@/shared/auth/throttle';
import {createSession} from '@/shared/auth/session-write';
import {SESSION_COOKIE,cookieOptions} from '@/shared/auth/session-policy';
export const runtime='nodejs';
export const POST=withErrors(async(req:NextRequest)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const parsed=loginBody.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError('INVALID_CREDENTIALS',401);
 const {requestId}=context(req);
 const result=await credentialTransaction(async tx=>{
  const now=new Date();
  const decision=await credentials(tx,{...parsed.data,username:parsed.data.username.toLowerCase(),ip:clientIp(req),requestId,kind:'login'},now);
  if(decision.status!==200)return decision;
  const session=await createSession(tx,decision.user.id,now);
  await audit(tx,{actorUserId:decision.user.id,action:'auth.login',target:'user:'+decision.user.id,requestId,details:{after:{sessionRevocations:session.revoked}}});
  return {status:200 as const,...session,mustChangePassword:decision.user.mustChangePassword};
 });
 if(result.status!==200)return jsonError(result.status===429?'RATE_LIMITED':'INVALID_CREDENTIALS',result.status);
 const response=NextResponse.json({ok:true,mustChangePassword:result.mustChangePassword},{headers:{'Cache-Control':'no-store'}});
 response.cookies.set(SESSION_COOKIE,result.token,cookieOptions(result.expires));
 return response;
});
