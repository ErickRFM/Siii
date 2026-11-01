import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CSS cleanup inventory', () => {
  it('counts every stylesheet and its bytes once on the current platform', () => {
    const files = readdirSync('src', { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.css'))
      .map(entry => path.join(entry.parentPath, entry.name));
    const output = execFileSync(process.execPath, ['scripts/css-cleanup.mjs', '--check'], { encoding: 'utf8', windowsHide: true });
    const line = output.split('\n').find(value => value.startsWith('CSS_CLEANUP_SUMMARY '));
    expect(line).toBeDefined();
    const summary = JSON.parse(line!.slice('CSS_CLEANUP_SUMMARY '.length));
    expect(summary.files).toBe(files.length);
    expect(summary.bytesBefore).toBe(files.reduce((sum, file) => sum + statSync(file).size, 0));
    expect(summary.bytesAfter).toBe(summary.bytesBefore);
  });
});
