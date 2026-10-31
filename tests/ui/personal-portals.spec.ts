import {personalNavigate} from '../support/personal-navigation';
import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import {createHash,randomBytes} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {portalFixture,portalPassword} from '../support/portal-fixture';
import {digestRecoveryCode} from '../../src/shared/auth/mfa-primitives';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
let f:Awaited<ReturnType<typeof portalFixture>>;
test.beforeAll(async()=>{await sql.connect();f=await portalFixture(sql)});
test.afterAll(async()=>{await sql.end()});
test.beforeEach(async()=>{await sql.query('DELETE FROM auth_throttle')});
async function login(page:Page,actor=f.student){
 let recovery='';if(actor===f.admin){const factor=(await sql.query('SELECT id FROM auth_mfa_factors WHERE user_id=$1',[actor.id])).rows[0].id;recovery=randomBytes(16).toString('hex').toUpperCase();await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[actor.id,factor,digestRecoveryCode(recovery,actor.id)])}
 await page.goto('/login');await page.getByLabel('Usuario institucional').fill(actor.username);await page.getByLabel('Contraseña',{exact:true}).fill(portalPassword);await page.getByRole('button',{name:'Entrar al sistema'}).click();
 if(recovery){await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();await page.getByLabel('Código de recuperación',{exact:true}).fill(recovery);await page.getByRole('button',{name:'Verificar y entrar'}).click()}
 await expect(page).toHaveURL(actor===f.admin?/\/dashboard$/:new RegExp(`/dashboard/institutions/${f.tenant}/(?:student|teacher)`));
}
test('student opens personal attendance and sees unavailable service distinctly from empty history',async({page})=>{
 await sql.query('INSERT INTO academic_section_versions(institution_id,section_id,source_version) VALUES($1,$2,1) ON CONFLICT DO NOTHING',[f.tenant,f.section]);
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);
 await personalNavigate(page,'Académico');await page.getByRole('link',{name:'Mi historial de asistencia',exact:true}).click();
 await expect(page.getByRole('heading',{name:/^Mi historial de asistencia/})).toBeVisible();
 await expect(page.getByRole('region',{name:'Consulta personal de asistencia'}).getByRole('alert')).toContainText('no está disponible');
 await expect(page.getByText('No hay asistencias disponibles')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});
