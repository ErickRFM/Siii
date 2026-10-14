import {describe,it,beforeAll,afterAll,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
const raw=isolatedDatabaseUrl(),admin=new pg.Client({connectionString:raw});
const name='p0_1_roles_'+randomUUID().replaceAll('-','').slice(0,12),url=new URL(raw);url.pathname='/'+name;
let owner:pg.Client;
function run(script:string,extra:Record<string,string>={}){
 const r=spawnSync(process.execPath,['--import','tsx',script],{env:{...process.env,NODE_ENV:'test',SIII_DATABASE_ENV:'test',DATABASE_URL:url.toString(),...extra},encoding:'utf8',windowsHide:true,timeout:30000});
 return {status:r.status,output:r.stdout+r.stderr};
}
describe.sequential('P0.1 reused roles and RPC privacy',()=>{
 beforeAll(async()=>{
  await admin.connect();await admin.query('CREATE DATABASE '+name);
  owner=new pg.Client({connectionString:url.toString()});await owner.connect();
  for(const tag of ['0000_siii_foundation_identity','0001_academic_catalogs'])await owner.query(readFileSync('db/migrations/'+tag+'.sql','utf8'));
  await owner.query("GRANT DELETE,TRUNCATE ON security_audit_log TO siii_app");
  await owner.query("CREATE FUNCTION public.synthetic_existing_rpc() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT 1 $$");
  await owner.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated');
  // Adoption must certify known table structure without reapplying historical DDL.
  expect(run('scripts/db-baseline.ts',{SIII_BASELINE_CONFIRM:'0001_academic_catalogs'}).status).toBe(0);
  expect(run('db/migrate.ts').status).toBe(0);
 },40000);
 it('normalizes legacy audit DELETE and TRUNCATE grants',async()=>{
  const row=(await owner.query("SELECT has_table_privilege('siii_app','public.security_audit_log','DELETE') AS deletion,has_table_privilege('siii_app','public.security_audit_log','TRUNCATE') AS truncation")).rows[0];
  expect(row).toEqual({deletion:false,truncation:false});
 });
 it('denies existing and future RPC execution to Data API roles',async()=>{
  await owner.query("CREATE FUNCTION public.synthetic_future_rpc() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$");
  for(const role of ['anon','authenticated'])for(const fn of ['synthetic_existing_rpc','synthetic_future_rpc']){
   expect((await owner.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,'public.'+fn+'()'])).rows[0].allowed).toBe(false);
  }
 });
 it('permits only append audit through a separate application LOGIN',async()=>{
  const role='p0_1_app_'+randomBytes(6).toString('hex'),pass=randomBytes(32).toString('hex');
  await owner.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '+pg.escapeLiteral(pass));
  await owner.query('GRANT siii_app TO '+role);
  const appUrl=new URL(url);appUrl.username=role;appUrl.password=pass;
  const app=new pg.Client({connectionString:appUrl.toString()});await app.connect();
  try{
   await app.query("INSERT INTO security_audit_log(action,target,request_id) VALUES('synthetic.append','fixture','test-request')");
   await expect(app.query("DELETE FROM security_audit_log")).rejects.toHaveProperty('code','42501');
   await expect(app.query("TRUNCATE security_audit_log")).rejects.toHaveProperty('code','42501');
   await expect(app.query("UPDATE security_audit_log SET action='tamper'")).rejects.toHaveProperty('code','42501');
   await expect(app.query("CREATE TABLE unauthorized(id integer)")).rejects.toHaveProperty('code','42501');
  }finally{await app.end();await owner.query('DROP ROLE '+role);}
 });
 afterAll(async()=>{await owner?.end();await admin.query('DROP DATABASE '+name);await admin.end();});
});

it('reconciles inherited API RPC/defaults and excessive app defaults additively',async()=>{
 const admin=new pg.Client({connectionString:raw});await admin.connect();
 const suffix=randomBytes(6).toString('hex'),database='p0_1_inherit_'+suffix+'_test',group='p0_1_rpc_'+suffix;
 const target=new URL(raw);target.pathname='/'+database;
 await admin.query('CREATE DATABASE '+database);await admin.query('CREATE ROLE '+group+' NOLOGIN');
 const client=new pg.Client({connectionString:target.toString()});await client.connect();await client.query('CREATE SCHEMA drizzle');await client.query('CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)');
 try{
  for(const tag of ['0000_siii_foundation_identity','0001_academic_catalogs','0002_p0_hardening','0003_p0_1_privacy'])await client.query(readFileSync('db/migrations/'+tag+'.sql','utf8'));
  await client.query("CREATE FUNCTION public.synthetic_inherited_rpc() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT 1 $$");
  await client.query('GRANT EXECUTE ON FUNCTION public.synthetic_inherited_rpc() TO '+group);
  await client.query('GRANT '+group+' TO anon');
  await client.query('ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO '+group);
  await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO '+group);
  for(const namespace of ['', ' IN SCHEMA public']){
   await client.query('ALTER DEFAULT PRIVILEGES'+namespace+' GRANT ALL ON TABLES TO siii_app');
   await client.query('ALTER DEFAULT PRIVILEGES'+namespace+' GRANT ALL ON SEQUENCES TO siii_app');
  }
  expect((await client.query("SELECT has_function_privilege('anon','public.synthetic_inherited_rpc()','EXECUTE') AS allowed")).rows[0].allowed).toBe(true);
  await client.query('CREATE TABLE public.synthetic_before(id integer)');
  expect((await client.query("SELECT has_table_privilege('siii_app','public.synthetic_before','TRUNCATE') AS allowed")).rows[0].allowed).toBe(true);
  await client.query(readFileSync('db/migrations/0004_p0_1_inherited_privileges.sql','utf8'));
  await client.query('CREATE TABLE public.synthetic_after(id integer)');
  await client.query('CREATE SEQUENCE public.synthetic_after_seq');
  await client.query("CREATE FUNCTION public.synthetic_after_rpc() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT 2 $$");
  for(const fn of ['synthetic_inherited_rpc','synthetic_after_rpc'])expect((await client.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',['anon','public.'+fn+'()'])).rows[0].allowed).toBe(false);
  expect((await client.query("SELECT has_table_privilege('siii_app','public.synthetic_after','DELETE,TRUNCATE,TRIGGER,REFERENCES') AS allowed")).rows[0].allowed).toBe(false);
  expect((await client.query("SELECT has_sequence_privilege('siii_app','public.synthetic_after_seq','USAGE,SELECT,UPDATE') AS allowed")).rows[0].allowed).toBe(false);
  await client.query(readFileSync('db/migrations/0004_p0_1_inherited_privileges.sql','utf8'));
 }finally{
  await client.query('REVOKE '+group+' FROM anon');await client.query('DROP OWNED BY '+group);await client.end();
  await admin.query('DROP DATABASE '+database);await admin.query('DROP ROLE '+group);await admin.end();
 }
},30000);
