import {personalNavigate} from '../support/personal-navigation';
import {test,expect,type Page} from '@playwright/test';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import {portalFixture,portalPassword} from '../support/portal-fixture';
import {isolatedDatabaseUrl} from '../support/database-url';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
test.beforeAll(async()=>{await sql.connect()});test.afterAll(async()=>{await sql.end()});
async function enter(page:Page,f:Awaited<ReturnType<typeof portalFixture>>){await page.goto('/login');await page.getByLabel('Usuario institucional').fill(f.teacher.username);await page.getByLabel('Contraseña',{exact:true}).fill(portalPassword);await page.getByRole('button',{name:'Entrar al sistema'}).click();await page.waitForURL(`**/dashboard/institutions/${f.tenant}/teacher`);await page.goto(`/dashboard/institutions/${f.tenant}/teacher`);}

test('teacher navigation has no agenda, opens minimum official roster and shows published final rather than draft',async({page})=>{
 const f=await portalFixture(sql),requests:string[]=[];page.on('request',r=>{if(r.url().includes('/portal/teacher/'))requests.push(r.url())});await enter(page,f);
 await expect(page.getByRole('heading',{name:'Docente oficial Asignado',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'Mi horario'})).toHaveCount(0);
 await personalNavigate(page,'Mis grupos');await page.getByRole('button',{name:'Lista oficial de SYS-101'}).click();
 await expect(page.getByRole('heading',{name:'Lista oficial',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Alumna propia Sintético',exact:true})).toBeVisible();await expect(page.getByRole('spinbutton')).toHaveCount(0);
 await page.getByRole('tab',{name:'Resultados y actas',exact:true}).click();await expect(page.getByRole('cell',{name:'8.50',exact:true})).toBeVisible();await expect(page.getByText('9.99',{exact:true})).toHaveCount(0);
 expect(requests.some(url=>url.includes('/schedule'))).toBe(false);await expect(page.getByRole('button',{name:/QR|asistencia|pase de lista/i})).toHaveCount(0);
 await personalNavigate(page,'Mi perfil');await expect(page.getByText('Número de empleado',{exact:true})).toBeVisible();await expect(page.getByText('Matrícula / número de empleado',{exact:true})).toHaveCount(0);
});
test('teacher mobile and desktop surfaces remain accessible without page overflow',async({page},info)=>{
 const f=await portalFixture(sql);await enter(page,f);await personalNavigate(page,'Mis grupos');await expect(page.getByRole('button',{name:'Lista oficial de SYS-101'})).toBeVisible();
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`teacher-${width}.png`),fullPage:true});}
 expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>['critical','serious'].includes(v.impact??''))).toEqual([]);
 await page.setViewportSize({width:320,height:900});await page.getByRole('button',{name:'Evaluar SYS-101'}).click();await expect(page.getByRole('heading',{name:'Libro de calificaciones'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('saved teacher grade draft survives reload; closed term remains read-only',async({page})=>{
 const f=await portalFixture(sql);await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.tenant,f.otherSection,f.teacherId]);await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3)',[f.tenant,f.otherSection,f.studentId]);
 await sql.query("INSERT INTO assessment_components(institution_id,section_id,code,title,weight) VALUES($1,$2,'FINAL','Evaluación integral',100)",[f.tenant,f.otherSection]);const enrollment=(await sql.query('SELECT enrollment_number FROM institutional_students WHERE id=$1',[f.studentId])).rows[0].enrollment_number;
 await enter(page,f);await personalNavigate(page,'Mis grupos');await page.getByRole('button',{name:'Evaluar SYS-202'}).click();
 const input=page.getByLabel(enrollment+' · Evaluación integral',{exact:true});await expect(input).toBeVisible();await input.fill('8.25');await input.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByText('Operación guardada correctamente.')).toBeVisible();
 await page.reload();await personalNavigate(page,'Mis grupos');await page.getByRole('button',{name:'Evaluar SYS-202'}).click();await expect(input).toHaveValue('8.25');await expect(page.getByText(/Última persistencia confirmada/)).toBeVisible();
 await sql.query("UPDATE academic_terms SET status='inactive' WHERE id=$1",[f.term]);await page.reload();await personalNavigate(page,'Mis grupos');await page.getByRole('button',{name:'Evaluar SYS-202'}).click();await expect(page.getByText(/Periodo cerrado.*consulta/)).toBeVisible();await expect(page.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);
});
test('unlinked and offline states give truthful recovery guidance',async({page})=>{
 const f=await portalFixture(sql);await sql.query('UPDATE teacher_account_links SET revoked_at=now() WHERE membership_id=$1',[f.teacher.member]);await enter(page,f);await expect(page.getByText('Perfil docente aún sin vincular',{exact:true})).toBeVisible();await personalNavigate(page,'Mis grupos');await expect(page.locator('.sii-teacher-navigation [role="tab"]').filter({hasText:'Evaluaciones'})).toBeDisabled();
 await page.context().setOffline(true);await expect(page.getByRole('alert').filter({hasText:'Sin conexión'})).toBeVisible();await page.context().setOffline(false);await expect(page.getByText('Perfil docente aún sin vincular',{exact:true})).toBeVisible();
});

test('closing a period preserves a pending capture visibly until explicit discard',async({page})=>{
 const f=await portalFixture(sql);await sql.query('DELETE FROM final_grades WHERE publication_id=$1',[f.publication]);await sql.query('DELETE FROM grade_publications WHERE id=$1',[f.publication]);await enter(page,f);await personalNavigate(page,'Mis grupos');await page.getByRole('button',{name:'Evaluar SYS-101'}).click();
 const enrollment=(await sql.query('SELECT enrollment_number FROM institutional_students WHERE id=$1',[f.studentId])).rows[0].enrollment_number,input=page.getByLabel(enrollment+' · Evaluación final',{exact:true});await input.fill('6.25');await sql.query("UPDATE academic_terms SET status='inactive' WHERE id=$1",[f.term]);
 await input.locator('..').locator('..').getByRole('button',{name:'Guardar',exact:true}).click();await page.locator('.sii-academic').getByRole('button',{name:'Reintentar consulta',exact:true}).click();
 const excluded=page.getByRole('region',{name:'Captura local fuera del listado'});await expect(excluded).toContainText('6.25');await excluded.getByRole('button',{name:/Descartar captura/}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Descartar captura',exact:true}).click();await expect(excluded).toHaveCount(0);
});
test('an unavailable explicit group never silently opens another roster',async({page})=>{
 const f=await portalFixture(sql);await enter(page,f);await page.goto(`/dashboard/institutions/${f.tenant}/grading?sectionId=${f.otherSection}`);await expect(page.getByText('El grupo solicitado ya no está disponible o no tienes autorización. Selecciona otro grupo.')).toBeVisible();await expect(page.getByLabel('Materia y grupo asignado')).toHaveValue('');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0);
});
