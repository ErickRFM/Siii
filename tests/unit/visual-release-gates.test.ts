import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// Fail closed when a future UI refactor silently replaces reviewed pixel baselines
// with geometry-only or screenshot-existence checks.
describe('mandatory visual release gates',()=>{
 const suite=readFileSync('tests/ui/approved-reference.spec.ts','utf8');
 const baseline=readFileSync('tests/support/visual-baseline.ts','utf8');

 it('retains the approved-reference material composition gate',()=>{
  expect(suite).toMatch(/expect\(comparison\.compositionWithinThreshold,[^\n]*\)\.toBe\(true\)/);
 });
 it('compares real student/teacher light/dark desktop/mobile screenshots',()=>{
  expect(suite).toMatch(/import\s*\{\s*expectVisualBaseline\s*\}\s*from\s*['"]\.\.\/support\/visual-baseline['"]/);
  expect(suite).toContain("for(const role of ['student','teacher'] as const)for(const theme of ['dark','light'] as const)");
  expect(suite).toContain('for(const width of [1344,390])');
  expect(suite).toContain('expectVisualBaseline(screenshot,`${role}-${theme}-${width}`,info)');
 });
 it('preserves unmasked pixelmatch and the reviewed 5% limit',()=>{
  expect(baseline).toContain('pixelmatch(reference.data,actual.data,diff.data');
  expect(baseline).toMatch(/expect\(ratio,[^\n]*\)\.toBeLessThanOrEqual\(\.05\)/);
 });
});
