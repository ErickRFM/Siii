import {describe,expect,it} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const source=(file:string)=>readFileSync(resolve(process.cwd(),file),'utf8');

describe('Smoked Glass cross-module design contract',()=>{
 it('keeps one authentic theme toggle and reliable initial paint',()=>{
  const root=source('src/app/layout.tsx');
  const toggle=source('src/components/sii-theme-toggle.tsx');
  expect(root).toContain('data-sii-theme="light"');
  expect(root).toContain('siii-theme-bootstrap');
  expect(root).toContain('nonce={nonce}');
  expect(root).toContain('suppressHydrationWarning');
  expect(toggle).toContain("useState<Theme>('light')");
  expect(toggle).toContain("saved==='dark'?'dark':'light'");
  expect(toggle).toContain("window.localStorage.setItem('sii-theme',next)");
  expect(toggle).toContain("'Activar tema oscuro'");
  expect(toggle).toContain("'Activar tema claro'");
 });
 it('shares the matte material across all authorized management workspaces',()=>{
  const files=[
   'admissions-workspace','academic-catalog','university-services',
   'academic-operations','teacher-portal','personal-portal',
   'school-registry','financial-workspace','institution-roles',
   'institution-users','institution-admin','institution-invitations',
   'scheduling-studio','teacher-gradebook'
  ];
  for(const name of files)expect(source('src/components/'+name+'.tsx'),name).toContain('siii-glass-workspace');
 });
 it('keeps a single shared surface and protects low-motion/high-contrast users',()=>{
  const css=source('src/app/sii-glass.css');
  expect(css).toContain('.siii-glass-workspace');
  expect(css).toContain('.siii-glass-surface');
  expect(css).toContain('prefers-reduced-motion:reduce');
  expect(css).toContain('forced-colors:active');
  expect(css).not.toContain('filter:drop-shadow(');
  const kit=source('src/components/ui/siii-glass-kit.tsx');
  expect(kit).toContain('export function SiiiGlassMetric');
  expect(kit).toContain('export function SiiiGlassPanel');
  expect(kit).toContain('export function SiiiGlassPanelHeading');
  expect(kit).toContain('export function SiiiGlassMetricsRow');
  for(const file of ['student-glass-overview','teacher-portal','financial-workspace','admissions-workspace'])expect(source('src/components/'+file+'.tsx')).toContain('<SiiiGlassMetricsRow');
  expect(source('src/components/teacher-portal.tsx')).toContain('<SiiiGlassMetric');
  expect(source('src/components/student-glass-overview.tsx')).toContain('<SiiiGlassMetric');
  expect(source('src/components/student-glass-overview.tsx')).toContain('<SiiiGlassPanel');
 });
 it('does not apply text-field paint to radios, sliders, file upload or hidden controls',()=>{
  const css=source('src/app/sii-glass.css');
  expect(css).not.toContain('input:not([type=checkbox])');
  for(const kind of ['radio','file','range','hidden','color'])expect(css).not.toContain('[type='+kind+']');
  expect(css).toContain('input:is(:not([type]),[type=text]');
 });
 it('uses its own decorative backdrop rather than a rasterized dashboard',()=>{
  expect(existsSync(resolve('public/visuals/siii-warm-architecture.svg'))).toBe(true);
  const svg=source('public/visuals/siii-warm-architecture.svg');
  expect(svg).toContain('<svg ');
  expect(svg).not.toContain('<script');
  expect(svg).not.toContain('<image');
  expect(svg).not.toContain('<foreignObject');
  expect(source('src/app/sii-glass.css')).toContain("/visuals/siii-warm-architecture.svg");
 });
 it('shows only bounded academic indicators and no ungrounded credit plan percentage',()=>{
  const overview=source('src/components/student-glass-overview.tsx');
  expect(overview).toContain('No es el promedio oficial');
  expect(overview).toContain('El plan oficial no está disponible');
  expect(overview).toContain('No se registran vencimientos próximos');
  expect(overview).not.toContain('152 / 180');
  expect(overview).not.toContain('84%');
 });
});
