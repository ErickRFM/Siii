import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Offline, fail-closed exporter for the independently audited 2026-10-14 schema.
// It has no database client, role provisioning, or managed-schema source code.
const trustedColumns: Record<string, readonly string[]> = {
  "academic_courses": [
    "id",
    "institution_id",
    "code",
    "name",
    "credits",
    "status",
    "created_at",
    "updated_at"
  ],
  "academic_programs": [
    "id",
    "institution_id",
    "code",
    "name",
    "level",
    "modality",
    "status",
    "created_at",
    "updated_at"
  ],
  "academic_terms": [
    "id",
    "institution_id",
    "name",
    "code",
    "start_date",
    "end_date",
    "status",
    "created_at",
    "updated_at"
  ],
  "auth_sessions": [
    "id",
    "user_id",
    "token_hash",
    "created_at",
    "expires_at",
    "revoked_at"
  ],
  "campuses": [
    "id",
    "institution_id",
    "name",
    "code",
    "is_primary",
    "status",
    "created_at",
    "updated_at"
  ],
  "curriculum_versions": [
    "id",
    "institution_id",
    "program_id",
    "version",
    "status",
    "created_at",
    "updated_at"
  ],
  "institution_memberships": [
    "id",
    "institution_id",
    "user_id",
    "status",
    "created_at",
    "updated_at"
  ],
  "institutions": [
    "id",
    "name",
    "short_name",
    "code",
    "timezone",
    "status",
    "created_at",
    "updated_at"
  ],
  "people": [
    "id",
    "first_name",
    "last_name",
    "middle_name",
    "email",
    "phone",
    "created_at",
    "updated_at"
  ],
  "platform_users": [
    "id",
    "person_id",
    "username",
    "password_hash",
    "is_active",
    "must_change_password",
    "failed_login_attempts",
    "locked_until",
    "created_at",
    "updated_at"
  ],
  "role_assignments": [
    "id",
    "membership_id",
    "role",
    "granted_by",
    "created_at",
    "revoked_at"
  ],
  "security_audit_log": [
    "id",
    "actor_user_id",
    "institution_id",
    "action",
    "target",
    "request_id",
    "created_at"
  ]
};
const enumNames = ['entity_status', 'membership_status', 'user_role'];
const sourceRoles = ['postgres', 'supabase_admin', 'pg_database_owner', 'anon', 'authenticated', 'service_role', 'dashboard_user'];
const privileges: Record<string, string> = {
  r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE', D: 'TRUNCATE',
  x: 'REFERENCES', t: 'TRIGGER', m: 'MAINTAIN', U: 'USAGE', C: 'CREATE', X: 'EXECUTE',
};
type Row = Record<string, unknown>;
export type ReplayOptions = { roleMap?: Record<string, string> };
function fail(reason: string): never { throw new Error('SCHEMA_REPLAY_REJECTED: ' + reason); }
function object(v: unknown): Row {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('metadata object missing');
  return v as Row;
}
function rows(v: unknown): Row[] {
  if (!Array.isArray(v)) fail('metadata array missing');
  return v.map(object);
}
function text(v: unknown, label: string): string {
  if (typeof v !== 'string') fail(label + ' must be text');
  return v;
}
function identifier(v: unknown, label: string): string {
  const n = text(v, label);
  if (!/^[a-z_][a-z0-9_]*$/.test(n) || Buffer.byteLength(n) > 63) fail(label + ' identifier unsupported');
  return n;
}
export function quoteIdentifier(n: string): string {
  if (!n || n.includes('\0') || Buffer.byteLength(n) > 63) fail('identifier invalid');
  return '"' + n.replaceAll('"', '""') + '"';
}
function literal(v: unknown): string {
  const n = text(v, 'enum label');
  if (n.includes('\0') || n.includes('\\')) fail('unsupported enum label');
  return "'" + n.replaceAll("'", "''") + "'";
}
function publicRows(v: unknown): Row[] { return rows(v).filter(r => r.schema === 'public'); }
function qualified(n: string): string { return '"public".' + quoteIdentifier(n); }
function tableName(v: unknown): string {
  const n = identifier(v, 'table');
  if (!Object.hasOwn(trustedColumns, n)) fail('unknown public table');
  return n;
}
function columnList(raw: string, table: string): string {
  return raw.split(', ').map(n => {
    if (!trustedColumns[table].includes(n)) fail('unknown column in constraint/index');
    return quoteIdentifier(n);
  }).join(', ');
}
function sqlType(v: unknown): string {
  const n = text(v, 'column type');
  if (enumNames.includes(n)) return qualified(n);
  if (['uuid', 'text', 'integer', 'boolean', 'timestamp with time zone', 'timestamp without time zone'].includes(n)) return n;
  return fail('unsupported column type');
}
function defaultSql(v: unknown, type: unknown): string {
  if (v === null) return '';
  const expression = text(v, 'default');
  const permitted: Record<string, readonly string[]> = {
    uuid: ['gen_random_uuid()'], 'timestamp with time zone': ['now()'],
    boolean: ['true', 'false'], integer: ['0'], text: ["'America/Mexico_City'::text"],
    entity_status: ["'active'::entity_status"], membership_status: ["'active'::membership_status"],
  };
  if (!permitted[text(type, 'default type')]?.includes(expression)) fail('unsupported default expression');
  if (expression === 'gen_random_uuid()') return ' DEFAULT pg_catalog.gen_random_uuid()';
  if (expression === 'now()') return ' DEFAULT pg_catalog.now()';
  if (expression === "'active'::entity_status") return " DEFAULT 'active'::" + qualified('entity_status');
  if (expression === "'active'::membership_status") return " DEFAULT 'active'::" + qualified('membership_status');
  return ' DEFAULT ' + expression;
}
function constraintSql(r: Row): string {
  const definition = text(r.definition, 'constraint definition'), table = tableName(r.relation);
  if (r.validated !== true || r.deferrable !== false || r.deferred !== false) fail('unsupported constraint state');
  let m = /^(PRIMARY KEY|UNIQUE) \(([a-z_][a-z0-9_]*(?:, [a-z_][a-z0-9_]*)*)\)$/.exec(definition);
  if (m && r.kind === (m[1] === 'PRIMARY KEY' ? 'p' : 'u')) return m[1] + ' (' + columnList(m[2], table) + ')';
  m = /^FOREIGN KEY \(([a-z_][a-z0-9_]*(?:, [a-z_][a-z0-9_]*)*)\) REFERENCES ([a-z_][a-z0-9_]*)\(([a-z_][a-z0-9_]*(?:, [a-z_][a-z0-9_]*)*)\)( ON DELETE (?:RESTRICT|CASCADE))?$/.exec(definition);
  if (m && r.kind === 'f') {
    if (m[1].split(', ').length !== m[3].split(', ').length) fail('constraint column count');
    const target = tableName(m[2]);
    return 'FOREIGN KEY (' + columnList(m[1], table) + ') REFERENCES ' + qualified(target) + ' (' + columnList(m[3], target) + ')' + (m[4] || '');
  }
  if (r.kind === 'c' && table === 'academic_courses' && definition === 'CHECK (credits >= 0 AND credits <= 30)') return 'CHECK ("credits" >= 0 AND "credits" <= 30)';
  if (r.kind === 'c' && table === 'academic_terms' && definition === 'CHECK (end_date >= start_date)') return 'CHECK ("end_date" >= "start_date")';
  return fail('unsupported constraint definition');
}
function indexSql(r: Row): string {
  const m = /^CREATE (UNIQUE )?INDEX ([a-z_][a-z0-9_]*) ON public\.([a-z_][a-z0-9_]*) USING btree \(([a-z_][a-z0-9_]*(?:, [a-z_][a-z0-9_]*)*)\)( WHERE \(revoked_at IS NULL\))?$/.exec(text(r.definition, 'index definition'));
  if (!m || m[2] !== r.name || m[3] !== r.relation || Boolean(m[1]) !== r.unique || r.valid !== true || r.ready !== true) fail('unsupported index definition/state');
  const table = tableName(m[3]);
  if (m[5] && table !== 'role_assignments') fail('unsupported index predicate');
  return 'CREATE ' + (m[1] || '') + 'INDEX ' + quoteIdentifier(m[2]) + ' ON ' + qualified(table) + ' USING btree (' + columnList(m[4], table) + ')' + (m[5] ? ' WHERE ("revoked_at" IS NULL)' : '');
}
type Acl = { grantee: string; privilege: string; option: boolean };
function parseAcl(v: unknown, allowed: string): Acl[] {
  const acl = text(v, 'ACL');
  if (!acl.startsWith('{') || !acl.endsWith('}')) fail('unsupported ACL');
  if (acl === '{}') return [];
  return acl.slice(1, -1).split(',').flatMap(entry => {
    const m = /^([a-z_][a-z0-9_]*|)=([a-zA-Z*]+)\/([a-z_][a-z0-9_]*)$/.exec(entry);
    if (!m || !sourceRoles.includes(m[3]) || (m[1] && !sourceRoles.includes(m[1]))) fail('unknown ACL role/syntax');
    const parsed: Acl[] = [];
    for (let i = 0; i < m[2].length; i++) {
      const code = m[2][i];
      if (!allowed.includes(code) || !privileges[code]) fail('unsupported ACL privilege');
      const option = m[2][i + 1] === '*';
      parsed.push({ grantee: m[1], privilege: privileges[code], option });
      if (option) i++;
    }
    return parsed;
  });
}
function permissions(v: unknown, allowed: string, prefix: string, target: string, role: (n: string) => string): string[] {
  const parsed = parseAcl(v, allowed);
  const out = ['', ...sourceRoles].map(n => prefix + 'REVOKE ALL PRIVILEGES ' + target + ' FROM ' + role(n) + ';');
  const groups = new Map<string, Acl[]>();
  for (const p of parsed) groups.set(p.grantee + ':' + p.option, [...(groups.get(p.grantee + ':' + p.option) || []), p]);
  const order = Object.values(privileges);
  for (const g of groups.values()) out.push(prefix + 'GRANT ' + g.map(p => p.privilege).sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(', ') + ' ' + target + ' TO ' + role(g[0].grantee) + (g[0].option ? ' WITH GRANT OPTION' : '') + ';');
  return out;
}

