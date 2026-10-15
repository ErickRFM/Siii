/**
 * LOCAL SYNTHETIC REHEARSAL ONLY. Reverses date conversion, never hardening.
 * It preserves retained hours only if their calendar day is still current.
 * New/edited days become midnight timestamp without time zone. Legacy columns,
 * owners, RLS, ACLs, policies, runtime restrictions and migration hashes remain.
 * This intentionally leaves date types divergent from the applied ledger;
 * do not use the reversed schema with the deployed date-based application.
 */
import pg from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { assertMigrationLedger } from '../db/migration-safety';
import { assertNoConnectionOverrides } from '../db/connection-url';

function reject(code: string): never { throw new Error(code); }
function localSyntheticUrl(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV !== 'test' || env.SIII_DATABASE_ENV !== 'test' ||
      env.SIII_SYNTHETIC_REHEARSAL !== '1' || env.SIII_ROLLBACK_CONFIRM !== 'LOCAL_SYNTHETIC_DATES_ONLY' ||
      !env.DATABASE_URL) reject('LOCAL_SYNTHETIC_ROLLBACK_REQUIRED');
  let url: URL;
  try { url = new URL(env.DATABASE_URL); } catch { return reject('LOCAL_SYNTHETIC_ROLLBACK_REQUIRED'); }
  try { assertNoConnectionOverrides(url); } catch { return reject('LOCAL_SYNTHETIC_ROLLBACK_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) ||
      !/^\/p0_replay_[a-f0-9]{12}_[a-z]+_test$/.test(url.pathname)) {
    reject('LOCAL_SYNTHETIC_ROLLBACK_REQUIRED');
  }
  return env.DATABASE_URL;
}
async function securitySnapshot(client: pg.Client): Promise<string> {
  const r = await client.query("SELECT jsonb_build_object(" +
    "'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S'))," +
    "'policies',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',p.polname,'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY c.relname,p.polname) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')," +
    "'column_acl',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'acl',a.attacl::text) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped)," +
    "'defaults',(SELECT jsonb_agg(jsonb_build_object('owner',d.defaclrole,'schema',d.defaclnamespace,'kind',d.defaclobjtype,'acl',d.defaclacl::text) ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype) FROM pg_default_acl d)," +
    "'routines',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',p.proowner,'acl',p.proacl::text,'definer',p.prosecdef,'config',p.proconfig) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')," +
    "'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'create_role',rolcreaterole,'create_db',rolcreatedb,'login',rolcanlogin) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('siii_app','siii_migrator','anon','authenticated'))," +
    "'memberships',(SELECT jsonb_agg(jsonb_build_object('role',roleid,'member',member,'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY roleid,member) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('siii_app','siii_migrator','anon','authenticated')))," +
    "'ledger',(SELECT jsonb_agg(jsonb_build_object('hash',hash,'at',created_at) ORDER BY created_at,id) FROM drizzle.__drizzle_migrations)) AS signature");
  return JSON.stringify(r.rows[0].signature);
}
async function requireHardening(client: pg.Client) {
  await assertMigrationLedger(client);
  const ledger = await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
  const latest = readMigrationFiles({ migrationsFolder: './db/migrations' });
  if (latest.length < 4 || ledger.rows[0].n !== latest.length) reject('DATE_ROLLBACK_REQUIRES_HARDENING');
  const tables = await client.query("SELECT c.relname,c.relrowsecurity AS rls,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')");
  if (tables.rowCount !== 13 || tables.rows.some(t => !t.rls || t.owner !== 'siii_migrator')) reject('DATE_ROLLBACK_REQUIRES_HARDENING');
  const roles = await client.query("SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname IN ('siii_app','siii_migrator')");
  if (roles.rowCount !== 2 || roles.rows.some(r => r.rolsuper || r.rolbypassrls || r.rolcreaterole || r.rolcreatedb)) reject('DATE_ROLLBACK_REQUIRES_HARDENING');
  const audit = await client.query("SELECT has_table_privilege('siii_app','public.security_audit_log','SELECT') AND has_table_privilege('siii_app','public.security_audit_log','INSERT') AND NOT has_any_column_privilege('siii_app','public.security_audit_log','UPDATE') AND NOT has_table_privilege('siii_app','public.security_audit_log','DELETE,TRUNCATE') AS safe");
  if (!audit.rows[0].safe) reject('DATE_ROLLBACK_REQUIRES_HARDENING');
  const api = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES('anon'),('authenticated')) r(name) WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (has_table_privilege(r.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))");
  if (api.rowCount) reject('DATE_ROLLBACK_REQUIRES_HARDENING');
}
async function main() {
  const connectionString = localSyntheticUrl(process.env);
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
  try {
    await client.connect(); await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('siii:migrations'))");
    await requireHardening(client);
    const beforeSecurity = await securitySnapshot(client);
    const columns = (await client.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_terms' AND column_name IN ('start_date','end_date','legacy_start_date','legacy_end_date') ORDER BY column_name")).rows;
    const types = Object.fromEntries(columns.map(c => [c.column_name, c.data_type]));
    if (columns.length !== 4 || types.legacy_start_date !== 'timestamp without time zone' || types.legacy_end_date !== 'timestamp without time zone') reject('DATE_ROLLBACK_SCHEMA_UNSUPPORTED');
    if (types.start_date === 'timestamp without time zone' && types.end_date === 'timestamp without time zone') {
      await client.query('COMMIT'); console.log('LOCAL_DATES_ALREADY_REVERSED'); return;
    }
    if (types.start_date !== 'date' || types.end_date !== 'date') reject('DATE_ROLLBACK_SCHEMA_UNSUPPORTED');
    await client.query("LOCK TABLE public.academic_terms,public.security_audit_log IN ACCESS EXCLUSIVE MODE");
    await client.query("ALTER TABLE public.academic_terms ALTER COLUMN start_date TYPE timestamp without time zone USING(CASE WHEN legacy_start_date IS NOT NULL AND legacy_start_date::date=start_date THEN legacy_start_date ELSE start_date::timestamp END), ALTER COLUMN end_date TYPE timestamp without time zone USING(CASE WHEN legacy_end_date IS NOT NULL AND legacy_end_date::date=end_date THEN legacy_end_date ELSE end_date::timestamp END)");
    if (await securitySnapshot(client) !== beforeSecurity) reject('DATE_ROLLBACK_SECURITY_CHANGED');
    // Sensitive rehearsal operation is appended; no earlier audit row is edited.
    await client.query("INSERT INTO public.security_audit_log(action,target,request_id,details) VALUES('rehearsal.academic_term_dates.rollback','academic_terms','local-synthetic-rehearsal',jsonb_build_object('environment','local_synthetic','legacy_hours','restore_only_if_current_day_matches','new_or_edited_days','midnight','hardening','preserved','ledger','unchanged'))");
    await client.query('COMMIT'); console.log('LOCAL_DATE_ROLLBACK_REHEARSED');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); throw error;
  } finally { await client.end(); }
}
main().catch((error: unknown) => {
  const safe = new Set(['LOCAL_SYNTHETIC_ROLLBACK_REQUIRED','DATE_ROLLBACK_REQUIRES_HARDENING','DATE_ROLLBACK_SCHEMA_UNSUPPORTED','DATE_ROLLBACK_SECURITY_CHANGED','MIGRATION_LEDGER_DRIFT']);
  console.error(error instanceof Error && safe.has(error.message) ? error.message : 'LOCAL_DATE_ROLLBACK_FAILED');
  process.exitCode = 1;
});

