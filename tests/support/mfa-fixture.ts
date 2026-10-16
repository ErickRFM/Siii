import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {generate} from 'otplib';
import {NodeCryptoPlugin} from '@otplib/plugin-crypto-node';
import {digestRecoveryCode} from '../../src/shared/auth/mfa-primitives';

export function fixtureCookie(response:Response,name='siii_session'){
 const value=response.headers.getSetCookie().find(value=>value.startsWith(name+'='))?.split(';')[0]??'';
 return value.split('=')[1]?value:'';
}
async function post(base:string,path:string,body:unknown,cookie:string){
 return fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json',cookie},body:JSON.stringify(body),redirect:'manual'});
}
// Isolated fixture data only: every login/step-up still consumes a genuine single-use recovery code over HTTP.
export async function fixtureRecovery(sql:pg.Client,username:string){
 const [factor]=(await sql.query('SELECT f.id,f.user_id FROM auth_mfa_factors f JOIN platform_users u ON u.id=f.user_id WHERE u.username=$1 AND f.enabled_at IS NOT NULL AND f.revoked_at IS NULL',[username])).rows;
 if(!factor)throw new Error('FIXTURE_FACTOR_REQUIRED');
 const recoveryCode=randomBytes(16).toString('hex').toUpperCase();
 await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[factor.user_id,factor.id,digestRecoveryCode(recoveryCode,factor.user_id)]);
 return recoveryCode;
}
export async function fixtureMfaLogin(sql:pg.Client,base:string,username:string,password:string,response:Response,critical=true){
 let cookie=fixtureCookie(response);
 const challenge=fixtureCookie(response,'siii_mfa_challenge');
 if(response.status!==200)return cookie;
 if(challenge){
  const verified=await post(base,'/api/v1/auth/mfa/challenge',{recoveryCode:await fixtureRecovery(sql,username)},challenge);
  if(verified.status!==200)throw new Error('FIXTURE_MFA_LOGIN_FAILED');
  cookie=fixtureCookie(verified);
 }else{
  const status=await fetch(base+'/api/v1/auth/mfa',{headers:{cookie}});
  // A mandatory password change intentionally blocks enrollment; existing password-change tests keep that state.
  if(status.status===403)return cookie;
  if(status.status!==200)throw new Error('FIXTURE_MFA_STATUS_FAILED');
  if(!(await status.json()).data.configured){
   const pending=await post(base,'/api/v1/auth/mfa/enroll',{currentPassword:password},cookie);
   if(pending.status===403)return cookie;
   if(pending.status!==201)throw new Error('FIXTURE_MFA_ENROLL_FAILED');
   const {data}=await pending.json();
   const code=await generate({secret:data.secret,crypto:new NodeCryptoPlugin(),algorithm:'sha1',digits:6,period:30});
   const verified=await post(base,'/api/v1/auth/mfa/verify',{enrollmentId:data.enrollmentId,code},cookie);
   if(verified.status!==200)throw new Error('FIXTURE_MFA_VERIFY_FAILED');
   cookie=fixtureCookie(verified);
  }
 }
 if(critical){
  const stepped=await post(base,'/api/v1/auth/mfa/step-up',{currentPassword:password,recoveryCode:await fixtureRecovery(sql,username)},cookie);
  if(stepped.status!==200)throw new Error('FIXTURE_STEP_UP_FAILED');
  cookie=fixtureCookie(stepped);
 }
 return cookie;
}
