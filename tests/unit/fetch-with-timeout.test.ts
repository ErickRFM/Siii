import {afterEach,describe,expect,it,vi} from 'vitest';
import {fetchWithTimeout,RequestTimeoutError} from '@/shared/client/fetch-with-timeout';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
describe('bounded portal requests',()=>{
 it('returns responses and clears the timer',async()=>{
  vi.useFakeTimers();
  let captured:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn(async (_url:string,init:RequestInit)=>{captured=init.signal??undefined;return {ok:true} as Response}));
  const result=await fetchWithTimeout('/ok',{},100);
  expect(result.ok).toBe(true);
  await vi.advanceTimersByTimeAsync(200);
  expect(captured?.aborted).toBe(false);
 });
 it('fails a stalled connection with a timeout error',async()=>{
  vi.useFakeTimers();
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise((_resolve,reject)=>{
   init.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  })));
  const request=fetchWithTimeout('/stalled',{},100);
  const assertion=expect(request).rejects.toBeInstanceOf(RequestTimeoutError);
  await vi.advanceTimersByTimeAsync(101);
  await assertion;
 });
 it('does not misreport user navigation as a timeout',async()=>{
  vi.useFakeTimers();
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise((_resolve,reject)=>{
   init.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  })));
  const upstream=new AbortController(),request=fetchWithTimeout('/cancelled',{signal:upstream.signal},200);
  const assertion=expect(request).rejects.toMatchObject({name:'AbortError'});
  upstream.abort();
  await assertion;
  await vi.advanceTimersByTimeAsync(250);
 });
});
