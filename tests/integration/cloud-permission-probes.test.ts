import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {quoteIdentifier} from '../../scripts/replay-institutional-schema';
import {runPermissionProbes} from '../../scripts/rehearse-cloud-schema';

const source=new URL(isolatedDatabaseUrl());
if(!['127.0.0.1','localhost','[::1]'].includes(source.hostname))throw new Error('LOCAL_REPLAY_CLUSTER_REQUIRED');
const run=randomBytes(6).toString('hex'),prefix='p0_probe_'+run,database=prefix+'_test';
const roles={owner:prefix+'_owner',creator:prefix+'_creator'};
const admin=new pg.Client({connectionString:source.toString()});
const createdRoles:string[]=[];let client:pg.Client|undefined,createdDatabase=false;
const snapshot=async()=>{
 if(!client)throw new Error('FIXTURE_REQUIRED');
 return (await client.query(`SELECT jsonb_build_object(
 'schema',(SELECT nspacl::text FROM pg_namespace WHERE nspname='public'),
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'kind',c.relkind,'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'acl',a.attacl::text) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped),
 'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d),
 'routines',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'ledger',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM drizzle.__drizzle_migrations l),
 'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM security_audit_log a),
 'people',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM people p)) AS value`)).rows[0].value;
};

describe.sequential('permission probe transaction isolation in real local PostgreSQL',()=>{
 beforeAll(async()=>{
  await admin.connect();
  for(const name of ['anon','authenticated','siii_app',...Object.values(roles)]){
   const existing=await admin.query('SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=$1',[name]);
   if(existing.rowCount){expect(Object.values(existing.rows[0]).every(value=>value===false)).toBe(true);continue;}
   await admin.query('CREATE ROLE '+quoteIdentifier(name)+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');createdRoles.push(name);
  }
  if(!/^p0_probe_[a-f0-9]{12}_test$/.test(database))throw new Error('DISPOSABLE_DATABASE_REQUIRED');
  await admin.query('CREATE DATABASE '+quoteIdentifier(database)+' TEMPLATE template0');createdDatabase=true;
  const target=new URL(source);target.pathname='/'+database;client=new pg.Client({connectionString:target.toString()});await client.connect();
  await client.query('CREATE TABLE public.people(id integer PRIMARY KEY); INSERT INTO people VALUES(1); ALTER TABLE people ENABLE ROW LEVEL SECURITY; ALTER TABLE people FORCE ROW LEVEL SECURITY; CREATE POLICY fixture_deny ON public.people AS RESTRICTIVE FOR ALL TO anon,authenticated USING(false) WITH CHECK(false)');
  await client.query("CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id integer,hash text,created_at bigint); INSERT INTO drizzle.__drizzle_migrations VALUES(1,'synthetic-ledger',123); CREATE TABLE security_audit_log(id integer,action text); INSERT INTO security_audit_log VALUES(1,'synthetic-original')");
  await client.query("CREATE FUNCTION public.cloud_legacy_rpc() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT 1'; REVOKE ALL ON FUNCTION public.cloud_legacy_rpc() FROM PUBLIC,anon,authenticated,siii_app");
  for(const creator of Object.values(roles))await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+quoteIdentifier(creator)+' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
 });
 afterAll(async()=>{
  if(client){await client.query('ROLLBACK');await client.query('RESET ROLE');await client.end();}
  if(createdDatabase)await admin.query('DROP DATABASE '+quoteIdentifier(database));
  for(const name of [...createdRoles].reverse())await admin.query('DROP ROLE '+quoteIdentifier(name));
  await admin.end();
 });
 it('can repeat the same named probes without changing objects, schema ACL, policies, ledger or audit',async()=>{
  const before=await snapshot();
  const first=await runPermissionProbes(client!,roles,run);
  const second=await runPermissionProbes(client!,roles,run);
  expect(first).toEqual(second);
  expect(await snapshot()).toEqual(before);
  expect(first).toMatchObject({restrictiveRls:true,probesRolledBack:true});
  expect(first.future).toHaveLength(2);
 });
 it('restores role and fixtures after PostgreSQL itself aborts the transaction',async()=>{
  const before=await snapshot(),faultRun=randomBytes(6).toString('hex');let injected=false;
  const realQuery=client!.query.bind(client!);
  const wrapped=new Proxy(client!,{get(target,key){
   if(key!=='query')return Reflect.get(target,key);
   return async(...args:unknown[])=>{
    const result=await Reflect.apply(realQuery,target,args);
    if(!injected&&typeof args[0]==='string'&&args[0].startsWith('CREATE SEQUENCE public.')){injected=true;await realQuery('SELECT FROM');}
    return result;
   };
  }});
  await expect(runPermissionProbes(wrapped,roles,faultRun)).rejects.toMatchObject({code:'42601'});
  expect(injected).toBe(true);expect(await snapshot()).toEqual(before);
  expect((await client!.query('SELECT current_user=session_user AS restored')).rows[0].restored).toBe(true);
  await expect(runPermissionProbes(client!,roles,faultRun)).resolves.toMatchObject({probesRolledBack:true});
  expect(await snapshot()).toEqual(before);
 });
 it('rolls back a driver failure after a real CREATE and permits the same named retry',async()=>{
  const before=await snapshot(),faultRun=randomBytes(6).toString('hex');let injected=false;
  const realQuery=client!.query.bind(client!);
  const wrapped=new Proxy(client!,{get(target,key){
   if(key!=='query')return Reflect.get(target,key);
   return async(...args:unknown[])=>{
    const result=await Reflect.apply(realQuery,target,args);
    if(!injected&&typeof args[0]==='string'&&args[0].startsWith('CREATE TABLE public.')){injected=true;throw new Error('SYNTHETIC_POST_CREATE_FAILURE');}
    return result;
   };
  }});
  await expect(runPermissionProbes(wrapped,roles,faultRun)).rejects.toThrow('SYNTHETIC_POST_CREATE_FAILURE');
  expect(injected).toBe(true);expect(await snapshot()).toEqual(before);
  expect((await client!.query('SELECT current_user=session_user AS restored')).rows[0].restored).toBe(true);
  await expect(runPermissionProbes(client!,roles,faultRun)).resolves.toMatchObject({probesRolledBack:true});
  expect(await snapshot()).toEqual(before);
 });
});
