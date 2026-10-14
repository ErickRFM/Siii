import {and,eq,inArray,isNull,asc} from 'drizzle-orm';
import {institutions,platformUsers,institutionMemberships,roleAssignments,authSessions} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import {hasPermission,type Permission,type Role} from './roles';
import {lockMfaFactor} from './mfa-session';
import {sessionIsCurrent} from './mfa-session-policy';
export async function lockWriteAccess(
 tx:Transaction,identity:{id:string;sessionId:string},access:{institutionId:string;membershipId:string},
 permission:Permission,target?:{id:string;userId:string}
):Promise<Role[]|null>{
 const [unit]=await tx.select({id:institutions.id}).from(institutions).where(and(eq(institutions.id,access.institutionId),eq(institutions.status,'active'))).for('share');
 if(!unit)return null;
 const ids=[...new Set([identity.id,...(target?[target.userId]:[])])];
 const users=await tx.select({id:platformUsers.id,active:platformUsers.isActive,mustChange:platformUsers.mustChangePassword,authVersion:platformUsers.authVersion}).from(platformUsers).where(inArray(platformUsers.id,ids)).orderBy(asc(platformUsers.id)).for('update');
 const actor=users.find(user=>user.id===identity.id);if(!actor?.active||actor.mustChange)return null;
 const factor=await lockMfaFactor(tx,identity.id,'share');
 const [session]=await tx.select().from(authSessions).where(and(eq(authSessions.id,identity.sessionId),eq(authSessions.userId,identity.id))).for('share');
 const now=new Date();
 if(!session||!sessionIsCurrent({isActive:actor.active,authVersion:actor.authVersion},session,factor,now))return null;
 const members=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.institutionId,access.institutionId),inArray(institutionMemberships.id,[access.membershipId,...(target?[target.id]:[])]))).orderBy(asc(institutionMemberships.id)).for('update');
 const member=members.find(row=>row.id===access.membershipId&&row.userId===identity.id);
 if(!member||member.status!=='active')return null;
 if(target){
  const current=members.find(row=>row.id===target.id&&row.userId===target.userId);
  if(!current||(permission==='roles.assign'&&(current.status!=='active'||!users.find(user=>user.id===target.userId)?.active)))return null;
 }
 const roles=(await tx.select({role:roleAssignments.role}).from(roleAssignments).where(and(eq(roleAssignments.membershipId,member.id),isNull(roleAssignments.revokedAt)))).map(row=>row.role);
 return hasPermission(roles,permission)?roles:null;
}
