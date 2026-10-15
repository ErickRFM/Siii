import type {Grant} from './capabilities';
import {hasFreshStepUp} from './mfa-session-policy';

export type Assurance={mfaConfigured:boolean;mfaVerified:boolean;stepUpAt:Date|null};
export const PRIVILEGED_ROLES=['admin','super_admin','control_escolar'] as const;
export function requiresPrivilegedMfa(grants:readonly Grant[],now=new Date()){
 return grants.some(grant=>PRIVILEGED_ROLES.some(role=>role===grant.role)&&grant.revokedAt===null
  &&(grant.validUntil===null||grant.validUntil>now));
}
export function privilegedAssuranceAllows(grants:readonly Grant[],assurance:Assurance,now=new Date(),critical=false){
 if(!Number.isFinite(now.getTime()))return false;
 if((critical||requiresPrivilegedMfa(grants,now))&&(!assurance.mfaConfigured||!assurance.mfaVerified))return false;
 return !critical||hasFreshStepUp(assurance,now);
}
