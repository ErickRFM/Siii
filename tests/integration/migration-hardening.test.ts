import {isolatedDatabaseUrl} from '../support/database-url';
const testDatabaseUrl=isolatedDatabaseUrl();
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const admin=new pg.Client({connectionString:testDatabaseUrl});
const prefix='p0_migration_'+randomUUID().replaceAll('-','').slice(0,12);
const globalCreator=prefix+'_creator';
const urls:Record<string,string>={};
const clients:pg.Client[]=[];
function command(script:string,url:string,extra:Record<string,string>={}){
 const result=spawnSync(process.execPath,['--import','tsx',script],{
  env:{...process.env,NODE_ENV:'test',SIII_DATABASE_ENV:'test',DATABASE_URL:url,...extra},
  encoding:'utf8',windowsHide:true,timeout:20000});
 return {status:result.status,output:result.stdout+result.stderr};
}
async function database(name:string,legacy:boolean){
 const dbname=prefix+'_'+name;await admin.query('CREATE DATABASE '+dbname);
 const url=new URL(testDatabaseUrl);url.pathname='/'+dbname;
 urls[name]=url.toString();const c=new pg.Client({connectionString:urls[name]});await c.connect();clients.push(c);
 if(legacy){for(const tag of ['0000_siii_foundation_identity','0001_academic_catalogs'])await c.query(readFileSync('db/migrations/'+tag+'.sql','utf8'));}
 return c;
}
describe('migration hardening on empty and production-shaped databases',()=>{
 let empty:pg.Client,baseline:pg.Client;
 beforeAll(async()=>{
  if(process.env.SIII_DATABASE_ENV!=='test')throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  await admin.connect();
  await admin.query("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;");
  await admin.query('CREATE ROLE '+globalCreator+' NOLOGIN');
  empty=await database('empty',false);baseline=await database('baseline',true);
  for(const c of [empty,baseline]){await c.query('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated');await c.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+globalCreator+' GRANT ALL ON TABLES TO anon,authenticated');await c.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+globalCreator+' GRANT ALL ON SEQUENCES TO anon,authenticated');}
  const unit=(await baseline.query("INSERT INTO institutions(name,code) VALUES('Synthetic baseline','BASELINE') RETURNING id")).rows[0].id;
  await baseline.query("INSERT INTO academic_terms(institution_id,name,code,start_date,end_date) VALUES($1,'Historical synthetic term','LEGACY','2026-01-01 12:00:00','2026-06-30 18:00:00')",[unit]);
  await empty.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated');
  await baseline.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated');
 });
 it('refuses a schema without migration history',async()=>{
  const r=command('db/migrate.ts',urls.baseline);expect(r.status).toBe(1);expect(r.output).toContain('BASELINE_REQUIRED');
  expect((await baseline.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS ledger" )).rows[0].ledger).toBeNull();
 });
 it('adopts only the exact known baseline without rewriting it',async()=>{
  const r=command('scripts/db-baseline.ts',urls.baseline,{SIII_BASELINE_CONFIRM:'0001_academic_catalogs'});
  expect(r.output).toContain('BASELINE_ADOPTED');expect(r.status).toBe(0);
  expect((await baseline.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n).toBe(2);
 });
 it('applies once to a clean database and makes every table private',async()=>{
  const r=command('db/migrate.ts',urls.empty);expect(r.status).toBe(0);
  const rows=(await empty.query("SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r'")).rows;
  expect(rows.length).toBeGreaterThanOrEqual(12);expect(rows.filter(r=>!r.relrowsecurity)).toEqual([]);
  expect(command('db/migrate.ts',urls.empty).status).toBe(0);
 });
 it('upgrades the adopted baseline with the same protections',async()=>{
  const r=command('db/migrate.ts',urls.baseline);expect(r.status).toBe(0);
  expect((await baseline.query("SELECT relrowsecurity FROM pg_class WHERE oid='platform_users'::regclass")).rows[0].relrowsecurity).toBe(true);
  const term=(await baseline.query("SELECT start_date::text AS day,legacy_start_date::text AS original FROM academic_terms WHERE code='LEGACY'")).rows[0];
  expect(term).toEqual({day:'2026-01-01',original:'2026-01-01 12:00:00'});
 });
 it('keeps calendar dates and constrains the database vocabulary',async()=>{
  const cols=(await empty.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_terms' AND column_name='start_date'")).rows;
  expect(cols[0].data_type).toBe('date');
  const inst=(await empty.query("INSERT INTO institutions(name,code) VALUES('Local synthetic institution','P0') RETURNING id")).rows[0].id;
  await expect(empty.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'BAD','Synthetic','invalid','presencial')",[inst])).rejects.toHaveProperty('code','23514');
 });
 it('revokes present and future Data API access',async()=>{
  for(const role of ['anon','authenticated']){
   const rows=(await empty.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege($1,c.oid,'SELECT')",[role])).rows;
   expect(rows).toEqual([]);
  }
  await empty.query('CREATE TABLE future_private(id int)');
  expect((await empty.query("SELECT has_table_privilege('anon','public.future_private','SELECT') AS allowed")).rows[0].allowed).toBe(false);
 });
 it('revokes global defaults from a distinct object creator',async()=>{
  await empty.query('GRANT USAGE,CREATE ON SCHEMA public TO '+globalCreator);
  await empty.query('SET ROLE '+globalCreator);
  try{await empty.query('CREATE TABLE globally_private(id integer)');await empty.query('CREATE SEQUENCE globally_private_sequence');}finally{await empty.query('RESET ROLE');}
  for(const role of ['anon','authenticated']){
   expect((await empty.query("SELECT has_table_privilege($1,'public.globally_private','SELECT') AS allowed",[role])).rows[0].allowed).toBe(false);
   expect((await empty.query("SELECT has_sequence_privilege($1,'public.globally_private_sequence','USAGE') AS allowed",[role])).rows[0].allowed).toBe(false);
  }
 });
 it('gives the application DML while rejecting DDL',async()=>{
  await empty.query('SET ROLE siii_app');
  try{
   expect((await empty.query('SELECT count(*) FROM institutions')).rowCount).toBe(1);
   await expect(empty.query('CREATE TABLE should_not_exist(id int)')).rejects.toHaveProperty('code','42501');
  }finally{await empty.query('RESET ROLE');}
 });

 it('refuses unknown baseline structure before recording any migration',async()=>{
  const drift=await database('drift',true);await drift.query('ALTER TABLE people ADD COLUMN unexpected_secret text');
  const result=command('scripts/db-baseline.ts',urls.drift,{SIII_BASELINE_CONFIRM:'0001_academic_catalogs'});
  expect(result.status).toBe(1);expect(result.output).toContain('BASELINE_SCHEMA_DRIFT');
  expect((await drift.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS ledger")).rows[0].ledger).toBeNull();
 });
 it('rejects a modified ledger instead of replaying DDL',async()=>{
  await empty.query("UPDATE drizzle.__drizzle_migrations SET hash='tampered' WHERE id=(SELECT min(id) FROM drizzle.__drizzle_migrations)");
  const result=command('db/migrate.ts',urls.empty);
  expect(result.status).toBe(1);expect(result.output).toContain('MIGRATION_LEDGER_DRIFT');
 });

 afterAll(async()=>{
  await Promise.all(clients.map(c=>c.end()));
  // Only the uniquely named disposable databases created in this file are removed.
  for(const name of Object.keys(urls)){const dbname=prefix+'_'+name;await admin.query('DROP DATABASE '+dbname);}
  await admin.query('DROP ROLE IF EXISTS '+globalCreator);
  await admin.end();
 });
});
