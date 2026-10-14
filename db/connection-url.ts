/** node-postgres query parameters can override the authority and database path. */
export function assertNoConnectionOverrides(url: URL): void {
 const allowed=new Set(['sslmode','application_name']),seen=new Set<string>();
 if(url.hash)throw new Error('INVALID_DATABASE_URL');
 for(const key of url.searchParams.keys()){
  if(!allowed.has(key)||seen.has(key))throw new Error('INVALID_DATABASE_URL');
  seen.add(key);
 }
}