/** Requires a fresh isolated PostgreSQL 17 DB and pre-created source/fixture roles.
 * Captured ACL grantors are validated; the executor becomes the replay grantor.
 * Role maps preserve distinct roles and never create roles or alter auth schemas. */
export function emitInstitutionalSchema(snapshot: unknown, options: ReplayOptions = {}): string {
  const doc = object(snapshot);
  if (doc.project_ref !== 'kkjzbqsaummyralqjqrb' || doc.environment !== 'production' || doc.postgres_version !== '17.11') fail('unsupported metadata provenance');
  const queries = rows(object(doc.collection).queries);
  const query = (n: string): unknown => {
    const found = queries.filter(q => q.name === n);
    if (found.length !== 1) fail('missing/duplicate metadata query');
    return found[0].result;
  };
  const one = (n: string): Row => {
    const rs = rows(query(n));
    if (rs.length !== 1) fail('metadata cardinality');
    return rs[0];
  };
  for (const n of Object.keys(options.roleMap || {})) if (!sourceRoles.includes(n)) fail('unknown role mapping source');
  const targetNames = sourceRoles.map(n => options.roleMap?.[n] ?? n);
  targetNames.forEach(quoteIdentifier);
  if (new Set(targetNames).size !== targetNames.length) fail('role mapping collapse');
  const role = (n: string): string => {
    if (!n) return 'PUBLIC';
    if (!sourceRoles.includes(n)) return fail('unknown role');
    return quoteIdentifier(options.roleMap?.[n] ?? n);
  };
  const context = one('context_schemas_relations'), tables = publicRows(context.relations);
  if (tables.length !== 12 || new Set(tables.map(t => t.name)).size !== 12) fail('unexpected public relation count');
  for (const t of tables) {
    tableName(t.name);
    if (t.kind !== 'r' || t.rls !== false || t.force_rls !== false || t.options !== null || t.owner !== 'postgres') fail('unsupported public relation state/owner');
  }
  const schemas = rows(context.schemas).filter(s => s.name === 'public');
  if (schemas.length !== 1 || schemas[0].owner !== 'pg_database_owner') fail('unsupported public schema owner');
  if (publicRows(query('functions')).length) fail('public functions unsupported');
  const extra = one('sequences_types_triggers'), security = one('roles_defaults_policies');
  if (publicRows(extra.sequences || []).length) fail('public sequences unsupported');
  if (publicRows(extra.triggers || []).some(t => t.internal !== true)) fail('public triggers unsupported');
  if (rows(security.policies || []).some(p => p.schemaname === 'public')) fail('public policies unsupported');
  const details = publicRows(one('database_types_relation_details').relation_details);
  if (details.length !== 12 || details.some(r => r.persistence !== 'p' || r.is_partition !== false || r.replica_identity !== 'd' || r.view_definition !== null)) fail('unsupported relation details');
  const types = publicRows(extra.types);
  if (types.length !== 3 || new Set(types.map(t => t.name)).size !== 3) fail('unsupported enum type count');
  for (const t of types) {
    if (!enumNames.includes(String(t.name)) || t.kind !== 'e' || t.owner !== 'postgres' || t.acl !== null || t.not_null !== false || t.default !== null || t.base_type !== null || !Array.isArray(t.enum_labels) || !t.enum_labels.length) fail('unsupported enum type');
  }
  const columns = publicRows(query('columns'));
  if (columns.length !== 92) fail('incomplete public column inventory');
  for (const t of tables) {
    const n = tableName(t.name), captured = columns.filter(c => c.relation === n).sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
    if (captured.length !== trustedColumns[n].length) fail('column count mismatch');
    for (const [i, c] of captured.entries()) {
      if (c.name !== trustedColumns[n][i] || c.ordinal !== i + 1 || c.identity !== '' || c.generated !== '' || c.acl !== null || ![null, 'default'].includes(c.collation as string | null) || typeof c.not_null !== 'boolean') fail('unsupported column metadata');
      sqlType(c.type); defaultSql(c.default_expression, c.type);
    }
  }
  const defs = one('constraints_indexes'), constraints = publicRows(defs.constraints), indexes = publicRows(defs.indexes);
  if (constraints.length !== 33 || indexes.length !== 26) fail('constraint/index inventory mismatch');
  if (new Set(constraints.map(c => String(c.relation) + ':' + c.name)).size !== 33 || new Set(indexes.map(i => i.name)).size !== 26) fail('duplicate constraint/index');
  for (const c of constraints) { identifier(c.name, 'constraint'); constraintSql(c); }
  for (const i of indexes) { identifier(i.name, 'index'); indexSql(i); }
  const defaults = rows(security.default_acls).filter(d => d.schema === 'public' || (d.schema === null && ['postgres', 'supabase_admin'].includes(String(d.owner))));
  if (defaults.length !== 6 || defaults.some(d => !['postgres', 'supabase_admin'].includes(String(d.owner)) || !['r', 'S', 'f'].includes(String(d.object_type)) || d.schema !== 'public')) fail('unsupported scoped/global defaults');
  const globals = rows(one('schema_column_default_privileges').global_default_privileges).filter(d => ['postgres', 'supabase_admin'].includes(String(d.owner)) && ['r', 'S', 'f'].includes(String(d.object_type)));
  if (globals.length !== 6 || globals.some(d => d.explicit_global_acl !== null)) fail('unsupported explicit global defaults');
  const out = [
    '-- Generated offline from docs/audit/P0_1_PRODUCTION_STRUCTURE.json.',
    '-- Observed production institutional structure 2026-10-14. NO PERSONAL DATA.',
    '-- ISOLATED REHEARSAL ONLY: preserves insecure source ACL/defaults/RLS to test hardening.',
    '-- Requires fresh PostgreSQL 17 DB and pre-created source roles or explicit fixture role maps.',
    '-- No managed schemas, ledger, secrets, login roles, extension changes or data are replayed.',
    '-- Grantor identity is the executor; source owner/grantee permissions/grant options are preserved.',
    'BEGIN;', 'CREATE SCHEMA IF NOT EXISTS "public";',
    'ALTER SCHEMA "public" OWNER TO ' + role('pg_database_owner') + ';',
  ];
  const kinds: Record<string, { target: string; allowed: string }> = {
    r: { target: 'ON TABLES', allowed: 'arwdDxtm' }, S: { target: 'ON SEQUENCES', allowed: 'rwU' }, f: { target: 'ON FUNCTIONS', allowed: 'X' },
  };
  // Global/scoped default grants are additive. Represent both before objects.
  for (const d of globals) {
    const k = kinds[text(d.object_type, 'default kind')];
    out.push(...permissions(d.builtin_global_acl, k.allowed, 'ALTER DEFAULT PRIVILEGES FOR ROLE ' + role(text(d.owner, 'owner')) + ' ', k.target, role));
  }
  for (const d of defaults) {
    const k = kinds[text(d.object_type, 'default kind')];
    out.push(...permissions(d.acl, k.allowed, 'ALTER DEFAULT PRIVILEGES FOR ROLE ' + role(text(d.owner, 'owner')) + ' IN SCHEMA "public" ', k.target, role));
  }
  for (const t of types) {
    const n = identifier(t.name, 'enum type');
    out.push('CREATE TYPE ' + qualified(n) + ' AS ENUM (' + (t.enum_labels as unknown[]).map(literal).join(', ') + ');');
    out.push('ALTER TYPE ' + qualified(n) + ' OWNER TO ' + role('postgres') + ';');
    // Null enum ACL has PostgreSQL default USAGE for PUBLIC.
    out.push('GRANT USAGE ON TYPE ' + qualified(n) + ' TO PUBLIC;');
  }
  for (const t of tables) {
    const n = tableName(t.name), cols = columns.filter(c => c.relation === n).sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
    out.push('CREATE TABLE ' + qualified(n) + ' (\n' + cols.map(c => '  ' + quoteIdentifier(text(c.name, 'column')) + ' ' + sqlType(c.type) + defaultSql(c.default_expression, c.type) + (c.not_null ? ' NOT NULL' : '')).join(',\n') + '\n);');
  }
  // PK/UNIQUE constraints own backing indexes. Validate, avoid duplication.
  // Standalone unique indexes must exist before dependent composite FKs.
  for (const i of indexes) {
    const backing = constraints.find(c => ['p', 'u'].includes(String(c.kind)) && c.relation === i.relation && c.name === i.name);
    if (backing) {
      const cols = / \(([^)]+)\)$/.exec(text(backing.definition, 'constraint'))?.[1];
      if (i.unique !== true || i.primary !== (backing.kind === 'p') || !text(i.definition, 'index').endsWith(' (' + cols + ')')) fail('constraint backing index mismatch');
    } else {
      if (i.primary !== false) fail('missing primary index constraint');
      out.push(indexSql(i) + ';');
    }
  }
  for (const kind of ['p', 'u', 'c', 'f']) for (const c of constraints.filter(c => c.kind === kind)) out.push('ALTER TABLE ' + qualified(tableName(c.relation)) + ' ADD CONSTRAINT ' + quoteIdentifier(identifier(c.name, 'constraint')) + ' ' + constraintSql(c) + ';');
  for (const t of tables) {
    const n = tableName(t.name);
    out.push('ALTER TABLE ' + qualified(n) + ' OWNER TO ' + role('postgres') + ';');
    out.push('ALTER TABLE ' + qualified(n) + ' DISABLE ROW LEVEL SECURITY;');
    out.push('ALTER TABLE ' + qualified(n) + ' NO FORCE ROW LEVEL SECURITY;');
    out.push(...permissions(t.acl, 'arwdDxtm', '', 'ON TABLE ' + qualified(n), role));
  }
  out.push(...permissions(schemas[0].acl, 'UC', '', 'ON SCHEMA "public"', role));
  out.push('COMMIT;', '');
  return out.join('\n');
}

// CLI: tsx scripts/replay-institutional-schema.ts [snapshot.json] [output.sql]
// Optional third argument: JSON mapping to pre-created, distinct fixture roles.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const input = resolve(process.argv[2] || 'docs/audit/P0_1_PRODUCTION_STRUCTURE.json');
    const output = resolve(process.argv[3] || 'db/baseline/supabase-2026-10-14-schema.sql');
    const options = process.argv[4] ? { roleMap: JSON.parse(process.argv[4]) as Record<string, string> } : {};
    const sql = emitInstitutionalSchema(JSON.parse(readFileSync(input, 'utf8')), options);
    writeFileSync(output, sql, 'utf8');
    console.log('Institutional schema exported offline; no DB connection was made.');
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith('SCHEMA_REPLAY_REJECTED:') ? error.message : 'SCHEMA_REPLAY_REJECTED: invalid input or output');
    process.exitCode = 1;
  }
}

