import {afterEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
// This unit suite exercises orchestration against a durable-store boundary;
// PostgreSQL claim/completion fencing remains covered by academic-outbox integration tests.
vi.mock('@/infrastructure/database',()=>({db:{select:()=>({from:()=>({where:()=>({orderBy:()=>({limit:async()=>[]})})})})}}));
import {deliverAcademicEvents,type AcademicLease} from '@/integrations/companion/outbox/worker';
import {runAcademicTransport,type AcademicDeliveryResult} from '@/integrations/companion/outbox/transport';
import {sealAcademicBody} from '@/integrations/companion/outbox/seal';

const input={eventId:randomUUID(),institutionId:randomUUID(),sectionId:randomUUID(),sourceVersion:1,body:'immutable'};
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
function fixture(){
 vi.stubEnv('SIII_ACADEMIC_OUTBOX_ENABLED','true');vi.stubEnv('SIII_ACADEMIC_OUTBOX_KEYS',JSON.stringify({fixture:randomBytes(32).toString('base64')}));vi.stubEnv('SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID','fixture');
 const rows=Array.from({length:4},(_,index)=>{const eventId=randomUUID(),body=JSON.stringify({eventId,sourceVersion:index+1});return {...input,eventId,sourceVersion:index+1,body,bodyEncrypted:sealAcademicBody(body,{...input,eventId}),bodyDigest:createHash('sha256').update(body).digest('hex'),state:'queued',attempts:0,leaseToken:null,leaseUntil:null} as unknown as AcademicLease;});
 const store={
  listDue:async()=>rows.map(row=>({eventId:row.eventId})),
  claim:async(eventId:string,now:Date)=>{const row=rows.find(item=>item.eventId===eventId)!;row.attempts++;row.leaseToken=randomUUID();row.leaseUntil=new Date(now.getTime()+60000);return {...row};},
  complete:async(event:AcademicLease,result:AcademicDeliveryResult)=>{const row=rows.find(item=>item.eventId===event.eventId)!;row.state=result.status==='accepted'?'accepted':result.status==='retryable'?'queued':'failed';row.leaseToken=null as unknown as string;row.leaseUntil=null;return row.state;},
 };
 return {rows,store};
}

describe('academic delivery execution budget',()=>{
 it('stops before claiming a new event without a full transport window',async()=>{
  const {rows,store}=fixture();let elapsed=0;
  const totals=await deliverAcademicEvents({transport:async()=>{elapsed+=31000;return {status:'accepted'};},budgetMs:90000,clock:()=>elapsed},store);
  expect(totals).toMatchObject({claimed:2,accepted:2,budgetExhausted:true});expect(rows.map(row=>row.state)).toEqual(['accepted','accepted','queued','queued']);expect(rows.map(row=>row.attempts)).toEqual([1,1,0,0]);
 });
 it('leaves every event unclaimed when selection consumes the budget',async()=>{
  const {rows,store}=fixture();let elapsed=0;const listDue=store.listDue;store.listDue=async()=>{elapsed=90000;return listDue();};
  expect(await deliverAcademicEvents({transport:async()=>({status:'accepted'}),budgetMs:90000,clock:()=>elapsed},store)).toMatchObject({claimed:0,budgetExhausted:true});expect(rows.map(row=>row.attempts)).toEqual([0,0,0,0]);
 });
 it('caps a claimed transport to the execution budget remaining after claim',async()=>{
  vi.useFakeTimers();const {rows,store}=fixture();let elapsed=0,signal:AbortSignal|undefined;const claim=store.claim;store.claim=async(id,now)=>{elapsed=89000;return claim(id,now);};
  const pending=deliverAcademicEvents({transport:async value=>{signal=value.signal;return new Promise(()=>{});},budgetMs:90000,clock:()=>elapsed},store);
  await vi.advanceTimersByTimeAsync(1000);elapsed=90000;const totals=await pending;
  expect(signal?.aborted).toBe(true);expect(totals).toMatchObject({claimed:1,retried:1,budgetExhausted:true});expect(rows[0].state).toBe('queued');expect(rows[0].leaseToken).toBeNull();expect(rows.slice(1).map(row=>row.attempts)).toEqual([0,0,0]);expect(vi.getTimerCount()).toBe(0);
 });
 it('cancels an inflight transport, completes it retryably and does not claim another',async()=>{
  const {rows,store}=fixture(),controller=new AbortController();let signal:AbortSignal|undefined;
  const totals=await deliverAcademicEvents({transport:async value=>{signal=value.signal;controller.abort();return new Promise(()=>{});},signal:controller.signal},store);
  expect(signal?.aborted).toBe(true);expect(totals).toMatchObject({claimed:1,retried:1,cancelled:true});expect(rows[0].state).toBe('queued');expect(rows[0].leaseToken).toBeNull();expect(rows.slice(1).map(row=>row.attempts)).toEqual([0,0,0]);
 });
 it('honors cancellation before reading or claiming any events',async()=>{
  const {rows,store}=fixture(),controller=new AbortController();controller.abort();
  expect(await deliverAcademicEvents({transport:async()=>({status:'accepted'}),signal:controller.signal},store)).toMatchObject({claimed:0,cancelled:true});expect(rows.map(row=>row.attempts)).toEqual([0,0,0,0]);
 });
 it('keeps the timeout below an existing lease even when execution budget remains',async()=>{
  vi.useFakeTimers();const {rows,store}=fixture();let signal:AbortSignal|undefined;const claim=store.claim;store.claim=async(id,now)=>{const event=await claim(id,now);event.leaseUntil=new Date(Date.now()+10000);return event;};
  const pending=deliverAcademicEvents({limit:1,transport:async value=>{signal=value.signal;return new Promise(()=>{});}}, {...store,listDue:async()=>[{eventId:rows[0].eventId}]});
  await vi.advanceTimersByTimeAsync(8999);expect(signal?.aborted).toBe(false);await vi.advanceTimersByTimeAsync(1);expect(await pending).toMatchObject({claimed:1,retried:1});expect(signal?.aborted).toBe(true);expect(rows[0].leaseToken).toBeNull();
 });
});

describe('academic transport cancellation boundary',()=>{
 it('uses the caller timeout and aborts stalled IO without leaking timers',async()=>{
  vi.useFakeTimers();let signal:AbortSignal|undefined;
  const pending=runAcademicTransport(async value=>{signal=value.signal;return new Promise(()=>{});},input,{timeoutMs:1500});
  await vi.advanceTimersByTimeAsync(1499);expect(signal?.aborted).toBe(false);await vi.advanceTimersByTimeAsync(1);expect(await pending).toEqual({status:'retryable'});expect(signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it('propagates parent abort without waiting for timeout and detaches its listener',async()=>{
  vi.useFakeTimers();const parent=new AbortController();let signal:AbortSignal|undefined;
  const pending=runAcademicTransport(async value=>{signal=value.signal;return new Promise(()=>{});},input,{signal:parent.signal,timeoutMs:5000});parent.abort();
  expect(await pending).toEqual({status:'retryable'});expect(signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it('does not submit an already cancelled request',async()=>{
  const parent=new AbortController();parent.abort();let submissions=0;
  expect(await runAcademicTransport(async()=>{submissions++;return {status:'accepted'};},input,{signal:parent.signal})).toEqual({status:'retryable'});expect(submissions).toBe(0);
 });
 it('detaches a parent listener after a successful receipt',async()=>{
  const parent=new AbortController();let signal:AbortSignal|undefined;
  expect(await runAcademicTransport(async value=>{signal=value.signal;return {status:'accepted'};},input,{signal:parent.signal})).toEqual({status:'accepted'});parent.abort();expect(signal?.aborted).toBe(false);
 });
});
