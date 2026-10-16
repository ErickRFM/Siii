import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import type pg from 'pg';

const PROFILE='supabase-v1';
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function manifest(profile:string){
 if(profile!==PROFILE)throw Error('MIGRATION_PROFILE_INVALID');
 return JSON.parse(readFileSync(new URL('./releases/supabase-v1/manifest.json',import.meta.url),'utf8')) as {profile:string;version:number;entries:{idx:number;tag:string;when:number;canonicalHash:string;executedHash:string}[]};
}
export function readReleaseMigrations(profile:string,folder='./db/migrations'){
 const definition=manifest(profile),canonical=readMigrationFiles({migrationsFolder:folder});
 const journal=JSON.parse(readFileSync(join(folder,'meta/_journal.json'),'utf8'));
 if(definition.profile!==PROFILE||definition.version!==1||canonical.length<definition.entries.length)throw Error('MIGRATION_PROFILE_DRIFT');
 return canonical.map((migration,index)=>{
  if(index>=definition.entries.length)return migration;
  const entry=definition.entries[index],tag=journal.entries[index];
  if(entry.idx!==index||entry.tag!==tag.tag||entry.when!==migration.folderMillis||entry.canonicalHash!==migration.hash)throw Error('MIGRATION_PROFILE_DRIFT');
  if(index!==2&&index!==3&&index!==4){if(entry.executedHash!==migration.hash)throw Error('MIGRATION_PROFILE_DRIFT');return migration}
  const replacement=readFileSync(new URL('./releases/supabase-v1/'+entry.tag+'.sql',import.meta.url),'utf8');
  if(digest(replacement)!==entry.executedHash)throw Error('MIGRATION_PROFILE_DRIFT');
  return {...migration,sql:replacement.split('--> statement-breakpoint'),hash:entry.executedHash};
 });
}
export function releaseDefinitionHash(profile:string){readReleaseMigrations(profile);return digest(JSON.stringify(manifest(profile)))}
type Client=pg.Client|pg.PoolClient;
export async function storedReleaseProfile(client:Client):Promise<string|undefined>{
 if(!(await client.query("SELECT to_regclass('drizzle.siii_release_profile') IS NOT NULL AS exists")).rows[0].exists)return;
 const rows=(await client.query('SELECT profile,definition_hash FROM drizzle.siii_release_profile')).rows;
 if(rows.length!==1||rows[0].profile!==PROFILE||rows[0].definition_hash!==releaseDefinitionHash(PROFILE))throw Error('MIGRATION_PROFILE_DRIFT');
 return PROFILE;
}
export async function registerReleaseProfile(client:Client,requested:string|undefined){
 const stored=await storedReleaseProfile(client);
 if(requested&&requested!=='canonical'&&requested!==PROFILE)throw Error('MIGRATION_PROFILE_INVALID');
 if(stored){if(requested&&requested!==stored)throw Error('MIGRATION_PROFILE_CONFLICT');return stored}
 if(!requested||requested==='canonical')return;
 const exists=(await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists")).rows[0].exists;
 if(exists&&(await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n>3)throw Error('MIGRATION_PROFILE_CONFLICT');
 const fingerprint=releaseDefinitionHash(requested);
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query('CREATE TABLE drizzle.siii_release_profile(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),profile text NOT NULL,definition_hash text NOT NULL,registered_at timestamptz NOT NULL DEFAULT now())');
  await client.query('INSERT INTO drizzle.siii_release_profile(profile,definition_hash) VALUES($1,$2)',[requested,fingerprint]);
 return requested;
}
/** Called under the global migration advisory lock. Registration, DDL and actual hashes commit together. */
export async function migrateManagedRelease(client:Client,requested:string){
 await client.query('BEGIN');
 try{
  const profile=await registerReleaseProfile(client,requested);
  if(!profile)throw Error('MIGRATION_PROFILE_INVALID');
  const migrations=readReleaseMigrations(profile);
  await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)');
  const ledger=(await client.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  if(ledger.length>migrations.length||ledger.some((row,index)=>row.hash!==migrations[index].hash||Number(row.created_at)!==migrations[index].folderMillis))throw Error('MIGRATION_LEDGER_DRIFT');
  for(const migration of migrations.slice(ledger.length)){
   for(const statement of migration.sql)if(statement.trim())await client.query(statement);
   await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[migration.hash,migration.folderMillis]);
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error}
}
