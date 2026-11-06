#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { buildSchedule, renderMarkdown } from './coordinator.mjs';

const allowedFlags = new Set(['--manifest', '--reservations', '--format']);
const args = process.argv.slice(2);
try {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = [args[i], args[i + 1]];
    if (!allowedFlags.has(key) || !value || value.startsWith('--') || key in options) {
      throw new Error(`Invalid arguments. Use --manifest path --reservations path --format json|markdown`);
    }
    options[key] = value;
  }
  const format = options['--format'] ?? 'markdown';
  if (!['json', 'markdown'].includes(format)) throw new Error('Invalid output format');
  const raw = JSON.parse(await readFile(options['--manifest'] ?? 'scripts/agents/workplan.json', 'utf8'));
  const reservations = options['--reservations'] ?
    JSON.parse(await readFile(options['--reservations'], 'utf8')) : [];
  const result = buildSchedule(raw, reservations);
  process.stdout.write(format === 'json' ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
} catch (error) {
  console.error(`SIII agent planner: ${error.message}`);
  process.exitCode = 1;
}
