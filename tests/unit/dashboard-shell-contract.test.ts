import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
describe('institutional shell persistence contract',()=>{
 it('keeps exactly one shell in the dashboard layout rather than per page',()=>{
  expect(source('src/app/dashboard/layout.tsx')).toContain('<SiiAppShell');
  const root='src/app/dashboard/institutions/[institutionId]';
  for(const page of ['src/app/dashboard/page.tsx','src/app/dashboard/security/page.tsx',`${root}/page.tsx`,
   ...['academic','admin','grading','invitations','operations','registry','roles','scheduling','services','users'].map(s=>`${root}/${s}/page.tsx`)])
   expect(source(page)).not.toContain('<SiiAppShell');
 });
 it('represents unverified permissions without a false denial',()=>{
  const shell=source('src/components/sii-app-shell.tsx');
  expect(shell).toContain("'Verificando…'");
  expect(shell).toContain('aria-busy={verifying}');
  expect(shell).toContain('resolveDashboardLocation(pathname,defaultInstitutionId)');
  expect(shell).toMatch(/SidebarProvider|Sheet|aria-label="Abrir navegación"/);
 });
});
