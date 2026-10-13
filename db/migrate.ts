import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: './db/migrations' });
  await pool.end();
}

main().catch((e) => {
  console.error('Migration failed', e);
  process.exit(1);
});