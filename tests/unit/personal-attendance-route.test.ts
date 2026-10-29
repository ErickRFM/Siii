import {randomUUID,createHash} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const mocks=vi.hoisted(()=>({context:vi.fn(),subject:vi.fn(),read:vi.fn(),finish:vi.fn()}));
vi.mock('@/modules/portal/read-model',()=>({personalContext:mocks.context}));
vi.mock('@/modules/consolidation/domain-boundary',()=>({withDomainErrors:(fn:unknown)=>fn}));
vi.mock('@/integrations/companion/personal-attendance',()=>({personalAttendanceSubject:mocks.subject,finishPersonalAttendance:mocks.finish}));
vi.mock('@/integrations/companion/attendance-history',()=>({readCompanionAttendance:mocks.read}));
import {GET} from '@/app/api/v1/institutions/[institutionId]/companion-attendance/mine/route';

const tenant=randomUUID(),actor={identity:{id:randomUUID(),sessionId:randomUUID()},access:{institutionId:tenant}};
const subject={linkId:randomUUID(),id:randomUUID(),externalId:'PRACTICE001',programId:randomUUID(),sections:[]};
const history={contract:'siii.attendance_history.v1',observedAtEpochSeconds:1,sampleLimit:100,records:[]};
function get(query='',institutionId:string=tenant,origin='http://localhost'){
 return GET(new NextRequest(`http://localhost/api/v1/institutions/${institutionId}/companion-attendance/mine${query}`,{headers:{origin}}),{params:Promise.resolve({institutionId})});
}
beforeEach(()=>{vi.clearAllMocks();mocks.context.mockResolvedValue(actor);mocks.subject.mockResolvedValue(subject);mocks.read.mockResolvedValue(history);mocks.finish.mockResolvedValue(true)});
describe('personal attendance HTTP handler',()=>{
 it('resolves only the session-linked subject, revalidates and returns no-store history',async()=>{
  const response=await get();expect(response.status).toBe(200);expect(await response.json()).toEqual({data:history});
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-siii-attendance-session')).toBe(createHash('sha256').update(actor.identity.id+':'+actor.identity.sessionId).digest('hex'));
  expect(mocks.context).toHaveBeenCalledWith(tenant,'student');expect(mocks.subject).toHaveBeenCalledWith(actor);
  expect(mocks.read).toHaveBeenCalledWith(tenant,subject.externalId,expect.objectContaining({signal:expect.any(AbortSignal)}));
  expect(mocks.finish).toHaveBeenCalledWith(actor,subject,history,expect.any(String));
 });
 it('denies missing student capability before any student or provider lookup',async()=>{mocks.context.mockResolvedValue(null);expect((await get()).status).toBe(403);expect(mocks.subject).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled()});
 it('denies missing or revoked link without asking Companion',async()=>{mocks.subject.mockResolvedValue(null);expect((await get()).status).toBe(404);expect(mocks.read).not.toHaveBeenCalled()});
 it('does not turn absent configuration into an empty history',async()=>{mocks.read.mockResolvedValue(null);expect((await get()).status).toBe(503);expect(mocks.finish).not.toHaveBeenCalled()});
 it('discards history when source or authority changes during remote I/O',async()=>{mocks.finish.mockResolvedValue(false);const response=await get();expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('records')});
 it.each(['?studentId='+randomUUID(),'?studentExternalId=OTHER','?origin=https://other.invalid'])('rejects caller selector %s',async query=>{expect((await get(query)).status).toBe(422);expect(mocks.context).not.toHaveBeenCalled()});
 it('rejects malformed institution and foreign origin before resolving authority',async()=>{expect((await get('','bad')).status).toBe(404);expect((await get('',tenant,'https://other.invalid')).status).toBe(403);expect(mocks.context).not.toHaveBeenCalled()});
});
