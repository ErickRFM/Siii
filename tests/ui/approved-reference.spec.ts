import {test,expect,type Page} from '@playwright/test';
import pg from 'pg';
import {mkdirSync,writeFileSync} from 'node:fs';
import {isolatedDatabaseUrl} from '../support/database-url';
import {portalPassword} from '../support/portal-fixture';
import {approvedReferenceFixture} from '../support/approved-reference-fixture';
import AxeBuilder from '@axe-core/playwright';
import {compareApprovedReference} from '../../scripts/compare-approved-reference.mjs';
import {personalNavigate} from '../support/personal-navigation';
import {expectVisualBaseline} from '../support/visual-baseline';


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
 await login(page,f.student.username,'light');
 if(process.env.SIII_FIDELITY_BASELINE!=='1')await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/student`),{timeout:30000});
 const initialUrl=page.url();
 if(process.env.SIII_FIDELITY_BASELINE==='1')await page.goto(`/dashboard/institutions/${f.tenant}/student`);
 await expect(page.locator('.siii-student-dashboard')).toBeVisible();await expect(page.locator('.siii-overview-detail-grid').getByText('Matemáticas Discretas',{exact:true})).toBeVisible();
 await expect(page.locator('.siii-calendar-header strong')).toHaveText('octubre 2026');
 await page.evaluate(async()=>{await document.fonts.ready});
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
  // Keep the approved material composition gate until a documented visual baseline review.
  expect(comparison.compositionWithinThreshold,JSON.stringify(comparison.materials)).toBe(true);
  // Geometry remains matched to the approved layout. Historical material-pixel thresholds
  // describe the superseded bordered finish; use the explicit borderless material contract.
  // The comparison data is still produced for visual review; no tolerance is increased.
  const matte=await page.locator('#siii-personal :is(.siii-overview-hero,.siii-overview-panel,.siii-shared-glass-metric)').evaluateAll(elements=>elements.map(el=>({border:getComputedStyle(el).borderTopWidth,shadow:getComputedStyle(el).boxShadow})));
  expect(matte.length).toBeGreaterThan(4);
  expect(matte.every(surface=>surface.border==='0px'&&surface.shadow==='none')).toBe(true);
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

test('browser back restores the personal home after navigating to a section',async({page})=>{
 for(const [kind,actor,label,link]of [['student',f.student,'Académico','Carga académica'],['teacher',f.teacher,'Mis grupos','Mis grupos']] as const){
  await login(page,actor.username);await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/${kind}$`));
  const nav=page.getByRole('navigation',{name:'Navegación institucional',exact:true});await expect(nav.getByRole('link',{name:link,exact:true})).not.toHaveAttribute('aria-disabled','true');
  await personalNavigate(page,label);await expect(page).toHaveURL(/#(?:inscripciones|grupos)$/);await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/${kind}$`));await expect(page.locator(kind==='student'?'.siii-student-dashboard':'.siii-teacher-dashboard')).toBeVisible();
 }
});

test('theme preference persists through login, section navigation, reload and logout',async({page})=>{
 await page.setViewportSize({width:1366,height:900});await page.goto('/login');
 await page.getByRole('button',{name:'Activar tema oscuro'}).click();
 await page.getByLabel('Usuario institucional').fill(f.student.username);await page.getByLabel('Contraseña',{exact:true}).fill(portalPassword);await page.getByRole('button',{name:'Entrar al sistema'}).click();
 await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/student`));await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');
 await personalNavigate(page,'Académico');await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');
 await page.locator('.siii-personal-account summary').click();await page.locator('.siii-personal-account').getByRole('button',{name:'Salir'}).click();
 await expect(page).toHaveURL(/\/login/);await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');expect(await page.evaluate(()=>localStorage.getItem('sii-theme'))).toBe('dark');
});

for(const role of ['student','teacher'] as const)test(`${role}: both themes remain within all requested viewport widths`,async({page})=>{
 test.setTimeout(120000);await login(page,f[role].username,'light');
 for(const theme of ['light','dark'] as const){
  if(await page.locator('html').getAttribute('data-sii-theme')!==theme)await page.getByRole('button',{name:'Activar tema oscuro'}).click();
  for(const width of [360,390,412,430,768,1024,1366,1440]){
   await page.setViewportSize({width,height:900});await expect(page.locator(role==='student'?'.siii-student-dashboard':'.siii-teacher-dashboard')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${role} ${theme} ${width}`).toBeLessThanOrEqual(width);
  }
 }
});

test('personal home honors increased contrast in both themes',async({page})=>{
 await page.setViewportSize({width:390,height:900});await login(page,f.student.username,'light');
 await page.emulateMedia({contrast:'more'});
 for(const theme of ['light','dark'] as const){
  if(theme==='dark')await page.getByRole('button',{name:'Activar tema oscuro'}).click();
  const violations=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations;
  expect(violations).toEqual([]);
 }
 await personalNavigate(page,'Académico');
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});

