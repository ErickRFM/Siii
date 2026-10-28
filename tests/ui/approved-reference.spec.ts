import {test,expect,type Page} from '@playwright/test';
import pg from 'pg';
import {mkdirSync,writeFileSync} from 'node:fs';
import {isolatedDatabaseUrl} from '../support/database-url';
import {portalPassword} from '../support/portal-fixture';
import {approvedReferenceFixture} from '../support/approved-reference-fixture';
import AxeBuilder from '@axe-core/playwright';
import {compareApprovedReference} from '../../scripts/compare-approved-reference.mjs';
import {personalNavigate} from '../support/personal-navigation';

const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
let f:Awaited<ReturnType<typeof approvedReferenceFixture>>;
test.beforeAll(async()=>{await sql.connect();f=await approvedReferenceFixture(sql)});
test.afterAll(async()=>{await sql.end()});
test.beforeEach(async()=>{await sql.query('DELETE FROM auth_throttle')});
async function login(page:Page,username:string,theme:'light'|'dark'|null='dark'){
 if(theme)await page.addInitScript(value=>localStorage.setItem('sii-theme',value),theme);
 await page.goto('/login');await page.getByLabel('Usuario institucional').fill(username);await page.getByLabel('Contraseña',{exact:true}).fill(portalPassword);await page.getByRole('button',{name:'Entrar al sistema'}).click();
 await page.waitForURL(/\/dashboard(?:\/|$)/);
}
test('student entry and approved composition at exactly 1344 by 896',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>{errors.push(error.stack??error.message);writeFileSync('.p0-local/fidelity/browser-errors.json',JSON.stringify(errors,null,2))});page.on('console',message=>{if(message.type()==='error'){errors.push(message.text());writeFileSync('.p0-local/fidelity/browser-errors.json',JSON.stringify(errors,null,2))}});
 await page.setViewportSize({width:1344,height:896});await page.clock.setFixedTime(new Date('2026-10-26T18:00:00Z'));
 await login(page,f.student.username);
 if(process.env.SIII_FIDELITY_BASELINE!=='1')await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/student`),{timeout:30000});
 const initialUrl=page.url();
 if(process.env.SIII_FIDELITY_BASELINE==='1')await page.goto(`/dashboard/institutions/${f.tenant}/student`);
 await expect(page.locator('.siii-student-dashboard')).toBeVisible();await expect(page.locator('.siii-overview-detail-grid').getByText('Matemáticas Discretas',{exact:true})).toBeVisible();
 await page.evaluate(async()=>{await document.fonts.ready;const image=new Image();image.src='/visuals/siii-campus-reference.png';await image.decode().catch(()=>{})});
 const directory='.p0-local/fidelity';mkdirSync(directory,{recursive:true});const name=process.env.SIII_FIDELITY_BASELINE==='1'?'before':'student-approved-1344';
 await page.screenshot({path:`${directory}/${name}.png`,animations:'disabled'});
 const selectors={hero:'.siii-overview-hero',metrics:'.siii-overview-metrics',details:'.siii-overview-detail-grid',progress:'.siii-overview-progress',calendar:'.siii-overview-calendar',notices:'#avisos',sidebar:'[data-sidebar=sidebar]'};
 const boxes:Record<string,unknown>={initialUrl};for(const[key,selector]of Object.entries(selectors))boxes[key]=await page.locator(selector).first().boundingBox();
 writeFileSync(`${directory}/${name}-geometry.json`,JSON.stringify(boxes,null,2));
 writeFileSync(`${directory}/${name}-rows.json`,JSON.stringify(await page.locator('.siii-overview-detail-grid>section:last-child .siii-overview-listrow').evaluateAll(rows=>rows.map(row=>({text:row.textContent,children:[...row.children].map(child=>{const style=getComputedStyle(child),box=child.getBoundingClientRect();return{text:child.textContent,position:style.position,width:box.width,height:box.height,color:style.color,opacity:style.opacity}})}))),null,2));
 writeFileSync(`${directory}/${name}-styles.json`,JSON.stringify(await page.evaluate(()=>Object.fromEntries(['.siii-personal-shell','.siii-student-dashboard','.siii-overview-hero','.siii-overview-hero h2','.siii-overview-heading h3','.siii-overview-listrow strong','.siii-personal-nav-link','.siii-student-home-shell [role=tabpanel]'].map(selector=>{const e=document.querySelector(selector)!;const s=getComputedStyle(e);return[selector,{font:s.font,fontFamily:s.fontFamily,fontWeight:s.fontWeight,background:s.background,border:s.border,padding:s.padding,lineHeight:s.lineHeight}]}))),null,2));
 expect(initialUrl).toContain(`/dashboard/institutions/${f.tenant}/student`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1344);
 const hero=await page.locator('.siii-overview-hero').boundingBox();expect(hero!.x).toBeCloseTo(232,0);expect(hero!.y).toBeCloseTo(87,0);
 await expect(page.getByText('PRIVATE-OTHER-TENANT')).toHaveCount(0);
 if(process.env.SIII_FIDELITY_BASELINE!=='1'){
  const comparison=compareApprovedReference(`${directory}/${name}.png`,boxes,directory);
  expect(comparison.geometryErrors).toEqual([]);
  expect(comparison.compositionWithinThreshold,JSON.stringify(comparison.materials)).toBe(true);
 }
});

test('ambiguous student and teacher roles require an explicit choice without administrative chrome',async({page})=>{
 const inserted=(await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'student'),($1,'teacher') RETURNING id",[f.guest.member])).rows.map(row=>row.id);
 try{await login(page,f.guest.username);await expect(page).toHaveURL(/\/dashboard$/);const chooser=page.getByRole('region',{name:'Seleccionar contexto institucional'});await expect(chooser).toBeVisible();await expect(chooser.getByRole('link',{name:'Mi vida universitaria',exact:true})).toHaveAttribute('href',`/dashboard/institutions/${f.tenant}/student`);await expect(chooser.getByRole('link',{name:'Mi docencia',exact:true})).toHaveAttribute('href',`/dashboard/institutions/${f.tenant}/teacher`);await expect(page.getByText('CENTRO DE OPERACIONES',{exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'SIII, ir al inicio institucional'})).toHaveAttribute('href','/dashboard')}
 finally{await sql.query('DELETE FROM role_assignments WHERE id=ANY($1::uuid[])',[inserted])}
});

test('a mandatory password change stays ahead of personal entry and operational modules',async({page})=>{
 await sql.query('UPDATE platform_users SET must_change_password=true WHERE id=$1',[f.secondStudent.id]);
 try{await login(page,f.secondStudent.username);await expect(page).toHaveURL(/\/dashboard$/);await expect(page.getByRole('alert',{name:'Actualización obligatoria de contraseña'})).toBeVisible();await expect(page.locator('.siii-student-dashboard')).toHaveCount(0);await expect(page.getByText('CENTRO DE OPERACIONES',{exact:true})).toHaveCount(0)}
 finally{await sql.query('UPDATE platform_users SET must_change_password=false WHERE id=$1',[f.secondStudent.id])}
});

test('personal first paint defaults to the approved dark theme and respects an explicit light preference',async({page})=>{
 await login(page,f.student.username,null);await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/student`));await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');
 await page.getByRole('button',{name:'Activar tema claro',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('sii-theme'))).toBe('light');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-sii-theme','light');
});

