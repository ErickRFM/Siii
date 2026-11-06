import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, copyFile, readFile, readdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (cwd, ...args) => exec('git', args, { cwd });

test('real Git worktree + fake Codex process produce reviewable report, never merge', async (t) => {
  if (process.platform === 'win32') { t.skip('POSIX fake CLI only'); return; }
  const scratch = await mkdtemp(join(tmpdir(), 'siii-agent-runtime-'));
  const root = join(scratch, 'repo');
  try {
    await mkdir(join(root, 'scripts/agents'), { recursive: true });
    await mkdir(join(root, 'src/components'), { recursive: true });
    for (const filename of ['run.mjs', 'executor-core.mjs', 'coordinator.mjs']) {
      await copyFile(join(sourceRoot, 'scripts/agents', filename), join(root, 'scripts/agents', filename));
    }
    await writeFile(join(root, 'src/components/seed.txt'), 'fixture\n');
    await writeFile(join(root, '.gitignore'), '.p0-local/\n');
    await writeFile(join(root, 'scripts/agents/workplan.json'), JSON.stringify({
      version: 1, repository: 'ErickRFM/Siii', base: 'main', tasks: [{
        id: 'agent-ui', agent: 'ui', title: 'Actualizar componente sintético',
        branch: 'codex/test-agent-ui', writes: ['src/components/**'], dependsOn: [],
      }],
    }));
    await git(root, 'init', '-b', 'main');
    await git(root, 'config', 'user.email', 'ci@example.invalid');
    await git(root, 'config', 'user.name', 'CI test');
    await git(root, 'add', '.');
    await git(root, 'commit', '-m', 'fixture');
    await git(root, 'remote', 'add', 'origin', 'https://github.com/ErickRFM/Siii.git');
    await git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    await mkdir(join(root, '.p0-local'));
    await writeFile(join(root, '.p0-local/reservations.json'), '[]\n');
    const bin = join(scratch, 'bin');
    await mkdir(bin);
    const codex = join(bin, 'codex');
    await writeFile(codex, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo codex-mock; exit 0; fi\nmkdir -p src/components\nprintf "agent result\\n" > src/components/agent.txt\nexit 0\n');
    await chmod(codex, 0o755);
    const { stdout } = await exec(process.execPath, [
      'scripts/agents/run.mjs', '--execute', '--reservations', '.p0-local/reservations.json', '--max-parallel', '1',
    ], { cwd: root, env: { ...process.env, PATH: bin + ':' + process.env.PATH }, timeout: 25000 });
    assert.match(stdout, /needs-review/);
    const runFolder = join(scratch, '.siii-agent-runs');
    const run = (await readdir(runFolder))[0];
    const report = JSON.parse(await readFile(join(runFolder, run, 'report.json'), 'utf8'));
    assert.equal(report.tasks[0].status, 'needs-review');
    assert.deepEqual(report.tasks[0].changedFiles, ['src/components/agent.txt']);
    assert.equal((await git(root, 'branch', '--show-current')).stdout.trim(), 'main');
    assert.equal((await git(root, 'status', '--porcelain')).stdout.trim(), '');
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
