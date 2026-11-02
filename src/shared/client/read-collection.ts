import {fetchWithTimeout} from './fetch-with-timeout';

/** Follow the cursor and surface an explicit partial-result flag at the safety limit. */
export class CollectionReadError extends Error{constructor(readonly status:number){super('COLLECTION_UNAVAILABLE')}}
export async function readCollection<T>(path:string,init:RequestInit={},checkResponse?:(response:Response)=>void):Promise<{data:T[];truncated?:boolean}>{
 let truncated=false;const data:T[]=[];let cursor:string|null=null;const seen=new Set<string>();let pages=0;
 do{const response=await fetchWithTimeout(path+(cursor?(path.includes('?')?'&':'?')+'cursor='+encodeURIComponent(cursor):''),{...init,cache:'no-store'},20000);if(!response.ok)throw new CollectionReadError(response.status);checkResponse?.(response);const body=await response.json() as {data:T[];page?:{nextCursor?:string|null};truncated?:boolean};if(!Array.isArray(body.data))throw new Error('INVALID_COLLECTION');truncated ||= body.truncated===true;data.push(...body.data);cursor=body.page?.nextCursor??null;if(cursor){if(seen.has(cursor))throw new Error('REPEATED_COLLECTION_CURSOR');seen.add(cursor)}if(++pages>=50&&cursor){truncated=true;break}}while(cursor);return truncated?{data,truncated:true}:{data};
}
