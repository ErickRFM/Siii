import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// Fail closed when a future UI refactor silently replaces reviewed pixel baselines
// with geometry-only or screenshot-existence checks.
describe('mandatory visual release gates',()=>{
 const suite=readFileSync('tests/ui/approved-reference.spec.ts','utf8');
 const baseline=readFileSync('tests/support/visual-baseline.ts','utf8');

 it('retains the approved-reference material composition gate',()=>{
  expect(suite).toContain("expect(matte.every(surface=>surface.border==='1px'&&surface.shadow==='none')).toBe(true)");
 });
 it('compares real student/teacher light/dark desktop/mobile screenshots',()=>{
  expect(suite).toMatch(/import\s*\{\s*expectVisualBaseline\s*\}\s*from\s*['"]\.\.\/support\/visual-baseline['"]/);
  expect(suite).toContain("for(const role of ['student','teacher'] as const)for(const theme of ['dark','light'] as const)");
  expect(suite).toContain('for(const width of [1344,390])');
  expect(suite).toContain('expectVisualBaseline(screenshot,`v2-${role}-${theme}-${width}`,info)');
 });
 it('preserves unmasked pixelmatch and the reviewed 5% limit',()=>{
  // Preserve real unmasked pixel comparison. A maximum two-row geometry drift
  // must be paid for in the 5% budget rather than silently cropped away.
  expect(baseline).toContain('pixelmatch(');
  expect(baseline).toContain('reference.data.subarray(0,overlapBytes)');
  expect(baseline).toContain('actual.data.subarray(0,overlapBytes)');
  expect(baseline).toContain('const unmatched=delta*actual.width');
  expect(baseline).toContain('toBeLessThanOrEqual(2)');
  expect(baseline).toMatch(/expect\(ratio,[^\n]*\)\.toBeLessThanOrEqual\(\.05\)/);
 });
});
