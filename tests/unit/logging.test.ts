import { expect, it } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger } from '@/shared/logging';
it('redacts secrets and personal contact fields in structured output',async()=>{
 let output='';
 const stream=new Writable({write(chunk,_encoding,callback){output+=chunk.toString();callback();}});
 const log=createLogger(stream);
 log.info({requestId:'abc',password:'raw-secret',DATABASE_URL:'private-connection',email:'private-email',token:'session-secret',req:{headers:{authorization:'Bearer sensitive',cookie:'cookie-secret'}}},'safe event');
 await new Promise<void>(resolve=>setImmediate(resolve));
 expect(output).toContain('safe event');expect(output).toContain('abc');
 for(const secret of ['raw-secret','private-connection','private-email','session-secret','Bearer sensitive','cookie-secret'])expect(output).not.toContain(secret);
});
