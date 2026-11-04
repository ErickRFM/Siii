import {describe, expect, it} from 'vitest';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyzeDrift, driftProblems} from '../../scripts/schema-migration-drift';

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'siii-drift-'));
  mkdirSync(join(root, 'db', 'schema'), {recursive: true});
  mkdirSync(join(root, 'db', 'migrations', 'meta'), {recursive: true});
  return root;
}

describe('schema ↔ migration drift gate', () => {
  it('el repositorio real no tiene drift', () => {
    const report = analyzeDrift(process.cwd());
    expect(driftProblems(report)).toEqual([]);
    expect(report.schemaTables.length).toBeGreaterThan(0);
    expect(report.schemaTables.length).toBe(report.migrationTables.length);
  });

  it('detecta una tabla de db/schema sin CREATE TABLE en migraciones', () => {
    const root = makeFixture();
    try {
      writeFileSync(join(root, 'db', 'schema', 'x.ts'), "export const x=pgTable('ghost_table',{});");
      writeFileSync(join(root, 'db', 'migrations', '0000_x.sql'), 'CREATE TABLE public.real_table (id uuid);');
      writeFileSync(
        join(root, 'db', 'migrations', 'meta', '_journal.json'),
        JSON.stringify({entries: [{idx: 0, tag: '0000_x'}]}),
      );
      const report = analyzeDrift(root);
      expect(report.missingInMigrations).toEqual(['ghost_table']);
      expect(driftProblems(report)).toEqual([
        'Tablas de db/schema sin CREATE TABLE en migraciones: ghost_table',
      ]);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('detecta journal no contiguo y archivos desalineados', () => {
    const root = makeFixture();
    try {
      writeFileSync(join(root, 'db', 'schema', 'x.ts'), "export const x=pgTable('real_table',{});");
      writeFileSync(join(root, 'db', 'migrations', '0000_a.sql'), 'CREATE TABLE public.real_table (id uuid);');
      writeFileSync(join(root, 'db', 'migrations', '0001_b.sql'), 'CREATE TABLE public.other (id uuid);');
      writeFileSync(
        join(root, 'db', 'migrations', 'meta', '_journal.json'),
        JSON.stringify({entries: [{idx: 0, tag: '0000_a'}, {idx: 2, tag: '0001_b'}]}),
      );
      const report = analyzeDrift(root);
      expect(report.journalIndexGaps).toContain('posicion 1 declara idx 2');
      expect(driftProblems(report).length).toBeGreaterThan(0);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('detecta una entrada de journal sin archivo .sql', () => {
    const root = makeFixture();
    try {
      writeFileSync(join(root, 'db', 'schema', 'x.ts'), "export const x=pgTable('real_table',{});");
      writeFileSync(join(root, 'db', 'migrations', '0000_a.sql'), 'CREATE TABLE public.real_table (id uuid);');
      writeFileSync(
        join(root, 'db', 'migrations', 'meta', '_journal.json'),
        JSON.stringify({entries: [{idx: 0, tag: '0000_a'}, {idx: 1, tag: '0001_missing'}]}),
      );
      const report = analyzeDrift(root);
      expect(report.journalWithoutSql).toEqual(['0001_missing']);
      expect(driftProblems(report).some(problem => problem.includes('0001_missing'))).toBe(true);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });
});
