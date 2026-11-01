vi.mock('server-only',()=>({}));
import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const mocks=vi.hoisted(()=>({authorize:vi.fn(),transaction:vi.fn(),subject:vi.fn(),matches:vi.fn(),read:vi.fn(),audit:vi.fn()}));
vi.mock('@/shared/auth/session',()=>({authorizeInstitution:mocks.authorize}));
vi.mock('@/modules/consolidation/domain-boundary',()=>({withDomainErrors:(fn:unknown)=>fn,domainTransaction:mocks.transaction}));
vi.mock('@/integrations/companion/attendance-subject',()=>({attendanceSubject:mocks.subject,attendanceRecordsMatch:mocks.matches}));
vi.mock('@/integrations/companion/attendance-history',()=>({readCompanionAttendance:mocks.read,institutionalResultsEnabled:()=>false}));
vi.mock('@/shared/http/request-context',()=>({audit:mocks.audit,requestId:()=> 'synthetic-request'}));
import {GET} from '@/app/api/v1/institutions/[institutionId]/companion-attendance/[studentId]/route';

const tenant=randomUUID(),student=randomUUID(),section=randomUUID(),actor={identity:{id:randomUUID()},access:{institutionId:tenant}};
const subject={id:student,externalId:'MAT-001',programId:randomUUID(),sections:[{sectionId:section,sourceVersion:2}]};
const history={contract:'siii.attendance_history.v1',observedAtEpochSeconds:1,sampleLimit:100,records:[]};
function get(query='',institutionId:string=tenant,studentId:string=student,origin='http://localhost'){
 return GET(new NextRequest('http://localhost/api/v1/institutions/'+institutionId+'/companion-attendance/'+studentId+query,{headers:{origin}}),{params:Promise.resolve({institutionId,studentId})});
}
beforeEach(()=>{
 vi.clearAllMocks();mocks.authorize.mockResolvedValue(actor);mocks.subject.mockResolvedValue(subject);mocks.matches.mockResolvedValue(true);mocks.read.mockResolvedValue(history);
 mocks.transaction.mockImplementation(async(_actor,_permission,fn)=>fn({}));
});
describe('institutional attendance proxy authority',()=>{
 it('checks institution permission and source twice, then audits only count metadata',async()=>{
  const response=await get();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual({data:history});
  expect(mocks.authorize).toHaveBeenCalledWith(tenant,'academic.manage');expect(mocks.transaction).toHaveBeenCalledTimes(2);
  expect(mocks.transaction.mock.calls.every(call=>call[1].permission==='academic.manage')).toBe(true);
  expect(mocks.subject).toHaveBeenCalledTimes(2);expect(mocks.read).toHaveBeenCalledWith(tenant,'MAT-001',expect.objectContaining({signal:expect.any(AbortSignal)}));
  expect(mocks.audit).toHaveBeenCalledWith({},expect.objectContaining({institutionId:tenant,action:'companion.attendance.read',target:'student:'+student,details:{after:{records:0,observedAtEpochSeconds:1}}}));
  expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('MAT-001');
 });
 it('denies an unauthorized institution before resolving a student or reaching Companion',async()=>{
  mocks.authorize.mockResolvedValue(null);expect((await get()).status).toBe(403);expect(mocks.subject).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled();
 });
 it.each(['student','foreign-student'])('rejects unavailable source %s without a remote lookup',async()=>{
  mocks.subject.mockResolvedValue(null);expect((await get()).status).toBe(404);expect(mocks.read).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled();
 });
 it('keeps unavailable remote history distinct from an authorized empty history',async()=>{
  mocks.read.mockResolvedValue(null);const response=await get();expect(response.status).toBe(503);expect(await response.json()).toEqual({error:{code:'COMPANION_ATTENDANCE_UNAVAILABLE'}});expect(mocks.audit).not.toHaveBeenCalled();
 });
 it.each(['revoked','version','enrollment','occurrence'] as const)('discards returned history when source changes: %s',async mode=>{
  if(mode==='revoked')mocks.subject.mockResolvedValueOnce(subject).mockResolvedValueOnce(null);
  if(mode==='version')mocks.subject.mockResolvedValueOnce(subject).mockResolvedValueOnce({...subject,sections:[{sectionId:section,sourceVersion:3}]});
  if(mode==='enrollment')mocks.subject.mockResolvedValueOnce(subject).mockResolvedValueOnce({...subject,sections:[]});
  if(mode==='occurrence')mocks.matches.mockResolvedValue(false);
  expect((await get()).status).toBe(503);expect(mocks.audit).not.toHaveBeenCalled();
 });
 it.each(['?studentExternalId=OTHER','?origin=https://foreign.invalid'])('rejects caller overrides %s',async query=>{
  expect((await get(query)).status).toBe(422);expect(mocks.read).not.toHaveBeenCalled();
 });
 it('rejects cross-origin and malformed resources before authorization',async()=>{
  expect((await get('',tenant,student,'https://foreign.invalid')).status).toBe(403);expect((await get('','bad',student)).status).toBe(404);expect((await get('',tenant,'bad')).status).toBe(404);expect(mocks.authorize).not.toHaveBeenCalled();
 });
});
