import 'server-only';
import {cookies} from 'next/headers';
import {and,eq,isNull} from 'drizzle-orm';
import {db,assertApplicationRole} from '@/infrastructure/database';
import {authSessions,platformUsers,people,institutionMemberships,institutions,roleAssignments} from '../../../db/schema';
import type {Role,Permission} from './roles';
import {hasPermission} from './roles';
import {SESSION_COOKIE} from './session-policy';
import {digestToken} from './session-write';
import {lockMfaFactor} from './mfa-session';
import {sessionIsCurrent} from './mfa-session-policy';
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
  return {...identity,sessionId:session.id};
 });
}
export async function getInstitutionAccess(userId:string){
 const rows=await db.select({institutionId:institutions.id,institutionName:institutions.name,institutionCode:institutions.code,membershipId:institutionMemberships.id,role:roleAssignments.role})
  .from(institutionMemberships).innerJoin(institutions,eq(institutionMemberships.institutionId,institutions.id)).innerJoin(roleAssignments,eq(roleAssignments.membershipId,institutionMemberships.id))
  .where(and(eq(institutionMemberships.userId,userId),eq(institutionMemberships.status,'active'),eq(institutions.status,'active'),isNull(roleAssignments.revokedAt)));
 const grouped=new Map<string,{institutionId:string;institutionName:string;institutionCode:string;membershipId:string;roles:Role[]}>();
 for(const row of rows){
  let entry=grouped.get(row.institutionId);
  if(!entry){entry={institutionId:row.institutionId,institutionName:row.institutionName,institutionCode:row.institutionCode,membershipId:row.membershipId,roles:[]};grouped.set(row.institutionId,entry);}
  entry.roles.push(row.role);
 }
 return [...grouped.values()].sort((a,b)=>a.institutionId.localeCompare(b.institutionId));
}
export async function authorizeInstitution(institutionId:string,permission:Permission){
 const identity=await getIdentity();if(!identity||identity.mustChangePassword)return null;
 const access=(await getInstitutionAccess(identity.id)).find(item=>item.institutionId===institutionId);
 if(!access||!hasPermission(access.roles,permission))return null;
 return {identity,access};
}
