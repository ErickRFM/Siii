import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentEnvironment, buildAgentPrompt, unexpectedChanges,
  selectFirstWave, assertTrustedRepoContext,
} from '../../scripts/agents/executor-core.mjs';

test('does not pass project credentials into spawned Codex sessions', () => {
  const env = agentEnvironment({ PATH: '/bin', HOME: '/home/u', OPENAI_API_KEY: 'auth',
    SUPABASE_SERVICE_ROLE_KEY: 'private', DATABASE_URL: 'postgres://private',
    CRON_SECRET: 'private', GITHUB_TOKEN: 'private', VERCEL_TOKEN: 'private' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/home/u', OPENAI_API_KEY: 'auth', NO_COLOR: '1' });
});

test('prompts have a narrow scope and prohibit pushing and production migrations', () => {
  const message = buildAgentPrompt({ title: 'Revisar UI', agent: 'ui', writes: ['src/components/**'] }, 'a'.repeat(40));
  assert.match(message, /src\/components\/\*\*/);
  assert.match(message, /no pushes/);
  assert.match(message, /migraciones en producción/);
  assert.throws(() => buildAgentPrompt({ writes: [] }, 'a'.repeat(40)));
});

test('detects unauthorised tracked and untracked file changes', () => {
  assert.deepEqual(unexpectedChanges(['src/components/A.tsx', 'src/components/A.tsx', 'src/app/api/route.ts', '.env'],
    ['src/components/**']), ['src/app/api/route.ts', '.env']);
  assert.deepEqual(unexpectedChanges(['src/app/api/a.ts', 'src/app/api/b.ts'], ['src/app/api/**']), []);
});

test('only the first independent wave is executable without prior merges', () => {
  const first = { id: 'ui', dependsOn: [] };
  const dependent = { id: 'qa', dependsOn: ['ui'] };
  const plan = { tasks: [first, dependent] };
  const schedule = { waves: [{ tasks: [first] }, { tasks: [dependent] }] };
  assert.deepEqual(selectFirstWave(plan, schedule), [first]);
  assert.throws(() => selectFirstWave(plan, { waves: [{ tasks: [dependent] }] }), /predecessors/);
});

test('requires exact clean and up-to-date intended repository', () => {
  const context = { branch: 'main', head: 'f'.repeat(40), originMain: 'f'.repeat(40),
    remote: 'https://github.com/ErickRFM/Siii.git', porcelain: '' };
  assert.doesNotThrow(() => assertTrustedRepoContext(context));
  assert.throws(() => assertTrustedRepoContext({ ...context, branch: 'feat/rogue' }), /main/);
  assert.throws(() => assertTrustedRepoContext({ ...context, originMain: '0'.repeat(40) }), /differs/);
  assert.throws(() => assertTrustedRepoContext({ ...context, remote: 'https://github.com/other/Siii' }), /origin/);
  assert.throws(() => assertTrustedRepoContext({ ...context, porcelain: '?? .env' }), /clean/);
});
