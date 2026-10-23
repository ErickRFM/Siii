#!/usr/bin/env node
/**
 * Operator-side, read-only DB gate for the SIII → Compañero pilot.
 * No migrations, inserts, updates, locks or connection information in output.
 */
import pg from 'pg';
import {assertNoConnectionOverrides} from '../db/connection-url';
import {assertMigrationLedger} from '../db/migration-safety';
import {assessOutboxGate, type OutboxTableMetadata} from './siii-pilot-db-gate-logic';

async function main() {
  const urlString = process.env.DATABASE_URL;
  if (!urlString) throw Error('DATABASE_URL_REQUIRED');
  let url: URL;
  try { url = new URL(urlString); } catch { throw Error('INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('INVALID_DATABASE_URL');
  assertNoConnectionOverrides(url);

  const client = new pg.Client({
    connectionString: urlString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 12000,
    query_timeout: 12000,
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    // Existing repository verifier compares FULL Drizzle migration hashes, timestamps
    // and the stored Supabase release profile, not only the first 12 hash characters.
    await assertMigrationLedger(client);
    const exists = await client.query<{present: boolean}>(
      "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
    );
    const appliedMigrations = exists.rows[0]?.present
      ? Number((await client.query<{count: number}>(
          'SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations',
        )).rows[0]?.count ?? 0)
      : 0;
    const states = await client.query<OutboxTableMetadata>(`
      SELECT c.relname AS relation,
             pg_get_userbyid(c.relowner) AS owner,
             c.relrowsecurity AS rls_on,
             c.relforcerowsecurity AS rls_forced,
             (
               CASE WHEN to_regrole('anon') IS NULL THEN false
                 ELSE has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
                   OR has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
               END
               OR
               CASE WHEN to_regrole('authenticated') IS NULL THEN false
                 ELSE has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
                   OR has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
               END
               OR EXISTS (
                 SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl_entry
                 WHERE acl_entry.grantee = 0
                   AND acl_entry.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
               )
               OR EXISTS (
                 SELECT 1 FROM pg_attribute attr
                 CROSS JOIN LATERAL aclexplode(attr.attacl) column_acl
                 WHERE attr.attrelid = c.oid AND attr.attnum > 0
                   AND column_acl.grantee = 0
                   AND column_acl.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES')
               )
             ) AS api_grants
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r','p')
        AND c.relname = ANY($1::text[])
    `, [['academic_section_outbox','academic_section_versions']]);
    const assessment = assessOutboxGate(appliedMigrations, states.rows);
    process.stdout.write(JSON.stringify({
      kind: 'SIII_COMPANION_READONLY_DATABASE_GATE',
      migrationLedger: 'FULL_HASH_VERIFIED',
      appliedMigrations,
      ...assessment,
      actualDelivery: 'NOT_TESTED',
      productionWrites: 'NONE',
    }, null, 2) + '\n');
    if (assessment.decision !== 'SCHEMA_READY') process.exitCode = 2;
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
main().catch((error: unknown) => {
  const safe = new Set([
    'DATABASE_URL_REQUIRED','INVALID_DATABASE_URL','MIGRATION_LEDGER_DRIFT',
    'MIGRATION_PROFILE_DRIFT','MIGRATION_PROFILE_CONFLICT','BASELINE_REQUIRED',
  ]);
  const message = error instanceof Error && safe.has(error.message)
    ? error.message : 'DATABASE_GATE_CHECK_FAILED';
  console.error(message);
  process.exitCode = 1;
});
