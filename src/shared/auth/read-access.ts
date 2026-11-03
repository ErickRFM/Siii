import {and,eq,exists,inArray,isNull,isNotNull,not,or,sql,type SQL} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {db} from '@/infrastructure/database';
import {roleAssignments,institutionMemberships,platformUsers,institutions,authSessions,mfaFactors,academicPrograms,campuses} from '../../../db/schema';
import {can,type Capability,type Subject} from './capabilities';
import type {InstitutionAccess,StoredGrant} from './institution-policy';
import {SESSION_IDLE_MS} from './session-policy';

export function readVisibility(subject:Subject,access:InstitutionAccess,sessionId:string,eligible:readonly StoredGrant[],relation:SQL=sql`true`):SQL{
 if(!eligible.length)return sql`false`;
 const scopeProgram=alias(academicPrograms,'read_scope_program'),scopeCampus=alias(campuses,'read_scope_campus');
 const requiredGrant=alias(roleAssignments,'read_required_mfa_grant'),requiredProgram=alias(academicPrograms,'read_required_mfa_program'),requiredCampus=alias(campuses,'read_required_mfa_campus');
 const requiresMfa=exists(db.select({one:sql`1`}).from(requiredGrant)
  .leftJoin(requiredProgram,and(eq(requiredGrant.programId,requiredProgram.id),eq(requiredProgram.institutionId,access.institutionId)))
  .leftJoin(requiredCampus,and(eq(requiredGrant.campusId,requiredCampus.id),eq(requiredCampus.institutionId,access.institutionId)))
  .where(and(eq(requiredGrant.membershipId,access.membershipId),inArray(requiredGrant.role,['admin','super_admin','control_escolar']),
   isNull(requiredGrant.revokedAt),or(isNull(requiredGrant.expiresAt),sql`${requiredGrant.expiresAt}>clock_timestamp()`),
   or(eq(requiredGrant.scopeType,'institution'),and(eq(requiredGrant.scopeType,'program'),eq(requiredProgram.status,'active')),and(eq(requiredGrant.scopeType,'campus'),eq(requiredCampus.status,'active'))))));
 const verifiedFactor=and(isNotNull(mfaFactors.enabledAt),isNull(mfaFactors.revokedAt),
  sql`${authSessions.mfaVerifiedAt}>=${mfaFactors.enabledAt}`,sql`${authSessions.mfaVerifiedAt}<=clock_timestamp()`);
 return exists(db.select({one:sql`1`}).from(roleAssignments)
  .innerJoin(institutionMemberships,eq(roleAssignments.membershipId,institutionMemberships.id))
  .innerJoin(platformUsers,eq(institutionMemberships.userId,platformUsers.id))
  .innerJoin(institutions,eq(institutionMemberships.institutionId,institutions.id))
  .innerJoin(authSessions,eq(authSessions.userId,platformUsers.id))
  .leftJoin(mfaFactors,eq(mfaFactors.userId,platformUsers.id))
  .leftJoin(scopeProgram,and(eq(roleAssignments.programId,scopeProgram.id),eq(scopeProgram.institutionId,access.institutionId)))
  .leftJoin(scopeCampus,and(eq(roleAssignments.campusId,scopeCampus.id),eq(scopeCampus.institutionId,access.institutionId)))
  .where(and(or(...eligible.map(grant=>and(eq(roleAssignments.id,grant.id),eq(roleAssignments.role,grant.role),eq(roleAssignments.scopeType,grant.scopeType)))),
   eq(institutionMemberships.id,access.membershipId),eq(institutionMemberships.institutionId,access.institutionId),eq(institutionMemberships.status,'active'),
   eq(platformUsers.id,subject.id),eq(platformUsers.isActive,true),eq(platformUsers.mustChangePassword,false),eq(institutions.status,'active'),
   isNull(roleAssignments.revokedAt),or(isNull(roleAssignments.expiresAt),sql`${roleAssignments.expiresAt}>clock_timestamp()`),
   or(eq(roleAssignments.scopeType,'institution'),and(eq(roleAssignments.scopeType,'program'),eq(scopeProgram.status,'active')),and(eq(roleAssignments.scopeType,'campus'),eq(scopeCampus.status,'active'))),relation,
   eq(authSessions.id,sessionId),eq(authSessions.authVersion,platformUsers.authVersion),isNull(authSessions.revokedAt),
   sql`${authSessions.expiresAt}>clock_timestamp()`,sql`${authSessions.lastSeenAt}>clock_timestamp()-(${SESSION_IDLE_MS}*interval '1 millisecond')`,
   or(isNull(mfaFactors.enabledAt),isNotNull(mfaFactors.revokedAt),verifiedFactor),or(not(requiresMfa),verifiedFactor))));
}
export function institutionVisibility(subject:Subject,access:InstitutionAccess,sessionId:string,capability:Capability,now=new Date()){
 const eligible=access.grants.filter(grant=>can({...subject,grants:[grant]},capability,{institutionId:access.institutionId,status:'active'},now));
 return readVisibility(subject,access,sessionId,eligible);
}
