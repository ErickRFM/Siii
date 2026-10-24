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

test('module directory keeps integrated areas visible for an authenticated guest without granting links',async({page})=>{
 await fixture('guest');await login(page);await page.goto('/dashboard');
 const directory=page.getByRole('region',{name:'Módulos de QA consolidación'});
 await expect(directory.locator('.sii-module-card')).toHaveCount(7);
 for(const label of ['Catálogo académico','Estudiantes y docentes','Grupos e inscripciones','Calificaciones','Horarios y aulas','Servicios universitarios','Admisiones']){
  await expect(directory.getByRole('heading',{name:label,exact:true})).toBeVisible();
  await expect(directory.getByRole('link',{name:new RegExp(label)})).toHaveCount(0);
 }
 await expect(directory.locator('article')).toHaveCount(7);
 await expect(directory.getByText('Sin permiso para este módulo',{exact:true})).toHaveCount(7);
 await page.goto('/dashboard/institutions/'+tenant);
 const navigation=page.getByRole('navigation',{name:'Gestión académica',exact:true});
 await expect(navigation).toBeVisible();
 await expect(navigation.getByRole('link')).toHaveCount(0);
 await expect(navigation.getByText('Estudiantes y docentes',{exact:false})).toBeVisible();
});

test('registry pagination reaches persisted students beyond two hundred without losing earlier pages',async({page})=>{
 await fixture('admin');
 const program=(await sql.query('SELECT id FROM academic_programs WHERE institution_id=$1 LIMIT 1',[tenant])).rows[0].id;
 await sql.query(`INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) SELECT $1,$2,'PAGER'||n,'Alumno','Sintético' FROM generate_series(1,205)n`,[tenant,program]);
 await login(page);await page.getByRole('link',{name:'Estudiantes y docentes',exact:true}).first().click();
 const rows=page.locator('tbody tr');await expect(rows).toHaveCount(50);
 const firstPage=await rows.locator('td:first-child').allTextContents();
 await page.getByRole('button',{name:'Siguiente página',exact:true}).click();await expect(rows).toHaveCount(50);
 const secondPage=await rows.locator('td:first-child').allTextContents();expect(secondPage.every(value=>!firstPage.includes(value))).toBe(true);
 await page.getByRole('button',{name:'Página anterior',exact:true}).click();await expect(rows.locator('td:first-child')).toHaveText(firstPage);
 for(let pageNumber=2;pageNumber<=5;pageNumber++){await page.getByRole('button',{name:'Siguiente página',exact:true}).click();await expect(page.getByText('Página '+pageNumber,{exact:true})).toBeVisible()}
 await expect(rows).toHaveCount(5);await expect(page.getByRole('button',{name:'Siguiente página',exact:true})).toBeDisabled();
 await page.reload();await expect(rows).toHaveCount(50);expect((await sql.query('SELECT count(*)::int AS count FROM institutional_students WHERE institution_id=$1',[tenant])).rows[0].count).toBe(205);
 await sql.query(`INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) SELECT $1,'FAC'||n,'Facilitador','Sintético' FROM generate_series(1,65)n`,[tenant]);
 await page.getByRole('link',{name:'Servicios universitarios',exact:true}).first().click();
 await page.getByRole('tab',{name:'Trámites estudiantiles',exact:true}).click();
 await expect(page.getByLabel(/^Alumno/).locator('option')).toHaveCount(206);
 await page.getByRole('tab',{name:'Talleres',exact:true}).click();
 await expect(page.getByLabel(/^Facilitador/).locator('option')).toHaveCount(66);
});

