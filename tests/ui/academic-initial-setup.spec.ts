import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-academic-setup-2026!';let hash:string;
test.beforeAll(async()=>{await sql.connect();hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1})});
test.afterAll(async()=>{await sql.end()});
async function catalog(page:Page,role='coordinator',scoped=false){
 await sql.query('DELETE FROM auth_throttle');const suffix=randomUUID().slice(0,8),username='setup-'+suffix;
 const tenant=(await sql.query("INSERT INTO institutions(name,code) VALUES('QA guía académica',$1) RETURNING id",['SET'+suffix])).rows[0].id;
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('QA','Guía') RETURNING id")).rows[0].id;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,user])).rows[0].id;
 if(scoped){
  const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'OWN','Programa propio','ingenieria','presencial') RETURNING id",[tenant])).rows[0].id;
  const other=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'OTHER','Programa ajeno','ingenieria','presencial') RETURNING id",[tenant])).rows[0].id;
  await sql.query("INSERT INTO curriculum_versions(institution_id,program_id,version) VALUES($1,$2,'OTRO-2026')",[tenant,other]);
  await sql.query("INSERT INTO role_assignments(membership_id,role,institution_id,scope_type,scope_program_id) VALUES($1,$2,$3,'program',$4)",[member,role,tenant,program]);
 }else await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,role]);
 await page.goto('/login');await page.getByLabel('Usuario institucional').fill(username);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar al sistema'}).click();await expect(page).toHaveURL(/\/dashboard$/);
 await page.goto('/dashboard/institutions/'+tenant+'/academic');return tenant;
}
test('empty setup opens the existing form, persists a campus and survives reload',async({page})=>{
 const tenant=await catalog(page);const guide=page.getByRole('region',{name:'Preparación inicial de catálogos'});
 await expect(guide.getByText('Sin registros en tu ámbito',{exact:true})).toHaveCount(5);
 await guide.getByRole('button',{name:'Abrir Campus',exact:true}).click();await expect(page.getByRole('tab',{name:'Campus',exact:true})).toBeFocused();
 await page.getByLabel('Clave',{exact:true}).fill('CAMPUS-QA');await page.getByLabel('Nombre',{exact:true}).fill('Campus de prueba');
 const saved=page.waitForResponse(response=>response.url().endsWith('/academic/campuses')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Guardar registro'}).click();expect((await saved).status()).toBe(201);
 await expect(guide.getByRole('listitem').filter({hasText:'Campus'})).toContainText('Con registros');
 expect((await sql.query('SELECT code FROM campuses WHERE institution_id=$1',[tenant])).rows).toEqual([{code:'CAMPUS-QA'}]);
 await page.reload();await expect(guide.getByRole('listitem').filter({hasText:'Campus'})).toContainText('Con registros');
 await expect(guide.getByText('Sin registros en tu ámbito',{exact:true})).toHaveCount(4);
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(result.violations).toEqual([]);
});
test('a failed presence request stays unknown until retry succeeds',async({page})=>{
 let fail=true;await page.route('**/academic/campuses?limit=1',route=>fail?route.fulfill({status:503,contentType:'application/json',body:'{"error":{"code":"TEMPORARY"}}'}):route.continue());
 await catalog(page);const guide=page.getByRole('region',{name:'Preparación inicial de catálogos'}),campus=guide.getByRole('listitem').filter({hasText:'Campus'});
 await expect(campus).toContainText('No se pudo consultar');await expect(campus).not.toContainText('Sin registros');
 fail=false;await campus.getByRole('button',{name:'Reintentar Campus'}).click();await expect(campus).toContainText('Sin registros en tu ámbito');
});
test('read-only users can consult setup without acquiring create controls',async({page})=>{
 await catalog(page,'student');const guide=page.getByRole('region',{name:'Preparación inicial de catálogos'});
 await expect(guide.getByText('Sin registros en tu ámbito',{exact:true})).toHaveCount(5);
 await guide.getByRole('button',{name:'Abrir Programas',exact:true}).click();await expect(page.getByRole('tab',{name:'Programas',exact:true})).toBeFocused();
 await expect(page.getByRole('button',{name:'Guardar registro'})).toHaveCount(0);await expect(guide.getByText('Solo consulta',{exact:true})).toHaveCount(5);
});


test('presence stays within a program grant and never queries unreadable catalogs',async({page})=>{
 const unreadable:string[]=[];
 page.on('request',request=>{if(/academic\/(campuses|courses|terms)\?limit=1$/.test(request.url()))unreadable.push(request.url())});
 await catalog(page,'coordinator',true);const guide=page.getByRole('region',{name:'Preparación inicial de catálogos'});
 await expect(guide.getByRole('listitem').filter({hasText:'Programas'})).toContainText('Con registros');
 await expect(guide.getByRole('listitem').filter({hasText:'Planes'})).toContainText('Sin registros en tu ámbito');
 await expect(guide.getByText('Sin permiso de consulta',{exact:true})).toHaveCount(3);expect(unreadable).toEqual([]);
 await expect(guide.getByRole('button',{name:'Abrir Campus',exact:true})).toHaveCount(0);
 await guide.getByRole('button',{name:'Abrir Programas',exact:true}).click();await expect(page.getByRole('button',{name:'Guardar registro'})).toHaveCount(0);
});
