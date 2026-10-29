import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({transaction:vi.fn(),lock:vi.fn(),can:vi.fn(),subject:vi.fn(),matches:vi.fn(),audit:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/infrastructure/database',()=>({db:{transaction:mocks.transaction}}));
vi.mock('@/shared/auth/write-access',()=>({lockInstitutionContext:mocks.lock}));
vi.mock('@/shared/auth/capabilities',()=>({can:mocks.can}));
vi.mock('@/shared/http/request-context',()=>({audit:mocks.audit}));
vi.mock('@/modules/consolidation/domain-boundary',()=>({DomainAccessDenied:class extends Error{}}));
vi.mock('@/integrations/companion/attendance-subject',()=>({attendanceSubject:mocks.subject,attendanceRecordsMatch:mocks.matches}));
import {personalAttendanceSubject,finishPersonalAttendance} from '@/integrations/companion/personal-attendance';
import type {InstitutionAccess} from '@/shared/auth/institution-policy';
const actor={identity:{id:'actor',sessionId:'session'},access:{institutionId:'tenant',membershipId:'membership'} as InstitutionAccess};
const subject={id:'student',externalId:'PRACTICE001',programId:'program',sections:[{sectionId:'section',sourceVersion:1}]};
const before={linkId:'link',...subject};
const history={contract:'siii.attendance_history.v1' as const,observedAtEpochSeconds:1,sampleLimit:100 as const,records:[]};
let links:{linkId:string;studentId:string;programId:string}[],tx:{select:ReturnType<typeof vi.fn>;execute:ReturnType<typeof vi.fn>};
beforeEach(()=>{
 vi.clearAllMocks();links=[{linkId:'link',studentId:'student',programId:'program'}];
 const chain={from:vi.fn().mockReturnThis(),innerJoin:vi.fn().mockReturnThis(),where:vi.fn().mockReturnThis(),limit:vi.fn().mockReturnThis(),for:vi.fn(async()=>links)};
 tx={select:vi.fn(()=>chain),execute:vi.fn(async()=>({rows:[{now:new Date()}]}))};
 mocks.transaction.mockImplementation(fn=>fn(tx));mocks.lock.mockResolvedValue({subject:{id:'actor'},access:actor.access});mocks.can.mockReturnValue(true);mocks.subject.mockResolvedValue(subject);mocks.matches.mockResolvedValue(true);
});
describe('trusted personal attendance binding',()=>{
 it('resolves the linked record and applies self read to the trusted owner and program',async()=>{
  expect(await personalAttendanceSubject(actor)).toEqual(before);expect(mocks.can).toHaveBeenCalledWith({id:'actor'},'student.self.read',{institutionId:'tenant',status:'active',programId:'program',ownerUserId:'actor'},expect.any(Date));
  expect(mocks.subject).toHaveBeenCalledWith(tx,'tenant','student');
 });
 it('denies a revoked session before selecting a link',async()=>{mocks.lock.mockResolvedValue(null);await expect(personalAttendanceSubject(actor)).rejects.toThrow();expect(tx.select).not.toHaveBeenCalled()});
 it('does not resolve any supplied student when the current membership has no link',async()=>{links=[];expect(await personalAttendanceSubject(actor)).toBeNull();expect(mocks.subject).not.toHaveBeenCalled()});
 it('denies a program scoped grant outside the linked program',async()=>{mocks.can.mockReturnValue(false);await expect(personalAttendanceSubject(actor)).rejects.toThrow();expect(mocks.subject).not.toHaveBeenCalled()});
 it.each(['link','record','version','occurrence','missing'] as const)('discards a remote result after %s changes',async mode=>{
  if(mode==='link')links[0].linkId='different';
  if(mode==='record')mocks.subject.mockResolvedValue({...subject,id:'other'});
  if(mode==='version')mocks.subject.mockResolvedValue({...subject,sections:[{sectionId:'section',sourceVersion:2}]});
  if(mode==='occurrence')mocks.matches.mockResolvedValue(false);
  if(mode==='missing')links=[];
  expect(await finishPersonalAttendance(actor,before,history,'request')).toBe(false);expect(mocks.audit).not.toHaveBeenCalled();
 });
 it('audits only count metadata and rechecks session and capability after audit',async()=>{
  expect(await finishPersonalAttendance(actor,before,history,'request')).toBe(true);expect(mocks.lock).toHaveBeenCalledTimes(2);
  expect(mocks.audit).toHaveBeenCalledWith(tx,{institutionId:'tenant',actorUserId:'actor',requestId:'request',action:'companion.attendance.self.read',target:'student:student',details:{after:{records:0,observedAtEpochSeconds:1}}});
  expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('PRACTICE001');
 });
 it('fails the transaction when authority expires while auditing',async()=>{mocks.can.mockReturnValueOnce(true).mockReturnValueOnce(false);await expect(finishPersonalAttendance(actor,before,history,'request')).rejects.toThrow()});
});