for(const role of ['student','teacher'] as const)for(const theme of ['dark','light'] as const)test(`${role} authenticated ${theme} desktop and mobile evidence`,async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:1344,height:896});await page.clock.setFixedTime(new Date('2026-10-26T18:00:00Z'));
 await login(page,f[role].username);await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/${role}`));
 await expect(page.locator('.siii-overview-hero h2')).toContainText(role==='student'?'Alejandra':'Docente oficial');
 await page.evaluate(async()=>{await document.fonts.ready});
 if(await page.locator('html').getAttribute('data-sii-theme')!==theme)await page.getByRole('button',{name:theme==='light'?'Activar tema claro':'Activar tema oscuro',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);
 for(const width of [1344,390]){
  await page.setViewportSize({width,height:896});await expect(page.locator('.siii-overview-metrics>section')).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`.p0-local/fidelity/${role}-${theme}-${width}.png`,animations:'disabled',fullPage:true});
  const violations=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations;
  expect(violations).toEqual([]);
 }
 if(role==='teacher'){
  await page.locator('.siii-overview-shortcuts').getByRole('link',{name:'Mi perfil',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mi perfil docente institucional',exact:true})).toBeVisible();
 }else{
  await personalNavigate(page,'Académico');await expect(page.getByRole('searchbox',{name:'Buscar en inscripciones'})).toBeVisible();
 }
 await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();
 await page.getByRole('navigation',{name:'Navegación institucional',exact:true}).getByRole('link',{name:'SIII, ir al inicio institucional',exact:true}).click();
 await expect(page.locator(role==='student'?'.siii-student-dashboard':'.siii-teacher-dashboard')).toBeVisible();
});

test('unlinked personal profiles preserve the approved panels without invented values',async({page})=>{
 test.setTimeout(120000);
 await sql.query('UPDATE student_account_links SET revoked_at=now() WHERE membership_id=$1',[f.secondStudent.member]);
 try{for(const [kind,actor]of [['student',f.secondStudent],['teacher',f.secondTeacher]] as const){
  await page.setViewportSize({width:1344,height:896});await login(page,actor.username);
  await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/${kind}`));
  await expect(page.locator('.siii-overview-tags')).toContainText('sin vincular');
  await expect(page.locator('.siii-overview-metrics>section')).toHaveCount(4);
  await expect(page.locator('.siii-overview-metrics')).not.toContainText(/9\.2|152|180|84%/);
  await expect(page.locator('.siii-overview-metrics strong')).toHaveText(['—','—','—','—']);
  for(const width of [1344,390]){await page.setViewportSize({width,height:896});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await page.screenshot({path:`.p0-local/fidelity/${kind}-unlinked-dark-${width}.png`,animations:'disabled',fullPage:true})}
 }}finally{await sql.query('UPDATE student_account_links SET revoked_at=null WHERE membership_id=$1',[f.secondStudent.member])}
});

test('scoped personal grants keep an accessible context choice instead of redirecting into a 404',async({page})=>{
 await sql.query("UPDATE role_assignments SET scope_type='program',scope_program_id=$1,institution_id=$3 WHERE id=$2",[f.program,f.secondTeacher.grant,f.tenant]);
 try{
  await login(page,f.secondTeacher.username);await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('region',{name:'Seleccionar contexto institucional'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Consultar acceso institucional'})).toBeVisible();
  await expect(page.getByRole('link',{name:'SIII, ir al inicio institucional'})).toHaveAttribute('href','/dashboard');
  await expect(page.getByText('CENTRO DE OPERACIONES',{exact:true})).toHaveCount(0);
 }finally{await sql.query("UPDATE role_assignments SET scope_type='institution',scope_program_id=null WHERE id=$1",[f.secondTeacher.grant])}
});
