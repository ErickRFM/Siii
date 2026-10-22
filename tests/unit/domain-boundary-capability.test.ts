import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {InstitutionAccess} from '@/shared/auth/institution-policy';
import type {Subject} from '@/shared/auth/capabilities';
const boundary=vi.hoisted(()=>({lock:vi.fn(),grades:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/infrastructure/database',()=>({db:{transaction:async<T>(work:(tx:unknown)=>Promise<T>)=>work({})},assertApplicationRole:async()=>{}}));
vi.mock('@/shared/auth/write-access',()=>({lockInstitutionContext:boundary.lock}));
vi.mock('@/modules/grading/teaching-scope',()=>({gradeScopeAllows:boundary.grades}));
import {domainTransaction,DomainAccessDenied} from '@/modules/consolidation/domain-boundary';

const access:InstitutionAccess={institutionId:'institution',institutionName:'Synthetic',institutionCode:'SYN',membershipId:'membership',roles:['admin'],grants:[{id:'grant',role:'admin',institutionId:'institution',scopeType:'institution',scopeId:null,validUntil:null,revokedAt:null}]};
const subject:Subject={id:'admin',active:true,mustChangePassword:false,grants:access.grants};
const actor={identity:{id:'admin',sessionId:'session'},access};
beforeEach(()=>{vi.clearAllMocks();boundary.lock.mockResolvedValue({access,subject,now:new Date(),assurance:{mfaConfigured:true,mfaVerified:true,stepUpAt:null}});boundary.grades.mockResolvedValue(true);});

describe('supported capability boundary excludes grade publication and role delegation',()=>{
 it.each(['grades.publish','roles.assign'] as const)('never runs a callback through generic %s even for an admin with MFA',async capability=>{
  const work=vi.fn(async()=>true);
  // @ts-expect-error Unsupported capabilities also fail closed for malformed runtime callers.
  await expect(domainTransaction(actor,{capability},work)).rejects.toBeInstanceOf(DomainAccessDenied);
  expect(work).not.toHaveBeenCalled();expect(boundary.grades).not.toHaveBeenCalled();
 });
 it('rejects ambiguous permission/capability and grade/capability modes without a callback',async()=>{
  const work=vi.fn(async()=>true);
  // @ts-expect-error A caller must choose one authorization mode.
  await expect(domainTransaction(actor,{permission:'academic.manage',capability:'admissions.manage'},work)).rejects.toBeInstanceOf(DomainAccessDenied);
  // @ts-expect-error Grades keep their section-specific authorization mode.
  await expect(domainTransaction(actor,{grade:{sectionId:'section',capability:'grades.publish'},capability:'admissions.manage'},work)).rejects.toBeInstanceOf(DomainAccessDenied);
  expect(work).not.toHaveBeenCalled();
 });
 it.each(['admissions.manage','institutions.read'] as const)('supports the explicit institutional %s capability',async capability=>{
  expect(await domainTransaction(actor,{capability},async()=>42)).toBe(42);expect(boundary.lock).toHaveBeenCalledTimes(2);expect(boundary.grades).not.toHaveBeenCalled();
 });
 it('keeps the legacy permission/default path and privileged user-write assurance',async()=>{
  expect(await domainTransaction(actor,{},async()=>1)).toBe(1);
  expect(await domainTransaction(actor,{permission:'users.manage'},async()=>2)).toBe(2);
  expect(boundary.lock.mock.calls.map(call=>call[4])).toEqual([false,false,true,true]);
  expect(boundary.grades).not.toHaveBeenCalled();
 });
 it('continues routing publication through section checks and critical assurance',async()=>{
  boundary.grades.mockResolvedValue(false);const work=vi.fn(async()=>true);
  await expect(domainTransaction(actor,{grade:{sectionId:'section',capability:'grades.publish'}},work)).rejects.toBeInstanceOf(DomainAccessDenied);
  expect(boundary.lock.mock.calls[0][4]).toBe(true);
  expect(boundary.grades.mock.calls[0].slice(2)).toEqual(['section','grades.publish']);expect(work).not.toHaveBeenCalled();
 });
 it('checks live authority after a callback before accepting its result',async()=>{
  boundary.lock.mockResolvedValueOnce({access,subject,now:new Date()}).mockResolvedValueOnce(null);
  await expect(domainTransaction(actor,{capability:'admissions.manage'},async()=>true)).rejects.toBeInstanceOf(DomainAccessDenied);
  expect(boundary.lock).toHaveBeenCalledTimes(2);
 });
});
