import {assertNoConnectionOverrides} from './connection-url';
import pg from 'pg';
<<<<<<< HEAD
import {storedReleaseProfile,readReleaseMigrations} from './release-profile';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export function validateMigrationEnvironment(env: NodeJS.ProcessEnv): string {
=======
import { readMigrationFiles } from 'drizzle-orm/migrator';

export function validateMigrationEnvironment(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === 'production' || env.SIII_DATABASE_ENV === 'production') throw new Error('PRODUCTION_MIGRATION_FORBIDDEN');
  if (!['development','test','staging'].includes(env.SIII_DATABASE_ENV ?? '')) throw new Error('DATABASE_ENV_REQUIRED');
>>>>>>> integrate/sii-v1
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const url=new URL(env.DATABASE_URL);
  if (!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_URL');
  assertNoConnectionOverrides(url);
<<<<<<< HEAD
  // The production database is permitted only through an explicitly authorized release.
  // Never infer safety from NODE_ENV or a caller-provided staging label.
  const productionRef='kkjzbqsaummyralqjqrb';
  const targetsProduction=url.hostname.includes(productionRef) ||
    decodeURIComponent(url.username).split('.').includes(productionRef);
  if (targetsProduction) {
    if (env.SIII_DATABASE_ENV !== 'production' ||
        env.SIII_ALLOW_PRODUCTION_MIGRATIONS !== 'I_ACKNOWLEDGE_PRODUCTION_MIGRATION')
      throw new Error('PRODUCTION_MIGRATION_NOT_AUTHORIZED');
  } else if (!['development','test','staging'].includes(env.SIII_DATABASE_ENV ?? '')) {
    throw new Error('DATABASE_ENV_REQUIRED');
  }
=======
  // Audited production project: block direct and Supabase pooler connections even if mislabeled.
  const productionRef='kkjzbqsaummyralqjqrb';
  if(url.hostname.includes(productionRef) || decodeURIComponent(url.username).split('.').includes(productionRef))
    throw new Error('PRODUCTION_MIGRATION_FORBIDDEN');
>>>>>>> integrate/sii-v1
  return env.DATABASE_URL;
}

export async function assertMigrationLedger(client: pg.Client | pg.PoolClient, folder='./db/migrations') {
  const state=await client.query<{exists:boolean;tableCount:number}>(`
    SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS "tableCount"
  `);
  const {exists,tableCount}=state.rows[0];
  if (!exists) {if(tableCount>0)throw new Error('BASELINE_REQUIRED');return;}
  const ledger=await client.query<{hash:string;created_at:string}>('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id');
  if (!ledger.rowCount && tableCount>0) throw new Error('BASELINE_REQUIRED');
<<<<<<< HEAD
  const profile=await storedReleaseProfile(client);
  const migrations=profile?readReleaseMigrations(profile,folder):readMigrationFiles({migrationsFolder:folder});
=======
  const migrations=readMigrationFiles({migrationsFolder:folder});
>>>>>>> integrate/sii-v1
  if(ledger.rows.length>migrations.length)throw new Error('MIGRATION_LEDGER_DRIFT');
  for(let i=0;i<ledger.rows.length;i++){
    if(ledger.rows[i].hash!==migrations[i].hash || Number(ledger.rows[i].created_at)!==migrations[i].folderMillis)
      throw new Error('MIGRATION_LEDGER_DRIFT');
  }
}
