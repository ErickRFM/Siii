import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { assertMigrationLedger, validateMigrationEnvironment } from './migration-safety';

async function main() {
  const connectionString=validateMigrationEnvironment(process.env);
  const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:60000});
  pool.on('error',()=>{console.error('MIGRATION_POOL_ERROR');process.exitCode=1;});
  const client=await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('siii:migrations'))");
    await assertMigrationLedger(client);
    await migrate(drizzle(client),{migrationsFolder:'./db/migrations'});
    console.log('MIGRATIONS_APPLIED');
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('siii:migrations'))").catch(()=>undefined);
    client.release();
    await pool.end();
  }
}
main().catch((error:unknown)=>{
  // Driver messages may include SQL or connection credentials; emit known stable codes only.
  const safe=new Set(['PRODUCTION_MIGRATION_FORBIDDEN','DATABASE_ENV_REQUIRED','DATABASE_URL_REQUIRED','INVALID_DATABASE_URL','BASELINE_REQUIRED','MIGRATION_LEDGER_DRIFT']);
  const code=error instanceof Error && safe.has(error.message)?error.message:'MIGRATION_FAILED';
  console.error(code);process.exitCode=1;
});
