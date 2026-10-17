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
 const sections=page.getByLabel(/^Sección/);await expect(sections).toHaveCount(2);
 for(let index=0;index<2;index++){
  await expect(sections.nth(index).locator('option')).toHaveCount(206);await sections.nth(index).selectOption(oldest.id);await expect(sections.nth(index)).toHaveValue(oldest.id);
 }
 await page.goto(`/dashboard/institutions/${fixture.tenant}/scheduling`);
 const scheduling=page.getByLabel(/^Sección/);await expect(scheduling.locator('option')).toHaveCount(206);await scheduling.selectOption(oldest.id);await expect(scheduling).toHaveValue(oldest.id);
 await expect(page.locator('main [role="alert"]')).toHaveCount(0);
 await page.reload();await expect(scheduling.locator('option')).toHaveCount(206);
 expect((await sql.query('SELECT count(*)::int AS count FROM academic_sections WHERE institution_id=$1',[fixture.tenant])).rows[0].count).toBe(205);
});
