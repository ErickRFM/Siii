import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {readReleaseMigrations,releaseDefinitionHash,releaseAppendixHash} from '../../db/release-profile';
import {isolatedDatabaseUrl} from '../support/database-url';
import {APPLICATION_BACKUP_METADATA_SQL,buildApplicationBackupInspectionSql,createApplicationBackupPlan,buildApplicationBackupSql,restoreApplicationBackup,validateApplicationCapture,type ApplicationBackupPlan,type ApplicationBackupManifest,type ApplicationCapture} from '../../scripts/application-backup';

const admin=new pg.Client({connectionString:isolatedDatabaseUrl()});
const prefix='p0_app_recovery_'+randomUUID().replaceAll('-','').slice(0,10);
const names:string[]=[],clients:pg.Client[]=[];
let source:pg.Client,target:pg.Client,managed:pg.Client,publicKey:string,privateKey:string,keyId:string,keyHome:string;
let plan:ApplicationBackupPlan,capture:ApplicationCapture,raw:string;
async function database(suffix:string){const name=prefix+'_'+suffix;await admin.query('CREATE DATABASE '+name+' TEMPLATE template0');names.push(name);const url=new URL(isolatedDatabaseUrl());url.pathname='/'+name;const client=new pg.Client({connectionString:url.href});await client.connect();clients.push(client);await client.query("SET timezone='UTC'; SET search_path=public,pg_catalog");return client}
async function migrate(client:pg.Client,profile:'canonical'|'supabase-v1',length:number){
 const roles=(await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('siii_app','siii_migrator') AND NOT rolsuper AND NOT rolcanlogin AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls")).rows;
 if(roles.length!==2)throw Error('SYNTHETIC_RECOVERY_REQUIRES_PREPROVISIONED_SAFE_ROLES');
 await client.query('CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)');
 const migrations=profile==='canonical'?readMigrationFiles({migrationsFolder:'db/migrations'}):readReleaseMigrations(profile);
 for(const migration of migrations.slice(0,length)){await client.query('BEGIN');try{for(const sql of migration.sql)await client.query(sql);await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[migration.hash,migration.folderMillis]);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}}
 if(profile==='supabase-v1'){
  await client.query('CREATE TABLE drizzle.siii_release_profile(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),profile text NOT NULL,definition_hash text NOT NULL,registered_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE drizzle.siii_release_appendix(name text PRIMARY KEY,definition_hash text NOT NULL,registered_at timestamptz NOT NULL DEFAULT now())');
  await client.query("INSERT INTO drizzle.siii_release_profile(profile,definition_hash) VALUES('supabase-v1',$1)",[releaseDefinitionHash(profile)]);
  await client.query("INSERT INTO drizzle.siii_release_appendix(name,definition_hash) VALUES('schema-isolation-v1',$1)",[releaseAppendixHash()]);
 }
 await client.query('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions');
}
async function inspect(client:pg.Client){const structure=(await client.query(APPLICATION_BACKUP_METADATA_SQL)).rows[0].metadata;return createApplicationBackupPlan((await client.query(buildApplicationBackupInspectionSql(structure))).rows[0].metadata,'kkjzbqsaummyralqjqrb')}
async function encrypt(client:pg.Client,expected:ApplicationBackupPlan){
 const results=await client.query(buildApplicationBackupSql({plan:expected,publicKey,recipientKeyId:keyId})) as unknown as pg.QueryResult[];
 return results.flatMap(result=>result.rows).filter(row=>'ciphertext_base64' in row) as ApplicationCapture[];
}
async function decrypt(client:pg.Client,archive:ApplicationCapture){return(await client.query("SELECT extensions.pgp_pub_decrypt(decode($1,'base64'),extensions.dearmor($2)) AS payload",[archive.ciphertext_base64,privateKey])).rows[0].payload as string}
async function empty(client:pg.Client){return(await client.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','drizzle','supabase_migrations') AND c.relkind IN('r','p')")).rows[0].n===0}
// Deliberately alter synthetic JSON inside PostgreSQL so the >2^53 fixture is never rounded by JS.
async function alter(expression:string,values:unknown[]=[]){return(await source.query(`SELECT (${expression})::text AS payload`,[raw,...values])).rows[0].payload as string}
async function manifestFor(payload:string){return(await source.query(`SELECT ($1::jsonb->'manifest') || jsonb_build_object('statistics',(SELECT jsonb_object_agg(key,jsonb_build_object('count',jsonb_array_length(value),'sha256',encode(sha256(convert_to(value::text,'UTF8')),'hex'))) FROM jsonb_each($1::jsonb->'records'))) AS manifest`,[payload])).rows[0].manifest as ApplicationBackupManifest}
async function withManifest(payload:string,manifest:ApplicationBackupManifest){return(await source.query("SELECT jsonb_set($1::jsonb,'{manifest}',$2::jsonb)::text AS payload",[payload,JSON.stringify(manifest)])).rows[0].payload as string}

describe.sequential('application logical recovery V2 (synthetic isolated databases)',()=>{
 beforeAll(async()=>{
  await admin.connect();source=await database('source');target=await database('target');managed=await database('managed');
  await migrate(source,'canonical',readMigrationFiles({migrationsFolder:'db/migrations'}).length);await migrate(managed,'supabase-v1',18);
  await source.query("INSERT INTO institutions(id,name,code) VALUES('11111111-1111-4111-8111-111111111111','Synthetic recovery only','SYNTHETIC'); INSERT INTO auth_throttle(key,scope,expires_at) VALUES('synthetic-key','login_ip','2030-01-01'); INSERT INTO security_audit_log(action,target,details) VALUES('synthetic','recovery','{\"integer\":9007199254740993123456789,\"nested\":{\"fraction\":0.12345678901234567890}}')");
  await source.query('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text NOT NULL PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text[])');
  await source.query("INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('202610270001',ARRAY['SELECT ''history only; never execute'''],'synthetic')");
  keyHome=mkdtempSync(join(tmpdir(),'siii-test-pgp-'));
  const gpg=(args:string[])=>execFileSync('gpg',['--homedir',keyHome,'--batch','--pinentry-mode','loopback','--passphrase','',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  gpg(['--quick-generate-key','synthetic-recovery@example.invalid','rsa2048','sign','1d']);
  const fingerprint=gpg(['--with-colons','--list-keys']).split('\n').find(line=>line.startsWith('fpr:'))!.split(':')[9];
  gpg(['--quick-add-key',fingerprint,'rsa2048','encr','1d']);
  publicKey=gpg(['--armor','--export']);privateKey=gpg(['--armor','--export-secret-keys']);
  keyId=(await source.query('SELECT upper(extensions.pgp_key_id(extensions.dearmor($1))) AS id',[publicKey])).rows[0].id;
  plan=await inspect(source);[capture]=await encrypt(source,plan);validateApplicationCapture(capture,keyId);raw=await decrypt(source,capture);
 },120000);
 it('captures every table and ledger with ciphertext-only output and fresh snapshot counts',async()=>{
  expect(Object.keys(capture).sort()).toEqual(['ciphertext_base64','ciphertext_sha256','manifest','recipient_key_id']);
  expect(capture.ciphertext_base64).not.toContain('Synthetic recovery only');
  expect(capture.manifest.tables.filter(t=>t.schema==='public')).toHaveLength(59);
  expect(capture.manifest.statistics['public.auth_throttle'].count).toBe(1);
  expect(capture.manifest.ledger).toHaveLength(28);
  await source.query("INSERT INTO auth_throttle(key,scope,expires_at) VALUES('second-synthetic-key','login_ip','2030-01-01')");
  const [fresh]=await encrypt(source,plan);expect(fresh.manifest.statistics['public.auth_throttle'].count).toBe(2);
  await source.query("DELETE FROM auth_throttle WHERE key='second-synthetic-key'");
 });
 it('rejects structural drift and missing table/column manifests without producing a partial archive',async()=>{
  await source.query('ALTER TABLE auth_throttle ADD COLUMN synthetic_drift text');
  try{expect(await encrypt(source,plan)).toEqual([])}finally{await source.query('ALTER TABLE auth_throttle DROP COLUMN synthetic_drift')}
  const missing=structuredClone(plan);missing.tables=missing.tables.filter(t=>t.name!=='people');expect(()=>buildApplicationBackupSql({plan:missing,publicKey,recipientKeyId:keyId})).toThrow('BACKUP_TABLE_SET_MISMATCH');
 });
 it('rejects forged ledger and recipient IDs at capture time',async()=>{
  await source.query("UPDATE drizzle.__drizzle_migrations SET hash=repeat('a',64) WHERE id=1");
  try{expect(await encrypt(source,plan)).toEqual([])}finally{await source.query('UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE id=1',[plan.ledger[0].hash])}
  const results=await source.query(buildApplicationBackupSql({plan,publicKey,recipientKeyId:'0000000000000000'})) as unknown as pg.QueryResult[];
  expect(results.flatMap(r=>r.rows).filter(r=>'ciphertext_base64' in r)).toEqual([]);
 });
 it('rejects remote effective destinations before restoring',async()=>{
  const endpoint=target as pg.Client&{host:string};const original=endpoint.host;endpoint.host='remote.example.invalid';
  try{await expect(restoreApplicationBackup(target,raw,{expectedManifest:capture.manifest})).rejects.toThrow('LOCAL_RECOVERY_ONLY')}finally{endpoint.host=original}
  expect(await empty(target)).toBe(true);
 });
 it('rejects omitted tables, columns and tampered hashes with atomic rollback',async()=>{
  for(const changed of [await alter("$1::jsonb #- '{records,public.people}'"),await alter("jsonb_set($1::jsonb,'{records,public.auth_throttle,0}',($1::jsonb#>'{records,public.auth_throttle,0}')-'scope')"),await alter("jsonb_set($1::jsonb,'{records,public.auth_throttle,0,failures}','99')")]){
   await expect(restoreApplicationBackup(target,changed,{expectedManifest:capture.manifest})).rejects.toThrow();expect(await empty(target)).toBe(true);
  }
 });
 it('checks all FK rows explicitly even when constraints were already marked valid',async()=>{
  const corrupted=await alter("jsonb_set($1::jsonb,'{records,public.security_audit_log,0,institution_id}','\"99999999-9999-4999-8999-999999999999\"')");
  const manifest=await manifestFor(corrupted),payload=await withManifest(corrupted,manifest);
  await expect(restoreApplicationBackup(target,payload,{expectedManifest:manifest})).rejects.toThrow('RESTORED_FOREIGN_KEY_MISMATCH');
  expect(await empty(target)).toBe(true);
 });
 it('keeps CHECK and PK validation active and never returns private database error details',async()=>{
  const corrupted=await alter("jsonb_set($1::jsonb,'{records,public.auth_throttle,0,failures}','-1')");const manifest=await manifestFor(corrupted);
  await expect(restoreApplicationBackup(target,await withManifest(corrupted,manifest),{expectedManifest:manifest})).rejects.toThrow('RECOVERY_DATABASE_OPERATION_FAILED');expect(await empty(target)).toBe(true);
 });
 it('restores all values including JSON precision, key PK and migration history',async()=>{
  const result=await restoreApplicationBackup(target,raw,{expectedManifest:capture.manifest});expect(result.tables).toBe(60);expect(result.allRowsEqual).toBe(true);expect(result.historyEqual).toBe(true);
  expect((await target.query("SELECT details->>'integer' AS value,details#>>'{nested,fraction}' AS fraction FROM security_audit_log")).rows).toEqual([{value:'9007199254740993123456789',fraction:'0.12345678901234567890'}]);
  expect((await target.query('SELECT key FROM auth_throttle')).rows).toEqual([{key:'synthetic-key'}]);
  expect((await target.query('SELECT statements FROM supabase_migrations.schema_migrations')).rows[0].statements).toEqual(["SELECT 'history only; never execute'"]);
 });
 it('refuses overwrite of a recovered database',async()=>{await expect(restoreApplicationBackup(target,raw,{expectedManifest:capture.manifest})).rejects.toThrow('EMPTY_RECOVERY_DATABASE_REQUIRED')});
 it('restores the exact managed prefix, profile and appendix',async()=>{
  const p=await inspect(managed),[archive]=await encrypt(managed,p),destination=await database('managed_target');
  const payload=await decrypt(managed,archive);const result=await restoreApplicationBackup(destination,payload,{expectedManifest:archive.manifest});expect(result.historyEqual).toBe(true);
  expect((await destination.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n).toBe(18);
  expect((await destination.query('SELECT profile FROM drizzle.siii_release_profile')).rows[0].profile).toBe('supabase-v1');
 });
 afterAll(async()=>{for(const client of clients)await client.end();for(const name of names)await admin.query('DROP DATABASE IF EXISTS '+name);await admin.end();if(keyHome)rmSync(keyHome,{recursive:true,force:true})},60000);
});