test('registry profile editing preserves failed drafts, rejects stale changes and persists both kinds after reload',async({page})=>{
 await fixture('admin');const program=(await sql.query('SELECT id FROM academic_programs WHERE institution_id=$1 LIMIT 1',[tenant])).rows[0].id;
 const student=(await sql.query(`INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,'EDIT2026','Antes','Sintética') RETURNING id`,[tenant,program])).rows[0].id;
 await sql.query(`INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,'FACEDIT','Docente','Sintético')`,[tenant]);
 await login(page);await page.getByRole('link',{name:'Estudiantes y docentes',exact:true}).first().click();
 await page.getByRole('row').filter({has:page.getByRole('cell',{name:'EDIT2026',exact:true})}).getByRole('button',{name:'Editar',exact:true}).click();
 const editor=page.getByRole('region',{name:'Edición de expediente',exact:true});
 await expect(editor.getByLabel('Nombre(s)',{exact:true})).toBeFocused();
 const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(accessibility.violations).toEqual([]);
 await editor.getByLabel('Nombre(s)',{exact:true}).fill('Corregida');await editor.getByLabel('Correo institucional (opcional)',{exact:true}).fill('corregida@example.test');
 const endpoint='**/api/v1/institutions/'+tenant+'/registry/students';
 await page.route(endpoint,async route=>{if(route.request().method()==='PATCH')await route.abort('failed');else await route.continue()});
 await editor.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.locator('main [role="alert"]')).toContainText('No se pudo guardar');
 await expect(editor.getByLabel('Nombre(s)',{exact:true})).toHaveValue('Corregida');await page.unroute(endpoint);
 const saved=page.waitForResponse(response=>response.url().endsWith('/registry/students')&&response.request().method()==='PATCH');
 await editor.getByRole('button',{name:'Guardar cambios',exact:true}).click();expect((await saved).status()).toBe(200);await expect(editor).toHaveCount(0);
 await expect(page.getByRole('row').filter({has:page.getByRole('cell',{name:'EDIT2026',exact:true})}).getByRole('button',{name:'Editar',exact:true})).toBeFocused();
 await page.reload();await expect(page.getByRole('cell',{name:'Corregida Sintética',exact:false})).toBeVisible();
 expect((await sql.query('SELECT first_name,institutional_email,enrollment_number,program_id FROM institutional_students WHERE id=$1',[student])).rows).toEqual([{first_name:'Corregida',institutional_email:'corregida@example.test',enrollment_number:'EDIT2026',program_id:program}]);
 await page.getByRole('row').filter({has:page.getByRole('cell',{name:'EDIT2026',exact:true})}).getByRole('button',{name:'Editar',exact:true}).click();
 await editor.getByLabel('Nombre(s)',{exact:true}).fill('Borrador local');await sql.query(`UPDATE institutional_students SET first_name='Edición externa' WHERE id=$1`,[student]);
 const conflict=page.waitForResponse(response=>response.url().endsWith('/registry/students')&&response.request().method()==='PATCH');await editor.getByRole('button',{name:'Guardar cambios',exact:true}).click();expect((await conflict).status()).toBe(409);
 await expect(page.locator('main [role="alert"]')).toContainText('cambió desde que lo abriste');await expect(editor.getByLabel('Nombre(s)',{exact:true})).toHaveValue('Borrador local');
 await expect(page.getByRole('tab',{name:'Docentes',exact:true})).toBeDisabled();await editor.getByRole('button',{name:'Cancelar edición',exact:true}).click();
 await expect(page.getByRole('row').filter({has:page.getByRole('cell',{name:'EDIT2026',exact:true})}).getByRole('button',{name:'Editar',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.getByRole('cell',{name:'Edición externa Sintética',exact:false})).toBeVisible();
 await page.getByRole('tab',{name:'Docentes',exact:true}).click();await page.getByLabel('Buscar en esta página',{exact:true}).fill('Docente');await page.getByRole('row').filter({has:page.getByRole('cell',{name:'FACEDIT',exact:true})}).getByRole('button',{name:'Editar',exact:true}).click();
 await editor.getByLabel('Nombre(s)',{exact:true}).fill('Profesora');await editor.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(editor).toHaveCount(0);
 await expect(page.getByLabel('Buscar en esta página',{exact:true})).toBeFocused();await page.getByLabel('Buscar en esta página',{exact:true}).fill('');await expect(page.getByRole('cell',{name:'Profesora Sintético',exact:false})).toBeVisible();
 await page.reload();await page.getByRole('tab',{name:'Docentes',exact:true}).click();await expect(page.getByRole('cell',{name:'Profesora Sintético',exact:false})).toBeVisible();
 const factor=(await sql.query('SELECT f.id,f.user_id FROM auth_mfa_factors f JOIN platform_users u ON u.id=f.user_id WHERE u.username=$1',[username])).rows[0];
 recovery=randomBytes(16).toString('hex').toUpperCase();await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[factor.user_id,factor.id,digestRecoveryCode(recovery,factor.user_id)]);
 await page.getByRole('button',{name:'Salir',exact:true}).click();await page.waitForURL('**/login');await login(page);
 await page.getByRole('link',{name:'Estudiantes y docentes',exact:true}).first().click();await page.getByRole('tab',{name:'Docentes',exact:true}).click();await expect(page.getByRole('cell',{name:'Profesora Sintético',exact:false})).toBeVisible();
});


test('system-wide module shell stays coherent in both themes and narrow screens',async({page})=>{
 test.setTimeout(240000);
 await fixture('super_admin');await login(page);
 const routes=['academic','registry','operations','scheduling','grading','services','users','roles','invitations','admin'];
 for(const area of routes){
  await page.goto('/dashboard/institutions/'+tenant+'/'+area);
  await expect(page).toHaveURL(new RegExp('/'+area+'$'));
  await expect(page.locator('main#main-content')).toBeVisible();
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  for(const theme of ['dark','light'] as const){
   const current=await page.locator('html').getAttribute('data-sii-theme');
   if(current!==theme)await page.getByRole('button',{name:theme==='dark'?'Activar tema oscuro':'Activar tema claro'}).click();
   await expect(page.locator('html')).toHaveAttribute('data-sii-theme',theme);
   await page.setViewportSize({width:390,height:844});
   await expect(page.locator('main#main-content')).toBeVisible();
   const extent=await page.evaluate(()=>({w:document.documentElement.scrollWidth,v:window.innerWidth}));
   expect(extent.w,area+'/'+theme+' horizontal overflow').toBeLessThanOrEqual(extent.v+2);
   await page.screenshot({path:'.p0-local/ux-matrix-all-'+area+'-'+theme+'-390.png',fullPage:true,animations:'disabled'});
   const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   expect(report.violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)})),area+'/'+theme+' accessibility').toEqual([]);
  }
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'.p0-local/ux-matrix-all-'+area+'-light-1440.png',fullPage:true,animations:'disabled'});
 }
});
