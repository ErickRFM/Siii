import {describe,it,expect} from 'vitest';
import {canGrant,canRevoke,delegationDisclosure,administratorState,type Grant,type Subject} from '@/shared/auth/capabilities';
import {requiresPrivilegedMfa,privilegedAssuranceAllows} from '@/shared/auth/privileged-policy';

const now=new Date('2026-10-14T12:00:00Z');
const grant=(patch:Partial<Grant>={}):Grant=>({role:'admin',institutionId:'tenant-a',scopeType:'institution',scopeId:null,validUntil:null,revokedAt:null,...patch});
const actor=(grants:Grant[]):Subject=>({id:'actor',active:true,mustChangePassword:false,grants});
describe('privileged institutional assurance',()=>{
 it('requires real MFA for all three privileged profiles but not expired or revoked grants',()=>{
  for(const role of ['admin','super_admin','control_escolar'] as const)expect(requiresPrivilegedMfa([grant({role})],now)).toBe(true);
  expect(requiresPrivilegedMfa([grant({validUntil:now}),grant({revokedAt:now}),grant({role:'coordinator'})],now)).toBe(false);
 });
 it('a password-only step-up cannot satisfy privileged access',()=>{
  expect(privilegedAssuranceAllows([grant()],{mfaConfigured:false,mfaVerified:false,stepUpAt:now},now,false)).toBe(false);
 });
 it('critical actions require factor assurance and strictly fresh step-up even for nonprivileged roles',()=>{
  const teacher=[grant({role:'teacher'})];
  expect(privilegedAssuranceAllows(teacher,{mfaConfigured:false,mfaVerified:false,stepUpAt:now},now,true)).toBe(false);
  expect(privilegedAssuranceAllows(teacher,{mfaConfigured:true,mfaVerified:true,stepUpAt:new Date(now.getTime()-300000)},now,true)).toBe(false);
  expect(privilegedAssuranceAllows(teacher,{mfaConfigured:true,mfaVerified:true,stepUpAt:now},now,true)).toBe(true);
 });
 it('ordinary nonprivileged institutional reads remain accessible without a factor',()=>{
  expect(privilegedAssuranceAllows([grant({role:'student'})],{mfaConfigured:false,mfaVerified:false,stepUpAt:null},now,false)).toBe(true);
 });
});
describe('delegated grant lifetime',()=>{
 it('distinguishes permanent administrative continuity from temporarily active grants',()=>{
  expect(administratorState([grant({validUntil:new Date(now.getTime()+1)})],now)).toEqual({any:true,permanent:false});
  expect(administratorState([grant(),grant({validUntil:now})],now)).toEqual({any:true,permanent:true});
  expect(administratorState([grant({revokedAt:now}),grant({validUntil:now})],now)).toEqual({any:false,permanent:false});
 });
 const scope={institutionId:'tenant-a',scopeType:'institution',scopeId:null} as const;
 const expiry=new Date(now.getTime()+60000);
 it('cannot turn temporary authority into a permanent or longer grant',()=>{
  const subject=actor([grant({validUntil:expiry})]);
  expect(canGrant(subject,'teacher',scope,now,null)).toBe(false);
  expect(canGrant(subject,'teacher',scope,now,new Date(expiry.getTime()+1))).toBe(false);
  expect(canGrant(subject,'teacher',scope,now,expiry)).toBe(true);
 });
 it('requires a single current authorizing grant to cover capability, scope and lifetime',()=>{
  const subject=actor([grant({validUntil:expiry}),grant({role:'teacher'})]);
  expect(canGrant(subject,'teacher',scope,now,null)).toBe(false);
  expect(canGrant(subject,'teacher',scope,now,now)).toBe(false);
  expect(canGrant(subject,'teacher',scope,now,new Date('invalid'))).toBe(false);
 });
 it('discloses the maximum independent grant lifetime while preserving permanent authority',()=>{
  const later=new Date(expiry.getTime()+60000);
  const limited=delegationDisclosure(actor([grant({validUntil:expiry}),grant({role:'super_admin',validUntil:later})]),scope,now);
  expect(limited.grantExpiryLimits.teacher).toBe(later.toISOString());
  expect(limited.grantExpiryLimits.admin).toBe(later.toISOString());
  expect(limited.grantableRoles).not.toContain('super_admin');
  expect(delegationDisclosure(actor([grant()]),scope,now).grantExpiryLimits.teacher).toBeNull();
 });
 it('permits a temporary administrator to remove existing lower authority without delegating it permanently',()=>{
  expect(canRevoke(actor([grant({validUntil:expiry})]),'teacher',scope,now)).toBe(true);
  expect(canRevoke(actor([grant({validUntil:now})]),'teacher',scope,now)).toBe(false);
  expect(canRevoke(actor([grant()]),'super_admin',scope,now)).toBe(false);
 });
});
