import {test,expect,type Page,type TestInfo,type Route} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret,digestRecoveryCode} from '../../src/shared/auth/mfa-primitives';
import AxeBuilder from '@axe-core/playwright';
import {resolve} from 'node:path';

const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-gradebook-drafts-2026!';
let hash:string;
test.beforeAll(async()=>{await sql.connect();hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});});
test.beforeEach(async()=>{await sql.query('DELETE FROM auth_throttle');});
test.afterAll(async()=>{await sql.end();});

async function fixture(){
 const suffix=randomUUID().slice(0,8),username='drafts-'+suffix;
 const institution=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic gradebook drafts',$1) RETURNING id",['DRAFT-'+suffix])).rows[0].id;
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Teacher') RETURNING id")).rows[0].id;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 const membership=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institution,user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,'teacher','institution')",[institution,membership]);
 const teacher=(await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,'T-DRAFT','Synthetic','Teacher') RETURNING id",[institution])).rows[0].id;
 await sql.query('INSERT INTO teacher_account_links(institution_id,teacher_id,membership_id) VALUES($1,$2,$3)',[institution,teacher,membership]);
 const factor=(await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute') RETURNING id",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)])).rows[0].id;
 const codes=[randomBytes(16).toString('hex').toUpperCase(),randomBytes(16).toString('hex').toUpperCase()];
 for(const code of codes)await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[user,factor,digestRecoveryCode(code,user)]);
 const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'DRAFT','Synthetic program','ingenieria','presencial') RETURNING id",[institution])).rows[0].id;
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,'DRAFT','Synthetic course',6) RETURNING id",[institution])).rows[0].id;
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,'2026-A','Synthetic term','2026-01-01','2026-12-31') RETURNING id",[institution])).rows[0].id;
 const section=(await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,'DRAFT-A',30) RETURNING id",[institution,term,course])).rows[0].id;
 await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[institution,section,teacher]);
 const students=[] as {id:string;enrollment:string}[];
 for(const enrollment of ['DRAFT001','DRAFT002']){
  const id=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,'Synthetic',$3) RETURNING id",[institution,program,enrollment])).rows[0].id;
  await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3)',[institution,section,id]);students.push({id,enrollment});
 }
 return {institution,section,students,username,codes,teacher,course,term,user};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function login(page:Page,f:Fixture){
 await page.goto('/login');await page.getByLabel('Usuario institucional').fill(f.username);await page.getByLabel('Contraseña',{exact:true}).fill(password);
 const logged=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login')&&r.request().method()==='POST');await page.getByRole('button',{name:'Entrar al sistema'}).click();expect((await logged).status()).toBe(200);
 await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();await page.getByLabel('Código de recuperación',{exact:true}).fill(f.codes[0]);
 const challenge=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/mfa/challenge'));await page.getByRole('button',{name:'Verificar y entrar'}).click();expect((await challenge).status()).toBe(200);await page.waitForURL('**/dashboard');
}
const endpoint=(f:Fixture)=>'/api/v1/institutions/'+f.institution+'/grading';
async function prepare(page:Page,f:Fixture){
 await login(page,f);
 const components=[] as {id:string;title:string}[];
 for(const [code,title] of [['P1','Parcial uno'],['P2','Parcial dos']]){
  const response=await page.request.post(endpoint(f),{headers:{origin:new URL(page.url()).origin},data:{kind:'component',sectionId:f.section,code,title,weight:50}});expect(response.status()).toBe(201);const data=(await response.json()).data;components.push({id:data.id,title});
 }
 await page.goto('/dashboard/institutions/'+f.institution+'/grading');
 await expect(page.getByLabel('DRAFT001 · Parcial uno',{exact:true})).toBeVisible();
 return components;
}
async function evidence(page:Page,info:TestInfo,f:Fixture,name:string,extra:Record<string,unknown>={}){
 const rows=(await sql.query('SELECT student_id,component_id,score_hundredths FROM assessment_scores WHERE institution_id=$1 ORDER BY student_id,component_id',[f.institution])).rows;
 await info.attach(name,{body:JSON.stringify({sectionId:f.section,scores:rows,...extra},null,2),contentType:'application/json'});
 await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});return rows;
}

test('saving one grade retains the other student draft and persists only the submitted cell',async({page},info)=>{
 const f=await fixture(),components=await prepare(page,f),a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true}),b=page.getByLabel('DRAFT002 · Parcial uno',{exact:true});
 await a.fill('9.00');await b.fill('8.75');await evidence(page,info,f,'two-local-drafts');
 const saved=page.waitForResponse(r=>r.url().endsWith(endpoint(f))&&r.request().method()==='POST');
 const refreshed=page.waitForResponse(r=>r.url().includes(endpoint(f)+'?sectionId=')&&r.request().method()==='GET');
 await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();const response=await saved;expect(response.status()).toBe(200);expect((await refreshed).status()).toBe(200);
 await expect(b).toBeVisible();const rows=await evidence(page,info,f,'after-first-save',{pendingDraft:await b.inputValue(),sent:response.request().postDataJSON()});
 expect(rows).toEqual([{student_id:f.students[0].id,component_id:components[0].id,score_hundredths:900}]);
 await expect(b).toHaveValue('8.75');
});

