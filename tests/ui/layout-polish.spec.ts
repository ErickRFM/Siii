import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import {randomBytes,randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret,digestRecoveryCode} from '../../src/shared/auth/mfa-primitives';

const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-layout-polish-2026!';
let tenant:string,username:string,recovery:string,stepCode:string;
test.beforeAll(async()=>{
 await sql.connect();
 const suffix=randomUUID().slice(0,8),hash=await argon2.hash(password);
 tenant=(await sql.query("INSERT INTO institutions(name,code) VALUES('Universidad de prueba · Layout',$1) RETURNING id",['LAY'+suffix])).rows[0].id;
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Administración','Sintética') RETURNING id")).rows[0].id;
 username='layout-'+suffix;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'super_admin')",[member]);
 for(let index=1;index<=5;index++){
  const identity=(await sql.query("INSERT INTO people(first_name,last_name) VALUES($1,'de prueba') RETURNING id",['Persona '+index])).rows[0].id;
  const target=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[identity,`qa-persona-${index}-${suffix}`,hash])).rows[0].id;
  const membership=(await sql.query("INSERT INTO institution_memberships(institution_id,user_id,display_name,institutional_code) VALUES($1,$2,$3,$4) RETURNING id",[tenant,target,'Persona '+index,'DOC-00'+index])).rows[0].id;
  await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'teacher')",[membership]);
 }
 const factor=(await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute') RETURNING id",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)])).rows[0].id;
 [recovery,stepCode]=[randomBytes(16).toString('hex').toUpperCase(),randomBytes(16).toString('hex').toUpperCase()];
 // Each browser test gets fresh recovery codes in beforeEach.
 await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[user,factor,digestRecoveryCode(recovery,user)]);
 const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'ISC','Ingeniería en Sistemas','ingenieria','presencial') RETURNING id",[tenant])).rows[0].id;
 await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name,institutional_email) SELECT $1,$2,'EST-2026-'||n,'Estudiante '||n,'de prueba','alumno'||n||'@example.test' FROM generate_series(1,6)n",[tenant,program]);
 await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) SELECT $1,'DOC-'||n,'Docente '||n,'de prueba' FROM generate_series(1,4)n",[tenant]);
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,'PROG','Programación',6) RETURNING id",[tenant])).rows[0].id;
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,'2026-2','Agosto–diciembre 2026','2026-08-01','2026-12-20') RETURNING id",[tenant])).rows[0].id;
 await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) SELECT $1,$2,$3,'ISC-'||n,30 FROM generate_series(1,5)n",[tenant,term,course]);
 await sql.query("INSERT INTO institutional_announcements(institution_id,title,body,author_user_id) SELECT $1,'Aviso institucional '||n,'Información académica de prueba para revisar la distribución del listado.',$2 FROM generate_series(1,4)n",[tenant,user]);
 const cycle=(await sql.query("INSERT INTO admission_cycles(institution_id,code,name,start_date,end_date,status) VALUES($1,'2026','Ingreso 2026','2026-01-01','2026-12-31','open') RETURNING id",[tenant])).rows[0].id;
 for(const [i,status] of ['submitted','under_review','admitted','rejected','waitlisted'].entries()){
  const applicant=(await sql.query("INSERT INTO applicant_profiles(email,first_name,last_name,password_hash) VALUES($1,$2,'de prueba',$3) RETURNING id",[`aspirante-${suffix}-${i}@example.test`,'Aspirante '+(i+1),hash])).rows[0].id;
  await sql.query("INSERT INTO admission_applications(institution_id,cycle_id,applicant_id,program_id,application_number,status,submitted_at) VALUES($1,$2,$3,$4,$5,$6,'2026-10-20T12:00:00Z')",[tenant,cycle,applicant,program,'ADM-2026-00'+(i+1),status]);
 }
});

