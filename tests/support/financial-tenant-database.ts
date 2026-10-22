import type pg from 'pg';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {readReleaseMigrations,registerReleaseProfile,releaseAppendixHash} from '../../db/release-profile';

/** Real immutable0000–0024 SQL + actual execution hashes; no disabled constraints. */
export async function seedFinancialBaseline24(client:pg.Client,profile='canonical'){
  const migrations=(profile==='canonical'?readMigrationFiles({migrationsFolder:'db/migrations'}):readReleaseMigrations(profile)).slice(0,25);
  await client.query('BEGIN');
  try{
   if(profile!=='canonical')await registerReleaseProfile(client,profile);
   await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
   await client.query('CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)');
   if(profile!=='canonical'){
    await client.query('CREATE TABLE drizzle.siii_release_appendix(name text PRIMARY KEY,definition_hash text NOT NULL,registered_at timestamptz NOT NULL DEFAULT now())');
    await client.query("INSERT INTO drizzle.siii_release_appendix(name,definition_hash) VALUES('schema-isolation-v1',$1)",[releaseAppendixHash()]);
   }
   for(const migration of migrations){
    for(const statement of migration.sql)if(statement.trim())await client.query(statement);
    await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[migration.hash,migration.folderMillis]);
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}
}
