#!/usr/bin/env node
/**
 * Opt-in LOCAL Codex execution. No GitHub token, auto-commit, push, PR or merge.
 * Later dependency waves are never launched until their predecessors are merged.
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSchedule, validateWorkplan, renderMarkdown } from './coordinator.mjs';
import {
  agentEnvironment, assertTrustedRepoContext, buildAgentPrompt,
  selectFirstWave, unexpectedChanges,
} from './executor-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const options = { execute: false, parallel: 2, timeout: 40, manifest: 'scripts/agents/workplan.json' };
const usage = 'Usage: node scripts/agents/run.mjs [--execute --reservations FILE] [--manifest FILE] [--max-parallel 1..4] [--timeout-minutes 5..120]';
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--execute' && !options.execute) { options.execute = true; continue; }
  if (!['--manifest', '--reservations', '--max-parallel', '--timeout-minutes'].includes(arg)) {
    console.error(usage); process.exit(2);
  }
  const value = args[++i];
  if (!value || value.startsWith('--')) { console.error(usage); process.exit(2); }
  if (arg === '--manifest') options.manifest = value;
  if (arg === '--reservations') options.reservations = value;
  if (arg === '--max-parallel') options.parallel = Number(value);
  if (arg === '--timeout-minutes') options.timeout = Number(value);
}
if (!Number.isSafeInteger(options.parallel) || options.parallel < 1 || options.parallel > 4 ||
    !Number.isSafeInteger(options.timeout) || options.timeout < 5 || options.timeout > 120) {
  console.error(usage); process.exit(2);
}

function command(bin, argv, cwd = root, extra = {}) {
  return new Promise((accept, reject) => {
    const processHandle = spawn(bin, argv, { cwd, shell: false, windowsHide: true, ...extra });
    let stdout = '';
    let stderr = '';
    processHandle.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    processHandle.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    processHandle.on('error', reject);
    processHandle.on('close', (code) => code === 0 ? accept(stdout) :
      reject(new Error(`${bin} exited ${code}: ${stderr.slice(-500)}`)));
  });
}
function git(argv, cwd = root) { return command('git', argv, cwd); }

function runCodex(worktree, prompt, timeout) {
  // Noninteractive Codex reads the prompt from stdin. The restrictive sandbox
  // is intentional; never append --dangerously-bypass-approvals-and-sandbox.
  let bin = 'codex';
  let argv = ['exec', '--sandbox', 'workspace-write', '--json', '-C', worktree, '-'];
  if (process.platform === 'win32') {
    // codex installed via npm on Windows is normally a .cmd shim.
    // Escape by strict path validation; do not pass untrusted text to cmd.exe.
    if (!/^[a-zA-Z0-9_:\\/ .-]+$/.test(worktree)) {
      throw new Error('Windows workspace path contains characters unsafe for cmd.exe');
    }
    bin = process.env.ComSpec ?? 'cmd.exe';
    argv = ['/d', '/c', `codex exec --sandbox workspace-write --json -C "${worktree}" -`];
  }
  return new Promise((done) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout * 60_000);
    let completed = false;
    function finish(result) {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      done(result);
    }
    try {
      const child = spawn(bin, argv, {
        cwd: worktree, shell: false, windowsHide: true, signal: controller.signal,
        env: agentEnvironment(), stdio: ['pipe', 'ignore', 'ignore'],
      });
      child.on('error', (error) => finish({ success: false, reason: error.name === 'AbortError' ? 'timeout' : 'runtime-error' }));
      child.on('close', (code) => finish({ success: code === 0, reason: code === 0 ? 'completed' : `exit-${code}` }));
      child.stdin.on('error', () => {});
      child.stdin.end(prompt);
    } catch {
      finish({ success: false, reason: 'runtime-error' });
    }
  });
}
async function main() {
  const plan = validateWorkplan(JSON.parse(await readFile(resolve(root, options.manifest), 'utf8')));
  if (!options.execute) {
    process.stdout.write(renderMarkdown(buildSchedule(plan)));
    process.stdout.write('\nPara ejecutar Codex localmente, usa --execute y --reservations con PRs abiertos revisados.\n');
    return;
  }
  if (!options.reservations) throw new Error('--execute requires --reservations (a reviewed PR ownership list)');
  const reservations = JSON.parse(await readFile(resolve(root, options.reservations), 'utf8'));
  const schedule = buildSchedule(plan, reservations);
  const candidates = selectFirstWave(plan, schedule);
  if (!candidates.length) throw new Error('No unblocked independent first-wave tasks');
  const [branch, head, originMain, remote, porcelain] = await Promise.all([
    git(['branch', '--show-current']), git(['rev-parse', 'HEAD']),
    git(['rev-parse', 'origin/main']), git(['remote', 'get-url', 'origin']),
    git(['status', '--porcelain']),
  ]);
  assertTrustedRepoContext({ branch: branch.trim(), head: head.trim(), originMain: originMain.trim(),
    remote: remote.trim(), porcelain: porcelain.trim() });
  // Fail before creating local branches if Codex is not installed.
  if (process.platform === 'win32') await command('where.exe', ['codex']);
  else await command('codex', ['--version']);
  const commit = head.trim();
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = resolve(dirname(root), '.siii-agent-runs', date);
  const worktreeRoot = resolve(dirname(root), '.siii-agent-worktrees');
  await mkdir(runDir, { recursive: false });
  await mkdir(worktreeRoot, { recursive: true });
  const report = { repository: plan.repository, baseSha: commit, mode: 'local-codex-worktree',
    startedAt: new Date().toISOString(), worktrees: [], blocked: schedule.blocked,
    waitingForMergedPRs: schedule.waves.slice(1).flatMap((w) => w.tasks.map((t) => t.id)),
    tasks: [], permission: 'manual-only-no-merge' };
  let saveQueue = Promise.resolve();
  const save = () => {
    const snapshot = JSON.stringify(report, null, 2) + '\n';
    saveQueue = saveQueue.then(() => writeFile(join(runDir, 'report.json'), snapshot, { flag: 'w' }));
    return saveQueue;
  };
  await save();
  // Create Git refs serially: concurrent git worktree changes contend for locks.
  const started = [];
  for (const task of candidates) {
    const worktree = join(worktreeRoot, task.id);
    await git(['worktree', 'add', '-b', task.branch, worktree, commit]);
    started.push({ task, worktree });
    report.worktrees.push({ id: task.id, branch: task.branch, path: worktree });
    report.tasks.push({ id: task.id, status: 'created', branch: task.branch });
    await save();
  }
  for (let offset = 0; offset < started.length; offset += options.parallel) {
    const batch = started.slice(offset, offset + options.parallel);
    await Promise.all(batch.map(async ({ task, worktree }) => {
      const item = report.tasks.find((x) => x.id === task.id);
      item.status = 'running';
      await save();
      console.log(`Running ${task.id} in isolated worktree (no git write-back).`);
      const outcome = await runCodex(worktree, buildAgentPrompt(task, commit), options.timeout);
      const tracked = (await git(['diff', '--name-only', '-z', 'HEAD'], worktree)).split('\0').filter(Boolean);
      const untracked = (await git(['ls-files', '--others', '--exclude-standard', '-z'], worktree)).split('\0').filter(Boolean);
      const changed = [...new Set([...tracked, ...untracked])];
      const outside = unexpectedChanges(changed, task.writes);
      item.status = outcome.success && outside.length === 0 ? 'needs-review' : 'blocked';
      item.reason = outside.length ? 'unauthorized-files' : outcome.reason;
      item.changedFiles = changed;
      item.outsideScope = outside;
      console.log(`${task.id}: ${item.status}, modified files: ${changed.length}`);
      await save();
    }));
  }
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(`Results (local-only): ${join(runDir, 'report.json')}`);
  if (report.tasks.some((task) => task.status === 'blocked')) process.exitCode = 1;
}
main().catch((error) => { console.error(`SIII agent runner: ${error.message}`); process.exitCode = 1; });
