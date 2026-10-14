import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
const sql=new pg.Client({connectionString:process.env.DATABASE_URL});
const suffix=randomUUID().slice(0,8),password='Synthetic-ui-password-2026!';
const username='qa-p0-'+suffix,student='qa-student-'+suffix;
let institutionId:string;
test.beforeAll(async()=>{
 await sql.connect();
 const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 institutionId=(await sql.query("INSERT INTO institutions(name,code) VALUES('QA P0 local — datos sintéticos',$1) RETURNING id",['UI'+suffix])).rows[0].id;
 for(const [name,role]of [[username,'admin'],[student,'student']]){
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
