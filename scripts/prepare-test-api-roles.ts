import pg from 'pg';
import {isolatedDatabaseUrl} from '../tests/support/database-url';

// Supabase provides these API principals. Plain PostgreSQL CI starts without them.
// Only a loopback test database may prepare these non-login, non-privileged fixtures.
const client=new pg.Client({connectionString:isolatedDatabaseUrl()});
await client.connect();
try{
 const created:string[]=[];
 for(const name of ['anon','authenticated']){
  const existing=(await client.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_roles WHERE rolname=$1',[name])).rows[0];
  if(existing&&Object.values(existing).some(Boolean))throw new Error('TEST_API_ROLE_UNSAFE');
  if(!existing){await client.query('CREATE ROLE '+name+' NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');created.push(name)}
 }
 console.log(JSON.stringify({code:'ISOLATED_API_ROLES_READY',created}));
}finally{await client.end()}
