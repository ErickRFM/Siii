import {describe,expect,it} from 'vitest';
import {catalogAccessKey} from '@/modules/academic/access-key';

function access(){return {
 institutionId:'institution',membershipId:'membership',restricted:false,
 capabilities:['programs.read','curricula.read'],
 grants:[{id:'grant-a',role:'coordinator',scopeType:'program',scopeId:'program-a',expiresAt:null},{id:'grant-b',role:'student',scopeType:'campus',scopeId:'campus-a',expiresAt:'2027-01-01T00:00:00.000Z'}],
 scopedCapabilities:[{scopeType:'program',scopeId:'program-a',capabilities:['programs.read','curricula.read']},{scopeType:'campus',scopeId:'campus-a',capabilities:['campuses.read']}],
 assurance:{stepUpExpiresAt:null as string|null,mfaVerified:true},
}}
describe('catalog access invalidation identity',()=>{
 it('is stable when equivalent server arrays arrive in another order',()=>{
  const original=access(),reordered=access();
  reordered.capabilities.reverse();reordered.grants.reverse();reordered.scopedCapabilities.reverse();reordered.scopedCapabilities.forEach(scope=>scope.capabilities.reverse());
  expect(catalogAccessKey(reordered)).toBe(catalogAccessKey(original));
 });
 it('invalidates when the same readable resources move to another scope',()=>{
  const original=access(),changed=access();changed.grants[0].scopeId='program-b';changed.scopedCapabilities[0].scopeId='program-b';
  expect(catalogAccessKey(changed)).not.toBe(catalogAccessKey(original));
 });
 it.each(['institution','membership','grant','role','expiry','capability','scopedCapability','restricted'])('invalidates a changed %s',field=>{
  const original=access(),changed=access();
  if(field==='institution')changed.institutionId='other';
  if(field==='membership')changed.membershipId='other';
  if(field==='grant')changed.grants[0].id='other';
  if(field==='role')changed.grants[0].role='teacher';
  if(field==='expiry')changed.grants[0].expiresAt='2027-02-01T00:00:00.000Z';
  if(field==='capability')changed.capabilities.push('courses.read');
  if(field==='scopedCapability')changed.scopedCapabilities[0].capabilities.push('programs.manage');
  if(field==='restricted')changed.restricted=true;
  expect(catalogAccessKey(changed)).not.toBe(catalogAccessKey(original));
 });
 it('keeps same-scope drafts when only MFA step-up status changes',()=>{
  const original=access(),elevated=access();elevated.assurance.stepUpExpiresAt='2027-01-01T00:00:00.000Z';
  expect(catalogAccessKey(elevated)).toBe(catalogAccessKey(original));
 });
 it('distinguishes missing access from an authorized projection',()=>{
  expect(catalogAccessKey(null)).not.toBe(catalogAccessKey(access()));
 });
});
