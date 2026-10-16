import type {PoolConfig} from 'pg';
/** node-postgres URL SSL fields otherwise replace an explicit CA configuration. */
export function databaseConnectionOptions(connectionString:string|undefined,certificate?:string):PoolConfig{
 if(!certificate)return{connectionString};
 try{
  if(!connectionString)throw Error();
  const url=new URL(connectionString),mode=url.searchParams.get('sslmode');
  if(!['postgres:','postgresql:'].includes(url.protocol)||mode&&!['require','verify-ca','verify-full'].includes(mode))throw Error();
  for(const key of ['sslcert','sslkey','sslrootcert','sslpassword','sslnegotiation'])if(url.searchParams.has(key))throw Error();
  url.searchParams.delete('sslmode');
  return{connectionString:url.href,ssl:{ca:certificate.replace(/\\n/g,'\n'),rejectUnauthorized:true}};
 }catch{throw Error('DATABASE_TLS_CONFIGURATION_INVALID')}
}
