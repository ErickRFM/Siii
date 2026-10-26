import {isolatedDatabaseUrl} from '../support/database-url';
const testDatabaseUrl=isolatedDatabaseUrl();
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
const sql=new pg.Client({connectionString:testDatabaseUrl});
const suffix=randomUUID().slice(0,8),password='Synthetic-ui-password-2026!';
const username='qa-p0-'+suffix,student='qa-student-'+suffix;
let institutionId:string;
test.beforeAll(async()=>{
 await sql.connect();
 const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 institutionId=(await sql.query("INSERT INTO institutions(name,code) VALUES('QA P0 local — datos sintéticos',$1) RETURNING id",['UI'+suffix])).rows[0].id;
 for(const [name,role]of [[username,'coordinator'],[student,'student']]){
  const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('QA','Local') RETURNING id")).rows[0].id;
  const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,name,hash])).rows[0].id;
  const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institutionId,user])).rows[0].id;
  await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,role]);
 }
 await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) SELECT $1,'QA-'||n,'Materia local '||n,6 FROM generate_series(1,65)n",[institutionId]);
});
test.beforeEach(async()=>{await sql.query('DELETE FROM auth_throttle');});
test.afterAll(async()=>{await sql.end();});
async function signIn(page:Page,name=username){
 await page.goto('/login');
 await page.getByLabel('Usuario institucional').fill(name);
 await page.getByLabel('Contraseña',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Entrar al sistema'}).click();
 await expect(page).toHaveURL(/\/dashboard$/);
}
async function catalog(page:Page,name=username){
 await signIn(page,name);await page.goto('/dashboard/institutions/'+institutionId+'/academic');
 await expect(page.getByRole('tab',{name:'Programas'})).toBeVisible();
}
async function axe(page:Page){
 const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
 expect(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
}
test('login supports skip link, password managers and associated errors',async({page})=>{
 await page.goto('/login');await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'Saltar al contenido principal'})).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();
 await expect(page.getByLabel('Contraseña',{exact:true})).toHaveAttribute('autocomplete','current-password');
 await page.getByLabel('Usuario institucional').fill(username);await page.getByLabel('Contraseña',{exact:true}).fill('wrong');
 await page.getByRole('button',{name:'Entrar al sistema'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByLabel('Usuario institucional')).toHaveAttribute('aria-describedby','sii-login-error');
 await axe(page);
});
test('login and account security meet automated AA checks',async({page})=>{
 await page.goto('/login');await axe(page);
 await signIn(page);await page.goto('/dashboard/security');
 await expect(page.getByLabel('Nueva contraseña')).toBeVisible();await axe(page);
});
test('catalog tabs implement arrow, home and end keyboard navigation',async({page})=>{
 await catalog(page);
 const programs=page.getByRole('tab',{name:'Programas'});
 await programs.focus();await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('tab',{name:'Materias'})).toBeFocused();
 await expect(page.getByRole('tab',{name:'Materias'})).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'Campus'})).toBeFocused();
 await page.keyboard.press('Home');await expect(programs).toBeFocused();
});
test('catalog retrieves both pages with honest counts and supports edits',async({page})=>{
 await catalog(page);await page.getByRole('tab',{name:'Materias'}).click();
 await expect(page.locator('#catalog-search')).toHaveAttribute('data-sii-control','input');
 await expect(page.locator('tbody tr')).toHaveCount(50);
 await page.getByRole('button',{name:'Siguiente página'}).click();await expect(page.locator('tbody tr')).toHaveCount(15);
 await page.getByRole('button',{name:'Página anterior'}).click();await expect(page.locator('tbody tr')).toHaveCount(50);
 const first=page.locator('tbody tr').first();await first.getByRole('button',{name:'Editar'}).click();
 await page.getByLabel('Nombre',{exact:true}).first().fill('Materia corregida local');
 await first.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Cambios guardados'})).toBeVisible();await axe(page);
});
test('student catalog contains no write controls and remains accessible',async({page})=>{
 await catalog(page,student);await page.getByRole('tab',{name:'Materias'}).click();
 await expect(page.locator('tbody tr')).toHaveCount(50);
 await expect(page.getByRole('button',{name:'Guardar registro'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Editar',exact:true})).toHaveCount(0);await axe(page);
});
test('catalog reports offline state and prevents writes until reconnection',async({page,context})=>{
 await catalog(page);await context.setOffline(true);
 await expect(page.getByText(/Sin conexión/).first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Guardar registro'})).toBeDisabled();
 await context.setOffline(false);
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.getByText(/Sin conexión/)).toHaveCount(0);
});
test('mobile and dark catalog retain accessible names and contrast',async({page})=>{
 await page.setViewportSize({width:390,height:844});await catalog(page);
 await page.getByRole('button',{name:'Activar tema oscuro'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-sii-theme','dark');await axe(page);
});

test('failed edits retain the draft and allow correction without reloading',async({page})=>{
 await catalog(page);await page.getByRole('tab',{name:'Materias'}).click();
 const first=page.locator('tbody tr').first();await first.getByRole('button',{name:'Editar'}).click();
 const input=first.getByLabel('Nombre',{exact:true});
 await input.fill('A');await first.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.locator('.sii-catalog-error[role=alert]')).toBeVisible();
 await expect(input).toBeVisible();await expect(input).toHaveValue('A');
 await expect(input).toHaveAttribute('aria-invalid','true');
 await expect(input).toHaveAttribute('aria-describedby','catalog-mutation-error');
 await input.fill('Corrección sin perder borrador');await first.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Cambios guardados'})).toBeVisible();
 await expect(page.locator('tbody tr')).toHaveCount(50);await axe(page);
});
test('retrying a transient program load restores curriculum creation',async({page})=>{
 await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Retry program','ingenieria','presencial')",[institutionId,'RETRY'+suffix]);
 await catalog(page);let fail=true;
 await page.route('**/academic/programs?*',route=>fail?route.fulfill({status:503,contentType:'application/json',body:'{"error":{"code":"TEMPORARY"}}'}):route.continue());
 await page.getByRole('tab',{name:'Planes'}).click();
 await expect(page.locator('.sii-catalog-error[role=alert]')).toContainText('No se pudieron cargar los programas');
 fail=false;await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.locator('.sii-catalog-error[role=alert]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Guardar registro'})).toBeEnabled();
 await expect(page.getByLabel('Programa académico').locator('option')).toHaveCount(2);
});



test('a rejected archive keeps valid catalog rows available',async({page})=>{
 const parent=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Archive rejection fixture','ingenieria','presencial') RETURNING id",[institutionId,'ARCHIVE'+suffix])).rows[0];
 await sql.query("INSERT INTO curriculum_versions(institution_id,program_id,version) VALUES($1,$2,'active-plan')",[institutionId,parent.id]);
 await catalog(page);
 const row=page.locator('tbody tr').filter({hasText:'Archive rejection fixture'});
 await row.getByRole('button',{name:'Archivar'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Confirmar cambio'}).click();
 await expect(page.locator('.sii-catalog-error[role=alert]')).toContainText('planes activos');
 await expect(row).toBeVisible();await expect(row.getByText('Activo',{exact:true})).toBeVisible();
 await axe(page);
});


test('mobile drawer locks background scrolling and restores keyboard focus',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/login');
 await expect(page.getByLabel('Usuario institucional')).toHaveCSS('font-size','16px');
 await catalog(page);
 const trigger=page.getByRole('button',{name:'Abrir navegación'});
 await expect(trigger).toHaveCSS('min-height','44px');
 await trigger.click();
 await expect(page.locator('#sii-sidebar-mobile')).toBeVisible();
 await expect(page.locator('html')).toHaveCSS('overflow','hidden');
 await expect(page.locator('body')).toHaveCSS('overflow','hidden');
 await page.keyboard.press('Escape');
 await expect(page.locator('#sii-sidebar-mobile')).toBeHidden();
 await expect(page.locator('html')).not.toHaveCSS('overflow','hidden');
 await expect(page.locator('body')).not.toHaveCSS('overflow','hidden');
 await expect(trigger).toBeFocused();
});

test('premium desktop sidebar collapses, persists and mobile drawer stays accessible',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await catalog(page);
 const app=page.locator('.sii-app');
 const nav=page.getByRole('navigation',{name:'Navegación institucional'});
 await expect(nav.getByRole('link',{name:'Inicio',exact:true})).toBeVisible();
 const collapse=page.getByRole('button',{name:'Contraer menú lateral'});
 await expect(collapse).toHaveAttribute('aria-expanded','true');
 await collapse.click();
 await expect(app).toHaveClass(/sii-app--collapsed/);
 await expect(page.getByRole('button',{name:'Expandir menú lateral'})).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('.sii-nav-glyph').first()).toBeVisible();
 await expect.poll(async()=>(await page.context().cookies()).find(cookie=>cookie.name==='sidebar_state')?.value).toBe('false');
 await page.reload();
 await expect(app).toHaveClass(/sii-app--collapsed/);
 await page.getByRole('button',{name:'Expandir menú lateral'}).click();
 await expect(app).not.toHaveClass(/sii-app--collapsed/);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Abrir navegación'}).click();
 await expect(nav.getByRole('link',{name:'Inicio',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#sii-sidebar-mobile')).toBeHidden();
});

test('quick switch searches only available module links and closes with Escape',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await catalog(page);
 await page.keyboard.press('Control+k');
 const dialog=page.getByRole('dialog',{name:'Ir a un módulo'});
 await expect(dialog).toBeVisible();
 await page.getByRole('combobox',{name:'Buscar secciones'}).fill('seguridad');
 await expect(dialog.getByRole('link',{name:'Cuenta y seguridad'})).toBeVisible();
 await expect(dialog.getByRole('link',{name:'Administración institucional'})).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Buscar módulos'})).toBeFocused();
});

test('mobile kit navigation closes after routing and after leaving its breakpoint',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await catalog(page);
 await page.getByRole('button',{name:'Abrir navegación'}).click();
 await page.getByRole('navigation',{name:'Navegación institucional'}).getByRole('link',{name:'Cuenta y seguridad'}).click();
 await expect(page).toHaveURL(/\/dashboard\/security$/);
 await expect(page.locator('#sii-sidebar-mobile')).toBeHidden();
 await expect(page.locator('html')).not.toHaveCSS('overflow','hidden');
 await page.getByRole('button',{name:'Abrir navegación'}).click();
 await page.setViewportSize({width:1024,height:844});
 await expect(page.locator('#sii-sidebar-mobile')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#sii-sidebar-mobile')).toBeHidden();
 await expect(page.getByRole('button',{name:'Abrir navegación'})).toHaveAttribute('aria-expanded','false');
});
