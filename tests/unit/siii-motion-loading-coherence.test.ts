import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(path,'utf8');

describe('personal motion, loading and role coherence',()=>{
 it('has one owner for entrance animations per workspace',()=>{
  const shell=read('src/app/sii-interactions.css');
  const personal=read('src/app/sii-personal-fidelity.css');
  expect(shell).toContain('.sii-app:not(#siii-personal) .sii-page > :first-child');
  expect(personal).toContain('.siii-overview-hero{animation:siii-personal-rise');
  expect(personal).toContain('@media(prefers-reduced-motion:reduce)');
  expect(personal).not.toContain('.siii-student-aside{animation:siii-personal-rise');
 });
 it('does not animate heavy decorations forever or make static cards pretend to be actions',()=>{
  const css=read('src/app/sii-personal-fidelity.css');
  for(const name of ['siii-ambient-pulse','siii-ribbon-breathe','siii-status-ping','siii-date-pulse'])
   expect(css).not.toContain(name);
  expect(css).not.toMatch(/\.siii-overview-panel:hover\s*\{\s*transform:/);
  expect(css).not.toMatch(/\.siii-shared-glass-metric:hover\s*\{\s*transform:/);
  expect(css).toContain('.siii-overview-shortcuts>:is(button,a):hover');
  expect(css).toContain('.siii-overview-primary:hover');
 });
 it('keeps compact loading while preserving a stable teacher home and independent filters',()=>{
  const teacher=read('src/components/teacher-portal.tsx');
  expect(read('src/app/sii-kit-components.css')).toContain('min-height:92px');
  expect(teacher).toContain('className="sr-only">Actualizando información institucional');
  expect(teacher).toContain('<TeacherGlassOverview profile={profile??null} groups={groups}');
  expect(teacher).toContain('rows={visible}');
  expect(teacher).not.toContain('<TeacherGlassOverview profile={profile??null} groups={inTerm}');
 });
});
