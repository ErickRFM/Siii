import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {academicRostersFixture} from '../support/academic-rosters-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
test.beforeAll(async()=>{await sql.connect()});test.afterAll(async()=>{await sql.end()});
test('operations loads and updates enrollments and assignments beyond the former 200-row cap',async({page})=>{
 const fixture=await academicRostersFixture(sql);
 const enrollment=(await sql.query("SELECT e.id,s.enrollment_number,g.code FROM section_enrollments e JOIN institutional_students s ON s.id=e.student_id JOIN academic_sections g ON g.id=e.section_id WHERE e.institution_id=$1 AND e.status='enrolled' ORDER BY e.created_at,e.id LIMIT 1",[fixture.tenant])).rows[0];
 const assignment=(await sql.query("SELECT a.id,t.employee_number,g.code FROM section_teachers a JOIN institutional_teachers t ON t.id=a.teacher_id JOIN academic_sections g ON g.id=a.section_id WHERE a.institution_id=$1 AND a.revoked_at IS NULL AND t.employee_number='TEACHER13' ORDER BY a.created_at,a.id LIMIT 1",[fixture.tenant])).rows[0];
 await page.goto('/login');await page.getByLabel('Usuario institucional').fill(fixture.username);await page.getByLabel('Contraseña',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Entrar al sistema'}).click();await expect(page).toHaveURL(/\/dashboard$/);
 await page.goto(`/dashboard/institutions/${fixture.tenant}/operations`);
 await page.getByRole('tab',{name:/Inscripciones/}).click();
 const enrollmentRows=page.locator('[role="tabpanel"] tbody tr');await expect(enrollmentRows).toHaveCount(208);
 // Match the complete identity cell and section: ROSTER13/TEACHER13 are
 // prefixes of 130..139, and the fixture also assigns some people to two sections.
 const enrollmentRow=enrollmentRows.filter({has:page.getByRole('cell',{name:enrollment.enrollment_number+' · Estudiante Sintético',exact:true})}).filter({has:page.getByRole('cell',{name:enrollment.code,exact:true})});await expect(enrollmentRow).toHaveCount(1);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 const withdrawalAction=enrollmentRow.getByRole('button',{name:'Retirar',exact:true});await withdrawalAction.click();
 const confirmation=page.getByRole('alertdialog',{name:'Confirmar cambio académico'});await expect(confirmation).toBeVisible();
 await expect(confirmation.getByRole('button',{name:'Volver sin cambios'})).toBeFocused();await page.keyboard.press('Escape');await expect(confirmation).toHaveCount(0);await expect(withdrawalAction).toBeFocused();
 const withdrawn=page.waitForResponse(response=>response.url().endsWith('/enrollments')&&response.request().method()==='PATCH');await withdrawalAction.click();await page.getByRole('alertdialog').getByRole('button',{name:'Aplicar cambio'}).click();expect((await withdrawn).status()).toBe(200);
 await expect(enrollmentRow).toContainText('Retirado');await expect(enrollmentRow.getByRole('button',{name:'Retirar',exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:/Asignaciones/}).click();
 const assignmentRows=page.locator('[role="tabpanel"] tbody tr');await expect(assignmentRows).toHaveCount(208);
 const assignmentRow=assignmentRows.filter({has:page.getByRole('cell',{name:assignment.employee_number+' · Docente Sintético',exact:true})}).filter({has:page.getByRole('cell',{name:assignment.code,exact:true})});await expect(assignmentRow).toHaveCount(1);
 const revoked=page.waitForResponse(response=>response.url().endsWith('/assignments')&&response.request().method()==='PATCH');await assignmentRow.getByRole('button',{name:'Revocar',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Aplicar cambio'}).click();expect((await revoked).status()).toBe(200);
 await expect(assignmentRows).toHaveCount(207);await expect(assignmentRow).toHaveCount(0);
 await page.reload();await page.getByRole('tab',{name:/Inscripciones/}).click();await expect(enrollmentRows).toHaveCount(208);await expect(enrollmentRow).toContainText('Retirado');
 await page.getByRole('tab',{name:/Asignaciones/}).click();await expect(assignmentRows).toHaveCount(207);await expect(page.locator('main [role="alert"]')).toHaveCount(0);
 expect((await sql.query('SELECT status FROM section_enrollments WHERE id=$1',[enrollment.id])).rows[0].status).toBe('withdrawn');
 expect((await sql.query('SELECT revoked_at FROM section_teachers WHERE id=$1',[assignment.id])).rows[0].revoked_at).not.toBeNull();
 expect((await sql.query("SELECT action FROM security_audit_log WHERE institution_id=$1 AND target=ANY($2::text[]) ORDER BY action",[fixture.tenant,['enrollment:'+enrollment.id,'assignment:'+assignment.id]])).rows.map(row=>row.action)).toEqual(['enrollment.withdraw','teacher.unassign']);
});
