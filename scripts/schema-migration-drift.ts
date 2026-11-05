import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {basename, join} from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * Deterministic drift gate between `db/schema` and `db/migrations`.
 *
 * The repository does not commit drizzle-kit snapshots (only `meta/_journal.json`),
 * so `drizzle-kit generate` cannot diff schema against migrations without producing
 * a spurious full-schema rewrite. This gate instead checks the invariants that can be
 * verified from the filesystem alone and require no database connection:
 *   - every `pgTable('...')` declared in `db/schema` has a `CREATE TABLE` somewhere in `db/migrations`;
 *   - the journal indices are contiguous and ordered from 0;
 *   - every `.sql` migration has a journal entry and every journal entry has its `.sql` file.
 * Database-level ledger drift stays covered by `assertMigrationLedger` in `db/migration-safety.ts`.
 */

export type DriftReport = {
  schemaTables: string[];
  migrationTables: string[];
  missingInMigrations: string[];
  journalTags: string[];
  journalIndices: number[];
  journalIndexGaps: string[];
  sqlWithoutJournal: string[];
  journalWithoutSql: string[];
};

const SCHEMA_TABLE = /pgTable\(\s*['"]([a-z0-9_]+)['"]/g;
const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([a-z0-9_]+)"?/gi;

export function scanSchemaTables(schemaDir: string): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(schemaDir).filter(name => name.endsWith('.ts'))) {
    const text = readFileSync(join(schemaDir, file), 'utf8');
    for (const match of text.matchAll(SCHEMA_TABLE)) names.add(match[1].toLowerCase());
  }
  return [...names].sort();
}

export function scanMigrationTables(migrationsDir: string): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(migrationsDir).filter(name => name.endsWith('.sql'))) {
    const text = readFileSync(join(migrationsDir, file), 'utf8');
    for (const match of text.matchAll(CREATE_TABLE)) names.add(match[1].toLowerCase());
  }
  return [...names].sort();
}

export function readJournal(journalPath: string): Array<{idx: number; tag: string}> {
  const parsed = JSON.parse(readFileSync(journalPath, 'utf8')) as {entries: Array<{idx: number; tag: string}>};
  return parsed.entries;
}

export function analyzeDrift(root: string): DriftReport {
  const schemaDir = join(root, 'db', 'schema');
  const migrationsDir = join(root, 'db', 'migrations');
  const journalPath = join(migrationsDir, 'meta', '_journal.json');

  const schemaTables = scanSchemaTables(schemaDir);
  const migrationTables = scanMigrationTables(migrationsDir);
  const migrationSet = new Set(migrationTables);
  const missingInMigrations = schemaTables.filter(table => !migrationSet.has(table));

  const entries = readJournal(journalPath);
  const journalTags = entries.map(entry => entry.tag);
  const journalIndices = entries.map(entry => entry.idx);
  const journalIndexGaps = journalIndices
    .map((idx, position) => (idx === position ? null : `posicion ${position} declara idx ${idx}`))
    .filter((value): value is string => value !== null);

  const tagSet = new Set(journalTags);
  const sqlFiles = readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .map(name => basename(name, '.sql'));
  const sqlWithoutJournal = sqlFiles.filter(name => !tagSet.has(name)).sort();
  const journalWithoutSql = journalTags.filter(tag => !existsSync(join(migrationsDir, `${tag}.sql`)));

  return {
    schemaTables,
    migrationTables,
    missingInMigrations,
    journalTags,
    journalIndices,
    journalIndexGaps,
    sqlWithoutJournal,
    journalWithoutSql,
  };
}

export function driftProblems(report: DriftReport): string[] {
  const problems: string[] = [];
  if (report.missingInMigrations.length)
    problems.push(`Tablas de db/schema sin CREATE TABLE en migraciones: ${report.missingInMigrations.join(', ')}`);
  if (report.journalIndexGaps.length)
    problems.push(`Journal con idx no contiguos: ${report.journalIndexGaps.join('; ')}`);
  if (report.sqlWithoutJournal.length)
    problems.push(`Migraciones .sql sin entrada en el journal: ${report.sqlWithoutJournal.join(', ')}`);
  if (report.journalWithoutSql.length)
    problems.push(`Entradas del journal sin archivo .sql: ${report.journalWithoutSql.join(', ')}`);
  return problems;
}

function main(): void {
  const report = analyzeDrift(process.cwd());
  const problems = driftProblems(report);
  if (problems.length) {
    console.error('SCHEMA_MIGRATION_DRIFT');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `SCHEMA_MIGRATION_OK: ${report.schemaTables.length} tablas de esquema cubiertas por ${report.journalTags.length} migraciones`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