test('a newer edit during a real blocked save survives the subsequent refresh',async({page},info)=>{
 const f=await fixture(),components=await prepare(page,f),a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true}),b=page.getByLabel('DRAFT002 · Parcial uno',{exact:true});
 await a.fill('7.50');await b.fill('8.25');
 const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE security_audit_log IN ACCESS EXCLUSIVE MODE');
 const saved=page.waitForResponse(r=>r.url().endsWith(endpoint(f))&&r.request().method()==='POST'),refreshed=page.waitForResponse(r=>r.url().includes(endpoint(f)+'?sectionId=')&&r.request().method()==='GET');
 try{
  await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();
  await expect.poll(async()=>Boolean((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%security_audit_log%') blocked")).rows[0].blocked)).toBe(true);
  await a.fill('6.25');await evidence(page,info,f,'newer-edit-while-saving',{latestLocal:await a.inputValue()});
  await gate.query('COMMIT');expect((await saved).status()).toBe(200);expect((await refreshed).status()).toBe(200);await expect(a).toBeVisible();
  const rows=await evidence(page,info,f,'after-inflight-save',{latestLocal:await a.inputValue(),otherDraft:await b.inputValue()});
  expect(rows).toEqual([{student_id:f.students[0].id,component_id:components[0].id,score_hundredths:750}]);
  await expect.soft(a).toHaveValue('6.25');await expect.soft(b).toHaveValue('8.25');await expect(a).toBeFocused();
 }finally{await gate.query('ROLLBACK');await gate.end();}
});

test('publication cannot emit an official grade while a newer local draft remains unsaved',async({page},info)=>{
 const f=await fixture(),components=await prepare(page,f);
 const stepUp=await page.request.post('/api/v1/auth/mfa/step-up',{headers:{origin:new URL(page.url()).origin},data:{currentPassword:password,recoveryCode:f.codes[1]}});expect(stepUp.status()).toBe(200);
 for(const [studentIndex,values] of [[0,[800,600]],[1,[700,900]]] as const){for(let index=0;index<components.length;index++){
  const score=await page.request.post(endpoint(f),{headers:{origin:new URL(page.url()).origin},data:{kind:'score',componentId:components[index].id,studentId:f.students[studentIndex].id,scoreHundredths:values[index]}});expect(score.status()).toBe(200);
 }}
 await page.reload();const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await expect(a).toHaveValue('8.00');await a.fill('9.50');
 const publish=page.getByRole('button',{name:'Publicar acta oficial',exact:true});await evidence(page,info,f,'draft-before-publication',{draft:'9.50',publishEnabled:await publish.isEnabled()});
 if(await publish.isEnabled()){
  await publish.click();const sent=page.waitForResponse(r=>r.url().endsWith(endpoint(f))&&r.request().method()==='POST');await page.getByRole('alertdialog').getByRole('button',{name:'Publicar acta',exact:true}).click();const response=await sent;
  await info.attach('publish-response',{body:JSON.stringify({status:response.status()}),contentType:'application/json'});
  await expect(page.getByText('Acta publicada. Los cambios requieren una rectificación autorizada.',{exact:true})).toBeVisible();
 }
 const publications=(await sql.query('SELECT id,version FROM grade_publications WHERE section_id=$1',[f.section])).rows;
 const finals=(await sql.query('SELECT student_id,score_hundredths FROM final_grades WHERE institution_id=$1',[f.institution])).rows;
 await evidence(page,info,f,'after-publication-attempt',{publications,finals});
 expect(publications).toHaveLength(0);
});

test('editing during publication confirmation prevents the final request',async({page})=>{
 const f=await fixture(),components=await prepare(page,f);
 expect((await page.request.post('/api/v1/auth/mfa/step-up',{headers:{origin:new URL(page.url()).origin},data:{currentPassword:password,recoveryCode:f.codes[1]}})).status()).toBe(200);
 for(const student of f.students)for(const component of components)expect((await page.request.post(endpoint(f),{headers:{origin:new URL(page.url()).origin},data:{kind:'score',componentId:component.id,studentId:student.id,scoreHundredths:800}})).status()).toBe(200);
 await page.reload();await page.getByRole('button',{name:'Publicar acta oficial',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByLabel('DRAFT001 · Parcial uno',{exact:true}).fill('9.25');
 await page.getByRole('alertdialog').getByRole('button',{name:'Publicar acta',exact:true}).click();
 await expect(page.locator('.sii-academic').getByRole('alert')).toContainText('sin guardar');
 expect((await sql.query('SELECT id FROM grade_publications WHERE section_id=$1',[f.section])).rows).toHaveLength(0);
 await expect(page.getByLabel('DRAFT001 · Parcial uno',{exact:true})).toHaveValue('9.25');
});

test('a real publication in flight disables capture and emits persisted official grades',async({page})=>{
 const f=await fixture(),components=await prepare(page,f);
 expect((await page.request.post('/api/v1/auth/mfa/step-up',{headers:{origin:new URL(page.url()).origin},data:{currentPassword:password,recoveryCode:f.codes[1]}})).status()).toBe(200);
 for(const student of f.students)for(const component of components)expect((await page.request.post(endpoint(f),{headers:{origin:new URL(page.url()).origin},data:{kind:'score',componentId:component.id,studentId:student.id,scoreHundredths:800}})).status()).toBe(200);
 await page.reload();await page.getByRole('button',{name:'Publicar acta oficial',exact:true}).click();
 const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE security_audit_log IN ACCESS EXCLUSIVE MODE');
 const response=page.waitForResponse(r=>r.url().endsWith(endpoint(f))&&r.request().method()==='POST');
 try{
  await page.getByRole('alertdialog').getByRole('button',{name:'Publicar acta',exact:true}).click();
  await expect.poll(async()=>Boolean((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%security_audit_log%') blocked")).rows[0].blocked)).toBe(true);
  await expect(page.getByLabel('DRAFT001 · Parcial uno',{exact:true})).toBeDisabled();
  await gate.query('COMMIT');expect((await response).status()).toBe(201);await expect(page.getByText('Acta publicada. Los cambios requieren una rectificación autorizada.',{exact:true})).toBeVisible();
  const grades=(await sql.query('SELECT score_hundredths FROM final_grades WHERE institution_id=$1',[f.institution])).rows;expect(grades).toEqual([{score_hundredths:800},{score_hundredths:800}]);
 }finally{await gate.query('ROLLBACK');await gate.end();}
});

test('an act published elsewhere keeps excluded local capture recoverable and read only',async({page})=>{
 const f=await fixture(),components=await prepare(page,f),headers={origin:new URL(page.url()).origin};
 expect((await page.request.post('/api/v1/auth/mfa/step-up',{headers,data:{currentPassword:password,recoveryCode:f.codes[1]}})).status()).toBe(200);
 for(const student of f.students)for(const component of components)expect((await page.request.post(endpoint(f),{headers,data:{kind:'score',componentId:component.id,studentId:student.id,scoreHundredths:800}})).status()).toBe(200);
 await page.reload();const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('9.50');
 expect((await page.request.post(endpoint(f),{headers,data:{kind:'publish',sectionId:f.section,operationId:randomUUID()}})).status()).toBe(201);
 await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.sii-academic').getByRole('alert')).toBeVisible();
 await page.getByRole('button',{name:'Reintentar consulta',exact:true}).click();await expect(page.getByText('Acta publicada. Los cambios requieren una rectificación autorizada.',{exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Captura local no incluida en el acta'})).toContainText('DRAFT001 · Parcial uno: 9.50');
 await expect(a).toHaveCount(0);await expect(page.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);
 expect((await sql.query('SELECT score_hundredths FROM final_grades WHERE institution_id=$1',[f.institution])).rows).toEqual([{score_hundredths:800},{score_hundredths:800}]);
});

test('internal link cancellation preserves drafts and confirmation leaves the page',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.35');
 const grading=page.url(),link=page.getByRole('link',{name:'← Institución',exact:true}).first();
 await link.click();await expect(page.getByRole('alertdialog')).toBeVisible({timeout:5000});
 await page.getByRole('button',{name:'Volver sin cambios',exact:true}).click();expect(page.url()).toBe(grading);await expect(a).toHaveValue('8.35');await expect(link).toBeFocused();
 await link.click();await page.getByRole('alertdialog').getByRole('button',{name:'Salir sin guardar',exact:true}).click();
 await page.waitForURL(url=>url.pathname==='/dashboard/institutions/'+f.institution);await quickNavigate(page,'Calificaciones');await expect(a).toHaveValue('8.35');
 expect((await sql.query('SELECT id FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toHaveLength(0);
});

test('native reload and close warnings retain drafts when cancelled',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.45');
 const reloadDialog=page.waitForEvent('dialog',{timeout:5000});const reload=page.evaluate(()=>location.reload()).catch(()=>null);
 const dialog=await reloadDialog;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await reload;await expect(a).toHaveValue('8.45');
 const closeDialog=page.waitForEvent('dialog',{timeout:5000});const closed=page.close({runBeforeUnload:true});const closing=await closeDialog;expect(closing.type()).toBe('beforeunload');await closing.dismiss();await closed;expect(page.isClosed()).toBe(false);await expect(a).toHaveValue('8.45');
 const accepted=page.waitForEvent('dialog',{timeout:5000});const reloaded=page.reload();await(await accepted).accept();await reloaded;await expect(a).toHaveValue('');
 expect((await sql.query('SELECT id FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toHaveLength(0);
});

test('two sections retain isolated drafts and discard the old blocked read',async({page,context})=>{
 const f=await fixture();await prepare(page,f);
 const section=(await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,'DRAFT-B',30) RETURNING id",[f.institution,f.term,f.course])).rows[0].id;
 await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.institution,section,f.teacher]);
 for(const student of f.students)await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3)',[f.institution,section,student.id]);
 for(const [code,title]of[['P1','Parcial uno'],['P2','Parcial dos']])expect((await page.request.post(endpoint(f),{headers:{origin:new URL(page.url()).origin},data:{kind:'component',sectionId:section,code,title,weight:50}})).status()).toBe(201);
 await page.reload();const select=page.getByLabel('Materia y grupo asignado'),a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await select.selectOption(f.section);await a.fill('8.15');
 await context.setOffline(true);await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.sii-academic').getByRole('alert')).toBeVisible();await context.setOffline(false);
 const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE assessment_components IN ACCESS EXCLUSIVE MODE');
 try{
  await page.getByRole('button',{name:'Reintentar consulta',exact:true}).click();
  await expect.poll(async()=>Boolean((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%assessment_components%') blocked")).rows[0].blocked)).toBe(true);
  await select.selectOption(section);await page.getByRole('alertdialog').getByRole('button',{name:'Cambiar de grupo',exact:true}).click();
  await expect(page.getByText('DRAFT001',{exact:true})).toHaveCount(0);
  const next=page.waitForResponse(r=>r.url().includes('sectionId='+section)&&r.request().method()==='GET');await gate.query('COMMIT');expect((await next).status()).toBe(200);
  await expect(select).toHaveValue(section);await expect(a).toHaveValue('');await a.fill('6.65');
 }finally{await gate.query('ROLLBACK');await gate.end();}
 await select.selectOption(f.section);await page.getByRole('alertdialog').getByRole('button',{name:'Cambiar de grupo',exact:true}).click();await expect(a).toHaveValue('8.15');
 await select.selectOption(section);await page.getByRole('alertdialog').getByRole('button',{name:'Cambiar de grupo',exact:true}).click();await expect(a).toHaveValue('6.65');
 expect((await sql.query('SELECT id FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toHaveLength(0);
});

test('real assignment revocation hides the private roster and drafts on forbidden save',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.55');
 await sql.query('DELETE FROM section_teachers WHERE institution_id=$1 AND section_id=$2',[f.institution,f.section]);
 const denied=page.waitForResponse(r=>r.url().endsWith(endpoint(f))&&r.request().method()==='POST');await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();expect((await denied).status()).toBe(403);
 await expect(a).toHaveCount(0);await expect(page.getByText('DRAFT001',{exact:true})).toHaveCount(0);await expect(page.locator('.sii-academic').getByRole('alert')).toContainText('autorización');
});

test('real expired identity is 401 on auth and clears grading data after its 403',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.65');
 expect((await page.request.post('/api/v1/auth/logout',{headers:{origin:new URL(page.url()).origin}})).ok()).toBe(true);
 expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
 const denied=page.waitForResponse(r=>r.url().endsWith(endpoint(f))&&r.request().method()==='POST');await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();expect((await denied).status()).toBe(403);
 await expect(a).toHaveCount(0);await expect(page.getByText('DRAFT001',{exact:true})).toHaveCount(0);
});

test('forbidden refresh retires drafts and recovery reloads assigned section metadata',async({page,context})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.75');
 await context.setOffline(true);await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.sii-academic').getByRole('alert')).toBeVisible();await context.setOffline(false);
 await sql.query('DELETE FROM section_teachers WHERE institution_id=$1 AND section_id=$2',[f.institution,f.section]);
 const denied=page.waitForResponse(r=>r.url().includes(endpoint(f)+'?sectionId=')&&r.request().method()==='GET');await page.getByRole('button',{name:'Reintentar consulta',exact:true}).click();expect((await denied).status()).toBe(403);await expect(a).toHaveCount(0);
 await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.institution,f.section,f.teacher]);
 await page.getByRole('button',{name:'Reintentar consulta',exact:true}).click();await expect(a).toHaveValue('');
 await expect(page.getByLabel('Materia y grupo asignado').locator('option',{hasText:'DRAFT-A'})).toHaveCount(1);
});

test('real logout with drafts clears private data without a cancellable departure warning',async({page})=>{
 const f=await fixture();await prepare(page,f);await page.getByLabel('DRAFT001 · Parcial uno',{exact:true}).fill('8.85');
 const warnings:string[]=[];page.on('dialog',dialog=>{warnings.push(dialog.type());void dialog.dismiss();});
 const leaving=page.getByRole('button',{name:'Salir',exact:true}).click({noWaitAfter:true}).catch(()=>null);
 await expect(page).toHaveURL(/\/login$/,{timeout:5000});expect(warnings).toEqual([]);
 await leaving;await expect(page.getByLabel('DRAFT001 · Parcial uno',{exact:true})).toHaveCount(0);expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
});

test('real withdrawal keeps excluded capture visible until explicit confirmed discard',async({page,browser})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.95');
 const administrator=await fixture(),membership=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[f.institution,administrator.user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,'admin','institution')",[f.institution,membership]);
 const adminContext=await browser.newContext({baseURL:new URL(page.url()).origin});
 try{
  const adminPage=await adminContext.newPage();await login(adminPage,administrator);
  const enrollment=(await sql.query('SELECT id FROM section_enrollments WHERE institution_id=$1 AND section_id=$2 AND student_id=$3',[f.institution,f.section,f.students[0].id])).rows[0].id;
  expect((await adminPage.request.patch('/api/v1/institutions/'+f.institution+'/enrollments',{headers:{origin:new URL(adminPage.url()).origin},data:{id:enrollment,status:'withdrawn'}})).status()).toBe(200);
  await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.sii-academic').getByRole('alert')).toBeVisible();
  await page.getByRole('button',{name:'Reintentar consulta',exact:true}).click();await expect(a).toHaveCount(0);
  const excluded=page.getByRole('region',{name:'Captura local fuera del listado'});await expect(excluded).toContainText('DRAFT001 · Parcial uno: 8.95');
  const publish=page.getByRole('button',{name:'Publicar acta oficial',exact:true});await expect(publish).toBeDisabled();
  await excluded.getByRole('button',{name:'Descartar captura DRAFT001 · Parcial uno',exact:true}).click();await page.getByRole('button',{name:'Volver sin cambios',exact:true}).click();await expect(excluded).toContainText('8.95');
  await excluded.getByRole('button',{name:'Descartar captura DRAFT001 · Parcial uno',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Descartar captura',exact:true}).click();
  await expect(excluded).toHaveCount(0);await expect(publish).toBeEnabled();
  expect((await sql.query("SELECT actor_user_id FROM security_audit_log WHERE institution_id=$1 AND action='enrollment.withdraw' AND target=$2",[f.institution,'enrollment:'+enrollment])).rows).toEqual([{actor_user_id:administrator.user}]);
  expect((await sql.query('SELECT id FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toHaveLength(0);
 }finally{await adminContext.close();}
});

test('populated drafts retain focus with keyboard and have accessible light and dark views',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true}),b=page.getByLabel('DRAFT002 · Parcial uno',{exact:true});await a.fill('9.10');await b.fill('8.70');
 await a.focus();await page.keyboard.press('Tab');await expect(a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true})).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.getByRole('status').filter({hasText:'Operación guardada'})).toBeVisible();await expect(b).toHaveValue('8.70');
 await b.focus();await page.screenshot({path:resolve('.p0-local/ux-matrix-gradebook-drafts-light-desktop.png'),fullPage:true});
 expect((await new AxeBuilder({page}).include('.sii-academic').analyze()).violations).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Activar tema oscuro',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');await b.focus();await b.scrollIntoViewIfNeeded();
 await page.screenshot({path:resolve('.p0-local/ux-matrix-gradebook-drafts-dark-390.png'),fullPage:true});
 expect((await new AxeBuilder({page}).include('.sii-academic').analyze()).violations).toEqual([]);
});

test('SPA back and forward preserve a newer private revision without a write',async({page})=>{
 const f=await fixture();await prepare(page,f);await quickNavigate(page,'Catálogo académico');await quickNavigate(page,'Calificaciones');const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.21');
 await page.goBack();await expect(page).toHaveURL(new RegExp('/'+f.institution+'/academic$'));await page.goForward();await expect(a).toHaveValue('8.21');
 await a.fill('6.43');await page.goBack();await page.goForward();await expect(a).toHaveValue('6.43');
 expect((await sql.query('SELECT id FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toHaveLength(0);
});
async function quickNavigate(page:Page,label:string){await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Buscar secciones',exact:true}).fill(label);const href=await page.getByRole('dialog',{name:'Ir a un módulo'}).getByRole('link').first().getAttribute('href');expect(href).toBeTruthy();await page.getByRole('combobox',{name:'Buscar secciones',exact:true}).press('Enter');await expect(page).toHaveURL(new URL(href!,page.url()).href);}
test('real quick switch Enter retains a draft through another module',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.32');
 await quickNavigate(page,'Catálogo académico');await expect(page).toHaveURL(new RegExp('/'+f.institution+'/academic$'));
 await quickNavigate(page,'Calificaciones');await expect(a).toHaveValue('8.32');
});
test('native unload warning remains active outside the gradebook route',async({page})=>{
 const f=await fixture();await prepare(page,f);await page.getByLabel('DRAFT001 · Parcial uno',{exact:true}).fill('8.54');
 await quickNavigate(page,'Cuenta y seguridad');await expect(page).toHaveURL(/\/dashboard\/security$/);
 const warning=page.waitForEvent('dialog',{timeout:5000}),reload=page.evaluate(()=>location.reload()).catch(()=>null);
 const dialog=await warning;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await reload;
 await page.goBack();await expect(page.getByLabel('DRAFT001 · Parcial uno',{exact:true})).toHaveValue('8.54');
});

test('a valid real step-up invalidates then restores the same private capture',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.76');
 await quickNavigate(page,'Cuenta y seguridad');await expect(page).toHaveURL(/\/security$/);
 await page.getByLabel('Contraseña actual para confirmar').fill(password);await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();await page.getByLabel('Código de recuperación para confirmar').fill(f.codes[1]);
 const verified=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/mfa/step-up')&&r.request().method()==='POST');await page.getByRole('button',{name:'Confirmar identidad',exact:true}).click();expect((await verified).status()).toBe(200);
 await page.goBack();await expect(a).toHaveValue('8.76');
});
test('logout outside grading retires retained drafts and a fresh login starts empty',async({page})=>{
 const f=await fixture();await prepare(page,f);await page.getByLabel('DRAFT001 · Parcial uno',{exact:true}).fill('8.87');await quickNavigate(page,'Cuenta y seguridad');await expect(page).toHaveURL(/\/security$/);
 const warnings:string[]=[];page.on('dialog',d=>{warnings.push(d.type());void d.dismiss();});await Promise.all([page.waitForURL('**/login'),page.getByRole('button',{name:'Salir',exact:true}).click()]);expect(warnings).toEqual([]);expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
 // Fixture has a second unused recovery code; login consumes it through the real UI.
 await login(page,{...f,codes:[f.codes[1]]});await page.goto('/dashboard/institutions/'+f.institution+'/grading');await expect(page.getByLabel('DRAFT001 · Parcial uno',{exact:true})).toHaveValue('');
});
test('a forbidden read after navigation retires that context before restored authority',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.98');await quickNavigate(page,'Catálogo académico');
 await sql.query('DELETE FROM section_teachers WHERE institution_id=$1 AND section_id=$2',[f.institution,f.section]);const lost=page.waitForResponse(r=>r.url().endsWith(endpoint(f)+'/sections'));await page.goBack();expect((await lost).status()).toBe(200);expect((await(await lost).json()).data).toEqual([]);await expect(a).toHaveCount(0);
 // The real section endpoint returns no assignment. Restoring it must not restore the old capture.
 await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.institution,f.section,f.teacher]);
 await quickNavigate(page,'Cuenta y seguridad');await page.goBack();await expect(a).toHaveValue('');
});
test('a real expired session while away cannot restore private grade capture',async({page})=>{
 const f=await fixture();await prepare(page,f);await page.getByLabel('DRAFT001 · Parcial uno',{exact:true}).fill('7.12');await quickNavigate(page,'Cuenta y seguridad');await expect(page).toHaveURL(/\/security$/);
 expect((await page.request.post('/api/v1/auth/logout',{headers:{origin:new URL(page.url()).origin}})).ok()).toBe(true);
 await page.goBack();await expect(page.getByLabel('DRAFT001 · Parcial uno',{exact:true})).toHaveCount(0);
 expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
});

test('two authorized tenants retain isolated captures without remounting the memory owner',async({page})=>{
 const f=await fixture();await prepare(page,f);await page.getByLabel('DRAFT001 · Parcial uno',{exact:true}).fill('8.24');
 const other=await fixture(),member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[other.institution,f.user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,'teacher','institution')",[other.institution,member]);await sql.query('UPDATE teacher_account_links SET membership_id=$1 WHERE institution_id=$2 AND teacher_id=$3',[member,other.institution,other.teacher]);
 for(const[code,title]of[['P1','Parcial uno'],['P2','Parcial dos']])expect((await page.request.post(endpoint(other),{headers:{origin:new URL(page.url()).origin},data:{kind:'component',sectionId:other.section,code,title,weight:50}})).status()).toBe(201);
 await quickNavigate(page,'Inicio');await openInstitution(page,other.institution);await quickNavigate(page,'Calificaciones');const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await expect(a).toHaveValue('');await a.fill('6.46');
 await quickNavigate(page,'Inicio');await openInstitution(page,f.institution);await quickNavigate(page,'Calificaciones');await expect(a).toHaveValue('8.24');
 await quickNavigate(page,'Inicio');await openInstitution(page,other.institution);await quickNavigate(page,'Calificaciones');await expect(a).toHaveValue('6.46');
});
test('a different real actor cannot restore the previous actor capture in a retained layout',async({page,context})=>{
 const f=await fixture();await prepare(page,f);await page.getByLabel('DRAFT001 · Parcial uno',{exact:true}).fill('8.35');const other=await fixture();
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[f.institution,other.user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,'teacher','institution')",[f.institution,member]);
 const teacher=(await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,'T-OTHER','Synthetic','Other') RETURNING id",[f.institution])).rows[0].id;
 await sql.query('INSERT INTO teacher_account_links(institution_id,teacher_id,membership_id) VALUES($1,$2,$3)',[f.institution,teacher,member]);await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.institution,f.section,teacher]);
 const another=await context.newPage();try{await another.request.post('/api/v1/auth/logout',{headers:{origin:new URL(page.url()).origin}});await login(another,other);await page.bringToFront();await quickNavigate(page,'Cuenta y seguridad');await page.goBack();await expect(page.getByLabel('DRAFT001 · Parcial uno',{exact:true})).toHaveCount(0);expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);}finally{await another.close();}
});
test('a blocked old private read cannot repopulate capture after navigation and revocation',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.57');await quickNavigate(page,'Catálogo académico');
 const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE assessment_components IN ACCESS EXCLUSIVE MODE');
 try{await page.goBack();await expect.poll(async()=>Boolean((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%assessment_components%') blocked")).rows[0].blocked)).toBe(true);
  await quickNavigate(page,'Cuenta y seguridad');await sql.query('DELETE FROM section_teachers WHERE institution_id=$1 AND section_id=$2',[f.institution,f.section]);await gate.query('COMMIT');await expect(a).toHaveCount(0);
  const denied=page.waitForResponse(r=>r.url().endsWith(endpoint(f)+'/sections'));await page.goBack();expect((await denied).status()).toBe(200);expect((await(await denied).json()).data).toEqual([]);await expect(a).toHaveCount(0);
  await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.institution,f.section,f.teacher]);await quickNavigate(page,'Cuenta y seguridad');await page.goBack();await expect(a).toHaveValue('');
 }finally{await gate.query('ROLLBACK');await gate.end();}
});
async function openInstitution(page:Page,id:string){await page.locator('a[href="/dashboard/institutions/'+id+'"]').first().click();await expect(page).toHaveURL(new URL('/dashboard/institutions/'+id,page.url()).href);await expect(page.getByRole('link',{name:'Calificaciones',exact:true}).first()).toBeVisible();}
/** Delay only delivery: the server response and its SQL commit are real and unchanged. */
async function holdGradebookResponse(page:Page,f:Awaited<ReturnType<typeof fixture>>,kind:'score'|'snapshot'='score',expectedStatus=200){
 let release!:()=>void,ready!:()=>void,done!:(result:string)=>void;const gate=new Promise<void>(r=>{release=r;}),observed=new Promise<void>(r=>{ready=r;}),delivered=new Promise<string>(r=>{done=r;});let hold=true;
 const pattern='**'+endpoint(f)+'*';const handler=async(route:Route)=>{
  const wanted=kind==='score'?route.request().method()==='POST'&&route.request().postDataJSON().kind==='score':route.request().method()==='GET'&&new URL(route.request().url()).searchParams.has('sectionId');
  if(!hold||!wanted){await route.continue();return;}
  hold=false;const actual=await route.fetch();expect(actual.status()).toBe(expectedStatus);ready();await gate;
  try{await route.fulfill({response:actual});done('fulfilled');}catch(error){if(!route.request().failure())throw error;done('aborted');}
 };await page.route(pattern,handler);
 return {observed,release,delivered,dispose:()=>page.unroute(pattern,handler)};
}
for(const newer of [false,true])test('a committed save after SPA departure acknowledges only its sent revision; newer='+newer,async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('7.50');const held=await holdGradebookResponse(page,f);
 try{await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await held.observed;
  expect((await sql.query('SELECT score_hundredths FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toEqual([{score_hundredths:750}]);
  await quickNavigate(page,'Catálogo académico');if(newer){await page.goBack();await expect(a).toHaveValue('7.50');await a.fill('6.25');}
  held.release();expect(await held.delivered).toBe('fulfilled');if(!newer)await page.goBack();await expect(a).toHaveValue(newer?'6.25':'7.50');
  await expect(page.getByRole('status').filter({hasText:/Hay .* notas sin guardar en este grupo/})).toHaveCount(newer?1:0);
 }finally{held.release();await held.dispose();}
});
test('an old committed response cannot delete a new provider revision after own logout and same-actor login',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('7.50');const held=await holdGradebookResponse(page,f);
 try{await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await held.observed;expect((await sql.query('SELECT score_hundredths FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toEqual([{score_hundredths:750}]);
  await quickNavigate(page,'Cuenta y seguridad');await Promise.all([page.waitForURL('**/login'),page.getByRole('button',{name:'Salir',exact:true}).click()]);
  await login(page,{...f,codes:[f.codes[1]]});await page.goto('/dashboard/institutions/'+f.institution+'/grading');await expect(a).toHaveValue('7.50');await a.fill('6.39');held.release();expect(['fulfilled','aborted']).toContain(await held.delivered);
  await expect(a).toHaveValue('6.39');await expect(page.getByRole('status').filter({hasText:/Hay .* notas sin guardar en este grupo/})).toHaveCount(1);
 }finally{held.release();await held.dispose();}
});
test('a focus notification after tab return revalidates and preserves the active grade cell',async({page,context})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.68');await a.focus();const another=await context.newPage();
 try{await another.goto('/dashboard/security');await page.bringToFront();
  // Playwright forces each page focused; explicitly deliver the focus signal in headless Chromium.
  const current=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/me')&&r.request().method()==='GET');await page.evaluate(()=>window.dispatchEvent(new FocusEvent('focus')));expect((await current).status()).toBe(200);
  await expect(a).toHaveValue('8.68');await expect(a).toBeFocused();
 }finally{await another.close();}
});
test('focus revalidation hides private rows and does not steal a newly chosen control',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.79');await a.focus();
 const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE auth_sessions IN ACCESS EXCLUSIVE MODE');
 try{await page.evaluate(()=>window.dispatchEvent(new FocusEvent('focus')));await expect.poll(async()=>Boolean((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%auth_sessions%') blocked")).rows[0].blocked)).toBe(true);
  await expect(a).toHaveCount(0);await expect(page.getByText('DRAFT001',{exact:true})).toHaveCount(0);const chosen=page.getByRole('button',{name:'Buscar módulos',exact:true});await chosen.focus();
  await gate.query('COMMIT');await expect(a).toHaveValue('8.79');await expect(chosen).toBeFocused();
 }finally{await gate.query('ROLLBACK');await gate.end();}
});
test('a successful save is acknowledged when its subsequent real snapshot is delivered after departure',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('7.50');const held=await holdGradebookResponse(page,f,'snapshot');
 try{const posted=page.waitForResponse(r=>r.url().endsWith(endpoint(f))&&r.request().method()==='POST');await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();expect((await posted).status()).toBe(200);await held.observed;
  expect((await sql.query('SELECT score_hundredths FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toEqual([{score_hundredths:750}]);await quickNavigate(page,'Catálogo académico');held.release();expect(['fulfilled','aborted']).toContain(await held.delivered);
  await page.goBack();await expect(a).toHaveValue('7.50');await expect(page.getByRole('status').filter({hasText:/Hay .* notas sin guardar en este grupo/})).toHaveCount(0);
 }finally{held.release();await held.dispose();}
});
test('a valid same-route step-up cannot prevent acknowledging a committed original revision',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('7.50');const held=await holdGradebookResponse(page,f);
 try{await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await held.observed;expect((await sql.query('SELECT score_hundredths FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toEqual([{score_hundredths:750}]);
  expect((await page.request.post('/api/v1/auth/mfa/step-up',{headers:{origin:new URL(page.url()).origin},data:{currentPassword:password,recoveryCode:f.codes[1]}})).status()).toBe(200);
  const authorized=page.waitForResponse(r=>r.url().includes(endpoint(f)+'?sectionId=')&&r.request().method()==='GET');await page.evaluate(()=>window.dispatchEvent(new Event('siii:assurance-changed')));expect((await authorized).status()).toBe(200);await expect(a).toHaveValue('7.50');
  held.release();expect(await held.delivered).toBe('fulfilled');await expect(page.getByRole('status').filter({hasText:/Hay .* notas sin guardar en este grupo/})).toHaveCount(0);
 }finally{held.release();await held.dispose();}
});
test('a real forbidden save delivered outside grading clears that context before authority is restored',async({page})=>{
 const f=await fixture();await prepare(page,f);const a=page.getByLabel('DRAFT001 · Parcial uno',{exact:true});await a.fill('8.91');await sql.query('DELETE FROM section_teachers WHERE institution_id=$1 AND section_id=$2',[f.institution,f.section]);const held=await holdGradebookResponse(page,f,'score',403);
 try{const denied=page.waitForResponse(r=>r.url().endsWith(endpoint(f))&&r.request().method()==='POST');await a.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await held.observed;await quickNavigate(page,'Catálogo académico');held.release();expect(await held.delivered).toBe('fulfilled');expect((await denied).status()).toBe(403);
  await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.institution,f.section,f.teacher]);await page.goBack();await expect(a).toHaveValue('');expect((await sql.query('SELECT id FROM assessment_scores WHERE institution_id=$1',[f.institution])).rows).toHaveLength(0);
 }finally{held.release();await held.dispose();}
});
