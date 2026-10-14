import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { validateMigrationEnvironment, assertMigrationLedger } from '../db/migration-safety';
import { schemaSignature } from '../db/schema-signature';
async function main(){
 const connectionString=validateMigrationEnvironment(process.env);
 if(process.env.SIII_BASELINE_CONFIRM!=='0001_academic_catalogs')throw new Error('BASELINE_CONFIRM_REQUIRED');
 const client=new pg.Client({connectionString,connectionTimeoutMillis:5000,statement_timeout:30000});
 try{
  await client.connect();await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('siii:migrations'))");
  const existing=await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists");
  if(existing.rows[0].exists){
   await assertMigrationLedger(client);await client.query('COMMIT');console.log('BASELINE_ALREADY_RECORDED');return;
  }
  const reference=JSON.parse(await readFile(new URL('../db/baseline/0001-schema.json',import.meta.url),'utf8'));
  if(JSON.stringify(await schemaSignature(client))!==JSON.stringify(reference))throw new Error('BASELINE_SCHEMA_DRIFT');
  await client.query('CREATE SCHEMA drizzle');
  await client.query('CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)');
  const migrations=readMigrationFiles({migrationsFolder:'./db/migrations'}).slice(0,2);
  if(migrations.length!==2)throw new Error('BASELINE_SCHEMA_DRIFT');
  for(const migration of migrations)await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[migration.hash,migration.folderMillis]);
  await client.query('COMMIT');console.log('BASELINE_ADOPTED');
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{await client.end();}
}
main().catch((error:unknown)=>{
 const known=new Set(['PRODUCTION_MIGRATION_FORBIDDEN','DATABASE_ENV_REQUIRED','DATABASE_URL_REQUIRED','INVALID_DATABASE_URL','BASELINE_CONFIRM_REQUIRED','BASELINE_SCHEMA_DRIFT','MIGRATION_LEDGER_DRIFT']);
 console.error(error instanceof Error && known.has(error.message)?error.message:'BASELINE_FAILED');process.exitCode=1;
});
