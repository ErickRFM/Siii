import 'server-only';
import {and,eq,inArray,isNull,or,gt,sql,exists,asc,type SQL} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {db} from '@/infrastructure/database';
import {institutions,institutionMemberships,roleAssignments,platformUsers,authSessions,mfaFactors} from '../../../db/schema';
import {getIdentity} from '@/shared/auth/session';
import {uuid} from '@/shared/auth/validation';
import {can,type Capability,type Subject} from '@/shared/auth/capabilities';
import {storedGrant} from '@/shared/auth/institution-policy';
import {sessionIsCurrent,hasFreshStepUp} from '@/shared/auth/mfa-session-policy';
import {SESSION_IDLE_MS} from '@/shared/auth/session-policy';
import {factorIsActive} from '@/shared/auth/mfa-session';
import {privilegedAssuranceAllows} from '@/shared/auth/privileged-policy';
import type {Transaction} from '@/shared/http/request-context';
import {institutionDTO} from './policy';

/** This predicate ignores ONLY the unit's liveness for its own administration.
 * Business access continues to use institutionAccess/readVisibility unchanged. */
export function managementVisibility(userId:string,sessionId:string,institutionId:string|typeof institutions.id):SQL{
 const member=alias(institutionMemberships,'management_member'),grant=alias(roleAssignments,'management_grant'),user=alias(platformUsers,'management_user'),session=alias(authSessions,'management_session'),factor=alias(mfaFactors,'management_factor');
 return exists(db.select({one:sql`1`}).from(member)
  .innerJoin(grant,eq(grant.membershipId,member.id)).innerJoin(user,eq(user.id,member.userId))
  .innerJoin(session,eq(session.userId,user.id)).innerJoin(factor,eq(factor.userId,user.id))
  .where(and(eq(member.institutionId,institutionId),eq(member.userId,userId),eq(member.status,'active'),isNull(member.deletedAt),
   inArray(grant.role,['admin','super_admin']),eq(grant.scopeType,'institution'),isNull(grant.programId),isNull(grant.campusId),isNull(grant.revokedAt),or(isNull(grant.expiresAt),sql`${grant.expiresAt}>clock_timestamp()`),
   eq(user.isActive,true),eq(user.mustChangePassword,false),eq(session.id,sessionId),eq(session.authVersion,user.authVersion),isNull(session.revokedAt),
   sql`${session.expiresAt}>clock_timestamp()`,sql`${session.lastSeenAt}>clock_timestamp()-(${SESSION_IDLE_MS}*interval '1 millisecond')`,
   isNull(factor.revokedAt),sql`${factor.enabledAt} IS NOT NULL`,sql`${session.mfaVerifiedAt}>=${factor.enabledAt}`,sql`${session.mfaVerifiedAt}<=clock_timestamp()`)));
}
/** Landing-page projection; identical authority to the paginated management discovery. */
export async function hasInstitutionManagementPageAccess(identity:{id:string;sessionId:string}){
 const [row]=await db.select({id:institutions.id}).from(institutions).where(managementVisibility(identity.id,identity.sessionId,institutions.id)).limit(1);
 return Boolean(row);
}
export async function managementIdentity(institutionId:string){
 if(!uuid.safeParse(institutionId).success)return null;
 const identity=await getIdentity();
 if(!identity||identity.mustChangePassword)return null;
 const [institution]=await db.select().from(institutions).where(and(eq(institutions.id,institutionId),managementVisibility(identity.id,identity.sessionId,institutionId))).limit(1);
 return institution?{identity,institution}:null;
}
export async function lockManagementContext(tx:Transaction,identity:{id:string;sessionId:string},institutionId:string,capability:Capability){
 const [institution]=await tx.select().from(institutions).where(eq(institutions.id,institutionId)).for('update');
 if(!institution)return null;
 const [user]=await tx.select().from(platformUsers).where(eq(platformUsers.id,identity.id)).for('update');
 if(!user?.isActive||user.mustChangePassword)return null;
 const [factor]=await tx.select().from(mfaFactors).where(eq(mfaFactors.userId,user.id)).for('share');
 const [session]=await tx.select().from(authSessions).where(and(eq(authSessions.id,identity.sessionId),eq(authSessions.userId,user.id))).for('share');
 const [member]=await tx.select().from(institutionMemberships).where(and(eq(institutionMemberships.institutionId,institutionId),eq(institutionMemberships.userId,user.id))).for('update');
 if(!member||member.status!=='active'||member.deletedAt)return null;
 const rows=await tx.select().from(roleAssignments).where(and(eq(roleAssignments.membershipId,member.id),eq(roleAssignments.scopeType,'institution'),inArray(roleAssignments.role,['admin','super_admin']))).orderBy(asc(roleAssignments.id)).for('share');
 // Recompute after every potentially blocking lock, including grants.
 const now=new Date(),grants=rows.map(row=>storedGrant(row,institutionId));
 const subject:Subject={id:user.id,active:user.isActive,mustChangePassword:user.mustChangePassword,grants};
 const assurance={mfaConfigured:factorIsActive(factor??null),mfaVerified:factorIsActive(factor??null)&&!!session?.mfaVerifiedAt,stepUpAt:session?.stepUpAt??null};
 if(!session||!sessionIsCurrent(user,session,factor??null,now)||!privilegedAssuranceAllows(grants,assurance,now,true)||!can(subject,capability,{institutionId,status:'active'},now))return null;
 return {institution,subject,member,session,now,user,factor:factor??null,assurance};
}
async function pageAccess(identity:NonNullable<Awaited<ReturnType<typeof getIdentity>>>,institution:typeof institutions.$inferSelect){
 const [member]=await db.select().from(institutionMemberships).where(and(eq(institutionMemberships.institutionId,institution.id),eq(institutionMemberships.userId,identity.id)));
 if(!member)return null;
 const rows=await db.select().from(roleAssignments).where(and(eq(roleAssignments.membershipId,member.id),isNull(roleAssignments.revokedAt),or(isNull(roleAssignments.expiresAt),gt(roleAssignments.expiresAt,new Date()))));
 const subject:Subject={id:identity.id,active:identity.isActive,mustChangePassword:identity.mustChangePassword,grants:rows.map(row=>storedGrant(row,institution.id))};
 const permits=(capability:Capability)=>can(subject,capability,{institutionId:institution.id,status:'active'},new Date());
 const writable=institution.status!=='archived'&&hasFreshStepUp(identity,new Date());
 if(!(await db.select({id:institutions.id}).from(institutions).where(and(eq(institutions.id,institution.id),managementVisibility(identity.id,identity.sessionId,institution.id))).limit(1)).length)return null;
 return {institution:institutionDTO(institution),actions:{updateSettings:writable&&permits('settings.manage'),changeStatus:writable&&permits('institutions.manage'),readAudit:permits('audit.read')}};
}
export async function getInstitutionManagementPageAccess(institutionId:string){
 const context=await managementIdentity(institutionId);
 return context?pageAccess(context.identity,context.institution):null;
}
export async function listInstitutionManagementPageAccess(){
 const identity=await getIdentity();if(!identity||identity.mustChangePassword)return [];
 const rows=await db.select().from(institutions).where(managementVisibility(identity.id,identity.sessionId,institutions.id));
 const result=await Promise.all(rows.map(row=>pageAccess(identity,row)));
 return result.filter((row):row is NonNullable<typeof row>=>row!==null);
}

export class ManagementAuthorizationExpired extends Error {
 constructor(){super('MANAGEMENT_AUTHORIZATION_EXPIRED');}
}
/** Call after the final possibly blocking write/audit; throw so every prior mutation rolls back. */
export function assertManagementContextCurrent(current:NonNullable<Awaited<ReturnType<typeof lockManagementContext>>>,capability:Capability){
 const now=new Date();
 if(!sessionIsCurrent(current.user,current.session,current.factor,now)||!privilegedAssuranceAllows(current.subject.grants,current.assurance,now,true)||!can(current.subject,capability,{institutionId:current.institution.id,status:'active'},now))throw new ManagementAuthorizationExpired();
}
