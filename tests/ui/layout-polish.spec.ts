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
 await page.goto(`/dashboard/institutions/${tenant}/admissions`);
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
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
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
  await page.getByRole('button',{name:'Elegir estudiante',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Estudiante',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Elegir docente',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Docente',exact:true})).toBeFocused();
 }
 if(module==='users'){
  await page.setViewportSize({width:1440,height:1000});
  if(await page.locator('html').getAttribute('data-sii-theme')==='dark')await page.getByRole('button',{name:'Activar tema claro'}).click();
  await page.getByRole('button',{name:/Ver perfil de qa-persona-1/}).click();
  await expect(page.getByLabel('Nombre institucional',{exact:true})).toHaveValue('Persona 1');
  await page.screenshot({path:`.p0-local/layout-polish/${stage}-users-detail-1440.png`,fullPage:true,animations:'disabled'});
 }
});
