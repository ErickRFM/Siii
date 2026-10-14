import 'server-only';
import {cookies} from 'next/headers';
import {and,eq} from 'drizzle-orm';
import {db,assertApplicationRole} from '@/infrastructure/database';
import {authSessions,platformUsers,people} from '../../../db/schema';
import type {Permission} from './roles';
import {SESSION_COOKIE} from './session-policy';
import {digestToken} from './session-write';
import {lockMfaFactor} from './mfa-session';
import {sessionIsCurrent} from './mfa-session-policy';
import {factorIsActive} from './mfa-session';
import {institutionAccess,legacyAllows} from './institution-policy';
import {privilegedAssuranceAllows} from './privileged-policy';
import {can,type Capability,type Resource} from './capabilities';
export {SESSION_COOKIE,SESSION_DAYS} from './session-policy';
export {digestToken,generateToken} from './session-write';
export async function getIdentity(){
 await assertApplicationRole();
 const raw=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))return null;
 return db.transaction(async tx=>{
  const [candidate]=await tx.select({id:authSessions.id,userId:authSessions.userId}).from(authSessions).where(eq(authSessions.tokenHash,digestToken(raw))).limit(1);
  if(!candidate)return null;
  // All credential/privilege operations lock user before session; reads use the same order.
  const [identity]=await tx.select({id:platformUsers.id,username:platformUsers.username,firstName:people.firstName,lastName:people.lastName,mustChangePassword:platformUsers.mustChangePassword,isActive:platformUsers.isActive,authVersion:platformUsers.authVersion})
   .from(platformUsers).innerJoin(people,eq(platformUsers.personId,people.id)).where(and(eq(platformUsers.id,candidate.userId),eq(platformUsers.isActive,true))).limit(1).for('share',{of:platformUsers});
  if(!identity)return null;
  const factor=await lockMfaFactor(tx,identity.id,'share');
  const [session]=await tx.select().from(authSessions).where(and(eq(authSessions.id,candidate.id),eq(authSessions.userId,identity.id))).limit(1).for('update');
  const now=new Date();
  if(!session||!sessionIsCurrent(identity,session,factor,now))return null;
  await tx.update(authSessions).set({lastSeenAt:now}).where(eq(authSessions.id,session.id));
  return {...identity,sessionId:session.id,mfaConfigured:factorIsActive(factor),mfaVerified:factorIsActive(factor)&&!!session.mfaVerifiedAt,stepUpAt:session.stepUpAt};
 });
}
export const getInstitutionAccess=institutionAccess;
export async function institutionContext(institutionId:string){
 const identity=await getIdentity();if(!identity||identity.mustChangePassword)return null;
 const access=(await getInstitutionAccess(identity.id)).find(item=>item.institutionId===institutionId);
 if(!access)return null;
 return {identity,access,subject:{id:identity.id,active:identity.isActive,mustChangePassword:identity.mustChangePassword,grants:access.grants}};
}
export async function authorizeCapability(institutionId:string,capability:Capability,resource:Resource={institutionId,status:'active'},critical=false){
 const context=await institutionContext(institutionId);if(!context)return null;
 const now=new Date();
 return resource.institutionId===institutionId&&can(context.subject,capability,resource,now)&&privilegedAssuranceAllows(context.access.grants,context.identity,now,critical)?context:null;
}
export async function authorizeInstitution(institutionId:string,permission:Permission){
 const context=await institutionContext(institutionId);if(!context)return null;
 const now=new Date(),critical=permission==='roles.assign'||permission==='users.manage';
 return legacyAllows(context.subject,permission,institutionId,now)&&privilegedAssuranceAllows(context.access.grants,context.identity,now,critical)?context:null;
}
