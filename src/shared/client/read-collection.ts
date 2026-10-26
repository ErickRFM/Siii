/** Follow the server cursor so selectors never silently drop older catalog options. */
export async function readCollection<T>(path:string,init:RequestInit={}):Promise<{data:T[];truncated?:boolean}>{
 let truncated=false;const data:T[]=[];let cursor:string|null=null;const seen=new Set<string>();
 do{const response=await fetch(path+(cursor?(path.includes('?')?'&':'?')+'cursor='+encodeURIComponent(cursor):''),{...init,cache:'no-store'});if(!response.ok)throw new Error('COLLECTION_UNAVAILABLE');const body=await response.json() as {data:T[];page?:{nextCursor?:string|null};truncated?:boolean};if(!Array.isArray(body.data))throw new Error('INVALID_COLLECTION');truncated ||= body.truncated===true;data.push(...body.data);cursor=body.page?.nextCursor??null;if(cursor){if(seen.has(cursor))throw new Error('REPEATED_COLLECTION_CURSOR');seen.add(cursor)}}while(cursor);return truncated?{data,truncated:true}:{data};
}
