import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
describe('institutional UX contracts',()=>{
 it('loads glass before refinement',()=>{
  const layout=read('src/app/layout.tsx');
  expect(layout.indexOf("import './sii-glass.css'")).toBeGreaterThan(0);
  expect(layout.indexOf("import './sii-ux-refinement.css'")).toBeGreaterThan(layout.indexOf("import './sii-glass.css'"));
 });
 it('uses accessible confirmation instead of blocking prompts',()=>{
  const dialog=read('src/components/sii-confirmation.tsx');
  expect(dialog).toContain('role="alertdialog"');
  expect(dialog).toContain('aria-modal="true"');
  expect(dialog).toContain("event.key==='Escape'");
  for(const m of ['academic-catalog','academic-operations','school-registry','scheduling-studio','teacher-gradebook','university-services','institution-roles','institution-invitations','institution-users']){
    const source=read('src/components/'+m+'.tsx');
    expect(source).toContain('useInstitutionConfirmation');
    expect(source).not.toMatch(/window\.(?:prompt|confirm)\s*\(/);
  }
 });
 it('uses semantic keyboard tabs',()=>{
  for(const path of ['src/components/university-services.tsx','src/components/school-registry.tsx']){
   const source=read(path);expect(source).toContain('role="tabpanel"');
   expect(source).toContain('tabIndex=');expect(source).toContain('ArrowRight');expect(source).toContain('ArrowLeft');
  }
 });
});
