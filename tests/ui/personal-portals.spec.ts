import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
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
 await expect(page).toHaveURL(/\/dashboard$/);
}
test('student consults official own academic records in both themes across all requested widths',async({page})=>{
 test.setTimeout(180000);await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);
 await expect(page.getByRole('heading',{name:'Mi vida universitaria.'})).toBeVisible();await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Académico',exact:true}).click();await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toBeVisible();
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
  for(const width of [320,390,768,1440,1666]){
   await page.setViewportSize({width,height:900});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+2);
   await expect(page.locator('.siii-student-dashboard')).toBeVisible();
   if(width===1440||width===1666){
    const geometry=await page.locator('.siii-student-dashboard').evaluate(node=>{
     const dashboard=node.getBoundingClientRect();
     const main=node.closest('.sii-main')?.getBoundingClientRect();
     const columns=Array.from(node.children).map(el=>el.getBoundingClientRect());
     return {leftGap:main?dashboard.left-main.left:999,rightGap:main?main.right-dashboard.right:999,
       primaryTop:columns[0]?.top??0,railTop:columns[1]?.top??999};
    });
    expect(geometry.leftGap).toBeLessThan(64);
    expect(geometry.rightGap).toBeLessThan(64);
    expect(Math.abs(geometry.railTop-geometry.primaryTop)).toBeLessThan(12);
   }
   if(width===390||width===1440)await page.screenshot({path:`.p0-local/pr120-evidence/student-${theme}-${width}.png`,fullPage:true});
  }
 }
});
test('V3 student home stays institutional and loads only dashboard resources',async({page})=>{
 const resources:string[]=[];page.on('request',request=>{const match=request.url().match(/\/portal\/student\/([^?]+)/);if(match)resources.push(match[1])});
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 await expect(page.getByText('Próximas clases registradas',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('tab',{name:'Mi horario',exact:true})).toHaveCount(0);
 await expect(page.getByRole('tab',{name:'Académico',exact:true})).toBeVisible();
 expect(resources).not.toContain('schedule');expect(resources).toContain('grades');expect(resources).toContain('payments');
 await page.getByRole('tab',{name:'Académico',exact:true}).click();await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Calificaciones e historial',exact:true}).click();await expect(page.getByRole('tabpanel').last()).toContainText('8.50');
});
test('student sidebar opens real academic and finance sections without duplicating operational schedules',async({page})=>{
 await login(page);await page.goto('/dashboard/institutions/'+f.tenant+'/student');
 await page.getByRole('navigation',{name:'Navegación institucional'}).getByRole('link',{name:'Calificaciones e historial'}).click();
 await expect(page.getByRole('tab',{name:'Académico',exact:true})).toHaveAttribute('data-state','active');
 await expect(page.getByRole('tab',{name:'Calificaciones e historial',exact:true})).toHaveAttribute('data-state','active');
 await page.getByRole('navigation',{name:'Navegación institucional'}).getByRole('link',{name:'Estado de cuenta'}).click();
 await expect(page.getByRole('tab',{name:'Finanzas',exact:true})).toHaveAttribute('data-state','active');
});
test('V3 revalidation preserves displayed records and search while a valid profile is checked',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve});
 await page.route('**/portal/student/profile',async route=>{const response=await route.fetch();await gate;await route.fulfill({response})});
 try{await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Actualizando'})).toBeVisible()}finally{release()}
});
test('V3 refresh keeps the academic search and a denied collection removes all private content',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await page.getByRole('tab',{name:'Académico',exact:true}).click();
 const search=page.getByRole('searchbox',{name:'Buscar en inscripciones'});await search.fill('Álgebra');
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.getByRole('button',{name:'Actualizar mi información'})).toBeEnabled();await expect(search).toHaveValue('Álgebra');await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toBeVisible();
 await page.route('**/portal/student/courses',route=>route.fulfill({status:403,json:{error:'FORBIDDEN'}}));
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.locator('main [role="alert"]')).toContainText('acceso');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0);await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toHaveCount(0);
});
test('V3 rejects a different actor response and a different context on a later collection page',async({page})=>{
 await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 await page.route('**/portal/student/profile',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'x-siii-portal-actor':f.secondStudent.id}})});
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.locator('main [role="alert"]')).toContainText('acceso');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0);
 await page.unroute('**/portal/student/profile');await page.getByRole('tab',{name:'Académico',exact:true}).click();await expect(page.getByRole('cell').getByText('Álgebra institucional',{exact:true})).toBeVisible();
 await page.route('**/portal/student/courses*',async route=>{const response=await route.fetch();if(new URL(route.request().url()).searchParams.has('cursor'))await route.fulfill({response,headers:{...response.headers(),'x-siii-portal-context':'another-context'}});else{const body=await response.json();await route.fulfill({response,json:{...body,page:{nextCursor:'synthetic-next-page'}}})}});
 // Route the synthetic cursor through the real authorized first page, changing
 // only transport metadata. The consumer must reject before using its body.
 await page.route('**/portal/student/courses?cursor=*',async route=>{const response=await route.fetch({url:route.request().url().split('?')[0]});await route.fulfill({response,headers:{...response.headers(),'x-siii-portal-context':'another-context'}})});
 await page.getByRole('button',{name:'Actualizar mi información'}).click();await expect(page.locator('main [role="alert"]')).toContainText('acceso');await expect(page.getByText('Alumna propia Sintético',{exact:true})).toHaveCount(0);
});
test('V3 mobile destinations remain keyboard accessible and clear records offline',async({page,context})=>{
 await page.setViewportSize({width:360,height:800});await login(page);await page.goto(`/dashboard/institutions/${f.tenant}/student`);await expect(page.getByText('Alumna propia Sintético',{exact:true})).toBeVisible();
 const navigation=page.getByRole('tablist',{name:'Navegación estudiantil'});await expect(navigation.getByRole('tab')).toHaveCount(5);
 await navigation.getByRole('tab',{name:'Inicio',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(navigation.getByRole('tab',{name:'Académico',exact:true})).toHaveAttribute('data-state','active');
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
 await login(page,f.teacher);await page.goto(`/dashboard/institutions/${f.tenant}/teacher`);await expect(page.getByRole('heading',{name:'Mi docencia.'})).toBeVisible();
 await expect(page.getByRole('tabpanel')).toContainText('SYS-101');await expect(page.getByRole('tabpanel')).not.toContainText('SYS-202');
 await page.getByRole('tab',{name:'Mis grupos',exact:true}).click();await page.getByRole('button',{name:'Evaluar SYS-101'}).click();await expect(page.getByRole('heading',{name:'Libro de calificaciones'})).toBeVisible();
});
test('cashier records an external payment once and student sees its persistent statement',async({page,browser})=>{
 await login(page,f.admin);await page.goto(`/dashboard/institutions/${f.tenant}/financials`);await expect(page.getByRole('heading',{name:'Caja y finanzas.'})).toBeVisible();
 const number=(await sql.query('SELECT order_number FROM payment_orders WHERE id=$1',[f.orderId])).rows[0].order_number;
 const row=page.getByRole('row').filter({hasText:number});await row.getByRole('button',{name:'Registrar pago',exact:true}).click();
 await page.getByLabel('Importe recibido (MXN)').fill('100.00');await page.getByLabel('Método de pago').selectOption('transfer');await page.getByLabel('Referencia externa').fill('BANK-VNEXT-UI');
 await page.getByRole('button',{name:'Revisar pago',exact:true}).click();await page.getByRole('button',{name:'Confirmar registro del pago',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Pago registrado'})).toBeVisible();await expect(row).toContainText('Pagada');
 expect((await sql.query('SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1',[f.orderId])).rows[0].n).toBe(1);
 const context=await browser.newContext();try{const student=await context.newPage();await login(student);await student.goto(`/dashboard/institutions/${f.tenant}/student`);await student.getByRole('tab',{name:'Finanzas',exact:true}).click();await expect(student.getByRole('tabpanel')).toContainText('Pagada');await expect(student.getByRole('tabpanel')).toContainText('BANK-VNEXT-UI')}finally{await context.close()}
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
 await page.goto(`/dashboard/institutions/${f.tenant}/teacher`);await page.getByRole('tab',{name:'Mis grupos',exact:true}).click();await page.getByRole('button',{name:'Evaluar '+code}).click();await expect(page.getByLabel('Materia y grupo asignado')).toHaveValue(requested);
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
