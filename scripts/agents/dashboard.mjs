#!/usr/bin/env node
/** Local read-only dashboard bound to loopback. No tools or secrets. */
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';

const file = fileURLToPath(import.meta.url);
const htmlFile = join(dirname(file), 'dashboard.html');
const runFolder = resolve(dirname(dirname(dirname(dirname(file)))), '.siii-agent-runs');

export async function latestReport(root = runFolder) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const names = entries.filter(item => item.isDirectory() && /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(item.name))
    .map(item => item.name).sort().reverse();
  for (const name of names) {
    try {
      const parsed = JSON.parse(await readFile(join(root, name, 'report.json'), 'utf8'));
      if (parsed?.repository !== 'ErickRFM/Siii' || !Array.isArray(parsed.tasks)) continue;
      return {
        repository: parsed.repository, baseSha: parsed.baseSha, startedAt: parsed.startedAt,
        finishedAt: parsed.finishedAt ?? null,
        tasks: parsed.tasks.map(({ id, status, reason, changedFiles, outsideScope }) => ({
          id, status, reason, changedFiles: Array.isArray(changedFiles) ? changedFiles.length : 0,
          outsideScope: Array.isArray(outsideScope) ? outsideScope.length : 0,
        })),
        blocked: Array.isArray(parsed.blocked) ? parsed.blocked : [],
        waitingForMergedPRs: Array.isArray(parsed.waitingForMergedPRs) ? parsed.waitingForMergedPRs : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }
  return null;
}
export function makeDashboardServer(root = runFolder) {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    try {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      if (req.url === '/api/status') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ report: await latestReport(root) }));
      } else if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await readFile(htmlFile));
      } else { res.writeHead(404); res.end(); }
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Could not load local status' }));
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === file) {
  const port = Number(process.env.SIII_AGENT_DASHBOARD_PORT ?? '4318');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('Invalid port'); process.exit(2);
  }
  makeDashboardServer().listen(port, '127.0.0.1', () => {
    console.log(`SIII agents dashboard: http://127.0.0.1:${port} (read-only, local)`);
  });
}
