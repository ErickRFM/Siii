import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestReport, makeDashboardServer } from '../../scripts/agents/dashboard.mjs';

test('reads newest run but hides worktree paths from the client', async () => {
  const root = await mkdtemp(join(tmpdir(), 'siii-agents-'));
  try {
    const folder = join(root, '2026-11-02T22-00-00-000Z');
    await mkdir(folder);
    await writeFile(join(folder, 'report.json'), JSON.stringify({
      repository: 'ErickRFM/Siii', baseSha: 'a'.repeat(40), tasks: [
        { id: 'ui', status: 'needs-review', changedFiles: ['src/a'], outsideScope: [],
          path: 'C:\\private\\file', secret: 'not-client-data' },
      ], worktrees: [{ path: 'C:\\private\\file' }],
    }));
    const result = await latestReport(root);
    assert.equal(result.tasks[0].changedFiles, 1);
    assert.doesNotMatch(JSON.stringify(result), /private|secret|worktrees/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('read-only loopback dashboard exposes status but no execution endpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'siii-agents-'));
  const server = makeDashboardServer(root);
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const url = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(url + '/api/status');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { report: null });
    assert.equal((await fetch(url + '/start', { method: 'POST' })).status, 405);
    assert.equal((await fetch(url + '/nothing')).status, 404);
    const homepage = await fetch(url);
    assert.equal(homepage.status, 200);
    assert.match(await homepage.text(), /Centro de agentes/);
  } finally { await new Promise((done) => server.close(done)); await rm(root, { recursive: true, force: true }); }
});
