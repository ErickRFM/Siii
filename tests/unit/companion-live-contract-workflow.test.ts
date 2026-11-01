import {afterAll, describe, expect, it} from 'vitest';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parse} from 'yaml';

const workflow = parse(readFileSync(resolve('.github/workflows/verify.yml'), 'utf8'));
const job = workflow.jobs['companion-live-contract'];
const expectedSuites: Record<string, number> = {
  'org.companerodeescuela.api.integrations.academic.SiiiPushLiveContractTest': 1,
  'org.companerodeescuela.api.integrations.academic.SiiiFullChainLiveContractTest': 1,
  'org.companerodeescuela.api.integrations.academic.MongoSiiiSectionProjectionTest': 9,
  'org.companerodeescuela.api.integrations.academic.SiiiChangeNotificationTest': 4,
  'org.companerodeescuela.api.integrations.push.MongoInstitutionalPushRepositoryTest': 11,
  'org.companerodeescuela.api.integrations.push.InstitutionalProjectionReceiptRoutesTest': 5,
  'org.companerodeescuela.api.academic.InstitutionalAttendanceHistoryRoutesTest': 8,
};
const directory = mkdtempSync(join(tmpdir(), 'siii-live-contract-gate-'));
afterAll(() => rmSync(directory, {recursive: true, force: true}));
const bundledPython = join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.PYTHON ?? (process.platform === 'win32' && existsSync(bundledPython) ? bundledPython : 'python3');

function steps() { return job.steps as Array<{name?: string; run?: string; uses?: string; with?: Record<string, unknown>}>; }
function gateScript() {
  const script = steps().find(step => step.name === 'Require live contract and receiver regressions without skips')!.run!;
  const code = script.match(/<<'PY'\n([\s\S]*?)\nPY\s*$/)?.[1];
  expect(code).toBeDefined();
  return code!;
}
function executeGate(mutate?: (file: string, name: string, count: number) => void) {
  for (const [name, count] of Object.entries(expectedSuites)) {
    const file = join(directory, 'TEST-' + name + '.xml');
    writeFileSync(file, `<testsuite name="${name}" tests="${count}" failures="0" errors="0" skipped="0">${Array.from({length: count}, (_, index) => `<testcase name="case-${index}"/>`).join('')}</testsuite>`);
    mutate?.(file, name, count);
  }
  const result = spawnSync(python, ['-', directory], {input: gateScript(), encoding: 'utf8'});
  if (result.error) throw result.error;
  return result;
}

describe('full Companion live contract CI gate', () => {
  it('uses only disposable loopback database services and prepares the source before receiver tests', () => {
    expect(job.services.postgres).toMatchObject({image: 'postgres:17', ports: ['127.0.0.1:55439:5432'], env: {POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: 'postgres', POSTGRES_DB: 'siii_chain_test'}});
    expect(job.services.mongo).toMatchObject({image: 'mongo:7.0.45@sha256:8bb4442761a63a8dda452744082cdac9644b429807eb977b42324a63cef59ca4', ports: ['127.0.0.1:27017:27017']});
    expect(job.services.mongo.options).toContain('--health-start-period 20s');
    expect(job.services.mongo.options).toContain('db.adminCommand({ping:1})');
    const database = 'postgresql://postgres:postgres@127.0.0.1:55439/siii_chain_test';
    expect(job.env).toMatchObject({DATABASE_URL: database, INTEGRATION_DATABASE_URL: database, SIII_DATABASE_ENV: 'test', COMPANION_CHAIN_PROBE_DATABASE_URL: database, COMPANION_CHAIN_PROBE_PROJECT_ROOT: '${{ github.workspace }}', V12_TEST_MONGODB_URI: 'mongodb://127.0.0.1:27017'});
    const commands = steps().map(step => step.run ?? '');
    const install = commands.indexOf('npm ci --ignore-scripts');
    const native = commands.indexOf('npm rebuild argon2 esbuild');
    const roles = commands.indexOf('node --import tsx scripts/prepare-test-api-roles.ts');
    const migration = commands.indexOf('npm run db:migrate');
    const receiver = commands.findIndex(command => command.includes('./gradlew'));
    expect(install).toBeGreaterThanOrEqual(0);
    expect(native).toBeGreaterThan(install);
    expect(roles).toBeGreaterThan(native);
    expect(migration).toBeGreaterThan(roles);
    expect(receiver).toBeGreaterThan(migration);
    expect(job['timeout-minutes']).toBe(25);
  });

  it('runs and validates exactly the seven required suites and uploads only bounded evidence', () => {
    const receiver = steps().find(step => step.run?.includes('./gradlew'))!.run!;
    const selected = [...receiver.matchAll(/--tests '([^']+)'/g)].map(match => match[1]).sort();
    expect(selected).toEqual(Object.keys(expectedSuites).sort());
    expect(receiver).toContain('export COMPANION_CHAIN_PROBE_NODE=');
    const guarded = [...gateScript().matchAll(/'(org\.[^']+)': (\d+),/g)].map(match => [match[1], Number(match[2])]);
    expect(Object.fromEntries(guarded)).toEqual(expectedSuites);
    const artifact = steps().find(step => step.name === 'Synthetic live contract evidence')!.with!;
    expect((artifact.path as string).trim().split('\n').sort()).toEqual([
      '.p0-local/companion-contract.log',
      '.p0-local/companion-services.log',
      ...Object.keys(expectedSuites).map(name => '.p0-local/companion-contract/services/api/build/test-results/test/TEST-' + name + '.xml'),
    ].sort());
    expect(JSON.stringify(job.env)).not.toMatch(/HOLD|JWT|TOKEN|SECRET/);
    const checkout = steps().find(step => step.with?.repository === 'ErickRFM/Compa-ero-de-esc')!;
    expect(checkout.with!.ref).toMatch(/^[a-f0-9]{40}$/);
    const clean = steps().find(step => step.name === 'Receiver sources remain fixed and clean')!.run!;
    expect(clean).toContain("= '" + checkout.with!.ref + "'");
  });

  it('accepts complete successful XML fixtures', () => {
    const result = executeGate();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split('\n')).toHaveLength(Object.keys(expectedSuites).length);
  });

  it.each(['skipped', 'failure', 'error'])('rejects a %s testcase even when suite totals claim success', tag => {
    const result = executeGate((file, name) => {
      if (name.endsWith('.SiiiFullChainLiveContractTest')) writeFileSync(file, readFileSync(file, 'utf8').replace('<testcase name="case-0"/>', `<testcase name="case-0"><${tag}/></testcase>`));
    });
    expect(result.status).not.toBe(0);
  });

  it('rejects skipped suite totals, missing suites and incomplete testcase lists', () => {
    for (const variant of ['skipped', 'missing', 'incomplete']) {
      const result = executeGate((file, name) => {
        if (!name.endsWith('.InstitutionalProjectionReceiptRoutesTest')) return;
        if (variant === 'missing') rmSync(file);
        else writeFileSync(file, readFileSync(file, 'utf8').replace(variant === 'skipped' ? 'skipped="0"' : '<testcase name="case-0"/>', variant === 'skipped' ? 'skipped="1"' : ''));
      });
      expect(result.status, variant).not.toBe(0);
      if (variant === 'missing') expect(result.stderr).toContain('missing XML; contract did not run');
    }
  });
});
