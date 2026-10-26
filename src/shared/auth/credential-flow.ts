import {and,eq,gt,isNull} from 'drizzle-orm';
import {authThrottle,platformUsers,authSessions,accountEmailVerifications} from '../../../db/schema';
import {db} from '@/infrastructure/database';
import {audit,type Transaction} from '@/shared/http/request-context';
import {consumeIp,lockThrottle} from './throttle';
import {verifyPassword} from './password';
import {SESSION_IDLE_MS} from './session-policy';
import {lockMfaFactor} from './mfa-session';
import {sessionIsCurrent} from './mfa-session-policy';
export async function credentials(tx:Transaction,input:{username:string;password:string;ip:string;requestId:string;kind:'login'|'password';sessionId?:string},now:Date){
 const action='auth.'+input.kind;
 if(!await consumeIp(tx,input.ip,now)){
  await audit(tx,{action:action+'.throttled',target:'ip:throttled',requestId:input.requestId});
  return {status:429 as const};
 }
 // Only email addresses with accepted invitation ownership proof can act as login aliases.
 // Never authenticate using unverified people.email or institutional membership contact data.
 const [directUser]=await tx.select({id:platformUsers.id}).from(platformUsers)
  .where(eq(platformUsers.username,input.username)).limit(1);
 const [verifiedAlias]=input.kind==='login'&&input.username.includes('@')
  ?await tx.select({userId:accountEmailVerifications.userId}).from(accountEmailVerifications)
   .where(eq(accountEmailVerifications.verifiedEmail,input.username)).limit(1):[];
 const ambiguous=Boolean(directUser&&verifiedAlias&&directUser.id!==verifiedAlias.userId);
 const identityId=ambiguous?undefined:(directUser?.id??verifiedAlias?.userId);
 // Resolve the account key before row locks to preserve established lock ordering.
 const [identity]=identityId?await tx.select({username:platformUsers.username}).from(platformUsers)
  .where(eq(platformUsers.id,identityId)).limit(1):[];
 const account=await lockThrottle(tx,'login_account',identity?.username??input.username,now);
 const [user]=identityId?await tx.select().from(platformUsers)
  .where(eq(platformUsers.id,identityId)).limit(1).for('update'):[];
 const factor=user?await lockMfaFactor(tx,user.id):null;
 now=new Date();
 let verifiedSession:typeof authSessions.$inferSelect|undefined;
 if(input.kind==='password'){
  const [session]=input.sessionId?await tx.select().from(authSessions).where(and(eq(authSessions.id,input.sessionId),eq(authSessions.userId,user?.id??'00000000-0000-0000-0000-000000000000'),isNull(authSessions.revokedAt),gt(authSessions.expiresAt,now),gt(authSessions.lastSeenAt,new Date(now.getTime()-SESSION_IDLE_MS)))).for('share'):[];
  if(!session||!user||!sessionIsCurrent(user,session,factor,new Date())){
   await verifyPassword(user?.passwordHash,input.password);
   await audit(tx,{actorUserId:user?.id,action:'auth.password.blocked',target:user?'user:'+user.id:'session:expired',requestId:input.requestId});
   return {status:401 as const,code:'UNAUTHENTICATED' as const};
  }
  verifiedSession=session;
 }
 now=new Date();
 const expired=!!(user?.lockedUntil&&user.lockedUntil<=now);
 const reset=expired||(account.reset&&!(user?.lockedUntil&&user.lockedUntil>now));
 const attempts=reset?0:user?.failedLoginAttempts??account.failures;
 if(user&&reset)await tx.update(platformUsers).set({failedLoginAttempts:0,lockedUntil:null}).where(eq(platformUsers.id,user.id));
 const blocked=!!((user?.lockedUntil&&user.lockedUntil>now)||(account.blockedUntil&&account.blockedUntil>now));
 const valid=await verifyPassword(user?.isActive?user.passwordHash:null,input.password);
 const target=user?'user:'+user.id:'account:'+account.key;
 if(blocked){
  await audit(tx,{actorUserId:user?.id,action:action+'.blocked',target,requestId:input.requestId});
  return {status:401 as const};
 }
 if(!user||!user.isActive||!valid){
  const failures=attempts+1;
  const delay=Math.min(60,15*2**Math.min(user?.lockoutLevel??0,2))*60000;
  const until=failures>=5?new Date(now.getTime()+delay):null;
  await tx.update(authThrottle).set({failures,blockedUntil:until}).where(eq(authThrottle.key,account.key));
  if(user)await tx.update(platformUsers).set({failedLoginAttempts:failures,lockedUntil:until,...(until?{lockoutLevel:Math.min(user.lockoutLevel+1,3)}:{})}).where(eq(platformUsers.id,user.id));
  await audit(tx,{actorUserId:user?.id,action:action+'.failed',target,requestId:input.requestId,details:{reason:until?'account_locked':'invalid_credentials'}});
  if(until)await audit(tx,{actorUserId:user?.id,action:'auth.account.locked',target,requestId:input.requestId,details:{before:{attempts},after:{attempts:failures,lockedUntil:until}}});
  return {status:401 as const};
 }
 await tx.update(platformUsers).set({failedLoginAttempts:0,lockedUntil:null,lockoutLevel:0}).where(eq(platformUsers.id,user.id));
 await tx.update(authThrottle).set({failures:0,blockedUntil:null,windowStartedAt:now}).where(eq(authThrottle.key,account.key));
 return {status:200 as const,user,factor,session:verifiedSession};
}
export async function credentialTransaction<T extends {status:number}>(operation:(tx:Transaction)=>Promise<T>):Promise<T>{
 const start=performance.now();
 const result=await db.transaction(operation);
 // Equalize residual legacy-hash/protocol variation; IP denial is independent of account existence.
 if(result.status!==429){
  const remaining=250-(performance.now()-start);
  if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
 }
 return result;
}
