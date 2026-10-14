import {and,eq,or,sql,type SQL} from 'drizzle-orm';
import type {AnyPgColumn} from 'drizzle-orm/pg-core';
import {readVisibility} from './read-access';
import {roleAssignments} from '../../../db/schema';
import type {CatalogResource} from '@/modules/academic/catalog-validation';
import type {CatalogRow} from '@/modules/academic/catalog-registry';
import {can,type Capability,type Resource,type Subject} from './capabilities';
import {privilegedAssuranceAllows,type Assurance} from './privileged-policy';
import type {InstitutionAccess} from './institution-policy';

export const catalogCapability=(resource:CatalogResource,action:'read'|'manage'):Capability=>resource+'.'+action as Capability;
export function catalogRecord(resource:CatalogResource,row:CatalogRow):Resource{
 return {institutionId:row.institutionId,status:row.status,...(resource==='programs'?{programId:row.id}:resource==='curricula'?{programId:String(row.programId)}:resource==='campuses'?{campusId:row.id}:{})};
}
export function catalogMayAccess(subject:Subject,access:InstitutionAccess,assurance:Assurance,resource:CatalogResource,action:'read'|'manage',now=new Date()){
 if(!privilegedAssuranceAllows(access.grants,assurance,now))return false;
 return subject.grants.some(grant=>can({...subject,grants:[grant]},catalogCapability(resource,action),
  {institutionId:access.institutionId,status:'active',...(grant.scopeType==='program'&&(resource==='programs'||resource==='curricula')?{programId:grant.scopeId!}:grant.scopeType==='campus'&&resource==='campuses'?{campusId:grant.scopeId!}:{})},now));
}
export function catalogVisibility(subject:Subject,access:InstitutionAccess,sessionId:string,resource:CatalogResource,columns:{id:AnyPgColumn;programId?:AnyPgColumn},now=new Date()):SQL{
 const capability=catalogCapability(resource,'read');
 const eligible=access.grants.filter(grant=>can({...subject,grants:[grant]},capability,{institutionId:access.institutionId,status:'active',
  ...(grant.scopeType==='program'&&(resource==='programs'||resource==='curricula')?{programId:grant.scopeId!}:grant.scopeType==='campus'&&resource==='campuses'?{campusId:grant.scopeId!}:{})},now));
 if(!eligible.length)return sql`false`;
 // ACL row, membership and session are rechecked at query time, before cursor ordering/limit.
 const scopeMatches=or(eq(roleAssignments.scopeType,'institution'),
  resource==='programs'?and(eq(roleAssignments.scopeType,'program'),sql`${roleAssignments.programId} = ${columns.id}`):
  resource==='curricula'?and(eq(roleAssignments.scopeType,'program'),sql`${roleAssignments.programId} = ${columns.programId}`):
  resource==='campuses'?and(eq(roleAssignments.scopeType,'campus'),sql`${roleAssignments.campusId} = ${columns.id}`):undefined);
 return readVisibility(subject,access,sessionId,eligible,scopeMatches??sql`false`);
}
