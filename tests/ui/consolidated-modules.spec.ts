import {test,expect,type Page} from '@playwright/test';import AxeBuilder from '@axe-core/playwright';import pg from 'pg';import argon2 from 'argon2';import {randomBytes,randomUUID} from 'node:crypto';import {isolatedDatabaseUrl} from '../support/database-url';import {sealMfaSecret,digestRecoveryCode} from '../../src/shared/auth/mfa-primitives';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),password='Synthetic-module-browser-2026!';let hash:string,tenant:string,username:string,recovery:string;
test.beforeAll(async()=>{await sql.connect();hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1})});test.afterAll(async()=>{await sql.end()});
async function fixture(role='super_admin'){
 await sql.query('DELETE FROM auth_throttle');const suffix=randomUUID().slice(0,8);username='module-'+suffix;
 tenant=(await sql.query(`INSERT INTO institutions(name,code) VALUES('QA consolidación',$1) RETURNING id`,['MOD'+suffix])).rows[0].id;
 const person=(await sql.query(`INSERT INTO people(first_name,last_name) VALUES('QA','Consolidación') RETURNING id`)).rows[0].id;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,user])).rows[0].id;await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,role]);
 const factor=(await sql.query(`INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute') RETURNING id`,[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)])).rows[0].id;
 recovery=randomBytes(16).toString('hex').toUpperCase();await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[user,factor,digestRecoveryCode(recovery,user)]);
 await sql.query(`INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'SYS','Sistemas','ingenieria','presencial')`,[tenant]);
}
async function login(page:Page){
 await page.goto('/login');await page.getByLabel('Usuario institucional').fill(username);await page.getByLabel('Contraseña',{exact:true}).fill(password);
 const signedIn=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/login')&&response.request().method()==='POST');await page.getByRole('button',{name:'Entrar al sistema'}).click();expect((await signedIn).status()).toBe(200);
 await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();await page.getByLabel('Código de recuperación',{exact:true}).fill(recovery);
 const verified=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/mfa/challenge')&&response.request().method()==='POST');await page.getByRole('button',{name:'Verificar y entrar'}).click();expect((await verified).status()).toBe(200);
 const session=(await page.context().cookies()).find(cookie=>cookie.name==='__Host-siii_session');expect(session).toMatchObject({secure:true,httpOnly:true,sameSite:'Lax',path:'/'});await page.waitForURL('**/dashboard');await expect(page).toHaveURL(/\/dashboard$/);await page.goto('/dashboard/institutions/'+tenant);
}
test('super administrator navigates every integrated module through effective permissions',async({page})=>{
 await fixture();await login(page);
 const modules=[['registry','Estudiantes y docentes','Personas académicas'],['operations','Grupos e inscripciones','Operación académica'],['grading','Calificaciones','Calificaciones'],['scheduling','Horarios y aulas','Planificador institucional'],['services','Servicios universitarios','Atención institucional']];
 for(const [id,label,heading] of modules){await page.getByRole('link',{name:label,exact:true}).first().click();const response=await page.request.get('/api/v1/institutions/'+tenant+'/capabilities');expect(response.status()).toBe(200);const permissions=(await response.json()).data;expect(permissions.institutionId).toBe(tenant);expect(permissions.restricted).toBe(false);await expect(page).toHaveURL(new RegExp('/'+id+'$'));await expect(page.getByRole('heading',{level:1})).toContainText(heading);await expect(page.locator('main [role="alert"]')).toHaveCount(0);await expect(page.getByRole('link',{name:label,exact:true}).first()).toHaveAttribute('aria-current','page')}
});
test('registry writes real data and remains accessible in dark mobile layout',async({page})=>{
 await fixture('admin');await sql.query(`INSERT INTO academic_programs(institution_id,code,name,level,modality) SELECT $1,'PG'||n,'Programa '||n,'ingenieria','presencial' FROM generate_series(1,60) n`,[tenant]);await login(page);await page.getByRole('link',{name:'Estudiantes y docentes',exact:true}).first().click();
 await page.getByLabel('Matrícula',{exact:true}).fill('QA2026');await page.getByLabel('Nombre(s)',{exact:true}).fill('Alumna');await page.getByLabel('Apellidos',{exact:true}).fill('Sintética');await page.getByLabel('Programa académico',{exact:true}).selectOption({label:'SYS · Sistemas'});
 const saved=page.waitForResponse(response=>response.url().endsWith('/registry/students')&&response.request().method()==='POST');await page.getByRole('button',{name:'Guardar registro',exact:true}).click();expect((await saved).status()).toBe(201);await expect(page.getByRole('cell',{name:'QA2026',exact:true})).toBeVisible();
 expect((await sql.query('SELECT enrollment_number FROM institutional_students WHERE institution_id=$1',[tenant])).rows).toEqual([{enrollment_number:'QA2026'}]);
 await page.getByRole('button',{name:'Activar tema oscuro'}).click();await page.setViewportSize({width:390,height:844});await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');
 const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(results.violations).toEqual([]);await page.screenshot({path:'.p0-local/consolidated-registry-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Abrir navegación'}).click();await expect(page.getByRole('link',{name:'Horarios y aulas',exact:true}).first()).toBeVisible();
});
test('teacher navigation exposes only the assigned gradebook module',async({page})=>{
 await fixture('teacher');await login(page);await expect(page.getByRole('link',{name:'Calificaciones',exact:true}).first()).toBeVisible();await expect(page.getByRole('link',{name:'Estudiantes y docentes',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Usuarios',exact:true})).toHaveCount(0);await page.getByRole('link',{name:'Calificaciones',exact:true}).first().click();await expect(page.getByRole('option',{name:'Sin secciones asignadas'})).toBeAttached();await expect(page.locator('main [role="alert"]')).toHaveCount(0);
});
