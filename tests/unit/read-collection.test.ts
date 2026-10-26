import {afterEach,describe,expect,it,vi} from 'vitest';
import {readCollection} from '../../src/shared/client/read-collection';

afterEach(()=>vi.unstubAllGlobals());
describe('complete institutional collections',()=>{
 it('follows cursor pages and preserves an explicitly incomplete result',async()=>{
  const requests:string[]=[];
  vi.stubGlobal('fetch',async(url:string)=>{
   requests.push(url);
   return Response.json(requests.length===1?{data:[{id:'recent'}],page:{nextCursor:'older'}}:{data:[{id:'old'}],truncated:true,page:{nextCursor:null}});
  });
  expect(await readCollection('/records?section=one')).toEqual({data:[{id:'recent'},{id:'old'}],truncated:true});
  expect(requests).toEqual(['/records?section=one','/records?section=one&cursor=older']);
 });
 it('rejects cursor loops instead of presenting a partial institutional total',async()=>{
  vi.stubGlobal('fetch',async()=>Response.json({data:[],page:{nextCursor:'repeated'}}));
  await expect(readCollection('/records')).rejects.toThrow('REPEATED_COLLECTION_CURSOR');
 });
});
