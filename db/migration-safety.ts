import pg from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export function validateMigrationEnvironment(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === 'production' || env.SIII_DATABASE_ENV === 'production') throw new Error('PRODUCTION_MIGRATION_FORBIDDEN');
  if (!['development','test','staging'].includes(env.SIII_DATABASE_ENV ?? '')) throw new Error('DATABASE_ENV_REQUIRED');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const url=new URL(env.DATABASE_URL);
  if (!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_URL');
  // Audited production project: block direct and Supabase pooler connections even if mislabeled.
  const productionRef='kkjzbqsaummyralqjqrb';
  if(url.hostname.includes(productionRef) || decodeURIComponent(url.username).split('.').includes(productionRef))
    throw new Error('PRODUCTION_MIGRATION_FORBIDDEN');
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
  const migrations=readMigrationFiles({migrationsFolder:folder});
  if(ledger.rows.length>migrations.length)throw new Error('MIGRATION_LEDGER_DRIFT');
  for(let i=0;i<ledger.rows.length;i++){
    if(ledger.rows[i].hash!==migrations[i].hash || Number(ledger.rows[i].created_at)!==migrations[i].folderMillis)
      throw new Error('MIGRATION_LEDGER_DRIFT');
  }
}
