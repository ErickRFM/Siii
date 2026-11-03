import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(file:string)=>readFileSync(file,'utf8');

describe('SIII Solid institutional design contract',()=>{
 const css=read('src/app/sii-v5-theme.css');
 it('provides one opaque light/dark palette owned by the final root import',()=>{
  const layout=read('src/app/layout.tsx');
  const imports=[...layout.matchAll(/import '\.\/([^']+\.css)'/g)].map(match=>match[1]);
  expect(imports.at(-1)).toBe('sii-v5-theme.css');
  expect(css).toContain('--solid-bg:#f3f5f8');
  expect(css).toContain('--solid-bg:#101319');
  expect(css).toContain('--solid-panel:#fff');
  expect(css).toContain('--solid-panel:#1a2029');
  expect(css).toContain('background:var(--solid-panel)!important');
  expect(css).toContain('backdrop-filter:none');
  expect(css).not.toContain('backdrop-filter:blur(');
  expect(css).not.toContain('radial-gradient(');
  expect(css).not.toContain('linear-gradient(');
 });
 it('shares navigation, academic tables, forms and mobile breakpoints',()=>{
  for(const selector of ['[data-sidebar=sidebar]','.sii-topbar','.siii-overview-hero','.siii-overview-panel','.siii-personal-data-table','.sii-catalog-table','.sii-student-portal','.sii-teacher-portal','.sii-catalog-create','.sii-security-card'])
   expect(css,selector).toContain(selector);
  expect(css).toContain('@media(max-width:767px)');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(css).toContain('outline:2px solid var(--solid-accent)');
  expect(css).toContain('html[data-sii-theme=light] #siii-personal:has(');
 });
 it('removes meaningless ornaments while preserving real student and teacher metrics',()=>{
  const student=read('src/components/student-glass-overview.tsx');
  const teacher=read('src/components/teacher-glass-overview.tsx');
  for(const content of [student,teacher]){
   expect(content).not.toContain('SiiiHeroRibbon');
   expect(content).not.toContain('siii-overview-motto');
   expect(content).toContain('<SiiiGlassMetricsRow');
  }
  expect(student).toContain('No es el promedio oficial');
  expect(student).toContain('No se registran vencimientos próximos');
 });
});
