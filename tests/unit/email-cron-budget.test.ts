import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const jobs=vi.hoisted(()=>({applicants:vi.fn(),invitations:vi.fn(),passwordResets:vi.fn(),role:vi.fn()}));
vi.mock('@/modules/admissions/outbox-worker',()=>({deliverApplicantVerifications:jobs.applicants}));
vi.mock('@/shared/invitations/outbox-worker',()=>({deliverInvitations:jobs.invitations}));
vi.mock('@/shared/password-reset/outbox-worker',()=>({deliverPasswordResets:jobs.passwordResets}));
vi.mock('@/infrastructure/database',()=>({assertApplicationRole:jobs.role}));
vi.mock('@/shared/logging',()=>({logger:{error:vi.fn()}}));
import {GET,maxDuration} from '@/app/api/internal/email-delivery/route';
const secret='synthetic-cron-only-32-characters-minimum';
describe('shared email endpoint time budget',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(0);vi.stubEnv('CRON_SECRET',secret);jobs.role.mockResolvedValue(undefined);for(const job of [jobs.applicants,jobs.invitations,jobs.passwordResets])job.mockImplementation(async({limit}:{limit:number})=>{vi.setSystemTime(Date.now()+limit*10000);return {claimed:limit};});});
 afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
 it('services all three queues within provider worst-case time and reserves 30 seconds for database work',async()=>{
  const response=await GET(new Request('https://siii.example.test/api/internal/email-delivery',{headers:{authorization:'Bearer '+secret}}));expect(response.status).toBe(200);
  for(const job of [jobs.applicants,jobs.invitations,jobs.passwordResets])expect(job).toHaveBeenCalledOnce();
  expect(Date.now()).toBeLessThanOrEqual(maxDuration*1000-30000);
  expect(Object.keys(await response.json())).toEqual(expect.arrayContaining(['applicants','invitations','passwordResets']));
 });
 it('never claims mail for an unauthorized caller',async()=>{
  expect((await GET(new Request('https://siii.example.test/api/internal/email-delivery'))).status).toBe(401);
  for(const job of [jobs.role,jobs.applicants,jobs.invitations,jobs.passwordResets])expect(job).not.toHaveBeenCalled();
 });
 it('keeps a failed runtime guard retryable without claiming messages',async()=>{
  jobs.role.mockRejectedValueOnce(new Error('synthetic database unavailable'));
  const response=await GET(new Request('https://siii.example.test/api/internal/email-delivery',{headers:{authorization:'Bearer '+secret}}));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'DELIVERY_RETRY_REQUIRED'});
  for(const job of [jobs.applicants,jobs.invitations,jobs.passwordResets])expect(job).not.toHaveBeenCalled();
 });
});