test('admissions filters and detail preserve the authorized applications and keyboard focus',async({page})=>{
 await login(page);
 await page.goto(`/dashboard/institutions/${tenant}`);
 await page.getByRole('navigation',{name:'Gestión académica',exact:true}).getByRole('link',{name:'Admisiones',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/institutions/${tenant}/admissions$`));
 await expect(page.getByLabel('Buscar solicitudes')).toBeVisible();
 await page.getByLabel('Estado de solicitud').selectOption('admitted');
 await expect(page.locator('tbody tr')).toHaveCount(1);
 await expect(page.getByRole('cell',{name:'ADM-2026-003',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ver solicitud ADM-2026-003'}).click();
 const detail=page.getByRole('region',{name:'Detalle de solicitud'});
 await expect(detail.getByRole('heading',{name:'ADM-2026-003'})).toBeFocused();
 await expect(detail).toContainText('Aspirante 3 de prueba');
 await page.screenshot({path:'.p0-local/layout-polish/after-admissions-detail-1440.png',fullPage:true,animations:'disabled'});
 await detail.getByRole('button',{name:'Cerrar detalle'}).click();
 await expect(page.getByRole('button',{name:'Ver solicitud ADM-2026-003'})).toBeFocused();
 await page.getByLabel('Buscar solicitudes').fill('sin coincidencias');
 await expect(page.getByText('No hay solicitudes coincidentes')).toBeVisible();
 await page.locator('[data-slot="empty"]').getByRole('button',{name:'Limpiar filtros'}).click();
 await expect(page.getByLabel('Buscar solicitudes')).toBeFocused();
 await expect(page.locator('tbody tr')).toHaveCount(5);
 await page.goto(`/dashboard/institutions/${tenant}/registry`);
 await page.getByLabel('Buscar en esta página',{exact:true}).fill('sin coincidencias');
 await page.locator('[data-slot="empty"]').getByRole('button',{name:'Limpiar búsqueda'}).click();
 await expect(page.getByLabel('Buscar en esta página',{exact:true})).toBeFocused();
});

test('admissions distinguishes homonymous programs by institutional code',async({page})=>{
 const second=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'ISC-D','Ingeniería en Sistemas','ingenieria','en_linea') RETURNING id",[tenant])).rows[0].id;
 const applicant=(await sql.query("INSERT INTO applicant_profiles(email,first_name,last_name,password_hash) VALUES($1,'Segunda','Solicitud','synthetic-unused-hash') RETURNING id",[randomUUID()+'@example.test'])).rows[0].id;
 let application:string|undefined;
 try{
  application=(await sql.query("INSERT INTO admission_applications(institution_id,cycle_id,applicant_id,program_id,application_number,status) SELECT $1,cycle_id,$2,$3,'ADM-HOMONIMO','admitted' FROM admission_applications WHERE institution_id=$1 LIMIT 1 RETURNING id",[tenant,applicant,second])).rows[0].id;
  await login(page);await page.goto(`/dashboard/institutions/${tenant}/admissions`);
  await page.getByLabel('Programa solicitado').selectOption({label:'ISC-D · Ingeniería en Sistemas'});
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('cell',{name:'ADM-HOMONIMO',exact:true})).toBeVisible();
  await page.getByLabel('Programa solicitado').selectOption({label:'ISC · Ingeniería en Sistemas'});
  await expect(page.locator('tbody tr')).toHaveCount(5);
 }finally{
  if(application)await sql.query('DELETE FROM admission_applications WHERE id=$1',[application]);
  await sql.query('DELETE FROM applicant_profiles WHERE id=$1',[applicant]);
  await sql.query('DELETE FROM academic_programs WHERE id=$1',[second]);
 }
});
test.afterAll(async()=>{await sql.end()});
test('vnext academic tabs, real counts, searchable drawer and audited creation',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${tenant}/operations`);
 await expect(page.getByRole('tab',{name:/Secciones/})).toBeVisible();
 await expect(page.getByRole('tab',{name:/Inscripciones/})).toBeVisible();
 await page.getByRole('button',{name:'Nueva sección',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Nueva sección',exact:true});
 await expect(drawer).toBeVisible();
 await drawer.getByLabel('Buscar materia',{exact:true}).fill('Programación');
 await drawer.getByLabel('Materia',{exact:true}).selectOption({label:'PROG · Programación'});
 await drawer.getByLabel('Periodo',{exact:true}).selectOption({label:'2026-2 · Agosto–diciembre 2026'});
 await drawer.getByLabel('Grupo / sección',{exact:true}).fill('VNEXT-A');
 const saved=page.waitForResponse(r=>r.url().endsWith('/sections')&&r.request().method()==='POST');
 await drawer.getByRole('button',{name:'Crear sección',exact:true}).click();
 expect((await saved).status()).toBe(201);await expect(drawer).not.toBeVisible();
 await expect(page.getByRole('cell',{name:'VNEXT-A',exact:true})).toBeVisible();
 expect((await sql.query("SELECT count(*)::int AS n FROM security_audit_log WHERE institution_id=$1 AND action='section.create'",[tenant])).rows[0].n).toBeGreaterThan(0);
 await page.getByLabel('Buscar operaciones',{exact:true}).fill('sin coincidencias');
 await expect(page.getByText('No hay operaciones coincidentes')).toBeVisible();
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
 await page.getByRole('tab',{name:/Inscripciones/}).click();
 await page.getByRole('button',{name:'Inscribir estudiante',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Inscribir estudiante'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'Inscribir estudiante',exact:true})).toBeFocused();
});
async function login(page:Page){
 await sql.query('DELETE FROM auth_throttle');
 const user=(await sql.query('SELECT id FROM platform_users WHERE username=$1',[username])).rows[0].id;
 const factor=(await sql.query('SELECT id FROM auth_mfa_factors WHERE user_id=$1',[user])).rows[0].id;
 for(const code of [recovery,stepCode])await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[user,factor,digestRecoveryCode(code,user)]);
 // Used codes remain consumed, so generate new ones for each login.
 const loginCode=randomBytes(16).toString('hex').toUpperCase();
 await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[user,factor,digestRecoveryCode(loginCode,user)]);
 await page.goto('/login');
 await page.getByLabel('Usuario institucional').fill(username);
 await page.getByLabel('Contraseña',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Entrar al sistema'}).click();
 await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();
 await page.getByLabel('Código de recuperación',{exact:true}).fill(loginCode);
 await page.getByRole('button',{name:'Verificar y entrar'}).click();
 await expect(page).toHaveURL(/\/dashboard$/);
}

const modules=['users','invitations','security','registry','services','operations','admissions'] as const;
for(const module of modules)test('layout evidence and responsive composition: '+module,async({page})=>{
 test.setTimeout(150000);
 await login(page);
 if(module==='invitations'||module==='users'){
  // The same real API used by the existing invitation screen, with MFA step-up.
  const user=(await sql.query('SELECT id FROM platform_users WHERE username=$1',[username])).rows[0].id;
  const code=randomBytes(16).toString('hex').toUpperCase();
  const factor=(await sql.query('SELECT id FROM auth_mfa_factors WHERE user_id=$1',[user])).rows[0].id;
  await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[user,factor,digestRecoveryCode(code,user)]);
  const origin=String(test.info().project.use.baseURL);
  expect((await page.request.post('/api/v1/auth/mfa/step-up',{headers:{Origin:origin},data:{currentPassword:password,recoveryCode:code}})).status()).toBe(200);
  if(module==='invitations')for(let i=1;i<=3;i++)expect((await page.request.post(`/api/v1/institutions/${tenant}/invitations`,{headers:{Origin:origin},data:{email:`invitado-${i}-${tenant.slice(0,8)}@example.test`,role:'student'}})).status()).toBe(201);
 }
 await page.goto(module==='security'?'/dashboard/security':`/dashboard/institutions/${tenant}/${module}`);
 await expect(page.locator('main h1')).toBeVisible();
 if(module!=='security')await expect(page.locator('main tbody tr').first()).toBeVisible();
 if(module==='security')await expect(page.getByLabel('Contraseña actual para confirmar')).toBeVisible();
 const stage=process.env.SIII_LAYOUT_CAPTURE??'after';
 for(const width of [1440,1024,768,390,360]){
  await page.setViewportSize({width,height:1000});
  await page.screenshot({path:`.p0-local/layout-polish/${stage}-${module}-${width}.png`,fullPage:true,animations:'disabled'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  expect(overflow,module+' at '+width).toBe(false);
 }
 for(const theme of ['light','dark']){
  if(await page.locator('html').getAttribute('data-sii-theme')!==theme)await page.getByRole('button',{name:theme==='dark'?'Activar tema oscuro':'Activar tema claro'}).click();
  // Sample the transition in parallel with axe, without waiting for it to settle.
  const contrastSamples=module==='invitations'
   ?page.getByRole('button',{name:'Revocar invitación',exact:true}).first().evaluate(async button=>{
    const luminance=(color:string)=>{
     const channels=(color.match(/[\d.]+/g)??[]).slice(0,3).map(Number).map(value=>{const channel=value/255;return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;});
     return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
    };
    const samples:number[]=[];
    for(let frame=0;frame<12;frame++){
     await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
     const style=getComputedStyle(button),foreground=luminance(style.color),background=luminance(style.backgroundColor);
     samples.push((Math.max(foreground,background)+0.05)/(Math.min(foreground,background)+0.05));
    }
    return samples;
   }):Promise.resolve([] as number[]);
  const [contrasts,result]=await Promise.all([contrastSamples,new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()]);
  if(module==='invitations')expect(Math.min(...contrasts),'Invitation action retains AA contrast in sampled theme frames').toBeGreaterThanOrEqual(4.5);
  expect(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  if(theme==='dark')await page.screenshot({path:`.p0-local/layout-polish/${stage}-${module}-dark-360.png`,fullPage:true,animations:'disabled'});
 }
 if(module==='invitations'){
  const policy=page.locator('.sii-invitation-policy').first();
  await policy.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(policy).toHaveJSProperty('open',true);
  await expect(policy.locator('small')).toBeVisible();
 }
 if(module==='operations'){
  await page.getByRole('tab',{name:/Inscripciones/}).click();
  await page.getByRole('button',{name:'Inscribir estudiante',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Estudiante',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:/Asignaciones/}).click();
  await page.getByRole('button',{name:'Asignar docente',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Docente',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
 }
 if(module==='users'){
  await page.setViewportSize({width:1440,height:1000});
  if(await page.locator('html').getAttribute('data-sii-theme')==='dark')await page.getByRole('button',{name:'Activar tema claro'}).click();
  await page.getByRole('button',{name:/Ver perfil de qa-persona-1/}).click();
  await expect(page.getByLabel('Nombre institucional',{exact:true})).toHaveValue('Persona 1');
  await page.screenshot({path:`.p0-local/layout-polish/${stage}-users-detail-1440.png`,fullPage:true,animations:'disabled'});
 }
});

for(const area of ['operations','scheduling','services','registry','admissions','users','roles','admin','security','grading'] as const){
 test('vnext six-width themes, zoom and keyboard evidence: '+area,async({page})=>{
  test.setTimeout(240000);await login(page);
  await page.goto(area==='security'?'/dashboard/security':`/dashboard/institutions/${tenant}/${area}`);
  await expect(page.locator('main h1')).toBeVisible();
  if(['operations','registry','admissions','users'].includes(area))await expect(page.locator('main tbody tr').first()).toBeVisible();
  if(area==='scheduling')await expect(page.getByRole('region',{name:'Calendario semanal',exact:true})).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const theme of ['light','dark']){
   if(await page.locator('html').getAttribute('data-sii-theme')!==theme)await page.getByRole('button',{name:theme==='dark'?'Activar tema oscuro':'Activar tema claro'}).click();
   for(const width of [390,768,1024,1366,1600,1920]){
    await page.setViewportSize({width,height:1000});
    await page.screenshot({path:`.p0-local/vnext/${area}-${theme}-${width}.png`,fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`${area}/${theme}/${width}: no global overflow`).toBe(true);
    if(width===390||width===1366){
     const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
     expect(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
    }
   }
  }
  await page.setViewportSize({width:1366,height:1000});await page.evaluate(()=>{document.body.style.zoom='2'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'200% CSS zoom reflow: '+JSON.stringify(await page.evaluate(()=>Array.from(document.querySelectorAll('header,main,section,nav')).filter(node=>node.getBoundingClientRect().right>innerWidth+2).map(node=>({tag:node.tagName,cls:node.className,right:node.getBoundingClientRect().right}))))).toBe(true);
  await page.screenshot({path:`.p0-local/vnext/${area}-zoom-200.png`,fullPage:true,animations:'disabled'});
  await page.evaluate(()=>{document.body.style.zoom=''});
  if(['operations','scheduling','services'].includes(area)){
   await page.setViewportSize({width:390,height:844});
   await page.getByRole('button',{name:area==='operations'?'Nueva sección':area==='scheduling'?'Añadir aula':'Nuevo registro',exact:true}).click();
   const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
   for(let index=0;index<12;index++){
    await page.keyboard.press('Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
   }
   const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(result.violations.map(v=>v.id)).toEqual([]);
   await page.screenshot({path:`.p0-local/vnext/${area}-drawer-mobile.png`,fullPage:true,animations:'disabled'});
   await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  }
 });
}

test('vnext rejected creation keeps values and dirty cancellation requires confirmation',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${tenant}/operations`);
 await page.getByRole('button',{name:'Nueva sección',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Periodo',{exact:true}).selectOption({label:'2026-2 · Agosto–diciembre 2026'});
 await dialog.getByLabel('Materia',{exact:true}).selectOption({label:'PROG · Programación'});
 await dialog.getByLabel('Grupo / sección',{exact:true}).fill('ISC-1');
 await dialog.getByRole('button',{name:'Crear sección',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Ya existe esa sección');
 await expect(dialog.getByLabel('Grupo / sección',{exact:true})).toHaveValue('ISC-1');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 const confirmation=page.getByRole('alertdialog',{name:'Descartar cambios sin guardar'});await expect(confirmation).toBeVisible();
 await confirmation.getByRole('button',{name:'Volver sin cambios'}).click();await expect(dialog.getByLabel('Grupo / sección',{exact:true})).toHaveValue('ISC-1');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Descartar cambios',exact:true}).click();await expect(dialog).not.toBeVisible();
});

test('vnext scheduler creates a real classroom and keeps weekly agenda first',async({page})=>{
 await sql.query("INSERT INTO campuses(institution_id,code,name) VALUES($1,'VN','Campus VNext') ON CONFLICT DO NOTHING",[tenant]);
 await login(page);await page.goto(`/dashboard/institutions/${tenant}/scheduling`);
 await expect(page.getByRole('tab',{name:'Semana',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'Añadir aula',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Campus',{exact:true}).selectOption({label:'Campus VNext'});
 await dialog.getByLabel('Clave del aula',{exact:true}).fill('VN-101');await dialog.getByLabel('Edificio',{exact:true}).fill('Edificio VNext');
 const saved=page.waitForResponse(r=>r.url().endsWith('/rooms')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Guardar aula',exact:true}).click();expect((await saved).status()).toBe(201);
 await expect(dialog).not.toBeVisible();expect((await sql.query("SELECT code FROM classrooms WHERE institution_id=$1 AND code='VN-101'",[tenant])).rows).toHaveLength(1);
 const section=(await sql.query("SELECT id FROM academic_sections WHERE institution_id=$1 AND code='ISC-1'",[tenant])).rows[0].id;
 const teacher=(await sql.query('SELECT id FROM institutional_teachers WHERE institution_id=$1 LIMIT 1',[tenant])).rows[0].id;
 await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[tenant,section,teacher]);
 await page.getByRole('button',{name:'Programar clase recurrente',exact:true}).click();
 await dialog.getByLabel('Sección',{exact:true}).selectOption(section);await dialog.getByLabel('Aula',{exact:true}).selectOption({label:'Edificio VNext · VN-101 (30)'});
 const pattern=page.waitForResponse(r=>r.url().endsWith('/schedule-patterns')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Comprobar y programar',exact:true}).click();expect((await pattern).status()).toBe(201);await expect(dialog).not.toBeVisible();
 await page.getByLabel('Inicio de semana',{exact:true}).fill('2026-10-28');
 const calendar=page.getByRole('region',{name:'Calendario semanal',exact:true});await expect(calendar).toContainText('ISC-1');
 await page.screenshot({path:'.p0-local/vnext/scheduling-populated-week.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Programar clase recurrente',exact:true}).click();await dialog.getByLabel('Sección',{exact:true}).selectOption(section);await dialog.getByLabel('Aula',{exact:true}).selectOption({label:'Edificio VNext · VN-101 (30)'});
 const conflict=page.waitForResponse(r=>r.url().endsWith('/schedule-patterns')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Comprobar y programar',exact:true}).click();expect((await conflict).status()).toBe(409);
 await expect(dialog.getByRole('alert')).toContainText('ya tiene una actividad');await expect(dialog.getByLabel('Sección',{exact:true})).toHaveValue(section);
 await page.keyboard.press('Escape');const decision=page.getByRole('alertdialog');await expect(decision).toBeVisible();await page.keyboard.press('Escape');await expect(decision).toHaveCount(0);await expect(dialog).toBeVisible();

});


test('vnext authority loss hides loaded academic data and closes its drawer',async({page})=>{
  await login(page);await page.goto(`/dashboard/institutions/${tenant}/operations`);await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.getByRole('button',{name:/Ver detalle de ISC-/}).first().click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'Cerrar sección',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.route('**/capabilities',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'FORBIDDEN'}})}));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('tbody')).toHaveCount(0);
  await expect(page.getByText('No tienes acceso vigente a esta institución.',{exact:true}).first()).toBeVisible();
  await page.unroute('**/capabilities');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.getByRole('button',{name:'Cerrar',exact:true}).first().click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');
 });

test('vnext services drawer writes real data and locks tabs until publication settles',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${tenant}/services`);
 await page.getByRole('button',{name:'Nuevo registro',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Nuevo aviso',exact:true});
 await dialog.getByLabel('Título',{exact:true}).fill('Aviso VNext');await dialog.getByLabel('Mensaje',{exact:true}).fill('Información institucional sintética para comprobar el formulario.');
 const created=page.waitForResponse(r=>r.url().endsWith('/announcements')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Crear borrador / solicitud',exact:true}).click();expect((await created).status()).toBe(201);await expect(dialog).not.toBeVisible();
 const row=page.locator('tbody tr').filter({hasText:'Aviso VNext'});await expect(row).toHaveCount(1);
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),pending=new Promise<void>(resolve=>{started=resolve});
 await page.route('**/announcements',async route=>{
  if(route.request().method()!=='PATCH'){await route.continue();return;}
  const response=await route.fetch();started();await gate;await route.fulfill({response});
 });
 await row.getByRole('button',{name:'Publicar',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Aplicar cambio',exact:true}).click();await pending;
 for(const name of ['Avisos institucionales','Trámites estudiantiles','Talleres'])await expect(page.getByRole('tab',{name,exact:true})).toBeDisabled();
 release();await expect(row).toContainText('PUBLISHED');await expect(page.getByRole('tab',{name:'Talleres',exact:true})).toBeEnabled();
 expect((await sql.query("SELECT status FROM institutional_announcements WHERE institution_id=$1 AND title='Aviso VNext'",[tenant])).rows[0].status).toBe('PUBLISHED');
});

test('vnext section drawer applies audited state edits and preserves them after reload',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${tenant}/operations`);
 const row=page.locator('tbody tr').filter({has:page.getByRole('cell',{name:'ISC-2',exact:true})});
 for(const [action,label] of [['Cerrar sección','Cerrada'],['Abrir sección','Abierta'],['Archivar sección','Archivada']]){
  await row.getByRole('button',{name:'Ver detalle de ISC-2',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Detalle académico'});await expect(drawer).toBeVisible();
  const saved=page.waitForResponse(r=>r.url().endsWith('/sections')&&r.request().method()==='PATCH');await drawer.getByRole('button',{name:action,exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Aplicar cambio',exact:true}).click();expect((await saved).status()).toBe(200);await expect(drawer).not.toBeVisible();await expect(row).toContainText(label);
 }
 await page.reload();await expect(row).toContainText('Archivada');
 expect((await sql.query("SELECT status FROM academic_sections WHERE institution_id=$1 AND code='ISC-2'",[tenant])).rows[0].status).toBe('archived');
 expect((await sql.query("SELECT count(*)::int AS n FROM security_audit_log WHERE institution_id=$1 AND action='section.status'",[tenant])).rows[0].n).toBeGreaterThanOrEqual(3);
});
