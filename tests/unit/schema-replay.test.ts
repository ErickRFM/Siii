import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emitInstitutionalSchema, quoteIdentifier } from '../../scripts/replay-institutional-schema';

function snapshot() {
  return JSON.parse(readFileSync(new URL('../../docs/audit/P0_1_PRODUCTION_STRUCTURE.json', import.meta.url), 'utf8'));
}
function result(doc: ReturnType<typeof snapshot>, name: string) {
  return doc.collection.queries.find((entry: { name: string }) => entry.name === name).result;
}

describe('institutional structure-only replay exporter', () => {
  it('emits the captured tables, enum labels, timestamp types, FK and partial index without data or managed objects', () => {
    const sql = emitInstitutionalSchema(snapshot());
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(12);
    expect(sql.match(/CREATE TYPE /g)).toHaveLength(3);
    expect(sql).toContain('"start_date" timestamp without time zone NOT NULL');
    expect(sql).toContain('CHECK ("credits" >= 0 AND "credits" <= 30)');
    expect(sql).toContain('REFERENCES "public"."academic_programs" ("id", "institution_id") ON DELETE RESTRICT');
    expect(sql).toContain('WHERE ("revoked_at" IS NULL)');
    expect(sql).toContain('ALTER TABLE "public"."people" OWNER TO "postgres"');
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM PUBLIC');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."people" TO "service_role"');
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "anon"');
    expect(sql).not.toMatch(/\b(?:INSERT INTO|COPY|CREATE FUNCTION|CREATE ROLE|SET ROLE|CREATE EXTENSION)\b/);
    expect(sql).not.toMatch(/"(?:auth|storage|vault|realtime|supabase_migrations)"\./);
  });

  it('quotes local fixture role names, including embedded double quotes, without executing them', () => {
    const sql = emitInstitutionalSchema(snapshot(), { roleMap: { postgres: 'fixture"owner', service_role: 'fixture_service' } });
    expect(sql).toContain('OWNER TO "fixture""owner"');
    expect(sql).toContain('TO "fixture_service"');
    expect(quoteIdentifier('role"; DROP TABLE x; --')).toBe('"role""; DROP TABLE x; --"');
    expect(() => quoteIdentifier('bad\0role')).toThrow();
  });

  it('does not let distinct production roles collapse into one fixture role', () => {
    expect(() => emitInstitutionalSchema(snapshot(), { roleMap: { postgres: 'fixture', service_role: 'fixture' } })).toThrow(/mapping|collapse/i);
  });

  it.each(['pg_read_file(\'/etc/passwd\')', 'now(); DROP TABLE people', 'public.untrusted()', '(SELECT password_hash FROM platform_users)'])('rejects unsafe default %s before emitting SQL', (expression) => {
    const doc = snapshot();
    result(doc, 'columns').find((column: { schema: string; relation: string; name: string }) => column.schema === 'public' && column.relation === 'people' && column.name === 'id').default_expression = expression;
    expect(() => emitInstitutionalSchema(doc)).toThrow(/default/i);
  });

  it('rejects unexpected public relations instead of replaying arbitrary objects', () => {
    const doc = snapshot();
    result(doc, 'context_schemas_relations')[0].relations.push({ schema: 'public', name: 'unexpected', kind: 'r' });
    expect(() => emitInstitutionalSchema(doc)).toThrow(/relation|table/i);
  });

  it('rejects new public functions even when their definitions look harmless', () => {
    const doc = snapshot();
    result(doc, 'functions').push({ schema: 'public', name: 'do_something', public_definition: 'SELECT 1' });
    expect(() => emitInstitutionalSchema(doc)).toThrow(/function/i);
  });

  it('rejects non-enum types and unknown column types', () => {
    const doc = snapshot();
    result(doc, 'columns').find((column: { schema: string }) => column.schema === 'public').type = 'text; SELECT pg_read_file(\'/tmp/x\')';
    expect(() => emitInstitutionalSchema(doc)).toThrow(/type/i);
  });

  it('rejects unsafe FK/index/check definitions rather than copying catalog text', () => {
    for (const key of ['constraints', 'indexes']) {
      const doc = snapshot();
      result(doc, 'constraints_indexes')[0][key].find((item: { schema: string }) => item.schema === 'public').definition += '; SELECT pg_read_file(\'/tmp/x\')';
      expect(() => emitInstitutionalSchema(doc)).toThrow(/constraint|index/i);
    }
  });

  it('rejects unknown ACL roles and privilege codes', () => {
    for (const acl of ['{untrusted=ar/postgres}', '{service_role=z/postgres}']) {
      const doc = snapshot();
      result(doc, 'context_schemas_relations')[0].relations.find((item: { schema: string }) => item.schema === 'public').acl = acl;
      expect(() => emitInstitutionalSchema(doc)).toThrow(/acl|role|privilege/i);
    }
  });

  it('rejects incomplete snapshots and unsupported RLS policies or public triggers', () => {
    const incomplete = snapshot();
    result(incomplete, 'columns').splice(result(incomplete, 'columns').findIndex((column: { schema: string }) => column.schema === 'public'), 1);
    expect(() => emitInstitutionalSchema(incomplete)).toThrow(/column/i);
    const policy = snapshot();
    result(policy, 'roles_defaults_policies')[0].policies = [{ schemaname: 'public', tablename: 'people' }];
    expect(() => emitInstitutionalSchema(policy)).toThrow(/polic/i);
    const trigger = snapshot();
    result(trigger, 'sequences_types_triggers')[0].triggers.push({ schema: 'public', internal: false, name: 'untrusted' });
    expect(() => emitInstitutionalSchema(trigger)).toThrow(/trigger/i);
  });
});

