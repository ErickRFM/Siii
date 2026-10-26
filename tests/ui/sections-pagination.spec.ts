import {test,expect} from '@playwright/test';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sectionsFixture} from '../support/sections-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
test.beforeAll(async()=>{await sql.connect()});test.afterAll(async()=>{await sql.end()});
test('operations and scheduling selectors reach every section beyond the former 200-row cap',async({page})=>{
 const fixture=await sectionsFixture(sql);
 const oldest=(await sql.query('SELECT id,code FROM academic_sections WHERE institution_id=$1 ORDER BY created_at,id LIMIT 1',[fixture.tenant])).rows[0];
 await page.goto('/login');await page.getByLabel('Usuario institucional').fill(fixture.username);await page.getByLabel('Contraseña',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Entrar al sistema'}).click();await expect(page).toHaveURL(/\/dashboard$/);
 await page.goto(`/dashboard/institutions/${fixture.tenant}/operations`);
 await expect(page.locator('tbody tr')).toHaveCount(205);
 await expect(page.getByText('Solo se muestran los primeros 200 registros.',{exact:true})).toHaveCount(0);
 for(const [tab,action] of [['Inscripciones','Inscribir estudiante'],['Asignaciones','Asignar docente']]){
  await page.getByRole('tab',{name:new RegExp(tab)}).click();
  await page.getByRole('button',{name:action,exact:true}).click();
  const sections=page.getByRole('dialog').getByLabel('Sección',{exact:true});
  await expect(sections.locator('option')).toHaveCount(206);await sections.selectOption(oldest.id);await expect(sections).toHaveValue(oldest.id);
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'Descartar cambios'}).click();
 }
 await page.goto(`/dashboard/institutions/${fixture.tenant}/scheduling`);
 await page.getByRole('button',{name:'Programar clase recurrente',exact:true}).click();
 const scheduling=page.getByRole('dialog').getByLabel('Sección',{exact:true});await expect(scheduling.locator('option')).toHaveCount(206);await scheduling.selectOption(oldest.id);await expect(scheduling).toHaveValue(oldest.id);
 await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Programar clase recurrente',exact:true}).click();await expect(scheduling.locator('option')).toHaveCount(206);
 expect((await sql.query('SELECT count(*)::int AS count FROM academic_sections WHERE institution_id=$1',[fixture.tenant])).rows[0].count).toBe(205);
});
