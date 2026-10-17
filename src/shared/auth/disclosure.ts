import {can,delegationDisclosure,type Capability,type Subject,type GrantScope} from './capabilities';
import {privilegedAssuranceAllows,requiresPrivilegedMfa,type Assurance} from './privileged-policy';
import {hasFreshStepUp,MFA_STEP_UP_MS} from './mfa-session-policy';
import type {InstitutionAccess} from './institution-policy';

// Only backed API actions are disclosed as operable; domain placeholders are not UI affordances.
const SUPPORTED:readonly Capability[]=['institutions.read','institutions.manage','users.read','users.update','users.suspend','users.restore','users.reset','memberships.manage','roles.assign','invitations.manage','programs.read','programs.manage','curricula.read','curricula.manage','courses.read','courses.manage','campuses.read','campuses.manage','terms.read','terms.manage','grades.manage'];
export function disclose(subject:Subject,access:InstitutionAccess,assurance:Assurance,now=new Date(),requestedScope?:GrantScope){
 const restricted=!privilegedAssuranceAllows(access.grants,assurance,now);
 const capabilities=restricted?[]:SUPPORTED.filter(capability=>can(subject,capability,{institutionId:access.institutionId,status:capability==='users.restore'?'suspended':'active',...(capability==='grades.manage'?{assignedUserIds:[subject.id]}:{})},now));
 const scopes=new Map<string,GrantScope>();
 for(const grant of access.grants)if(grant.scopeType!=='institution')scopes.set(grant.scopeType+':'+grant.scopeId,grant);
 if(requestedScope&&requestedScope.scopeType!=='institution')scopes.set(requestedScope.scopeType+':'+requestedScope.scopeId,requestedScope);
 const authority=(scope:GrantScope)=>restricted?{grantableRoles:[],grantExpiryLimits:{}}:delegationDisclosure(subject,scope,now);
 return {institutionId:access.institutionId,membershipId:access.membershipId,roles:access.roles,
  grants:access.grants.map(grant=>({id:grant.id,role:grant.role,scopeType:grant.scopeType,scopeId:grant.scopeId,expiresAt:grant.validUntil?.toISOString()??null})),
  capabilities,...authority({institutionId:access.institutionId,scopeType:'institution',scopeId:null}),
  scopedCapabilities:[...scopes.values()].map(scope=>({scopeType:scope.scopeType,scopeId:scope.scopeId,
   capabilities:restricted?[]:SUPPORTED.filter(capability=>(scope.scopeType==='program'?(capability.startsWith('programs.')||capability.startsWith('curricula.')):capability.startsWith('campuses.'))&&can(subject,capability,{institutionId:scope.institutionId,status:'active',...(scope.scopeType==='program'?{programId:scope.scopeId!}:{campusId:scope.scopeId!})},now)),
   ...authority(scope)})),
  assurance:{mfaRequired:requiresPrivilegedMfa(access.grants,now),mfaConfigured:assurance.mfaConfigured,mfaVerified:assurance.mfaVerified,
   stepUpExpiresAt:hasFreshStepUp(assurance,now)?new Date(assurance.stepUpAt!.getTime()+MFA_STEP_UP_MS).toISOString():null},restricted};
}
