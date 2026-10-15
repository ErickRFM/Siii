import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {emitInstitutionalSchema,quoteIdentifier} from '../../scripts/replay-institutional-schema';
import {schemaSignature} from '../../db/schema-signature';
// Added by the harness correction, never by changing historical SQL/exporter.
import {emitCloudLegacyReplay} from '../../scripts/rehearse-cloud-schema';
const source=new URL(isolatedDatabaseUrl());
if(!['127.0.0.1','localhost','[::1]'].includes(source.hostname))throw new Error('LOCAL_REPLAY_CLUSTER_REQUIRED');
const run=randomBytes(6).toString('hex'),prefix='p0_legacy_'+run,database=prefix+'_test';
const roles={owner:prefix+'_owner',creator:prefix+'_creator',service:prefix+'_service',dashboard:prefix+'_dashboard'};
const executor=prefix+'_executor',roleMap={postgres:roles.owner,supabase_admin:roles.creator,service_role:roles.service,dashboard_user:roles.dashboard};
const admin=new pg.Client({connectionString:source.toString()});
const createdRoles:string[]=[];let client:pg.Client|undefined,createdDatabase=false;
const snapshot=JSON.parse(readFileSync('docs/audit/P0_1_PRODUCTION_STRUCTURE.json','utf8'));
const inventory=async()=>{
 if(!client)throw new Error('FIXTURE_REQUIRED');
 return (await client.query("SELECT jsonb_build_object('schema',(SELECT nspacl::text FROM pg_namespace WHERE nspname='public'),'objects',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),'types',(SELECT jsonb_agg(t.typname ORDER BY t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'),'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d)) AS value")).rows[0].value;
};
describe.sequential('cloud legacy replay with a real non-superuser database owner',()=>{
 beforeAll(async()=>{
  await admin.connect();
  for(const name of ['anon','authenticated',...Object.values(roles),executor]){
   const existing=await admin.query('SELECT rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=$1',[name]);
   if(existing.rowCount){expect(Object.values(existing.rows[0]).every(value=>value===false)).toBe(true);continue;}
   await admin.query('CREATE ROLE '+quoteIdentifier(name)+' NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');createdRoles.push(name);
  }
  for(const name of Object.values(roles))await admin.query('GRANT '+quoteIdentifier(name)+' TO '+quoteIdentifier(executor)+' WITH INHERIT TRUE, SET TRUE');
  if(!/^p0_legacy_[a-f0-9]{12}_test$/.test(database))throw new Error('DISPOSABLE_DATABASE_REQUIRED');
  await admin.query('CREATE DATABASE '+quoteIdentifier(database)+' OWNER '+quoteIdentifier(executor)+' TEMPLATE template0');createdDatabase=true;
  const target=new URL(source);target.pathname='/'+database;client=new pg.Client({connectionString:target.toString()});await client.connect();
  await client.query('SET ROLE '+quoteIdentifier(executor));
  expect((await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
 });
 afterAll(async()=>{
  if(client){await client.query('ROLLBACK');await client.query('RESET ROLE');await client.end();}
  if(createdDatabase)await admin.query('DROP DATABASE '+quoteIdentifier(database));
  for(const name of [...createdRoles].reverse())await admin.query('DROP ROLE '+quoteIdentifier(name));
  await admin.end();
 });
 it('demonstrates the original ownership prerequisite failure and leaves no replay objects',async()=>{
  const before=await inventory();
  expect((await client!.query("SELECT has_schema_privilege($1,'public','CREATE') AS allowed",[roles.owner])).rows[0].allowed).toBe(false);
  await expect(client!.query(emitInstitutionalSchema(snapshot,{roleMap}))).rejects.toMatchObject({code:'42501'});
  await client!.query('ROLLBACK');
  expect(await inventory()).toEqual(before);
 });
 it('rolls back the preparatory grant and every replay object after an injected SQL failure',async()=>{
  const before=await inventory(),sql=emitCloudLegacyReplay(snapshot,roles);
  const commit='COMMIT;\n';expect(sql.endsWith(commit)).toBe(true);
  await expect(client!.query(sql.slice(0,-commit.length)+'SELECT 1/0;\n'+commit)).rejects.toMatchObject({code:'22012'});
  await client!.query('ROLLBACK');expect(await inventory()).toEqual(before);
 });
 it('replays the exact audited baseline atomically without pregranting fixture owners',async()=>{
  expect((await client!.query("SELECT has_schema_privilege($1,'public','CREATE') AS allowed",[roles.owner])).rows[0].allowed).toBe(false);
  await client!.query(emitCloudLegacyReplay(snapshot,roles));
  const expected=JSON.parse(readFileSync('db/baseline/supabase-2026-10-14-schema.json','utf8'));
  expect(await schemaSignature(client!)).toEqual(expected);
  expect((await client!.query("SELECT has_schema_privilege($1,'public','CREATE') AS allowed",[roles.owner])).rows[0].allowed).toBe(false);
  expect((await client!.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows[0].count).toBe(12);
 });
});
