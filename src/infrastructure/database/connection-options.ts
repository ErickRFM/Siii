import type {PoolConfig} from 'pg';
/** node-postgres URL SSL fields otherwise replace an explicit CA configuration. */
export function databaseConnectionOptions(connectionString:string|undefined,certificate?:string):PoolConfig{
 if(!certificate)return{connectionString};
 try{
  if(!connectionString)throw Error();
  const url=new URL(connectionString),mode=url.searchParams.get('sslmode');
  if(!['postgres:','postgresql:'].includes(url.protocol)||mode&&!['require','verify-ca','verify-full'].includes(mode))throw Error();
  for(const key of url.searchParams.keys())if(!['sslmode','application_name','connect_timeout'].includes(key))throw Error();
  url.searchParams.delete('sslmode');
  return{connectionString:url.href,ssl:{ca:certificate.replace(/\\n/g,'\n'),rejectUnauthorized:true}};
 }catch{throw Error('DATABASE_TLS_CONFIGURATION_INVALID')}
}

/** Preserve the credential and CA; change only the well-known Supavisor port when explicitly enabled. */
export function serverlessTransactionPoolerUrl(connectionString:string|undefined,enabled:boolean):string|undefined{
 if(!enabled)return connectionString;
 if(!connectionString)throw Error('DATABASE_URL_REQUIRED');
 let url:URL;
 try{url=new URL(connectionString)}catch{throw Error('DATABASE_POOLER_CONFIGURATION_INVALID')}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.pooler.supabase.com')||url.port!=='5432'){
  // Avoid silently rewriting direct/custom Postgres endpoints or an already-transactional URL.
  if(url.hostname.endsWith('.pooler.supabase.com')&&url.port==='6543')return connectionString;
  throw Error('DATABASE_POOLER_CONFIGURATION_INVALID');
 }
 url.port='6543';
 return url.toString();
}
