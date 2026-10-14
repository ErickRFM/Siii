import {describe,it,expect} from 'vitest';
import {disclose} from '@/shared/auth/disclosure';
import type {InstitutionAccess} from '@/shared/auth/institution-policy';
import type {Subject} from '@/shared/auth/capabilities';

const now=new Date('2026-10-14T12:00:00Z');
const access:InstitutionAccess={institutionId:'tenant',institutionName:'Synthetic',institutionCode:'S',membershipId:'member',roles:['coordinator'],
 grants:[{id:'grant',role:'coordinator',institutionId:'tenant',scopeType:'program',scopeId:'program',validUntil:null,revokedAt:null}]};
const subject:Subject={id:'actor',active:true,mustChangePassword:false,grants:access.grants};
const assurance={mfaConfigured:false,mfaVerified:false,stepUpAt:null};
describe('trusted capability disclosure',()=>{
 it('does not invent links from a scoped grant to courses, terms, users or future domains',()=>{
  const data=disclose(subject,access,assurance,now);
  expect(data.capabilities).toEqual([]);
  expect(data.scopedCapabilities[0].capabilities).toEqual(['programs.read','programs.manage','curricula.read','curricula.manage']);
 });
 it('exposes onboarding assurance without operable capabilities or delegation',()=>{
  const privileged={...access,roles:['admin'] as const,grants:[{...access.grants[0],role:'admin' as const,scopeType:'institution' as const,scopeId:null}]};
  const data=disclose({...subject,grants:privileged.grants},{...privileged,roles:[...privileged.roles]},assurance,now);
  expect(data.restricted).toBe(true);expect(data.assurance.mfaRequired).toBe(true);
  expect(data.capabilities).toEqual([]);expect(data.grantableRoles).toEqual([]);
 });
 it('requested real scopes disclose catalog domain actions but never tenant-wide actions',()=>{
  const privileged={...access,roles:['super_admin' as const],grants:[{...access.grants[0],role:'super_admin' as const,scopeType:'institution' as const,scopeId:null}]};
  const data=disclose({...subject,grants:privileged.grants},privileged,{mfaConfigured:true,mfaVerified:true,stepUpAt:now},now,{institutionId:'tenant',scopeType:'campus',scopeId:'campus'});
  expect(data.scopedCapabilities[0].capabilities).toEqual(['campuses.read','campuses.manage']);
  expect(data.scopedCapabilities[0].grantableRoles).not.toContain('admin');
 });
});