test('personal attendance discards a response completed after logout submission',async({page})=>{
 await sql.query('INSERT INTO academic_section_versions(institution_id,section_id,source_version) VALUES($1,$2,1) ON CONFLICT DO NOTHING',[f.tenant,f.section]);
 await login(page);
 const token=(await page.context().cookies()).find(cookie=>cookie.name==='siii_session'||cookie.name==='__Host-siii_session')!.value;
 const session=(await sql.query('SELECT id FROM auth_sessions WHERE token_hash=$1',[createHash('sha256').update(token).digest('hex')])).rows[0].id;
 const discriminator=createHash('sha256').update(f.student.id+':'+session).digest('hex');
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});let requested!:()=>void;const received=new Promise<void>(resolve=>{requested=resolve});
 await page.route('**/companion-attendance/mine',async route=>{requested();await held;await route.fulfill({status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-siii-attendance-session':discriminator},body:JSON.stringify({data:{contract:'siii.attendance_history.v1',observedAtEpochSeconds:Math.floor(Date.now()/1000),sampleLimit:100,records:[{auditRecordId:'a'.repeat(64),sessionId:'synthetic',sectionId:f.section,occurrenceDate:'2026-10-26',status:'review_required',disposition:null}]}})}).catch(()=>{})});
 await page.goto(`/dashboard/institutions/${f.tenant}/student/attendance`);await received;
 // Keep this page mounted while native logout navigation is pending.
 await page.route('**/api/v1/auth/logout',async()=>{});
 await page.evaluate(()=>{const form=document.createElement('form');form.method='post';form.action='/api/v1/auth/logout';document.body.append(form);form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 release();await expect(page.getByRole('button',{name:'Actualizar asistencia'})).toBeEnabled();
 await expect(page.getByRole('region',{name:'Consulta personal de asistencia'}).getByText('Revisión pendiente',{exact:true})).toHaveCount(0);
});
test('student consults official own academic records in both themes across all requested widths',async({page})=>{
 test.setTimeout(180000);await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);
 await expect(page.getByRole('heading',{name:'Alumna propia Sintético'})).toBeVisible();await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 await personalNavigate(page,'Académico');await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Mis docentes',exact:true}).click();await expect(page.getByRole('cell').getByText('Docente oficial Asignado',{exact:true})).toBeVisible();await expect(page.getByRole('tabpanel').last()).not.toContainText('private-teacher');
 await page.getByRole('tab',{name:'Calificaciones e historial',exact:true}).click();await expect(page.getByRole('tabpanel').last()).toContainText('8.50');await expect(page.getByRole('tabpanel').last()).not.toContainText('9.99');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar historial informativo'}).click();expect((await download).suggestedFilename()).toMatch(/historial-informativo.*\.csv$/);
 await expect(page.getByRole('region',{name:'Calendario semanal'})).toHaveCount(0);await expect(page.getByRole('button',{name:/Cancelar clase/})).toHaveCount(0);
 for(const theme of ['light','dark']){
  if(await page.locator('html').getAttribute('data-sii-theme')!==theme)await page.getByRole('button',{name:theme==='dark'?'Activar tema oscuro':'Activar tema claro'}).click();
  for(const width of [360,390,430,768,1024,1366,1600,1920]){
   await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
   if(width===360){expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);await page.screenshot({path:`.p0-local/vnext-institutional/student-${theme}-${width}.png`,fullPage:true})}
  }
 }
});
test('approved glass student overview stays readable and without overflow on mobile and desktop',async({page})=>{
 await login(page);await page.goto('/dashboard/institutions/'+f.tenant+'/student');
 await expect(page.locator('.siii-student-dashboard')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Calificaciones recientes'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Estado de cuenta'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Mis trámites'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Calendario'})).toBeVisible();
 for(const theme of ['dark','light']){
  const current=await page.locator('html').getAttribute('data-sii-theme');
  if(current!==theme)await page.getByRole('button',{name:theme==='light'?'Activar tema claro':'Activar tema oscuro'}).click();
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
   await expect(page.locator('.siii-student-dashboard')).toBeVisible();
   if(width===390||width===1440)await page.screenshot({path:`.p0-local/pr120-evidence/student-${theme}-${width}.png`,fullPage:true});
  }
 }
});
test('V3 student home stays institutional and loads only dashboard resources',async({page})=>{
 const resources:string[]=[];page.on('request',request=>{const match=request.url().match(/\/portal\/student\/([^?]+)/);if(match)resources.push(match[1])});
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 await expect(page.getByText('Próximas clases registradas',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('tab',{name:'Mi horario',exact:true})).toHaveCount(0);
 const academicGroup=page.getByRole('navigation',{name:'Navegación institucional'}).locator('.siii-personal-nav-group').filter({hasText:'Carga académica'});
 await expect(academicGroup).toHaveCount(1);await academicGroup.locator('summary').click();
 await expect(page.getByRole('navigation',{name:'Navegación institucional'}).getByRole('link',{name:'Carga académica',exact:true})).toBeVisible();
 expect(resources).not.toContain('schedule');expect(resources).toContain('grades');expect(resources).not.toContain('payments');expect(resources).not.toContain('teachers');
 await personalNavigate(page,'Académico');await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Calificaciones e historial',exact:true}).click();await expect(page.getByRole('tabpanel').last()).toContainText('8.50');
});
test('student sidebar opens real academic and finance sections without duplicating operational schedules',async({page})=>{
 await login(page);await page.goto('/dashboard/institutions/'+f.tenant+'/student');
 await personalNavigate(page,'Calificaciones');
 await expect(page.locator('.sii-personal-navigation [role="tab"][data-state="active"]')).toContainText('Académico');
 await expect(page.getByRole('tab',{name:'Calificaciones e historial',exact:true})).toHaveAttribute('data-state','active');
 await personalNavigate(page,'Estado de cuenta');
 await expect(page.locator('.sii-personal-navigation [role="tab"][data-state="active"]')).toContainText('Finanzas');
});
test('V3 revalidation preserves displayed records and search while a valid profile is checked',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve});
 await page.route('**/portal/student/profile',async route=>{const response=await route.fetch();await gate;await route.fulfill({response})});
 try{await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Actualizando'})).toBeVisible()}finally{release()}
});
test('V3 refresh keeps the academic search and a denied collection removes all private content',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await personalNavigate(page,'Académico');
 const search=page.getByRole('searchbox',{name:'Buscar en inscripciones'});await search.fill('Álgebra');
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.getByRole('button',{name:'Actualizar mi información'})).toBeEnabled();await expect(search).toHaveValue('Álgebra');await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toBeVisible();
 await page.route('**/portal/student/courses',route=>route.fulfill({status:403,json:{error:'FORBIDDEN'}}));
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.locator('main [role="alert"]')).toContainText('acceso');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0);await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toHaveCount(0);
});
test('V3 rejects a different actor response and a different context on a later collection page',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 await page.route('**/portal/student/profile',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'x-siii-portal-actor':f.secondStudent.id}})});
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.locator('main [role="alert"]')).toContainText('acceso');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0);
 await page.unroute('**/portal/student/profile');await personalNavigate(page,'Académico');await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toBeVisible();
 await page.route('**/portal/student/courses*',async route=>{const response=await route.fetch();if(new URL(route.request().url()).searchParams.has('cursor'))await route.fulfill({response,headers:{...response.headers(),'x-siii-portal-context':'another-context'}});else{const body=await response.json();await route.fulfill({response,json:{...body,page:{nextCursor:'synthetic-next-page'}}})}});
 // Route the synthetic cursor through the real authorized first page, changing
 // only transport metadata. The consumer must reject before using its body.
 await page.route('**/portal/student/courses?cursor=*',async route=>{const response=await route.fetch({url:route.request().url().split('?')[0]});await route.fulfill({response,headers:{...response.headers(),'x-siii-portal-context':'another-context'}})});
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.locator('main [role="alert"]')).toContainText('acceso');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0);
});
test('V3 mobile destinations remain keyboard accessible and clear records offline',async({page,context})=>{
 await page.setViewportSize({width:360,height:800});await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Abrir navegación',exact:true}).focus();await page.keyboard.press('Enter');
 const drawer=page.getByRole('dialog');await expect(drawer).toBeVisible();
 const disclosure=drawer.locator('.siii-personal-nav-group').filter({hasText:'Carga académica'}).locator('summary');
 await disclosure.focus();await page.keyboard.press('Enter');
 const academic=drawer.getByRole('link',{name:'Carga académica',exact:true});await expect(academic).toBeVisible();await academic.focus();await page.keyboard.press('Enter');await expect(drawer).toHaveCount(0);
 const navigation=page.getByRole('tablist',{name:'Navegación estudiantil'});await expect(navigation.getByRole('tab',{name:'Académico',exact:true})).toHaveAttribute('data-state','active');
 await expect(page.getByRole('searchbox',{name:'Buscar en inscripciones'})).toBeVisible();await expect(page.getByRole('cell')).toHaveCount(0);
 for(const name of ['Inicio','Académico','Finanzas','Servicios','Perfil']){const box=await navigation.getByRole('tab',{name,exact:true}).boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44);expect(box?.width).toBeGreaterThanOrEqual(44)}
 await context.setOffline(true);await expect(page.locator('main [role="alert"]')).toContainText('Sin conexión');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0);await context.setOffline(false);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
});
test('V3 student catalog offers consultation without administrative setup or mutations',async({page})=>{
 await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality,status) VALUES($1,'INACTIVE-V3','Programa inactivo V3','ingenieria','presencial','inactive')",[f.tenant]);
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/academic`);
 await expect(page.getByRole('heading',{name:'Catálogo académico.'})).toBeVisible();
 await expect(page.getByRole('cell',{name:'Ingeniería de Sistemas',exact:false})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Preparación inicial de catálogos'})).toHaveCount(0);
 await expect(page.getByText('Administra programas, materias, campus, periodos y versiones de planes.',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Crear|Archivar|Editar/})).toHaveCount(0);
 await expect(page.getByRole('cell',{name:'Programa inactivo V3',exact:false})).toHaveCount(0);
 await page.getByRole('checkbox',{name:'Incluir registros inactivos y archivados'}).check();await expect(page.getByRole('cell',{name:'Programa inactivo V3',exact:false})).toBeVisible();
});
test('V3 focus revalidates an account relink immediately even after a recent load',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 const replacement=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,'V3-RELINK','Expediente nuevo','Sintético') RETURNING id",[f.tenant,f.program])).rows[0].id;
 await sql.query('UPDATE student_account_links SET student_id=$1 WHERE membership_id=$2',[replacement,f.student.member]);
 try{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('Expediente nuevo Sintético',{exact:true})).toBeVisible();await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0)}finally{await sql.query('UPDATE student_account_links SET student_id=$1 WHERE membership_id=$2',[f.studentId,f.student.member])}
});
for(const departure of ['hidden','blur'] as const)test(`V3 return after ${departure} discards its earlier pending profile response`,async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 let release=()=>{},ready=()=>{},done=()=>{},hold=true;const gate=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{ready=resolve}),finished=new Promise<void>(resolve=>{done=resolve});
 await page.route('**/portal/student/profile',async route=>{const response=await route.fetch();if(hold){hold=false;ready();await gate;try{await route.fulfill({response})}catch{/* The hidden page must abort its earlier pending request. */}finally{done()}}else await route.fulfill({response})});
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await started;
 await page.evaluate(mode=>{if(mode==='hidden'){Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))}else window.dispatchEvent(new Event('blur'))},departure);
 const replacement=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,'Expediente al volver','Sintético') RETURNING id",[f.tenant,f.program,'V3-'+departure.toUpperCase()])).rows[0].id;
 await sql.query('UPDATE student_account_links SET student_id=$1 WHERE membership_id=$2',[replacement,f.student.member]);
 try{await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))});await expect(page.getByText('Expediente al volver Sintético',{exact:true})).toBeVisible();release();await finished;await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0)}finally{release();await sql.query('UPDATE student_account_links SET student_id=$1 WHERE membership_id=$2',[f.studentId,f.student.member])}
});
test('teacher sees only assigned groups and can open the existing real gradebook',async({page})=>{
 await login(page,f.teacher);await page.goto(`/dashboard/institutions/${f.tenant}/teacher`);await expect(page.getByRole('heading',{name:'Docente oficial Asignado'})).toBeVisible();
 await expect(page.getByRole('tabpanel')).toContainText('SYS-101');await expect(page.getByRole('tabpanel')).not.toContainText('SYS-202');
 await personalNavigate(page,'Mis grupos');await page.getByRole('button',{name:'Evaluar SYS-101'}).click();await expect(page.getByRole('heading',{name:'Libro de calificaciones'})).toBeVisible();
});
test('cashier records an external payment once and student sees its persistent statement',async({page,browser})=>{
 await login(page,f.admin);await page.goto(`/dashboard/institutions/${f.tenant}/financials`);await expect(page.getByRole('heading',{name:'Caja y finanzas.'})).toBeVisible();
 const number=(await sql.query('SELECT order_number FROM payment_orders WHERE id=$1',[f.orderId])).rows[0].order_number;
 const row=page.getByRole('row').filter({hasText:number});await row.getByRole('button',{name:'Registrar pago',exact:true}).click();
 await page.getByLabel('Importe recibido (MXN)').fill('100.00');await page.getByLabel('Método de pago').selectOption('transfer');await page.getByLabel('Referencia externa').fill('BANK-VNEXT-UI');
 await page.getByRole('button',{name:'Revisar pago',exact:true}).click();await page.getByRole('button',{name:'Confirmar registro del pago',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Pago registrado'})).toBeVisible();await expect(row).toContainText('Pagada');
 expect((await sql.query('SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1',[f.orderId])).rows[0].n).toBe(1);
 const context=await browser.newContext();try{const student=await context.newPage();await login(student);await student.goto(`/dashboard/institutions/${f.tenant}/student`);await personalNavigate(student,'Finanzas');await expect(student.getByRole('tabpanel')).toContainText('Pagada');await expect(student.getByRole('tabpanel')).toContainText('BANK-VNEXT-UI')}finally{await context.close()}
});
test('revoked personal membership clears displayed data on revalidation and offers an honest error',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 await sql.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[f.student.member]);
 try{await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.locator('main [role="alert"]')).toContainText('acceso');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0)}finally{await sql.query("UPDATE institution_memberships SET status='active' WHERE id=$1",[f.student.member])}
});
test('teacher deep link selects the requested authorized group instead of the remembered group',async({page})=>{
 const teacher=(await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,'EMP-DEEP','Docente','Multigrupo') RETURNING id",[f.tenant])).rows[0].id;
 await sql.query('INSERT INTO teacher_account_links(institution_id,membership_id,teacher_id) VALUES($1,$2,$3)',[f.tenant,f.secondTeacher.member,teacher]);
 await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$4),($1,$3,$4)',[f.tenant,f.section,f.otherSection,teacher]);
 await login(page,f.secondTeacher);await page.goto(`/dashboard/institutions/${f.tenant}/grading`);
 const remembered=await page.getByLabel('Materia y grupo asignado').inputValue();const requested=remembered===f.section?f.otherSection:f.section,code=requested===f.section?'SYS-101':'SYS-202';
 await page.goto(`/dashboard/institutions/${f.tenant}/teacher`);await personalNavigate(page,'Mis grupos');await page.getByRole('button',{name:'Evaluar '+code}).click();await expect(page.getByLabel('Materia y grupo asignado')).toHaveValue(requested);
});
test('late movements response cannot fill the drawer of another order',async({page})=>{
 await login(page,f.admin);const numbers=(await sql.query('SELECT id,order_number FROM payment_orders WHERE id=ANY($1::uuid[])',[[f.orderId,f.otherOrderId]])).rows;
 await sql.query("INSERT INTO payment_transactions(institution_id,order_id,transaction_number,amount_cents,payment_method,reference,received_by) VALUES($1,$2,$3,500,'cash','MOVEMENT-A',$4),($1,$5,$6,500,'cash','MOVEMENT-B',$4)",[f.tenant,f.orderId,'UI-A-'+f.orderId,f.admin.id,f.otherOrderId,'UI-B-'+f.otherOrderId]);
 let release=()=>{},ready=()=>{},done=()=>{};const gate=new Promise<void>(resolve=>{release=resolve}),started=new Promise<void>(resolve=>{ready=resolve}),finished=new Promise<void>(resolve=>{done=resolve});
 await page.route(`**/orders/${f.orderId}/payments`,async route=>{const response=await route.fetch();ready();await gate;try{await route.fulfill({response})}catch{/* A closed drawer is allowed to abort its pending request. */}finally{done()}});
 await page.goto(`/dashboard/institutions/${f.tenant}/financials`);
 await page.getByRole('row').filter({hasText:numbers.find(row=>row.id===f.orderId).order_number}).getByRole('button',{name:'Movimientos',exact:true}).click();await started;
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('row').filter({hasText:numbers.find(row=>row.id===f.otherOrderId).order_number}).getByRole('button',{name:'Movimientos',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('MOVEMENT-B');
 release();await finished;await expect(page.getByRole('dialog')).not.toContainText('MOVEMENT-A');await expect(page.getByRole('dialog')).toContainText('MOVEMENT-B');
});
test('denied cashier payment retires the private order and student list',async({page})=>{
 await login(page,f.admin);await page.goto(`/dashboard/institutions/${f.tenant}/financials`);const number=(await sql.query('SELECT order_number FROM payment_orders WHERE id=$1',[f.otherOrderId])).rows[0].order_number;
 await page.getByRole('row').filter({hasText:number}).getByRole('button',{name:'Registrar pago',exact:true}).click();await page.getByLabel('Importe recibido (MXN)').fill('1.00');await page.getByRole('button',{name:'Revisar pago',exact:true}).click();
 await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[f.admin.grant]);
 try{await page.getByRole('button',{name:'Confirmar registro del pago',exact:true}).click();await expect(page.locator('main [role="alert"]')).toContainText('acceso');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText(number,{exact:true})).toHaveCount(0)}finally{await sql.query('UPDATE role_assignments SET revoked_at=null WHERE id=$1',[f.admin.grant])}
});
test('teacher and treasury personal workspaces remain usable across both themes and all requested widths',async({page})=>{
 test.setTimeout(180000);
 for(const [kind,actor] of [['teacher',f.teacher],['financials',f.admin]] as const){
  await login(page,actor);await page.goto(`/dashboard/institutions/${f.tenant}/${kind}`);await expect(page.getByRole('tabpanel')).toBeVisible();
  for(const theme of ['light','dark']){
   if(await page.locator('html').getAttribute('data-sii-theme')!==theme)await page.getByRole('button',{name:theme==='dark'?'Activar tema oscuro':'Activar tema claro'}).click();
   for(const width of [360,390,768,1024,1366,1600,1920]){
    await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
    if(kind==='teacher'&&(width===390||width===1366))await page.screenshot({path:`.p0-local/pr120-evidence/teacher-${theme}-${width}.png`,fullPage:true});
    if(width===360){expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);await page.screenshot({path:`.p0-local/vnext-institutional/${kind}-${theme}-${width}.png`,fullPage:true})}
   }
  }
 }
});

test('student official tables support accessible desktop and mobile sorting',async({page})=>{
 await login(page);
 await page.goto(`/dashboard/institutions/${f.tenant}/student`);
 await personalNavigate(page,'Académico');
 const region=page.getByRole('region',{name:'Inscripciones'});
 const firstHeader=region.getByRole('columnheader').first();
 await expect(firstHeader).toHaveAttribute('aria-sort','none');
 const sort=region.getByRole('button',{name:'Ordenar por Materia'});
 await sort.click();
 await expect(firstHeader).toHaveAttribute('aria-sort','ascending');
 await sort.click();
 await expect(firstHeader).toHaveAttribute('aria-sort','descending');
 await page.setViewportSize({width:390,height:844});
 const mobileSort=page.getByRole('combobox',{name:'Ordenar Inscripciones'});
 await expect(mobileSort).toBeVisible();
 await mobileSort.selectOption({label:'Materia'});
 await expect(page.getByRole('button',{name:'Cambiar a orden descendente'})).toBeEnabled();
 await expect(page.getByRole('region',{name:'Inscripciones'}).locator('dl').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
});


test('mobile personal interiors keep header and academic records readable in both themes',async({page})=>{
 test.setTimeout(180000);
 await login(page);
 await page.goto('/dashboard/institutions/'+f.tenant+'/student');
 await personalNavigate(page,'Académico');
 await expect(page.getByRole('tab',{name:'Mis docentes',exact:true})).toBeVisible();
 for(const theme of ['light','dark'] as const){
  if(await page.locator('html').getAttribute('data-sii-theme')!==theme){
   await page.getByRole('button',{name:theme==='light'?'Activar tema claro':'Activar tema oscuro'}).click();
  }
  for(const width of [320,360,390,430,768]){
   await page.setViewportSize({width,height:844});
   await expect(page.getByRole('heading',{name:'Mi vida universitaria'})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
   const rectangles=await page.evaluate(()=>{
    const top=document.querySelector('#siii-personal .sii-topbar')?.getBoundingClientRect();
    const heading=document.querySelector('#siii-personal .sii-student-portal .sii-kit-page-heading h1')?.getBoundingClientRect();
    const tabs=document.querySelector('#siii-personal .siii-academic-tabs')?.getBoundingClientRect();
    const main=document.querySelector('#siii-personal .sii-page')?.getBoundingClientRect();
    return {top:top?.bottom??0,heading:heading?.top??-1,headingRight:heading?.right??Infinity,tabsRight:tabs?.right??Infinity,mainRight:main?.right??Infinity};
   });
   expect(rectangles.heading).toBeGreaterThanOrEqual(rectangles.top-2);
   expect(rectangles.headingRight).toBeLessThanOrEqual(width+2);
   expect(rectangles.tabsRight).toBeLessThanOrEqual(width+2);
   expect(rectangles.mainRight).toBeLessThanOrEqual(width+2);
   if(width===390){
    await expect(page.locator('.siii-personal-mobile-records .siii-personal-record').first()).toBeVisible();
    await expect(page.locator('.siii-personal-mobile-records .siii-personal-record-label').first()).toBeVisible();
    await expect(page.getByRole('navigation',{name:'Accesos académicos'})).toBeVisible();
   }
  }
 }
});

test('teacher portal mobile groups keep cards and toolbar within viewport',async({page})=>{
 await login(page,f.teacher);
 await page.goto('/dashboard/institutions/'+f.tenant+'/teacher');
 await personalNavigate(page,'Mis grupos');
 for(const width of [320,390,430,768]){
  await page.setViewportSize({width,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
  const header=await page.locator('#siii-personal .sii-topbar').boundingBox();
  const heading=await page.getByRole('heading',{name:'Mi docencia'}).boundingBox();
  if(width<768)expect(heading!.y).toBeGreaterThanOrEqual(header!.y+header!.height-2);
 }
});


test('borderless personal panels and fully visible mobile student tabs',async({page})=>{
 test.setTimeout(180000);
 await login(page);
 await page.goto('/dashboard/institutions/'+f.tenant+'/student');
 const hero=page.locator('#siii-personal .siii-overview-hero');
 await expect(hero).toBeVisible();
 for(const theme of ['dark','light'] as const){
  if(await page.locator('html').getAttribute('data-sii-theme')!==theme){
   await page.getByRole('button',{name:theme==='dark'?'Activar tema oscuro':'Activar tema claro'}).click();
  }
  for(const width of [320,360,390,430,768]){
   await page.setViewportSize({width,height:844});
   const paint=await hero.evaluate(el=>({border:getComputedStyle(el).borderTopWidth,shadow:getComputedStyle(el).boxShadow}));
   expect(paint.border).toBe('0px');
   expect(paint.shadow).toBe('none');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
  }
  await personalNavigate(page,'Académico');
  const academics=page.getByRole('tablist',{name:'Consultas académicas'});
  const studentNav=page.getByRole('tablist',{name:'Navegación estudiantil'});
  for(const width of [320,360,390,430,768]){
   await page.setViewportSize({width,height:844});
   const academicsBox=await academics.boundingBox();
   expect(academicsBox?.x??-1).toBeGreaterThanOrEqual(0);
   expect((academicsBox?.x??0)+(academicsBox?.width??0)).toBeLessThanOrEqual(width+2);
   for(const label of ['Mis inscripciones','Mis docentes','Calificaciones e historial']){
    const tab=academics.getByRole('tab',{name:label,exact:true});
    await expect(tab).toBeVisible();
    const box=await tab.boundingBox();
    expect(box?.x??-1).toBeGreaterThanOrEqual(-1);
    expect((box?.x??0)+(box?.width??0)).toBeLessThanOrEqual(width+2);
   }
   if(width<768){
    const bottom=await studentNav.evaluate(el=>{
     const style=getComputedStyle(el),tabs=[...el.querySelectorAll('[role=tab]')];
     return {display:style.display,columns:style.gridTemplateColumns.split(' ').length,
      right:tabs.at(-1)?.getBoundingClientRect().right??Infinity,
      lastWidth:tabs.at(-1)?.getBoundingClientRect().width??0,
      overflow:el.scrollWidth-el.clientWidth};
    });
    expect(bottom.display).toBe('grid');
    await expect(studentNav.getByRole('tab')).toHaveCount(5);
    expect(bottom.columns).toBe(5);
    expect(bottom.right).toBeLessThanOrEqual(width+2);
    expect(bottom.lastWidth).toBeGreaterThanOrEqual(44);
    expect(bottom.overflow).toBeLessThanOrEqual(2);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
  }
  await page.setViewportSize({width:390,height:844});
  const first=page.locator('.siii-personal-mobile-records .siii-personal-record').first();
  await expect(first).toBeVisible();
  expect(await first.evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
  // A fixed bottom bar must not hide the final academic record or pagination.
  // Verify this at the actual document bottom, not only at the first viewport.
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const clearance=await page.evaluate(()=>{
   const bar=document.querySelector('#siii-personal .sii-student-portal .sii-personal-navigation');
   const records=[...document.querySelectorAll('.siii-personal-mobile-records .siii-personal-record')];
   const last=records.at(-1);
   if(!bar||!last)return null;
   return {barTop:bar.getBoundingClientRect().top,lastBottom:last.getBoundingClientRect().bottom};
  });
  expect(clearance).not.toBeNull();
  expect(clearance!.lastBottom).toBeLessThanOrEqual(clearance!.barTop-8);
  await personalNavigate(page,'Inicio');
 }
});

test('wide student workspace uses available width without shifting approved 1344px layout',async({page})=>{
 test.setTimeout(120000);
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);
 await expect(page.locator('.siii-student-dashboard')).toBeVisible();
 for(const theme of ['dark','light'] as const){
  const current=await page.locator('html').getAttribute('data-sii-theme');
  if(current!==theme)await page.getByRole('button',{name:theme==='light'?'Activar tema claro':'Activar tema oscuro',exact:true}).click();
  for(const width of [1440,1666]){
   await page.setViewportSize({width,height:900});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth),`${theme} ${width}: no horizontal overflow`).toBeLessThanOrEqual(width+2);
   const geometry=await page.locator('.siii-student-dashboard').evaluate(node=>{
    const dashboard=node.getBoundingClientRect();
    const shell=node.closest('.sii-main')?.getBoundingClientRect();
    const main=node.querySelector('.siii-student-main')?.getBoundingClientRect();
    const aside=node.querySelector('.siii-student-aside')?.getBoundingClientRect();
    return {left:shell?dashboard.left-shell.left:999,right:shell?shell.right-dashboard.right:999,
     aligned:main&&aside?Math.abs(main.top-aside.top):999,columns:getComputedStyle(node).gridTemplateColumns.split(' ').length};
   });
   expect(geometry.left).toBeLessThan(70);
   expect(geometry.right).toBeLessThan(70);
   expect(geometry.aligned).toBeLessThan(12);
   expect(geometry.columns).toBe(2);
  }
 }
});


test('student desktop uses the sidebar once and keeps academic data readable',async({page})=>{
 test.setTimeout(120000);
 await login(page);await page.goto('/dashboard/institutions/'+f.tenant+'/student');
 await personalNavigate(page,'Calificaciones');
 await expect(page.getByRole('tab',{name:'Calificaciones e historial',exact:true})).toHaveAttribute('data-state','active');
 await expect(page.locator('.siii-student-identity-card')).toBeVisible();
 await expect(page.locator('.siii-personal-data-table table')).toBeVisible();
 await page.setViewportSize({width:1666,height:920});
 const geometry=await page.evaluate(()=>{
  const primary=document.querySelector('#siii-personal .sii-student-portal .sii-personal-navigation');
  const identity=document.querySelector('#siii-personal .siii-student-identity-card');
  const table=document.querySelector('#siii-personal .siii-personal-data-table table');
  const first=table?.querySelector('thead th');
  return {primaryDisplay:primary?getComputedStyle(primary).display:null,identityHeight:identity?.getBoundingClientRect().height??0,
   firstColumnPercent:first&&table?first.getBoundingClientRect().width/table.getBoundingClientRect().width:0,
   overflow:document.documentElement.scrollWidth-window.innerWidth};
 });
 expect(geometry.primaryDisplay).toBe('none');
 expect(geometry.identityHeight).toBeGreaterThan(35);
 expect(geometry.identityHeight).toBeLessThan(100);
 expect(geometry.firstColumnPercent).toBeGreaterThan(.29);
 expect(geometry.overflow).toBeLessThanOrEqual(2);
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('tablist',{name:'Navegación estudiantil'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
});

test('student home avoids unused personal collection requests',async({page})=>{
 const unnecessary:string[]=[];
 page.on('request',request=>{
  const pathname=new URL(request.url()).pathname; if(pathname.endsWith('/portal/student/teachers')||pathname.endsWith('/portal/student/payments'))unnecessary.push(request.url());
 });
 await login(page);
 await expect(page.locator('.siii-student-dashboard')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Calificaciones recientes'})).toBeVisible();
 await expect(page.locator('.siii-overview-metrics>section')).toHaveCount(4);
 expect(unnecessary).toEqual([]);
});
