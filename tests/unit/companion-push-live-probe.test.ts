import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const root = path.resolve('.');
const probe = path.join(root, 'tests/support/companion-push-live-probe.ts');
const prefix = 'COMPANION_PUSH_PROBE_';
const config = {
  [`${prefix}ORIGIN`]: 'http://127.0.0.1:1',
  [`${prefix}SOURCE_INSTITUTION_ID`]: '11111111-1111-4111-8111-111111111111',
  [`${prefix}TARGET_TENANT_ID`]: '22222222-2222-4222-8222-222222222222',
  [`${prefix}CREDENTIAL_ID`]: 'synthetic-probe',
  [`${prefix}SECRET_BASE64`]: Buffer.alloc(32, 17).toString('base64'),
};

function invoke(overrides: Record<string, string | undefined>) {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOME'].includes(name.toUpperCase())));
  Object.assign(env, config, overrides);
  for (const name of Object.keys(env)) if (env[name] === undefined) delete env[name];
  return spawnSync(process.execPath, ['--import', 'tsx', probe], {
    // Next augments ProcessEnv with NODE_ENV; this child intentionally forwards only runtime paths.
    cwd: root, env: env as NodeJS.ProcessEnv, encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 65_536,
  });
}

function expectConfigurationRejection(overrides: Record<string, string | undefined>) {
  const child = invoke(overrides);
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  expect(child.status).toBe(1);
  expect(child.stdout).toBe('');
  expect(child.stderr).toBe('COMPANION_PUSH_PROBE_CONFIG_INVALID\n');
  expect(child.stderr).not.toContain(config[`${prefix}SECRET_BASE64`]);
}

describe('live Companion probe process guards', () => {
  it.each(Object.keys(config))('rejects a missing %s before attempting delivery', name => {
    expectConfigurationRejection({[name]: undefined});
  }, 15_000);

  it.each(['http://localhost:1', 'http://example.invalid:1', 'http://127.0.0.1:1/redirect'])
    ('rejects non-literal or non-origin destination %s', origin => {
      expectConfigurationRejection({[`${prefix}ORIGIN`]: origin});
    }, 15_000);

  it('rejects a noncanonical 32-byte secret without exposing it', () => {
    expectConfigurationRejection({[`${prefix}SECRET_BASE64`]: 'not-a-base64-secret'});
  }, 15_000);

  it('requires distinct source institution and credential tenant', () => {
    expectConfigurationRejection({[`${prefix}TARGET_TENANT_ID`]: config[`${prefix}SOURCE_INSTITUTION_ID`]});
  }, 15_000);
});