test('personal surfaces become opaque with reduced transparency and honor forced colors',async({page})=>{
 await page.setViewportSize({width:390,height:900});await login(page,f.student.username,'dark');
 const session=await page.context().newCDPSession(page);
 await session.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
 const material=await page.locator('#avisos').evaluate(el=>({background:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter}));
 expect(material).toEqual({background:'rgb(25, 27, 32)',blur:'none'});
 await page.emulateMedia({forcedColors:'active'});
 expect(await page.locator('#avisos').evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');
});

for(const role of ['student','teacher'] as const)for(const theme of ['dark','light'] as const)test(`${role} authenticated ${theme} desktop and mobile evidence`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width:1344,height:896});await page.clock.setFixedTime(new Date('2026-10-26T18:00:00Z'));
 await login(page,f[role].username);await expect(page).toHaveURL(new RegExp(`/dashboard/institutions/${f.tenant}/${role}`));
 await expect(page.locator('.siii-overview-hero h2')).toContainText(role==='student'?'Alejandra':'Docente oficial');
 await page.evaluate(async()=>{await document.fonts.ready});
 if(await page.locator('html').getAttribute('data-sii-theme')!==theme)await page.getByRole('button',{name:theme==='light'?'Activar tema claro':'Activar tema oscuro',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);
 for(const width of [1344,390]){
  await page.setViewportSize({width,height:896});await expect(page.locator('.siii-overview-metrics>section')).toHaveCount(4);
  if(width===390&&theme==='light'){
   const menu=page.getByRole('button',{name:'Abrir navegación',exact:true});
   await expect(menu).toHaveCSS('background-color','rgb(73, 71, 67)');
   await expect(menu.locator('svg')).toHaveCSS('color','rgb(247, 242, 234)');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const screenshot=await page.screenshot({path:`.p0-local/fidelity/${role}-${theme}-${width}.png`,animations:'disabled',fullPage:true});
  // Preserve historical PNG comparison and its original threshold pending explicit visual approval.
  expectVisualBaseline(screenshot,`${role}-${theme}-${width}`,info);
  // A new borderless design intentionally differs from the historical bordered PNGs.
  // Keep the screenshot as evidence, verify PNG output and enforce material/geometry.
  expect(screenshot.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  // The former PNG references document the bordered V1 look, not the approved borderless V11 design.
  // Keep the captured PNG as review evidence; enforce spatial, material and accessibility contracts
  // rather than accepting a larger pixel-diff tolerance or silently replacing historical PNGs.
  const layout=await page.locator('#siii-personal .siii-student-dashboard').evaluate(board=>{
   const bounds=board.getBoundingClientRect();
   const hero=board.querySelector('.siii-overview-hero')?.getBoundingClientRect();
   const metrics=board.querySelector('.siii-overview-metrics')?.getBoundingClientRect();
   const aside=board.querySelector('.siii-student-aside')?.getBoundingClientRect();
   return {left:bounds.left,right:bounds.right,width:bounds.width,
    heroLeft:hero?.left??-1,heroRight:hero?.right??Infinity,heroBottom:hero?.bottom??Infinity,
    metricsLeft:metrics?.left??-1,metricsRight:metrics?.right??Infinity,metricsTop:metrics?.top??-1,
    asideLeft:aside?.left??-1,asideRight:aside?.right??Infinity,asideWidth:aside?.width??0};
  });
  expect(layout.left).toBeGreaterThanOrEqual(-2);
  expect(layout.right).toBeLessThanOrEqual(width+2);
  expect(layout.width).toBeGreaterThan(0);
  expect(layout.heroLeft).toBeGreaterThanOrEqual(-2);
  expect(layout.heroRight).toBeLessThanOrEqual(width+2);
  expect(layout.metricsLeft).toBeGreaterThanOrEqual(-2);
  expect(layout.metricsRight).toBeLessThanOrEqual(width+2);
  expect(layout.metricsTop).toBeGreaterThanOrEqual(layout.heroBottom-2);
  expect(layout.asideLeft).toBeGreaterThanOrEqual(-2);
  expect(layout.asideRight).toBeLessThanOrEqual(width+2);
  expect(layout.asideWidth).toBeGreaterThan(180);
  const appearance=await page.locator('#siii-personal :is(.siii-overview-hero,.siii-overview-panel,.siii-shared-glass-metric)').evaluateAll(nodes=>nodes.map(node=>{
   const style=getComputedStyle(node),box=node.getBoundingClientRect();
   return {border:style.borderTopWidth,shadow:style.boxShadow,blur:style.backdropFilter,left:box.left,right:box.right,width:box.width};
  }));
  expect(appearance.length).toBeGreaterThan(4);
  for(const surface of appearance){
   expect(surface.border).toBe('0px');
   expect(surface.shadow).toBe('none');
   expect(surface.blur).toContain('blur(');
   expect(surface.width).toBeGreaterThan(0);
   expect(surface.left).toBeGreaterThanOrEqual(-2);
   expect(surface.right).toBeLessThanOrEqual(width+2);
  }
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
