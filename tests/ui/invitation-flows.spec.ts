import {test,expect,type Page,type Browser} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import argon2 from 'argon2';
import {randomBytes,randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret,digestRecoveryCode} from '../../src/shared/auth/mfa-primitives';
import {openInvitationDelivery} from '../../src/shared/invitations/delivery-seal';

const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),password='Synthetic-invitation-ui-password-2026!';
let institutionId:string,programId:string,username:string,loginRecovery:string,stepRecovery:string;
test.beforeAll(async()=>{await sql.connect();});
test.afterAll(async()=>{await sql.end();});
test.beforeEach(async()=>{
 const suffix=randomUUID().slice(0,8),hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 await sql.query('DELETE FROM auth_throttle');
 institutionId=(await sql.query("INSERT INTO institutions(name,code) VALUES('QA invitaciones — datos sintéticos',$1) RETURNING id",['IV'+suffix])).rows[0].id;
 programId=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'IV-PROG','Programa invitado','ingenieria','presencial') RETURNING id",[institutionId])).rows[0].id;
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('QA Invitador','Local') RETURNING id")).rows[0].id;username='inviter-'+suffix;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institutionId,user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(membership_id,institution_id,role) VALUES($1,$2,'admin')",[member,institutionId]);
 const factor=(await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute') RETURNING id",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)])).rows[0].id;
 loginRecovery=randomBytes(16).toString('hex').toUpperCase();stepRecovery=randomBytes(16).toString('hex').toUpperCase();
 for(const code of [loginRecovery,stepRecovery])await sql.query('INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)',[user,factor,digestRecoveryCode(code,user)]);
});
async function login(page:Page,name=username,mfa=false){
 await page.goto('/login');await page.getByLabel('Usuario institucional').fill(name);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar al sistema'}).click();
 if(mfa){await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();await page.getByLabel('Código de recuperación',{exact:true}).fill(loginRecovery);const result=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/mfa/challenge'));await page.getByRole('button',{name:'Verificar y entrar'}).click();expect((await result).status()).toBe(200);}
 await expect(page).toHaveURL(/\/dashboard$/);
}
async function administrator(page:Page){await login(page,username,true);await page.goto('/dashboard/security');await page.getByLabel('Contraseña actual para confirmar').fill(password);await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();await page.getByLabel('Código de recuperación para confirmar').fill(stepRecovery);await page.getByRole('button',{name:'Confirmar identidad',exact:true}).click();await expect(page.getByRole('button',{name:'Renovar códigos de recuperación',exact:true})).toBeEnabled();await page.goto(`/dashboard/institutions/${institutionId}/invitations`);await expect(page.getByRole('heading',{name:'Invitaciones.'})).toBeVisible();}
async function create(page:Page,email:string,role='student',scoped=false){
 await page.getByLabel('Correo del destinatario').fill(email);
 if(scoped){await page.getByLabel('Ámbito',{exact:true}).selectOption('program');await page.getByLabel('Programa',{exact:true}).selectOption(programId);await expect(page.getByLabel('Perfil',{exact:true})).toBeEnabled();}
 await page.getByLabel('Perfil',{exact:true}).selectOption(role);
 const result=page.waitForResponse(response=>response.url().endsWith(`/institutions/${institutionId}/invitations`)&&response.request().method()==='POST');await page.getByRole('button',{name:'Crear invitación',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Crear invitación'}).click();const response=await result;expect(response.status()).toBe(201);const body=await response.json();expect(Object.keys(body.data)).not.toContain('token');expect(Object.keys(body.data)).not.toContain('invitationLink');return body.data.id as string;
}
async function mailLink(id:string){
 const delivery=(await sql.query('SELECT id,payload_encrypted FROM invitation_delivery_outbox WHERE invitation_id=$1 AND state=\'queued\' ORDER BY created_at DESC,id DESC LIMIT 1',[id])).rows[0];expect(Boolean(delivery)).toBe(true);
 const mail=openInvitationDelivery(delivery.payload_encrypted,delivery.id,institutionId);
 const link=mail.text.match(/https:\/\/[^\s]+/g)?.map(value=>new URL(value)).find(value=>value.pathname==='/invitations/accept');expect(Boolean(link)).toBe(true);
 const url=link!;expect(url.protocol).toBe('https:');expect(url.origin).toBe(new URL(process.env.SIII_PUBLIC_ORIGIN!).origin);expect(Boolean(url.search==='')).toBe(true);
 // Preserve the actual queued mail's path and fragment; only its known fixture origin is translated.
 return {path:url.pathname+url.hash,token:new URLSearchParams(url.hash.slice(1)).get('token')!};
}
async function recipient(browser:Browser){const context=await browser.newContext({baseURL:test.info().project.use.baseURL});return {context,page:await context.newPage()};}
async function axe(page:Page){const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(results.violations.map(result=>({id:result.id,targets:result.nodes.map(node=>node.target)}))).toEqual([]);}

test('security keeps institutional navigation and refreshes assurance without manual page reload',async({page})=>{
  await login(page,username,true);
  const back=`/dashboard/institutions/${institutionId}/invitations`;
  await page.goto('/dashboard/security?returnTo='+encodeURIComponent(back));
  const academicMenu=page.getByRole('navigation',{name:'Gestión académica'});
  await expect(academicMenu.getByRole('link',{name:'Catálogo académico'})).toBeVisible();
  await expect(academicMenu.getByRole('link',{name:'Estudiantes y docentes'})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Navegación institucional'}).getByRole('link',{name:'Invitaciones'})).toBeVisible();
  await page.getByLabel('Contraseña actual para confirmar').fill(password);
  await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();
  await page.getByLabel('Código de recuperación para confirmar').fill(stepRecovery);
  const capabilities=page.waitForResponse(response=>response.url().endsWith(`/institutions/${institutionId}/capabilities`)&&response.status()===200);
  await page.getByRole('button',{name:'Confirmar identidad',exact:true}).click();
  await capabilities;
  await expect(page.getByText('Confirmación vigente hasta', {exact:false})).toBeVisible();
  await expect(academicMenu.getByRole('link',{name:'Catálogo académico'})).toBeVisible();
  await page.getByRole('link',{name:'Volver y reintentar la operación'}).click();
  await expect(page).toHaveURL(new RegExp('/institutions/'+institutionId+'/invitations,async({page})=>{
 await login(page,username,true);
 await page.goto(`/dashboard/institutions/${institutionId}/invitations`);
 await expect(page.getByRole('heading',{name:'Confirma tu identidad para invitar'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Crear invitación'})).toBeVisible();
 await page.getByLabel('Contraseña actual',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();
 await page.getByLabel('Código de recuperación',{exact:true}).fill(stepRecovery);
 const verified=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/mfa/step-up')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Confirmar identidad y continuar'}).click();
 expect((await verified).status()).toBe(200);
 await expect(page.getByRole('heading',{name:'Confirma tu identidad para invitar'})).toHaveCount(0);
 await expect(page.getByText('Identidad confirmada. Ya puedes crear o administrar invitaciones durante cinco minutos.')).toBeVisible();
 const id=await create(page,`inline-step-up-${randomUUID().slice(0,8)}@example.test`);
 expect((await sql.query('SELECT id FROM institution_invitations WHERE id=$1',[id])).rowCount).toBe(1);
});

test('administration records honest delivery and rotates then revokes the real mail link',async({page,browser})=>{
 test.setTimeout(120000);await administrator(page);const email=`rotate-${randomUUID().slice(0,8)}@example.test`,id=await create(page,email,'coordinator',true),original=await mailLink(id);
 const row=page.locator('tbody tr').filter({hasText:email});await expect(row).toContainText(/Entrega pendiente|Pendiente de configurar correo/);await expect(row).toContainText('Programa invitado');
 await expect(row.getByRole('button',{name:'Reenviar invitación'})).toBeDisabled();
 await sql.query("UPDATE institution_invitations SET last_requested_at=now()-interval '61 seconds' WHERE id=$1",[id]);
 await page.getByRole('button',{name:'Actualizar invitaciones',exact:true}).click();await expect(row.getByRole('button',{name:'Reenviar invitación'})).toBeVisible();
 const resent=page.waitForResponse(response=>response.url().endsWith(`/${id}/resend`));await row.getByRole('button',{name:'Reenviar invitación'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Confirmar reenvío'}).click();expect((await resent).status()).toBe(200);const rotated=await mailLink(id);expect(Boolean(rotated.token!==original.token)).toBe(true);
 const other=await recipient(browser);try{await other.page.goto(original.path);await expect(other.page.locator('#invitation-error')).toContainText('no está disponible');await other.page.goto(rotated.path);await expect(other.page.getByText('Programa: Programa invitado',{exact:true})).toBeVisible();}finally{await other.context.close();}
 await row.getByRole('button',{name:'Revocar invitación'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Revocar invitación'}).click();await expect(row).toContainText('Revocada');await expect(row.getByRole('button',{name:'Reenviar invitación'})).toHaveCount(0);await axe(page);
});

test('new account acceptance requires consent, protects the fragment and permits only MFA onboarding',async({page,browser})=>{
 test.setTimeout(150000);await administrator(page);const id=await create(page,`new-${randomUUID().slice(0,8)}@example.test`,'control_escolar'),link=await mailLink(id),other=await recipient(browser);
 try{const publicPage=other.page,requests:{url:string;headers:Record<string,string>}[]=[];publicPage.on('request',request=>requests.push({url:request.url(),headers:request.headers()}));await publicPage.goto(link.path);await expect(publicPage.getByText('Control escolar',{exact:true})).toBeVisible();expect(Boolean(new URL(publicPage.url()).hash==='')).toBe(true);expect(Boolean(new URL(publicPage.url()).search==='')).toBe(true);expect(requests.every(request=>!request.url.includes(link.token)&&!JSON.stringify(request.headers).includes(link.token))).toBe(true);
  expect(await publicPage.evaluate(token=>!JSON.stringify(history.state).includes(token)&&Object.values({...localStorage,...sessionStorage}).every(value=>!String(value).includes(token)),link.token)).toBe(true);
  await expect(publicPage.getByRole('button',{name:'Aceptar invitación',exact:true})).toBeDisabled();await publicPage.getByLabel('Cuenta para aceptar').selectOption('new');await publicPage.getByLabel('Nombre',{exact:true}).fill('QA Destinatario');await publicPage.getByLabel('Apellidos',{exact:true}).fill('Propio');const name='invitee-'+randomUUID().slice(0,8);await publicPage.getByLabel('Nuevo usuario institucional').fill(name);await publicPage.getByLabel('Nueva contraseña',{exact:true}).fill(password);await publicPage.getByLabel('Confirmar nueva contraseña').fill(password+'x');await publicPage.locator('#invitation-consent').check();await publicPage.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(publicPage.locator('#invitation-error')).toContainText('no coinciden');await expect(publicPage.getByLabel('Confirmar nueva contraseña')).toHaveAttribute('aria-invalid','true');
  await publicPage.getByLabel('Confirmar nueva contraseña').fill(password);await publicPage.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(publicPage.getByRole('heading',{name:'Invitación aceptada.'})).toBeVisible();expect((await publicPage.request.get('/api/v1/auth/me')).status()).toBe(401);await publicPage.getByRole('link',{name:'Ir al acceso institucional',exact:true}).click();await expect(publicPage).toHaveURL(/\/login$/);expect(requests.every(request=>!request.url.includes(link.token)&&!JSON.stringify(request.headers).includes(link.token))).toBe(true);expect(requests.some(request=>'next-router-state-tree' in request.headers)).toBe(true);expect(await publicPage.evaluate(token=>!JSON.stringify(history.state).includes(token),link.token)).toBe(true);await login(publicPage,name);await publicPage.goto(`/dashboard/institutions/${institutionId}`);await expect(publicPage.getByText(/Configura un autenticador para acceder/)).toBeVisible();await expect(publicPage.getByRole('link',{name:/Catálogo académico|Abrir catálogo/})).toHaveCount(0);
  await publicPage.getByRole('link',{name:'Configurar seguridad y volver'}).click();await expect(publicPage.getByLabel('Contraseña actual para activar')).toBeVisible();await axe(publicPage);expect(requests.every(request=>!request.url.includes(link.token)&&!JSON.stringify(request.headers).includes(link.token))).toBe(true);
 }finally{await other.context.close();}
});

test('recipient can reject with consent and reload cannot recover the consumed in-memory bearer',async({page,browser})=>{
 await administrator(page);const id=await create(page,`reject-${randomUUID().slice(0,8)}@example.test`),link=await mailLink(id),other=await recipient(browser);
 try{await other.page.goto(link.path);await expect(other.page.getByRole('button',{name:'Rechazar invitación'})).toBeDisabled();await other.page.locator('#invitation-consent').check();await other.page.getByRole('button',{name:'Rechazar invitación'}).click();await other.page.getByRole('alertdialog').getByRole('button',{name:'Rechazar invitación'}).click();await expect(other.page.getByRole('heading',{name:'Invitación rechazada.'})).toBeVisible();expect((await sql.query('SELECT state FROM institution_invitations WHERE id=$1',[id])).rows[0].state).toBe('rejected');await other.page.reload();await expect(other.page.locator('#invitation-error')).toContainText('Reabre el enlace original');await expect(other.page.getByRole('button',{name:'Aceptar invitación'})).toHaveCount(0);
 }finally{await other.context.close();}
});

test('public invitation preserves explicit consent and correction through offline, mobile and dark states',async({page,browser})=>{
 await administrator(page);const id=await create(page,`mobile-${randomUUID().slice(0,8)}@example.test`),link=await mailLink(id),other=await recipient(browser);
 try{await other.page.setViewportSize({width:390,height:844});await other.page.goto(link.path);await expect(other.page.getByText('Estudiante',{exact:true})).toBeVisible();await other.page.getByRole('button',{name:'Activar tema oscuro'}).click();await axe(other.page);await other.context.setOffline(true);await expect(other.page.getByText(/Sin conexión/)).toBeVisible();await expect(other.page.getByRole('button',{name:'Aceptar invitación'})).toBeDisabled();await other.context.setOffline(false);await other.page.getByRole('button',{name:'Actualizar invitación y sesión'}).click();await expect(other.page.getByText('Estudiante',{exact:true})).toBeVisible();await other.page.locator('#invitation-consent').check();await other.page.getByRole('button',{name:'Aceptar invitación'}).click();await expect(other.page.locator('#invitation-error')).toContainText('Inicia sesión');await expect(other.page.locator('#invitation-error')).toBeFocused();await expect(other.page.getByRole('link',{name:'Iniciar sesión en otra pestaña'})).toHaveAttribute('rel','noopener noreferrer');
 }finally{await other.context.close();}
});

test('existing account consents after real login and step-up in separate tabs without changing its identity',async({page,browser})=>{
 test.setTimeout(150000);await administrator(page);const email=`existing-${randomUUID().slice(0,8)}@example.test`,name='existing-'+randomUUID().slice(0,8),first=await create(page,email),initial=await mailLink(first),other=await recipient(browser);
 try{
  const accepted=await other.page.request.post('/api/v1/invitations/accept',{headers:{Origin:String(test.info().project.use.baseURL)},data:{invitationId:first,token:initial.token,consent:true,mode:'new',account:{username:name,password,firstName:'Identidad propia',lastName:'Conservada'}}});expect(accepted.status()).toBe(200);
  const before=(await sql.query('SELECT u.username,u.password_hash,p.first_name,p.last_name,p.email FROM platform_users u JOIN people p ON p.id=u.person_id WHERE u.username=$1',[name])).rows[0];
  const second=await create(page,email,'coordinator',true),link=await mailLink(second);await other.page.goto(link.path);await expect(other.page.getByText('Programa: Programa invitado',{exact:true})).toBeVisible();await other.page.locator('#invitation-consent').check();await other.page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(other.page.locator('#invitation-error')).toContainText('Inicia sesión');
  const authTab=other.context.waitForEvent('page');await other.page.getByRole('link',{name:'Iniciar sesión en otra pestaña'}).click();const auth=await authTab;await login(auth,name);await auth.close();
  await other.page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(other.page.locator('#invitation-error')).toContainText('Confirma tu identidad');
  const securityTab=other.context.waitForEvent('page');await other.page.getByRole('link',{name:'Confirmar identidad en otra pestaña'}).click();const security=await securityTab;await security.getByLabel('Contraseña actual para confirmar').fill(password);await security.getByRole('button',{name:'Confirmar identidad',exact:true}).click();await expect(security.getByRole('status').filter({hasText:'Confirmación vigente hasta'})).toBeVisible();await security.close();
  await other.page.getByRole('button',{name:'Actualizar invitación y sesión'}).click();await expect(other.page.getByText('Programa: Programa invitado',{exact:true})).toBeVisible();await other.page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(other.page.getByRole('heading',{name:'Invitación aceptada.'})).toBeVisible();expect((await other.page.request.get('/api/v1/auth/me')).status()).toBe(401);
  const after=(await sql.query('SELECT u.username,u.password_hash,p.first_name,p.last_name,p.email FROM platform_users u JOIN people p ON p.id=u.person_id WHERE u.username=$1',[name])).rows[0];expect(Boolean(before.username===after.username&&before.password_hash===after.password_hash&&before.first_name===after.first_name&&before.last_name===after.last_name&&before.email===after.email)).toBe(true);
  expect((await sql.query("SELECT count(*)::int AS total FROM role_assignments r JOIN institution_memberships m ON m.id=r.membership_id JOIN platform_users u ON u.id=m.user_id WHERE u.username=$1 AND r.role='coordinator' AND r.scope_program_id=$2 AND r.revoked_at IS NULL",[name,programId])).rows[0].total).toBe(1);await axe(other.page);
 }finally{await other.context.close();}
});

test('invitation list uses real cursor pagination and expired or revoked mail cannot offer consent',async({page,browser})=>{
 test.setTimeout(180000);await administrator(page);const ids:string[]=[];
 for(let index=0;index<11;index++)ids.push(await create(page,`paged-${index}-${randomUUID().slice(0,8)}@example.test`));
 await expect(page.locator('tbody tr')).toHaveCount(10);await page.getByRole('button',{name:'Siguiente página'}).click();await expect(page.locator('tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'Página anterior'}).click();await expect(page.locator('tbody tr')).toHaveCount(10);
 const expired=await mailLink(ids[0]),revoked=await mailLink(ids[1]);
 await sql.query("UPDATE institution_invitations SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[ids[0]]);
 const response=await page.request.post(`/api/v1/institutions/${institutionId}/invitations/${ids[1]}/revoke`,{headers:{Origin:String(test.info().project.use.baseURL)},data:{}});expect(response.status()).toBe(200);
 const other=await recipient(browser);try{for(const link of [expired,revoked]){await other.page.goto(link.path);await expect(other.page.locator('#invitation-error')).toContainText('no está disponible');await expect(other.page.getByRole('button',{name:'Aceptar invitación',exact:true})).toHaveCount(0);}}finally{await other.context.close();}
});

test('a delayed manual refresh cannot replace the invitation opened afterwards',async({page,browser})=>{
 test.setTimeout(150000);await administrator(page);
 const first=await create(page,`race-a-${randomUUID().slice(0,8)}@example.test`,'student'),firstLink=await mailLink(first);
 const second=await create(page,`race-b-${randomUUID().slice(0,8)}@example.test`,'coordinator',true),secondLink=await mailLink(second),other=await recipient(browser);
 let releaseOld:(()=>void)|undefined;
 const held=new Promise<void>(resolve=>{releaseOld=resolve;});
 let oldReady:(()=>void)|undefined;
 const oldResponseReady=new Promise<void>(resolve=>{oldReady=resolve;});
 let interceptManual=false;
 await other.page.route('**/api/v1/invitations/preview',async route=>{
  const body=route.request().postDataJSON() as {invitationId:string};
  if(interceptManual&&body.invitationId===first){
   interceptManual=false;
   const response=await route.fetch();expect(response.status()).toBe(200);oldReady?.();await held;await route.fulfill({response});
  }else await route.continue();
 });
 try{
  await other.page.goto(firstLink.path);await expect(other.page.getByText('Estudiante',{exact:true})).toBeVisible();
  interceptManual=true;await other.page.getByRole('button',{name:'Actualizar invitación y sesión'}).click();await oldResponseReady;
  await other.page.goto(secondLink.path);await expect(other.page.getByText('Coordinación',{exact:true})).toBeVisible();await expect(other.page.getByText('Programa: Programa invitado',{exact:true})).toBeVisible();
  const staleResponse=other.page.waitForResponse(response=>response.url().endsWith('/invitations/preview')&&response.request().postDataJSON().invitationId===first);
  releaseOld?.();await (await staleResponse).finished();
  // Cross one browser rendering boundary after the held HTTP body completes; no timed delay.
  await other.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(other.page.getByText('Coordinación',{exact:true})).toBeVisible();await expect(other.page.getByText('Estudiante',{exact:true})).toHaveCount(0);
  await expect(other.page.getByRole('status').filter({hasText:'La invitación y tu sesión se comprobarán nuevamente'})).toHaveCount(0);
  await expect(other.page.locator('#invitation-consent')).not.toBeChecked();await other.page.locator('#invitation-consent').check();
  const rejected=other.page.waitForRequest(request=>request.url().endsWith('/invitations/reject'));
  await other.page.getByRole('button',{name:'Rechazar invitación',exact:true}).click();await other.page.getByRole('alertdialog').getByRole('button',{name:'Rechazar invitación'}).click();
  expect((await rejected).postDataJSON().invitationId).toBe(second);await expect(other.page.getByRole('heading',{name:'Invitación rechazada.'})).toBeVisible();
  const states=await sql.query('SELECT id,state FROM institution_invitations WHERE id=ANY($1::uuid[])',[[first,second]]);
  expect(states.rows.find(row=>row.id===first)?.state).toBe('pending');expect(states.rows.find(row=>row.id===second)?.state).toBe('rejected');
 }finally{releaseOld?.();await other.context.close();}
});
));
  await expect(page.getByRole('heading',{name:'Crear invitación'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Confirma tu identidad para invitar'})).toHaveCount(0);
});

test('inviter confirms fresh MFA within Invitations and keeps the same draft and session',async({page})=>{
 await login(page,username,true);
 await page.goto(`/dashboard/institutions/${institutionId}/invitations`);
 await expect(page.getByRole('heading',{name:'Confirma tu identidad para invitar'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Crear invitación'})).toBeVisible();
 await page.getByLabel('Contraseña actual',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Usar código de recuperación',exact:true}).click();
 await page.getByLabel('Código de recuperación',{exact:true}).fill(stepRecovery);
 const verified=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/mfa/step-up')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Confirmar identidad y continuar'}).click();
 expect((await verified).status()).toBe(200);
 await expect(page.getByRole('heading',{name:'Confirma tu identidad para invitar'})).toHaveCount(0);
 await expect(page.getByText('Identidad confirmada. Ya puedes crear o administrar invitaciones durante cinco minutos.')).toBeVisible();
 const id=await create(page,`inline-step-up-${randomUUID().slice(0,8)}@example.test`);
 expect((await sql.query('SELECT id FROM institution_invitations WHERE id=$1',[id])).rowCount).toBe(1);
});

test('administration records honest delivery and rotates then revokes the real mail link',async({page,browser})=>{
 test.setTimeout(120000);await administrator(page);const email=`rotate-${randomUUID().slice(0,8)}@example.test`,id=await create(page,email,'coordinator',true),original=await mailLink(id);
 const row=page.locator('tbody tr').filter({hasText:email});await expect(row).toContainText(/Entrega pendiente|Pendiente de configurar correo/);await expect(row).toContainText('Programa invitado');
 await expect(row.getByRole('button',{name:'Reenviar invitación'})).toBeDisabled();
 await sql.query("UPDATE institution_invitations SET last_requested_at=now()-interval '61 seconds' WHERE id=$1",[id]);
 await page.getByRole('button',{name:'Actualizar invitaciones',exact:true}).click();await expect(row.getByRole('button',{name:'Reenviar invitación'})).toBeVisible();
 const resent=page.waitForResponse(response=>response.url().endsWith(`/${id}/resend`));await row.getByRole('button',{name:'Reenviar invitación'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Confirmar reenvío'}).click();expect((await resent).status()).toBe(200);const rotated=await mailLink(id);expect(Boolean(rotated.token!==original.token)).toBe(true);
 const other=await recipient(browser);try{await other.page.goto(original.path);await expect(other.page.locator('#invitation-error')).toContainText('no está disponible');await other.page.goto(rotated.path);await expect(other.page.getByText('Programa: Programa invitado',{exact:true})).toBeVisible();}finally{await other.context.close();}
 await row.getByRole('button',{name:'Revocar invitación'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Revocar invitación'}).click();await expect(row).toContainText('Revocada');await expect(row.getByRole('button',{name:'Reenviar invitación'})).toHaveCount(0);await axe(page);
});

test('new account acceptance requires consent, protects the fragment and permits only MFA onboarding',async({page,browser})=>{
 test.setTimeout(150000);await administrator(page);const id=await create(page,`new-${randomUUID().slice(0,8)}@example.test`,'control_escolar'),link=await mailLink(id),other=await recipient(browser);
 try{const publicPage=other.page,requests:{url:string;headers:Record<string,string>}[]=[];publicPage.on('request',request=>requests.push({url:request.url(),headers:request.headers()}));await publicPage.goto(link.path);await expect(publicPage.getByText('Control escolar',{exact:true})).toBeVisible();expect(Boolean(new URL(publicPage.url()).hash==='')).toBe(true);expect(Boolean(new URL(publicPage.url()).search==='')).toBe(true);expect(requests.every(request=>!request.url.includes(link.token)&&!JSON.stringify(request.headers).includes(link.token))).toBe(true);
  expect(await publicPage.evaluate(token=>!JSON.stringify(history.state).includes(token)&&Object.values({...localStorage,...sessionStorage}).every(value=>!String(value).includes(token)),link.token)).toBe(true);
  await expect(publicPage.getByRole('button',{name:'Aceptar invitación',exact:true})).toBeDisabled();await publicPage.getByLabel('Cuenta para aceptar').selectOption('new');await publicPage.getByLabel('Nombre',{exact:true}).fill('QA Destinatario');await publicPage.getByLabel('Apellidos',{exact:true}).fill('Propio');const name='invitee-'+randomUUID().slice(0,8);await publicPage.getByLabel('Nuevo usuario institucional').fill(name);await publicPage.getByLabel('Nueva contraseña',{exact:true}).fill(password);await publicPage.getByLabel('Confirmar nueva contraseña').fill(password+'x');await publicPage.locator('#invitation-consent').check();await publicPage.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(publicPage.locator('#invitation-error')).toContainText('no coinciden');await expect(publicPage.getByLabel('Confirmar nueva contraseña')).toHaveAttribute('aria-invalid','true');
  await publicPage.getByLabel('Confirmar nueva contraseña').fill(password);await publicPage.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(publicPage.getByRole('heading',{name:'Invitación aceptada.'})).toBeVisible();expect((await publicPage.request.get('/api/v1/auth/me')).status()).toBe(401);await publicPage.getByRole('link',{name:'Ir al acceso institucional',exact:true}).click();await expect(publicPage).toHaveURL(/\/login$/);expect(requests.every(request=>!request.url.includes(link.token)&&!JSON.stringify(request.headers).includes(link.token))).toBe(true);expect(requests.some(request=>'next-router-state-tree' in request.headers)).toBe(true);expect(await publicPage.evaluate(token=>!JSON.stringify(history.state).includes(token),link.token)).toBe(true);await login(publicPage,name);await publicPage.goto(`/dashboard/institutions/${institutionId}`);await expect(publicPage.getByText(/Configura un autenticador para acceder/)).toBeVisible();await expect(publicPage.getByRole('link',{name:/Catálogo académico|Abrir catálogo/})).toHaveCount(0);
  await publicPage.getByRole('link',{name:'Configurar seguridad y volver'}).click();await expect(publicPage.getByLabel('Contraseña actual para activar')).toBeVisible();await axe(publicPage);expect(requests.every(request=>!request.url.includes(link.token)&&!JSON.stringify(request.headers).includes(link.token))).toBe(true);
 }finally{await other.context.close();}
});

test('recipient can reject with consent and reload cannot recover the consumed in-memory bearer',async({page,browser})=>{
 await administrator(page);const id=await create(page,`reject-${randomUUID().slice(0,8)}@example.test`),link=await mailLink(id),other=await recipient(browser);
 try{await other.page.goto(link.path);await expect(other.page.getByRole('button',{name:'Rechazar invitación'})).toBeDisabled();await other.page.locator('#invitation-consent').check();await other.page.getByRole('button',{name:'Rechazar invitación'}).click();await other.page.getByRole('alertdialog').getByRole('button',{name:'Rechazar invitación'}).click();await expect(other.page.getByRole('heading',{name:'Invitación rechazada.'})).toBeVisible();expect((await sql.query('SELECT state FROM institution_invitations WHERE id=$1',[id])).rows[0].state).toBe('rejected');await other.page.reload();await expect(other.page.locator('#invitation-error')).toContainText('Reabre el enlace original');await expect(other.page.getByRole('button',{name:'Aceptar invitación'})).toHaveCount(0);
 }finally{await other.context.close();}
});

test('public invitation preserves explicit consent and correction through offline, mobile and dark states',async({page,browser})=>{
 await administrator(page);const id=await create(page,`mobile-${randomUUID().slice(0,8)}@example.test`),link=await mailLink(id),other=await recipient(browser);
 try{await other.page.setViewportSize({width:390,height:844});await other.page.goto(link.path);await expect(other.page.getByText('Estudiante',{exact:true})).toBeVisible();await other.page.getByRole('button',{name:'Activar tema oscuro'}).click();await axe(other.page);await other.context.setOffline(true);await expect(other.page.getByText(/Sin conexión/)).toBeVisible();await expect(other.page.getByRole('button',{name:'Aceptar invitación'})).toBeDisabled();await other.context.setOffline(false);await other.page.getByRole('button',{name:'Actualizar invitación y sesión'}).click();await expect(other.page.getByText('Estudiante',{exact:true})).toBeVisible();await other.page.locator('#invitation-consent').check();await other.page.getByRole('button',{name:'Aceptar invitación'}).click();await expect(other.page.locator('#invitation-error')).toContainText('Inicia sesión');await expect(other.page.locator('#invitation-error')).toBeFocused();await expect(other.page.getByRole('link',{name:'Iniciar sesión en otra pestaña'})).toHaveAttribute('rel','noopener noreferrer');
 }finally{await other.context.close();}
});

test('existing account consents after real login and step-up in separate tabs without changing its identity',async({page,browser})=>{
 test.setTimeout(150000);await administrator(page);const email=`existing-${randomUUID().slice(0,8)}@example.test`,name='existing-'+randomUUID().slice(0,8),first=await create(page,email),initial=await mailLink(first),other=await recipient(browser);
 try{
  const accepted=await other.page.request.post('/api/v1/invitations/accept',{headers:{Origin:String(test.info().project.use.baseURL)},data:{invitationId:first,token:initial.token,consent:true,mode:'new',account:{username:name,password,firstName:'Identidad propia',lastName:'Conservada'}}});expect(accepted.status()).toBe(200);
  const before=(await sql.query('SELECT u.username,u.password_hash,p.first_name,p.last_name,p.email FROM platform_users u JOIN people p ON p.id=u.person_id WHERE u.username=$1',[name])).rows[0];
  const second=await create(page,email,'coordinator',true),link=await mailLink(second);await other.page.goto(link.path);await expect(other.page.getByText('Programa: Programa invitado',{exact:true})).toBeVisible();await other.page.locator('#invitation-consent').check();await other.page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(other.page.locator('#invitation-error')).toContainText('Inicia sesión');
  const authTab=other.context.waitForEvent('page');await other.page.getByRole('link',{name:'Iniciar sesión en otra pestaña'}).click();const auth=await authTab;await login(auth,name);await auth.close();
  await other.page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(other.page.locator('#invitation-error')).toContainText('Confirma tu identidad');
  const securityTab=other.context.waitForEvent('page');await other.page.getByRole('link',{name:'Confirmar identidad en otra pestaña'}).click();const security=await securityTab;await security.getByLabel('Contraseña actual para confirmar').fill(password);await security.getByRole('button',{name:'Confirmar identidad',exact:true}).click();await expect(security.getByRole('status').filter({hasText:'Confirmación vigente hasta'})).toBeVisible();await security.close();
  await other.page.getByRole('button',{name:'Actualizar invitación y sesión'}).click();await expect(other.page.getByText('Programa: Programa invitado',{exact:true})).toBeVisible();await other.page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(other.page.getByRole('heading',{name:'Invitación aceptada.'})).toBeVisible();expect((await other.page.request.get('/api/v1/auth/me')).status()).toBe(401);
  const after=(await sql.query('SELECT u.username,u.password_hash,p.first_name,p.last_name,p.email FROM platform_users u JOIN people p ON p.id=u.person_id WHERE u.username=$1',[name])).rows[0];expect(Boolean(before.username===after.username&&before.password_hash===after.password_hash&&before.first_name===after.first_name&&before.last_name===after.last_name&&before.email===after.email)).toBe(true);
  expect((await sql.query("SELECT count(*)::int AS total FROM role_assignments r JOIN institution_memberships m ON m.id=r.membership_id JOIN platform_users u ON u.id=m.user_id WHERE u.username=$1 AND r.role='coordinator' AND r.scope_program_id=$2 AND r.revoked_at IS NULL",[name,programId])).rows[0].total).toBe(1);await axe(other.page);
 }finally{await other.context.close();}
});

test('invitation list uses real cursor pagination and expired or revoked mail cannot offer consent',async({page,browser})=>{
 test.setTimeout(180000);await administrator(page);const ids:string[]=[];
 for(let index=0;index<11;index++)ids.push(await create(page,`paged-${index}-${randomUUID().slice(0,8)}@example.test`));
 await expect(page.locator('tbody tr')).toHaveCount(10);await page.getByRole('button',{name:'Siguiente página'}).click();await expect(page.locator('tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'Página anterior'}).click();await expect(page.locator('tbody tr')).toHaveCount(10);
 const expired=await mailLink(ids[0]),revoked=await mailLink(ids[1]);
 await sql.query("UPDATE institution_invitations SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[ids[0]]);
 const response=await page.request.post(`/api/v1/institutions/${institutionId}/invitations/${ids[1]}/revoke`,{headers:{Origin:String(test.info().project.use.baseURL)},data:{}});expect(response.status()).toBe(200);
 const other=await recipient(browser);try{for(const link of [expired,revoked]){await other.page.goto(link.path);await expect(other.page.locator('#invitation-error')).toContainText('no está disponible');await expect(other.page.getByRole('button',{name:'Aceptar invitación',exact:true})).toHaveCount(0);}}finally{await other.context.close();}
});

test('a delayed manual refresh cannot replace the invitation opened afterwards',async({page,browser})=>{
 test.setTimeout(150000);await administrator(page);
 const first=await create(page,`race-a-${randomUUID().slice(0,8)}@example.test`,'student'),firstLink=await mailLink(first);
 const second=await create(page,`race-b-${randomUUID().slice(0,8)}@example.test`,'coordinator',true),secondLink=await mailLink(second),other=await recipient(browser);
 let releaseOld:(()=>void)|undefined;
 const held=new Promise<void>(resolve=>{releaseOld=resolve;});
 let oldReady:(()=>void)|undefined;
 const oldResponseReady=new Promise<void>(resolve=>{oldReady=resolve;});
 let interceptManual=false;
 await other.page.route('**/api/v1/invitations/preview',async route=>{
  const body=route.request().postDataJSON() as {invitationId:string};
  if(interceptManual&&body.invitationId===first){
   interceptManual=false;
   const response=await route.fetch();expect(response.status()).toBe(200);oldReady?.();await held;await route.fulfill({response});
  }else await route.continue();
 });
 try{
  await other.page.goto(firstLink.path);await expect(other.page.getByText('Estudiante',{exact:true})).toBeVisible();
  interceptManual=true;await other.page.getByRole('button',{name:'Actualizar invitación y sesión'}).click();await oldResponseReady;
  await other.page.goto(secondLink.path);await expect(other.page.getByText('Coordinación',{exact:true})).toBeVisible();await expect(other.page.getByText('Programa: Programa invitado',{exact:true})).toBeVisible();
  const staleResponse=other.page.waitForResponse(response=>response.url().endsWith('/invitations/preview')&&response.request().postDataJSON().invitationId===first);
  releaseOld?.();await (await staleResponse).finished();
  // Cross one browser rendering boundary after the held HTTP body completes; no timed delay.
  await other.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(other.page.getByText('Coordinación',{exact:true})).toBeVisible();await expect(other.page.getByText('Estudiante',{exact:true})).toHaveCount(0);
  await expect(other.page.getByRole('status').filter({hasText:'La invitación y tu sesión se comprobarán nuevamente'})).toHaveCount(0);
  await expect(other.page.locator('#invitation-consent')).not.toBeChecked();await other.page.locator('#invitation-consent').check();
  const rejected=other.page.waitForRequest(request=>request.url().endsWith('/invitations/reject'));
  await other.page.getByRole('button',{name:'Rechazar invitación',exact:true}).click();await other.page.getByRole('alertdialog').getByRole('button',{name:'Rechazar invitación'}).click();
  expect((await rejected).postDataJSON().invitationId).toBe(second);await expect(other.page.getByRole('heading',{name:'Invitación rechazada.'})).toBeVisible();
  const states=await sql.query('SELECT id,state FROM institution_invitations WHERE id=ANY($1::uuid[])',[[first,second]]);
  expect(states.rows.find(row=>row.id===first)?.state).toBe('pending');expect(states.rows.find(row=>row.id===second)?.state).toBe('rejected');
 }finally{releaseOld?.();await other.context.close();}
});
