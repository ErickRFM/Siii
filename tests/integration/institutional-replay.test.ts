import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { isolatedDatabaseUrl } from '../support/database-url';
import { schemaSignature } from '../../db/schema-signature';
import { emitInstitutionalSchema, quoteIdentifier } from '../../scripts/replay-institutional-schema';

const sourceUrl = isolatedDatabaseUrl();
const source = new URL(sourceUrl);
if (!['127.0.0.1','localhost','[::1]'].includes(source.hostname)) throw new Error('LOCAL_REPLAY_CLUSTER_REQUIRED');
const prefix = 'p0_replay_' + randomUUID().replaceAll('-', '').slice(0, 12);
const admin = new pg.Client({ connectionString: sourceUrl });
const roleMap = { postgres: prefix + '_owner', supabase_admin: prefix + '_creator', service_role: prefix + '_service', dashboard_user: prefix + '_dashboard' };
const fixtureRoles = Object.values(roleMap);
const ownedApiRoles: string[] = [];
const runtimeLogin = prefix + '_runtime';
let runtimeLoginCreated = false;
const databaseNames: string[] = [], clients: pg.Client[] = [];
let client: pg.Client, url: string;
function command(script: string, targetUrl = url, extra: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', script], {
    env: { ...process.env, NODE_ENV: 'test', SIII_DATABASE_ENV: 'test', DATABASE_URL: targetUrl,
      SIII_SYNTHETIC_REHEARSAL: '1', SIII_ROLLBACK_CONFIRM: 'LOCAL_SYNTHETIC_DATES_ONLY', ...extra },
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  return { status: r.status, output: r.stdout + r.stderr };
}
async function fresh(name: string) {
  const database = prefix + '_' + name + '_test';
  if (!/^p0_replay_[a-f0-9]{12}_[a-z]+_test$/.test(database)) throw new Error('DISPOSABLE_DATABASE_REQUIRED');
  await admin.query('CREATE DATABASE ' + quoteIdentifier(database)); databaseNames.push(database);
  const target = new URL(sourceUrl); target.pathname = '/' + database;
  const c = new pg.Client({ connectionString: target.toString() }); await c.connect(); clients.push(c);
  return { client: c, url: target.toString() };
}
async function ledger(c = client) {
  return (await c.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
}
async function security() {
  return (await client.query("SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname")).rows;
}
async function asRole(role: string, fn: () => Promise<void>) {
  await client.query('SET ROLE ' + quoteIdentifier(role));
  try { await fn(); } finally { await client.query('RESET ROLE'); }
}
const snapshot = () => JSON.parse(readFileSync('docs/audit/P0_1_PRODUCTION_STRUCTURE.json', 'utf8'));

describe.sequential('local institutional replay with synthetic PostgreSQL roles', () => {
  beforeAll(async () => {
    await admin.connect();
    const version = (await admin.query("SELECT current_setting('server_version_num')::int AS n")).rows[0].n;
    if (version < 170000) throw new Error('POSTGRESQL_17_REQUIRED');
    for (const role of ['anon','authenticated']) {
      const existing = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
      if (!existing.rowCount) {
        await admin.query('CREATE ROLE ' + quoteIdentifier(role) + ' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
        ownedApiRoles.push(role);
      }
    }
    const api = (await admin.query("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('anon','authenticated')")).rows;
    expect(api).toHaveLength(2); expect(api.every(r => !r.rolsuper && !r.rolbypassrls && !r.rolcanlogin)).toBe(true);
    for (const role of fixtureRoles) await admin.query('CREATE ROLE ' + quoteIdentifier(role) + ' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
    const db = await fresh('main'); client = db.client; url = db.url;
    await client.query(emitInstitutionalSchema(snapshot(), { roleMap }));
  }, 30000);

  it('matches exact baselines with synthetic table owners before adoption', async () => {
    const signature = await schemaSignature(client);
    expect(signature).toEqual(JSON.parse(readFileSync('db/baseline/0001-schema.json', 'utf8')));
    expect(signature).toEqual(JSON.parse(readFileSync('db/baseline/supabase-2026-10-14-schema.json', 'utf8')));
    expect((await client.query("SELECT DISTINCT pg_get_userbyid(relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'")).rows).toEqual([{ owner: roleMap.postgres }]);
    for (const role of ['anon', 'authenticated']) expect((await client.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege($1,c.oid,'SELECT')", [role])).rows[0].n).toBe(0);
  });

  it('rejects a missing ledger without changing replayed structure', async () => {
    const signature = await schemaSignature(client), r = command('db/migrate.ts');
    expect(r.status).toBe(1); expect(r.output).toContain('BASELINE_REQUIRED');
    expect((await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS ledger")).rows[0].ledger).toBeNull();
    expect(await schemaSignature(client)).toEqual(signature);
  });

  it('adopts exact 0–1 hashes and rejects structural drift in a second disposable DB', async () => {
    const r = command('scripts/db-baseline.ts', url, { SIII_BASELINE_CONFIRM: '0001_academic_catalogs' });
    expect(r.status).toBe(0); expect(r.output).toContain('BASELINE_ADOPTED');
    expect(await ledger()).toEqual(readMigrationFiles({ migrationsFolder: './db/migrations' }).slice(0, 2).map(m => ({ hash: m.hash, created_at: String(m.folderMillis) })));
    const drift = await fresh('drift'); await drift.client.query(emitInstitutionalSchema(snapshot(), { roleMap }));
    await drift.client.query('ALTER TABLE public.people ADD COLUMN unexpected_column text');
    const rejected = command('scripts/db-baseline.ts', drift.url, { SIII_BASELINE_CONFIRM: '0001_academic_catalogs' });
    expect(rejected.status).toBe(1); expect(rejected.output).toContain('BASELINE_SCHEMA_DRIFT');
    expect((await drift.client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS ledger")).rows[0].ledger).toBeNull();
  });

  it('applies all additive corrections preserving historical hashes and removes global/scoped RPC grants', async () => {
    const institution = (await client.query("INSERT INTO public.institutions(name,code) VALUES('Synthetic replay university','REPLAY') RETURNING id")).rows[0].id;
    for (const [code, start, end] of [['HISTORICAL','2026-01-01 12:00:00','2026-06-30 18:00:00'],['MODIFIED','2026-02-01 09:00:00','2026-07-31 16:00:00']]) await client.query("INSERT INTO public.academic_terms(institution_id,name,code,start_date,end_date) VALUES($1,'Synthetic term',$2,$3,$4)", [institution, code, start, end]);
    await client.query("INSERT INTO public.security_audit_log(action,target,request_id) VALUES('synthetic.replay','synthetic-fixture','local-only')");
    for (const creator of [roleMap.postgres, roleMap.supabase_admin]) {
      await client.query('GRANT USAGE,CREATE ON SCHEMA public TO ' + quoteIdentifier(creator));
      await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + quoteIdentifier(creator) + ' GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,siii_app');
      await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + quoteIdentifier(creator) + ' IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,siii_app');
      await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + quoteIdentifier(creator) + ' GRANT ALL ON TABLES TO siii_app');
      await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + quoteIdentifier(creator) + ' IN SCHEMA public GRANT ALL ON TABLES TO siii_app');
      await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + quoteIdentifier(creator) + ' GRANT ALL ON SEQUENCES TO siii_app');
      await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE ' + quoteIdentifier(creator) + ' IN SCHEMA public GRANT ALL ON SEQUENCES TO siii_app');
    }
    await asRole(roleMap.supabase_admin, async () => { await client.query("CREATE FUNCTION public.synthetic_legacy_rpc() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT 1'"); });
    expect((await client.query("SELECT has_function_privilege('anon','public.synthetic_legacy_rpc()','EXECUTE') AS yes")).rows[0].yes).toBe(true);
    const initial = await ledger(), migrated = command('db/migrate.ts');
    expect(migrated.status).toBe(0); expect(migrated.output).toContain('MIGRATIONS_APPLIED');
    const all = await ledger(); expect(all.slice(0, 2)).toEqual(initial);
    expect(all).toEqual(readMigrationFiles({ migrationsFolder: './db/migrations' }).map(m => ({ hash: m.hash, created_at: String(m.folderMillis) })));
    expect(all).toHaveLength(readMigrationFiles({ migrationsFolder: './db/migrations' }).length);
    const protectedTables = await security(); expect(protectedTables.map(t=>t.relname)).toEqual(expect.arrayContaining([...['institutions','people','platform_users','institution_memberships','role_assignments','auth_sessions','auth_throttle','campuses','academic_programs','academic_terms','curriculum_versions','academic_courses','security_audit_log'],'auth_mfa_factors','auth_mfa_enrollments','auth_mfa_challenges','auth_mfa_recovery_codes']));
    expect(protectedTables.every(t => t.rls && t.owner === 'siii_migrator')).toBe(true);
    for (const role of ['anon', 'authenticated', 'siii_app']) expect((await client.query("SELECT has_function_privilege($1,'public.synthetic_legacy_rpc()','EXECUTE') AS yes", [role])).rows[0].yes).toBe(false);
    const leaks = (await client.query("SELECT d.defaclobjtype FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) acl WHERE d.defaclobjtype='f' AND d.defaclrole IN (SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[])) AND (d.defaclnamespace=0 OR d.defaclnamespace='public'::regnamespace) AND acl.privilege_type='EXECUTE' AND (acl.grantee=0 OR acl.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','siii_app')))", [[roleMap.postgres, roleMap.supabase_admin, 'siii_migrator']])).rows;
    expect(leaks).toEqual([]);
    await client.query("UPDATE public.academic_terms SET start_date='2026-03-15',end_date='2026-08-15' WHERE code='MODIFIED'");
    await client.query("INSERT INTO public.academic_terms(institution_id,name,code,start_date,end_date) VALUES($1,'Synthetic new date','NEW','2026-09-01','2026-12-20')", [institution]);
  });

  it('enforces audit append-only and restrictive RLS despite synthetic conflicting grants', async () => {
    const audit = (await client.query("SELECT has_table_privilege('siii_app','public.security_audit_log','SELECT') AS read,has_table_privilege('siii_app','public.security_audit_log','INSERT') AS append,has_any_column_privilege('siii_app','public.security_audit_log','UPDATE') AS update,has_table_privilege('siii_app','public.security_audit_log','DELETE') AS delete,has_table_privilege('siii_app','public.security_audit_log','TRUNCATE') AS truncate")).rows[0];
    expect(audit).toEqual({ read: true, append: true, update: false, delete: false, truncate: false });
    await asRole('siii_app', async () => {
      await client.query("INSERT INTO public.security_audit_log(action,target) VALUES('synthetic.append','synthetic-runtime')");
      await expect(client.query("UPDATE public.security_audit_log SET action='mutated'")).rejects.toHaveProperty('code','42501');
      await expect(client.query('DELETE FROM public.security_audit_log')).rejects.toHaveProperty('code','42501');
      await expect(client.query('TRUNCATE public.security_audit_log')).rejects.toHaveProperty('code','42501');
      await expect(client.query('CREATE TABLE public.unwanted(id integer)')).rejects.toHaveProperty('code','42501');
    });
    await client.query('GRANT USAGE ON SCHEMA public TO anon,authenticated');
    await client.query('GRANT SELECT ON public.people TO anon,authenticated');
    await client.query('CREATE POLICY synthetic_permissive ON public.people FOR SELECT TO anon,authenticated USING(true)');
    await client.query("INSERT INTO public.people(first_name,last_name) VALUES('Synthetic','Fixture')");
    for (const role of ['anon','authenticated']) await asRole(role, async () => {
      expect((await client.query('SELECT id FROM public.people')).rows).toEqual([]);
      await expect(client.query('SELECT public.synthetic_legacy_rpc()')).rejects.toHaveProperty('code','42501');
    });
    await client.query('DROP POLICY synthetic_permissive ON public.people');
    await client.query('REVOKE SELECT ON public.people FROM anon,authenticated');
    await client.query('REVOKE USAGE ON SCHEMA public FROM anon,authenticated');
  });

  it('uses a real restricted LOGIN for positive INSERT SELECT UPDATE on all runtime tables and audit append-only', async () => {
    const password = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    await admin.query('CREATE ROLE ' + quoteIdentifier(runtimeLogin) + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT PASSWORD '" + password + "'");
    runtimeLoginCreated = true;
    await admin.query('GRANT siii_app TO ' + quoteIdentifier(runtimeLogin) + ' WITH INHERIT FALSE, SET TRUE');
    const loginUrl = new URL(url); loginUrl.username = runtimeLogin; loginUrl.password = password;
    const runtime = new pg.Client({ connectionString: loginUrl.toString(), options: '-c role=siii_app' });
    await runtime.connect(); clients.push(runtime);
    expect((await runtime.query('SELECT session_user,current_user')).rows[0]).toEqual({ session_user: runtimeLogin, current_user: 'siii_app' });
    const institution = (await runtime.query("INSERT INTO institutions(name,code) VALUES('Synthetic runtime university','RUNTIME') RETURNING id")).rows[0].id;
    const person = (await runtime.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic runtime','Fixture') RETURNING id")).rows[0].id;
    const user = (await runtime.query("INSERT INTO platform_users(person_id,username) VALUES($1,'synthetic-runtime') RETURNING id", [person])).rows[0].id;
    const member = (await runtime.query("INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id", [institution,user])).rows[0].id;
    const assignment = (await runtime.query("INSERT INTO role_assignments(membership_id,role,granted_by) VALUES($1,'coordinator',$2) RETURNING id", [member,user])).rows[0].id;
    const session = (await runtime.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,'synthetic-runtime-session',now()+interval '1 hour') RETURNING id", [user])).rows[0].id;
    const campus = (await runtime.query("INSERT INTO campuses(institution_id,code,name) VALUES($1,'RUNTIME','Synthetic campus') RETURNING id", [institution])).rows[0].id;
    const term = (await runtime.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,'RUNTIME','Synthetic runtime term','2026-01-01','2026-06-30') RETURNING id", [institution])).rows[0].id;
    const program = (await runtime.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'RUNTIME','Synthetic program','ingenieria','presencial') RETURNING id", [institution])).rows[0].id;
    const course = (await runtime.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,'RUNTIME','Synthetic course',3) RETURNING id", [institution])).rows[0].id;
    const curriculum = (await runtime.query("INSERT INTO curriculum_versions(institution_id,program_id,version) VALUES($1,$2,'runtime') RETURNING id", [institution,program])).rows[0].id;
    await runtime.query("INSERT INTO auth_throttle(key,scope,expires_at) VALUES('synthetic-runtime-throttle','login_account',now()+interval '1 hour')");
    const updates: [string, string, unknown][] = [
      ['institutions', "name='Synthetic runtime updated'",institution],
      ['people', "first_name='Synthetic updated'",person],
      ['platform_users', 'must_change_password=true',user],
      ['institution_memberships', "status='suspended'",member],
      ['role_assignments', 'revoked_at=now()',assignment],
      ['auth_sessions', 'last_seen_at=now()',session],
      ['campuses', "name='Synthetic campus updated'",campus],
      ['academic_terms', "name='Synthetic term updated'",term],
      ['academic_programs', "name='Synthetic program updated'",program],
      ['academic_courses', 'credits=4',course],
      ['curriculum_versions', "version='runtime-updated'",curriculum],
    ];
    for (const [table, expression, id] of updates) {
      // Table names and SET expressions above are fixed trusted test code.
      const selected = await runtime.query('SELECT id FROM public.' + quoteIdentifier(table) + ' WHERE id=$1', [id]);
      expect(selected.rows).toHaveLength(1);
      expect((await runtime.query('UPDATE public.' + quoteIdentifier(table) + ' SET ' + expression + ' WHERE id=$1 RETURNING id', [id])).rows).toHaveLength(1);
    }
    expect((await runtime.query("SELECT key FROM auth_throttle WHERE key='synthetic-runtime-throttle'")).rows).toHaveLength(1);
    expect((await runtime.query("UPDATE auth_throttle SET failures=1 WHERE key='synthetic-runtime-throttle' RETURNING failures")).rows).toEqual([{ failures:1 }]);
    const audit = (await runtime.query("INSERT INTO security_audit_log(action,target) VALUES('synthetic.runtime.positive','synthetic-fixtures') RETURNING id")).rows[0].id;
    expect((await runtime.query('SELECT id FROM security_audit_log WHERE id=$1',[audit])).rows).toHaveLength(1);
    await expect(runtime.query('UPDATE security_audit_log SET action=$1 WHERE id=$2',['forbidden',audit])).rejects.toHaveProperty('code','42501');
    await expect(runtime.query('DELETE FROM security_audit_log WHERE id=$1',[audit])).rejects.toHaveProperty('code','42501');
  });

  it('denies future tables, sequences and RPCs from both captured creators', async () => {
    for (const [i, creator] of [roleMap.postgres, roleMap.supabase_admin].entries()) {
      await asRole(creator, async () => {
        await client.query('CREATE TABLE public.synthetic_future_' + i + '(id integer)');
        await client.query('CREATE SEQUENCE public.synthetic_future_seq_' + i);
        await client.query("CREATE FUNCTION public.synthetic_future_rpc_" + i + "() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
      });
      for (const role of ['anon','authenticated']) {
        expect((await client.query("SELECT has_table_privilege($1,$2,'SELECT') AS yes", [role, 'public.synthetic_future_' + i])).rows[0].yes).toBe(false);
        expect((await client.query("SELECT has_sequence_privilege($1,$2,'USAGE') AS yes", [role, 'public.synthetic_future_seq_' + i])).rows[0].yes).toBe(false);
      }
      expect((await client.query("SELECT has_table_privilege('siii_app',$1,'DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS yes", ['public.synthetic_future_' + i])).rows[0].yes).toBe(false);
      expect((await client.query("SELECT has_sequence_privilege('siii_app',$1,'USAGE,SELECT,UPDATE') AS yes", ['public.synthetic_future_seq_' + i])).rows[0].yes).toBe(false);
      for (const role of ['anon','authenticated','siii_app']) expect((await client.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS yes", [role, 'public.synthetic_future_rpc_' + i + '()'])).rows[0].yes).toBe(false);
      await client.query('DROP TABLE public.synthetic_future_' + i);
      await client.query('DROP SEQUENCE public.synthetic_future_seq_' + i);
      await client.query('DROP FUNCTION public.synthetic_future_rpc_' + i + '()');
    }
  });

  it('repeats adoption and migration without changing schema or ledger', async () => {
    const before = await ledger(), signature = await schemaSignature(client);
    const adopted = command('scripts/db-baseline.ts', url, { SIII_BASELINE_CONFIRM: '0001_academic_catalogs' });
    expect(adopted.status).toBe(0); expect(adopted.output).toContain('BASELINE_ALREADY_RECORDED');
    expect(command('db/migrate.ts').status).toBe(0);
    expect(await ledger()).toEqual(before); expect(await schemaSignature(client)).toEqual(signature);
  });

  it('rejects rollback without local synthetic confirmation before any connection', () => {
    const rejected = command('scripts/rehearse-date-rollback.ts', url, { SIII_ROLLBACK_CONFIRM: '' });
    expect(rejected.status).toBe(1); expect(rejected.output).toContain('LOCAL_SYNTHETIC_ROLLBACK_REQUIRED');
    const remote = command('scripts/rehearse-date-rollback.ts', 'postgresql://placeholder:fake@db.kkjzbqsaummyralqjqrb.supabase.co:5432/postgres');
    expect(remote.status).toBe(1); expect(remote.output).toContain('LOCAL_SYNTHETIC_ROLLBACK_REQUIRED');
    expect(remote.output).not.toContain('placeholder');
    const override = new URL(url); override.searchParams.set('host','example.invalid');
    const redirected = command('scripts/rehearse-date-rollback.ts',override.toString());
    expect(redirected.status).toBe(1); expect(redirected.output).toContain('LOCAL_SYNTHETIC_ROLLBACK_REQUIRED');
    expect(redirected.output).not.toContain('ENOTFOUND');
  });

  it('rejects rollback with audit RLS disabled without changing date types', async () => {
    await client.query('ALTER TABLE public.security_audit_log DISABLE ROW LEVEL SECURITY');
    try {
      const rejected = command('scripts/rehearse-date-rollback.ts');
      expect(rejected.status).toBe(1); expect(rejected.output).toContain('DATE_ROLLBACK_REQUIRES_HARDENING');
      expect((await client.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_terms' AND column_name='start_date'")).rows[0].data_type).toBe('date');
    } finally { await client.query('ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY'); }
  });

  it('restores retained timestamps while preserving edits, security, audit and ledger', async () => {
    const beforeSecurity = await security(), beforeLedger = await ledger();
    const audit = async () => (await client.query("SELECT md5(row_to_json(a)::text) AS signature FROM public.security_audit_log a ORDER BY a.id")).rows;
    const beforeAudit = await audit(), result = command('scripts/rehearse-date-rollback.ts');
    expect(result.status).toBe(0); expect(result.output).toContain('LOCAL_DATE_ROLLBACK_REHEARSED');
    expect((await client.query("SELECT code,start_date::text AS start,end_date::text AS end FROM public.academic_terms WHERE code IN ('HISTORICAL','MODIFIED','NEW') ORDER BY code")).rows).toEqual([
      { code:'HISTORICAL',start:'2026-01-01 12:00:00',end:'2026-06-30 18:00:00' },
      { code:'MODIFIED',start:'2026-03-15 00:00:00',end:'2026-08-15 00:00:00' },
      { code:'NEW',start:'2026-09-01 00:00:00',end:'2026-12-20 00:00:00' },
    ]);
    expect(await security()).toEqual(beforeSecurity); expect(await ledger()).toEqual(beforeLedger);
    const afterAudit = await audit();
    expect(afterAudit).toHaveLength(beforeAudit.length + 1);
    expect(afterAudit).toEqual(expect.arrayContaining(beforeAudit));
    expect((await client.query("SELECT count(*)::int AS n FROM public.security_audit_log WHERE action='rehearsal.academic_term_dates.rollback'")).rows[0].n).toBe(1);
    const repeated = command('scripts/rehearse-date-rollback.ts');
    expect(repeated.status).toBe(0); expect(repeated.output).toContain('LOCAL_DATES_ALREADY_REVERSED');
    expect(await ledger()).toEqual(beforeLedger);
    expect(await audit()).toEqual(afterAudit);
  });

  afterAll(async () => {
    await Promise.all(clients.map(c => c.end()));
    for (const name of databaseNames) {
      if (!name.startsWith(prefix + '_') || !name.endsWith('_test')) throw new Error('DISPOSABLE_DATABASE_REQUIRED');
      await admin.query('DROP DATABASE IF EXISTS ' + quoteIdentifier(name));
    }
    for (const role of fixtureRoles) await admin.query('DROP ROLE IF EXISTS ' + quoteIdentifier(role));
    if (runtimeLoginCreated) await admin.query('DROP ROLE IF EXISTS ' + quoteIdentifier(runtimeLogin));
    // Never drop pre-existing API roles. Other files may have legitimately
    // acquired ACL/policy/membership dependencies; leave those roles intact.
    for (const role of ownedApiRoles) {
      const dependencies = await admin.query("SELECT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=(SELECT oid FROM pg_roles WHERE rolname=$1)) OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=$1) OR member=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS exists",[role]);
      if (!dependencies.rows[0].exists) await admin.query('DROP ROLE IF EXISTS ' + quoteIdentifier(role));
    }
    await admin.end();
  }, 30000);
});

