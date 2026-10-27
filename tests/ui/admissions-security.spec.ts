import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {isolatedDatabaseUrl} from '../support/database-url';
import {applicantMail} from '../support/applicant-mail';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),password='Synthetic-admissions-browser-2026!';
test.beforeAll(async()=>{await sql.connect();mkdirSync('.p0-local',{recursive:true});});test.afterAll(async()=>{await sql.end();});
for(const width of [360,1440])for(const theme of ['light','dark'] as const)test('mailbox → session → application → logout '+width+' '+theme,async({page,context})=>{
 await page.setViewportSize({width,height:960});await page.emulateMedia({colorScheme:theme});await page.addInitScript(value=>{localStorage.setItem('sii-theme',value);document.documentElement.dataset.siiTheme=value;},theme);
 await sql.query("DELETE FROM auth_throttle WHERE scope LIKE 'admissions_%'");
 const institution=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic browser admissions',$1) RETURNING id",['C32-UI-'+randomUUID()])).rows[0].id;
 await sql.query("INSERT INTO admission_cycles(institution_id,code,name,start_date,end_date,status) VALUES($1,'UI','Convocatoria sintética',now()-interval '1 day',now()+interval '1 day','open')",[institution]);await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'UI','Programa sintético','ingenieria','presencial')",[institution]);
 const email='browser-'+randomUUID()+'@example.test';
 await page.goto('/admissions/'+institution);await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);await page.getByLabel('Correo electrónico *',{exact:true}).fill(email);await page.getByLabel('Nombre(s) *',{exact:true}).fill('Prueba');await page.getByLabel('Apellido(s) *',{exact:true}).fill('Sintética');
 const register=page.waitForResponse(r=>r.url().endsWith('/admissions/register'));await page.getByRole('button',{name:'Registrarme como aspirante'}).click();const registered=await register;expect(registered.status()).toBe(202);expect(JSON.stringify(await registered.json())).not.toContain('verificationToken');await expect(page.getByRole('status').first()).toContainText('recibirás un correo');
 const mail=await applicantMail(sql,email);const mailUrl=new URL(mail.url);await page.goto('/admissions/verify'+mailUrl.hash);await expect(page.getByLabel('Nueva contraseña de aspirante')).toBeVisible();await expect(page).toHaveURL(/\/admissions\/verify$/);expect(await page.content()).not.toContain(mail.token);expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain(mail.token);
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Nueva contraseña de aspirante').fill(password);await page.getByLabel('Confirma tu nueva contraseña').fill(password);await page.getByRole('button',{name:'Verificar mi correo',exact:true}).click();await expect(page.getByRole('status')).toContainText('Correo verificado');
 await page.goto('/admissions/'+institution);await page.getByRole('button',{name:'Iniciar sesión de aspirante',exact:true}).click();await page.getByLabel('Correo electrónico *',{exact:true}).fill(email);await page.getByLabel('Contraseña *',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByText('Aspirante autenticado(a):')).toBeVisible();
 const cookie=(await context.cookies()).find(c=>c.name==='__Host-siii_applicant_session');expect(cookie).toMatchObject({httpOnly:true,secure:true,sameSite:'Strict'});
 await page.reload();await expect(page.getByText('Aspirante autenticado(a):')).toBeVisible();
 const submit=page.waitForResponse(r=>r.url().endsWith('/admissions/applications')&&r.request().method()==='POST');await page.getByRole('button',{name:'Enviar solicitud de admisión',exact:true}).click();const submitted=await submit;expect(submitted.status()).toBe(201);expect(submitted.request().postDataJSON()).not.toHaveProperty('applicantId');await expect(page.getByRole('heading',{name:'Solicitud de Admisión Registrada'})).toBeVisible();
 const application=(await submitted.json()).data;expect((await sql.query('SELECT applicant_id FROM admission_applications WHERE id=$1',[application.id])).rows[0].applicant_id).toBe(mail.id);
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.p0-local/c32-admissions-'+width+'-'+theme+'.png',fullPage:true});
 await page.getByRole('button',{name:'Cerrar sesión de aspirante'}).click();await expect(page.getByRole('status').first()).toContainText('Sesión cerrada');expect((await context.request.get('/api/v1/admissions/session')).status()).toBe(401);
});

test('does not offer another login while a previous session read is delayed',async({page})=>{
 const institution=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic delayed identity',$1) RETURNING id",['C32-delay-'+randomUUID()])).rows[0].id;
 let release!:()=>void,arrive!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{arrive=resolve;});
 await page.route('**/api/v1/admissions/session',async route=>{const response=await route.fetch();arrive();await gate;await route.fulfill({response});});
 const navigation=page.goto('/admissions/'+institution);
 try{await entered;await expect(page.getByRole('status')).toContainText('Comprobando sesión');await expect(page.getByRole('button',{name:'Iniciar sesión de aspirante'})).toHaveCount(0);}finally{release();}
 await navigation;await expect(page.getByRole('button',{name:'Iniciar sesión de aspirante'})).toBeVisible();
});
