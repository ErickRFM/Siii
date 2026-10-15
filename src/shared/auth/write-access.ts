import {and,eq,inArray,asc} from 'drizzle-orm';
import {institutions,platformUsers,institutionMemberships,authSessions,mfaFactors} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import type {Permission,Role} from './roles';
import {factorIsActive} from './mfa-session';
import {sessionIsCurrent} from './mfa-session-policy';
import {can,type Capability,type Resource,type Subject} from './capabilities';
import {institutionAccess,legacyAllows} from './institution-policy';
import {privilegedAssuranceAllows} from './privileged-policy';

export async function lockInstitutionContext(
 tx:Transaction,identity:{id:string;sessionId:string},access:{institutionId:string;membershipId:string},
 target?:{id:string;userId:string},critical=false
){
 // All institutional mutations serialize before user locks, including last-admin protection.
 const [unit]=await tx.select({id:institutions.id}).from(institutions).where(and(eq(institutions.id,access.institutionId),eq(institutions.status,'active'))).for('update');
 if(!unit)return null;
 const ids=[...new Set([identity.id,...(target?[target.userId]:[])])].sort();
 const users=await tx.select().from(platformUsers).where(inArray(platformUsers.id,ids)).orderBy(asc(platformUsers.id)).for('update');
 const actor=users.find(user=>user.id===identity.id);if(!actor?.isActive||actor.mustChangePassword)return null;
 // User locks serialize changes to all their factors, sessions and pending challenges.
 const factors=await tx.select().from(mfaFactors).where(inArray(mfaFactors.userId,ids)).orderBy(asc(mfaFactors.userId)).for('share');
 const factor=factors.find(row=>row.userId===identity.id)??null;
 const [session]=await tx.select().from(authSessions).where(and(eq(authSessions.id,identity.sessionId),eq(authSessions.userId,identity.id))).for('share');
 let now=new Date();
 if(!session||!sessionIsCurrent(actor,session,factor,now))return null;
 const members=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.institutionId,access.institutionId),inArray(institutionMemberships.id,[access.membershipId,...(target?[target.id]:[])].sort()))).orderBy(asc(institutionMemberships.id)).for('update');
 const member=members.find(row=>row.id===access.membershipId&&row.userId===identity.id);
 if(!member||member.status!=='active')return null;
 const targetMember=target?members.find(row=>row.id===target.id&&row.userId===target.userId):undefined;
 if(target&&!targetMember)return null;
 now=new Date();
 const currentAccess=(await institutionAccess(identity.id,tx,now)).find(row=>row.institutionId===access.institutionId);
 if(!currentAccess||currentAccess.membershipId!==access.membershipId)return null;
 const assurance={mfaConfigured:factorIsActive(factor),mfaVerified:factorIsActive(factor)&&!!session.mfaVerifiedAt,stepUpAt:session.stepUpAt};
 if(!privilegedAssuranceAllows(currentAccess.grants,assurance,now,critical))return null;
 const subject:Subject={id:actor.id,active:actor.isActive,mustChangePassword:actor.mustChangePassword,grants:currentAccess.grants};
 return {subject,access:currentAccess,session,assurance,now,targetMember,targetUser:target?users.find(user=>user.id===target.userId):undefined,targetFactor:target?factors.find(row=>row.userId===target.userId):undefined};
}
export async function lockWriteCapability(tx:Transaction,identity:{id:string;sessionId:string},access:{institutionId:string;membershipId:string},capability:Capability,resource:Resource={institutionId:access.institutionId,status:'active'},target?:{id:string;userId:string},critical=false){
 const context=await lockInstitutionContext(tx,identity,access,target,critical);
 return context&&resource.institutionId===access.institutionId&&can(context.subject,capability,resource,context.now)?context:null;
}
// Conservative adapter for legacy callers: it retains assurance and cannot flatten scoped grants.
export async function lockWriteAccess(tx:Transaction,identity:{id:string;sessionId:string},access:{institutionId:string;membershipId:string},permission:Permission,target?:{id:string;userId:string}):Promise<Role[]|null>{
 const context=await lockInstitutionContext(tx,identity,access,target,permission==='roles.assign'||permission==='users.manage');
 if(!context||!legacyAllows(context.subject,permission,access.institutionId,context.now))return null;
 if(permission==='roles.assign'&&(!context.targetUser?.isActive||context.targetMember?.status!=='active')&&target)return null;
 return context.access.roles;
}
