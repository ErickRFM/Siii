import {and,eq,isNull,gt,or,asc} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {institutions,institutionMemberships,roleAssignments,academicPrograms,campuses,platformUsers} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import {can,type Capability,type Grant,type Subject} from './capabilities';
import type {Permission,Role} from './roles';

export type StoredGrant=Grant&{id:string};
export type InstitutionAccess={institutionId:string;institutionName:string;institutionCode:string;membershipId:string;roles:Role[];grants:StoredGrant[]};
export const liveGrant=(now:Date)=>and(isNull(roleAssignments.revokedAt),or(isNull(roleAssignments.expiresAt),gt(roleAssignments.expiresAt,now)));
export function storedGrant(row:typeof roleAssignments.$inferSelect,institutionId:string):StoredGrant{
 return {id:row.id,role:row.role,institutionId,scopeType:row.scopeType,scopeId:row.scopeType==='program'?row.programId:row.scopeType==='campus'?row.campusId:null,validUntil:row.expiresAt,revokedAt:row.revokedAt};
}
export async function institutionAccess(userId:string,executor:typeof db|Transaction=db,now=new Date()){
 const rows=await executor.select({unit:institutions,member:institutionMemberships,grant:roleAssignments})
  .from(institutionMemberships).innerJoin(institutions,eq(institutionMemberships.institutionId,institutions.id))
  .innerJoin(roleAssignments,eq(roleAssignments.membershipId,institutionMemberships.id))
  .leftJoin(academicPrograms,and(eq(roleAssignments.programId,academicPrograms.id),eq(institutionMemberships.institutionId,academicPrograms.institutionId)))
  .leftJoin(campuses,and(eq(roleAssignments.campusId,campuses.id),eq(institutionMemberships.institutionId,campuses.institutionId)))
  .where(and(eq(institutionMemberships.userId,userId),eq(institutionMemberships.status,'active'),eq(institutions.status,'active'),liveGrant(now),
   or(eq(roleAssignments.scopeType,'institution'),and(eq(roleAssignments.scopeType,'program'),eq(academicPrograms.status,'active')),and(eq(roleAssignments.scopeType,'campus'),eq(campuses.status,'active')))));
 const grouped=new Map<string,InstitutionAccess>();
 for(const row of rows){
  let access=grouped.get(row.unit.id);
  if(!access){access={institutionId:row.unit.id,institutionName:row.unit.name,institutionCode:row.unit.code,membershipId:row.member.id,roles:[],grants:[]};grouped.set(row.unit.id,access);}
  if(!access.roles.includes(row.grant.role))access.roles.push(row.grant.role);
  access.grants.push(storedGrant(row.grant,row.unit.id));
 }
 return [...grouped.values()].sort((a,b)=>a.institutionId.localeCompare(b.institutionId));
}
// Legacy entry points authorize only institution-wide actions; scopes never collapse into roles.
export function legacyCapabilities(permission:Permission):readonly Capability[]{
 if(permission==='users.manage')return ['memberships.manage'];
 if(permission==='academic.read')return ['programs.read','curricula.read','courses.read','campuses.read','terms.read'];
 if(permission==='academic.manage')return ['programs.manage','curricula.manage','courses.manage','campuses.manage','terms.manage'];
 return [permission];
}
export function legacyAllows(subject:Subject,permission:Permission,institutionId:string,now=new Date()){
 return legacyCapabilities(permission).every(capability=>can(subject,capability,{institutionId,status:'active'},now));
}
export async function hasPrivilegedMembership(tx:Transaction,userId:string,now=new Date()){
 const [row]=await tx.select({id:roleAssignments.id}).from(roleAssignments)
  .innerJoin(institutionMemberships,eq(roleAssignments.membershipId,institutionMemberships.id))
  .innerJoin(institutions,eq(institutionMemberships.institutionId,institutions.id))
  .where(and(eq(institutionMemberships.userId,userId),eq(institutionMemberships.status,'active'),eq(institutions.status,'active'),liveGrant(now),
   or(eq(roleAssignments.role,'admin'),eq(roleAssignments.role,'super_admin'),eq(roleAssignments.role,'control_escolar')))).limit(1);
 return !!row;
}
// Caller locks institution exclusively, so grants and membership suspension cannot race this count.
export async function anotherActiveAdministrator(tx:Transaction,institutionId:string,excludedMembershipId:string,now=new Date(),permanent=false){
 const rows=await tx.select({id:institutionMemberships.id}).from(institutionMemberships)
  .innerJoin(platformUsers,eq(institutionMemberships.userId,platformUsers.id))
  .innerJoin(roleAssignments,eq(roleAssignments.membershipId,institutionMemberships.id))
  .where(and(eq(institutionMemberships.institutionId,institutionId),eq(institutionMemberships.status,'active'),eq(platformUsers.isActive,true),liveGrant(now),
   eq(roleAssignments.scopeType,'institution'),permanent?isNull(roleAssignments.expiresAt):undefined,or(eq(roleAssignments.role,'admin'),eq(roleAssignments.role,'super_admin'))))
  .orderBy(asc(institutionMemberships.id));
 return rows.some(row=>row.id!==excludedMembershipId);
}
