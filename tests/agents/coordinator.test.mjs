import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, claimsOverlap, renderMarkdown } from '../../scripts/agents/coordinator.mjs';

const makeTask = (id, writes, dependsOn = []) => ({
  id, agent: 'qa', title: `Auditoría de ${id}`, branch: `codex/agents-${id}`, writes, dependsOn,
});
const workplan = (tasks) => ({ version: 1, repository: 'ErickRFM/Siii', base: 'main', tasks });

test('parallel independent scopes, dependent QA, final integration', () => {
  const schedule = buildSchedule(workplan([
    makeTask('ui', ['src/app/dashboard/**']),
    makeTask('api', ['src/app/api/**']),
    makeTask('qa', ['tests/**'], ['ui', 'api']),
    makeTask('gate', ['docs/agent/**'], ['qa']),
  ]));
  assert.deepEqual(schedule.waves.map(({ tasks }) => tasks.map(({ id }) => id)),
    [['api', 'ui'], ['qa'], ['gate']]);
  assert.equal(schedule.mode, 'plan-only');
  assert.deepEqual(schedule.blocked, []);
});

test('overlapping files and directory claims never run in one wave', () => {
  assert.equal(claimsOverlap('src/app/**', 'src/app/api/route.ts'), true);
  assert.equal(claimsOverlap('src/app/api/**', 'src/app/dashboard/**'), false);
  const schedule = buildSchedule(workplan([
    makeTask('first', ['src/app/**']), makeTask('second', ['src/app/api/**']),
  ]));
  assert.deepEqual(schedule.waves.map(({ tasks }) => tasks.map(({ id }) => id)),
    [['first'], ['second']]);
});

test('reserved PR paths block tasks and their dependents, but not other lanes', () => {
  const schedule = buildSchedule(workplan([
    makeTask('ui', ['src/components/**']),
    makeTask('api', ['src/app/api/**']),
    makeTask('qa', ['tests/**'], ['ui', 'api']),
  ]), [{ id: 'pr-174', writes: ['src/components/personal-portal.tsx'] }]);
  assert.deepEqual(schedule.waves.map(({ tasks }) => tasks.map(({ id }) => id)), [['api']]);
  assert.deepEqual(schedule.blocked, [
    { id: 'qa', reason: 'waiting on ui' },
    { id: 'ui', reason: 'reserved by pr-174' },
  ]);
});

test('cycles and missing dependencies fail closed', () => {
  assert.throws(() => buildSchedule(workplan([
    makeTask('aa', ['src/a'], ['bb']), makeTask('bb', ['src/b'], ['aa']),
  ])), /Dependency cycle/);
  assert.throws(() => buildSchedule(workplan([
    makeTask('aa', ['src/a'], ['missing']),
  ])), /Unknown dependency/);
});

test('unsafe path claims, duplicate tasks and unsupported repo fail closed', () => {
  for (const path of ['/tmp/foo', 'src/../secrets', '**', 'src/**/*', 'src\\foo']) {
    assert.throws(() => buildSchedule(workplan([makeTask('bad', [path])])), /Unsafe or unsupported/);
  }
  assert.throws(() => buildSchedule(workplan([
    makeTask('dup', ['src/a']), makeTask('dup', ['src/b']),
  ])), /Duplicate task/);
  assert.throws(() => buildSchedule({ ...workplan([makeTask('ok', ['src/a'])]), base: 'other' }),
    /target main/);
});

test('markdown clearly states planning only', () => {
  const markdown = renderMarkdown(buildSchedule(workplan([makeTask('ok', ['docs/agent/**'])])));
  assert.match(markdown, /solo planificación/);
  assert.match(markdown, /No se ejecutan agentes ni merges/);
  assert.match(markdown, /CI completo verde/);
});
