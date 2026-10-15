import {isolatedDatabaseUrl} from './database-url';
import {spawn} from 'node:child_process';
import {openSync,closeSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
export default async function setup(){
 const raw=isolatedDatabaseUrl(),url=new URL(raw);
 const admin=new pg.Client({connectionString:raw});await admin.connect();
 for(const name of ['anon','authenticated']){
  const existing=(await admin.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_roles WHERE rolname=$1',[name])).rows[0];
  if(!existing)await admin.query('CREATE ROLE '+name+' NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');
  else if(Object.values(existing).some(Boolean))throw new Error('HTTP_TEST_API_ROLE_UNSAFE');
 }
 const role='p0_http_app_'+randomBytes(8).toString('hex'),password=randomBytes(32).toString('hex');
 await admin.query('CREATE ROLE "'+role+'" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '+pg.escapeLiteral(password));
 await admin.query('GRANT siii_app TO "'+role+'"');
 const appUrl=new URL(url);appUrl.username=role;appUrl.password=password;appUrl.searchParams.delete('options');
 mkdirSync('.superpowers/sdd/2026-10-13-p0-hardening',{recursive:true});
 writeFileSync('.superpowers/sdd/2026-10-13-p0-hardening/app-connection.json',JSON.stringify({connectionString:appUrl.toString()}));
 const log=openSync('.superpowers/sdd/2026-10-13-p0-hardening/http-server.log','w');
 // Global setup passes process.env to workers as well as the application child.
 process.env.SIII_MFA_KEYS ||= JSON.stringify({fixture:randomBytes(32).toString('base64')});
 process.env.SIII_MFA_ACTIVE_KEY_ID ||= 'fixture';
 process.env.SIII_INVITATION_KEYS ||= JSON.stringify({fixture:randomBytes(32).toString('base64')});
 process.env.SIII_INVITATION_ACTIVE_KEY_ID ||= 'fixture';
 process.env.SIII_PUBLIC_ORIGIN ||= 'https://siii.fixture.example';
 const child=spawn(process.execPath,['tests/support/server.mjs'],{env:{...process.env,NODE_ENV:'development',DATABASE_URL:appUrl.toString(),SIII_MFA_KEYS:process.env.SIII_MFA_KEYS||JSON.stringify({fixture:randomBytes(32).toString('base64')}),SIII_MFA_ACTIVE_KEY_ID:process.env.SIII_MFA_ACTIVE_KEY_ID||'fixture',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore',log,log],windowsHide:true});
 closeSync(log);
 async function stop(){
  child.kill();
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1',[role]);
  await admin.query('DROP ROLE "'+role+'"');await admin.end();
 }
 const started=Date.now();
 while(Date.now()-started<60000){
  if(child.exitCode!==null){await stop();throw new Error('HTTP_TEST_SERVER_EXITED');}
  try{if((await fetch('http://127.0.0.1:3107/api/health')).ok)return stop;}catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 await stop();throw new Error('HTTP_TEST_SERVER_TIMEOUT');
}
