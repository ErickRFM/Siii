/** Bounded client requests; upstream cancellation remains distinct from timeout. */
export class RequestTimeoutError extends Error {
 constructor(){super('REQUEST_TIMEOUT');this.name='RequestTimeoutError'}
}
export async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=20000):Promise<Response>{
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new RangeError('INVALID_REQUEST_TIMEOUT');
 const controller=new AbortController(),upstream=init.signal;
 const onAbort=()=>controller.abort(upstream?.reason);
 if(upstream?.aborted)onAbort();
 else upstream?.addEventListener('abort',onAbort,{once:true});
 let expired=false;
 const timeout=setTimeout(()=>{expired=true;controller.abort()},timeoutMs);
 try{return await fetch(input,{...init,signal:controller.signal})}
 catch(cause){if(expired&&!upstream?.aborted)throw new RequestTimeoutError();throw cause}
 finally{clearTimeout(timeout);upstream?.removeEventListener('abort',onAbort)}
}
