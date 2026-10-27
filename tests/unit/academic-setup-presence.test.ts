import {afterEach,describe,expect,it,vi} from 'vitest';
import {readCatalogPresence} from '@/modules/academic/setup-presence';

afterEach(()=>vi.unstubAllGlobals());
describe('academic setup presence from persisted catalogs',()=>{
 it.each([[[], 'empty'], [[{id:'persisted-record'}], 'present']] as const)('reads presence without claiming exact counts: %j',async(data,expected)=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({data,page:{nextCursor:null}})));
  vi.stubGlobal('fetch',request);const controller=new AbortController();
  expect(await readCatalogPresence('tenant','campuses',controller.signal)).toBe(expected);
  expect(request).toHaveBeenCalledWith('/api/v1/institutions/tenant/academic/campuses?limit=1',expect.objectContaining({cache:'no-store',credentials:'same-origin',signal:controller.signal}));
 });
 it.each([403,500])('keeps HTTP %s failures distinct from empty catalogs',async(status)=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"error":{"code":"FORBIDDEN"}}',{status})));
  expect(await readCatalogPresence('tenant','courses',new AbortController().signal)).toBe('error');
 });
 it('does not treat a malformed response as an empty catalog',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"data":null}')));
  expect(await readCatalogPresence('tenant','programs',new AbortController().signal)).toBe('error');
 });
 it('reports connectivity failures without asserting no records',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));
  expect(await readCatalogPresence('tenant','terms',new AbortController().signal)).toBe('error');
 });
 it('propagates cancellation so the caller cannot commit stale presence',async()=>{
  const controller=new AbortController();controller.abort();
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('Aborted','AbortError')));
  await expect(readCatalogPresence('tenant','curricula',controller.signal)).rejects.toMatchObject({name:'AbortError'});
 });
});
