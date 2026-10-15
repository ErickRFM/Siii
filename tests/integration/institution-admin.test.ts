import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isolatedDatabaseUrl} from '../support/database-url';
import {fixtureMfaLogin} from '../support/mfa-fixture';
const base='http://127.0.0.1:3107';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-F09-password-2026!';
let unit:string,foreign:string,user:string,member:string,cookie:string,hash:string;
let deliver:typeof import('../../src/shared/invitations/outbox-worker').deliverInvitations,pool:typeof import('../../src/infrastructure/database').pool;
const path=(suffix='settings',id=unit)=>'/api/v1/institutions/'+id+'/'+suffix;
async function req(url:string,body?:unknown,method=body===undefined?'GET':'POST',session=cookie){
 return fetch(base+url,{method,headers:{origin:base,...(session?{cookie:session}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function actor(role='admin',institution=unit){
 const person=(await sql.query("INSERT INTO people(first_name,last_name,email) VALUES('Private','Global','global-'||$1::text||'@example.test') RETURNING id",[randomUUID()])).rows[0].id;
 const name='f09-'+randomUUID();
 const id=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,name,hash])).rows[0].id;
 const membership=(await sql.query("INSERT INTO institution_memberships(institution_id,user_id,display_name) VALUES($1,$2,'Tenant operator') RETURNING id",[institution,id])).rows[0].id;
 await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[membership,role]);
 const response=await req('/api/v1/auth/login',{username:name,password},'POST','');
 expect(response.status).toBe(200);
 return {id,member:membership,username:name,cookie:await fixtureMfaLogin(sql,base,name,password,response,true)};
}
async function expectCode(response:Response,status:number,code:string){expect(response.status).toBe(status);expect(await response.json()).toEqual({error:{code}});}
const patch=(fields:Record<string,unknown>={},version=0)=>req(path(),{name:'Changed institution',reason:'Reviewed synthetic correction',expectedVersion:version,...fields},'PATCH');
const status=(value:string,version=0)=>req(path('status'),{status:value,reason:'Reviewed synthetic status',expectedVersion:version});
describe.sequential('F09 institutional settings and safe audit',()=>{
 beforeAll(async()=>{
  await sql.connect();hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
  const app=JSON.parse(readFileSync('.superpowers/sdd/2026-10-13-p0-hardening/app-connection.json','utf8')).connectionString;
  isolatedDatabaseUrl({SIII_DATABASE_ENV:'test',DATABASE_URL:app});const original=process.env.DATABASE_URL;process.env.DATABASE_URL=app;
  try{const database=await import('../../src/infrastructure/database');pool=database.pool;await database.assertApplicationRole();deliver=(await import('../../src/shared/invitations/outbox-worker')).deliverInvitations;}finally{process.env.DATABASE_URL=original;}
 });
 beforeEach(async()=>{
  await sql.query('DELETE FROM auth_throttle');
  await sql.query("UPDATE invitation_delivery_outbox SET next_attempt_at=now()+interval '1 day' WHERE state='queued'");
  unit=(await sql.query("INSERT INTO institutions(name,code) VALUES('Own institution',$1) RETURNING id",[randomUUID()])).rows[0].id;
  foreign=(await sql.query("INSERT INTO institutions(name,code) VALUES('Foreign institution',$1) RETURNING id",[randomUUID()])).rows[0].id;
  const own=await actor();({id:user,member,cookie}=own);
 });
 afterAll(async()=>{await pool?.end();await sql.end();});
 it('reads persisted own settings and exposes optimistic version',async()=>{
  const response=await req(path());expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({id:unit,name:'Own institution',shortName:null,timezone:'America/Mexico_City',status:'active',version:0});
 });
 it('persists only strict settings fields and requires reason/version with valid IANA timezone',async()=>{
  for(const fields of [{isActive:false},{timezone:'Mars/Olympus'},{expectedVersion:-1},{reason:'x'},{status:'inactive'}])await expectCode(await patch(fields),422,'VALIDATION_ERROR');
  const code='F09-'+randomUUID();const response=await patch({shortName:' Own ',code:' '+code+' ',timezone:'Europe/Madrid'});expect(response.status).toBe(200);expect((await response.json()).data).toMatchObject({name:'Changed institution',shortName:'Own',code,timezone:'Europe/Madrid',version:1});
  await expectCode(await patch({},0),409,'STALE_RESOURCE');
 });
 it('does not leak another institution through settings, audit, list or duplicate-code conflicts',async()=>{
  await expectCode(await req(path('settings',foreign)),403,'FORBIDDEN');await expectCode(await req(path('audit',foreign)),403,'FORBIDDEN');
  const list=await req('/api/v1/institutions/manageable');expect(list.status).toBe(200);expect((await list.json()).data.map((row:{id:string})=>row.id)).toEqual([unit]);
  const code=(await sql.query('SELECT code FROM institutions WHERE id=$1',[foreign])).rows[0].code;
  await expectCode(await patch({code}),409,'INSTITUTION_CODE_EXISTS');
 });
 it('reactivates own inactive/suspended unit while all ordinary institutional endpoints stay denied',async()=>{
  for(const [index,state] of ['inactive','suspended'].entries()){
   const version=index*2;expect((await status(state,version)).status).toBe(200);
   expect((await req(path())).status).toBe(200);expect((await req(path('audit'))).status).toBe(200);
   for(const endpoint of ['memberships','academic/programs','invitations','capabilities'])expect((await req(path(endpoint))).status).toBe(403);
   const own=(await(await req('/api/v1/institutions/manageable')).json()).data;expect(own[0].status).toBe(state);
   expect((await status('active',version+1)).status).toBe(200);
   expect((await req(path('academic/programs'))).status).toBe(200);
  }
 });
 it('treats archived metadata as terminal and rejects unsupported transitions without version changes',async()=>{
  await expectCode(await status('active'),409,'INVALID_STATUS_TRANSITION');await expectCode(await status('archived'),422,'VALIDATION_ERROR');
  await sql.query("UPDATE institutions SET status='archived' WHERE id=$1",[unit]);expect((await req(path())).status).toBe(200);await expectCode(await patch(),409,'INSTITUTION_ARCHIVED');await expectCode(await status('active'),409,'INSTITUTION_ARCHIVED');
 });
 it('serializes concurrent updates and rejects the losing expectedVersion',async()=>{
  const responses=await Promise.all([patch({name:'First'}),patch({name:'Second'})]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await sql.query('SELECT admin_version FROM institutions WHERE id=$1',[unit])).rows[0].admin_version).toBe(1);
  expect((await sql.query("SELECT count(*)::int n FROM security_audit_log WHERE institution_id=$1 AND action='institution.settings.update'",[unit])).rows[0].n).toBe(1);
 });
 it('never overflows an exhausted version counter',async()=>{await sql.query('UPDATE institutions SET admin_version=2147483647 WHERE id=$1',[unit]);await expectCode(await patch({},2147483647),409,'VERSION_LIMIT_REACHED');});
 it('requires an active institutional administrator grant and MFA verified against the current factor',async()=>{
  const coordinator=await actor('coordinator');await expectCode(await req(path(),undefined,'GET',coordinator.cookie),403,'FORBIDDEN');
  await sql.query("UPDATE role_assignments SET expires_at=now()-interval '1 second' WHERE membership_id=$1",[member]);await expectCode(await req(path()),403,'FORBIDDEN');
  await sql.query('UPDATE role_assignments SET expires_at=NULL WHERE membership_id=$1',[member]);
  await sql.query("UPDATE auth_sessions SET step_up_at=now()-interval '6 minutes' WHERE user_id=$1",[user]);expect((await req(path())).status).toBe(200);await expectCode(await patch(),403,'FORBIDDEN');
  await sql.query("UPDATE auth_mfa_factors SET enabled_at=clock_timestamp()+interval '1 second' WHERE user_id=$1",[user]);await expectCode(await req(path()),403,'FORBIDDEN');
 });
 it('rolls back settings and version when the audit insert fails',async()=>{
  const name='f09_audit_'+randomUUID().replaceAll('-','');await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='institution.settings.update' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$");await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
  try{expect((await patch()).status).toBe(500);expect((await sql.query('SELECT name,admin_version FROM institutions WHERE id=$1',[unit])).rows[0]).toEqual({name:'Own institution',admin_version:0});}finally{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');}
 });
 it('projects tenant audit without raw details, global identity labels or arbitrary target text',async()=>{
  await patch();await sql.query("INSERT INTO security_audit_log(institution_id,actor_user_id,action,target,details) VALUES($1,$2,'membership.profile',$3,$4)",[unit,user,'membership:'+member,JSON.stringify({reason:'Reviewed reason',before:{status:'active',institutionalEmail:'leak@example.test',passwordHash:'secret'},after:{status:'suspended',token:'bearer'},email:'global@example.test',ciphertext:'secret'})]);
  const foreignActor=await actor('admin',foreign);await sql.query("INSERT INTO security_audit_log(institution_id,actor_user_id,action,target,details) VALUES($1,$2,'unknown.action','email:leak@example.test',$3)",[unit,foreignActor.id,JSON.stringify({password:'secret'})]);
  const response=await req(path('audit'));expect(response.status).toBe(200);const data=(await response.json()).data;
  expect(JSON.stringify(data)).not.toMatch(/leak@example|global@example|Private|Global|password|bearer|ciphertext|secret/);
  const row=data.find((r:{action:string})=>r.action==='membership.profile');expect(row).toMatchObject({target:{kind:'membership',id:member},actor:{membershipId:member,label:'Tenant operator'},reason:'Reviewed reason',changes:{before:{status:'active'},after:{status:'suspended'}}});
  expect(data.find((r:{action:string})=>r.action==='unknown.action')).toMatchObject({actor:null,target:null,changes:{}});
 });
 it('binds audit cursors to tenant and normalized filters and rejects unknown/repeated parameters',async()=>{
  await patch();await patch({name:'Again'},1);
  const first=await(await req(path('audit')+'?limit=1&action=institution.settings.update')).json();expect(first.page.nextCursor).toBeTruthy();
  expect((await req(path('audit')+'?limit=1&action=membership.profile&cursor='+first.page.nextCursor)).status).toBe(400);
  for(const query of ['unknown=1','limit=1&limit=2','from=invalid','targetKind=email','action=%25'])expect((await req(path('audit')+'?'+query)).status).toBe(400);
 });
 it.each(['grant','stepup','session','expiry','factor','membership'] as const)('revalidates %s after waiting on the institution mutex',async(kind)=>{
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[unit]);const pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid;const pending=patch();
  try{let waiting=false;const end=Date.now()+8000;while(Date.now()<end){waiting=(await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) blocked",[pid])).rows[0].blocked;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,25));}expect(waiting).toBe(true);
   if(kind==='grant')await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE membership_id=$1',[member]);if(kind==='stepup')await sql.query("UPDATE auth_sessions SET step_up_at=now()-interval '6 minutes' WHERE user_id=$1",[user]);if(kind==='session')await sql.query('UPDATE platform_users SET auth_version=auth_version+1 WHERE id=$1',[user]);if(kind==='expiry')await sql.query("UPDATE role_assignments SET expires_at=clock_timestamp()-interval '1 second' WHERE membership_id=$1",[member]);
   if(kind==='factor')await sql.query("UPDATE auth_mfa_factors SET enabled_at=clock_timestamp()+interval '1 second' WHERE user_id=$1",[user]);
   if(kind==='membership')await sql.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[member]);
   await gate.query('COMMIT');expect((await pending).status).toBe(403);expect((await sql.query('SELECT admin_version FROM institutions WHERE id=$1',[unit])).rows[0].admin_version).toBe(0);
  }finally{await gate.query('ROLLBACK');await gate.end();await pending;}
 });
 it('rolls back settings after step-up expires during a delayed audit insert',async()=>{
  const name='f09_delay_'+randomUUID().replaceAll('-','');await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='institution.settings.update' THEN PERFORM pg_sleep(3); END IF; RETURN NEW; END $$");await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
  try{expect((await req(path())).status).toBe(200);await sql.query("UPDATE auth_sessions SET step_up_at=clock_timestamp()-interval '298 seconds' WHERE user_id=$1",[user]);await expectCode(await patch(),403,'FORBIDDEN');expect((await sql.query('SELECT admin_version,name FROM institutions WHERE id=$1',[unit])).rows[0]).toEqual({admin_version:0,name:'Own institution'});}finally{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');}
 });
 it('rechecks audit authorization after a blocked last read and returns no stale cursor/data',async()=>{
  await patch();const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE security_audit_log IN ACCESS EXCLUSIVE MODE');const pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=req(path('audit'));
  try{let waiting=false;const end=Date.now()+7000;while(Date.now()<end){waiting=(await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) blocked",[pid])).rows[0].blocked;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,25));}expect(waiting).toBe(true);await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE membership_id=$1',[member]);await gate.query('COMMIT');await expectCode(await pending,403,'FORBIDDEN');}finally{await gate.query('ROLLBACK');await gate.end();await pending;}
 });
 it('compares expectedVersion against state committed while the mutation waited',async()=>{
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[unit]);const pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=patch();
  try{let waiting=false;const end=Date.now()+7000;while(Date.now()<end){waiting=(await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) blocked",[pid])).rows[0].blocked;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,25));}expect(waiting).toBe(true);await gate.query('UPDATE institutions SET admin_version=1 WHERE id=$1',[unit]);await gate.query('COMMIT');await expectCode(await pending,409,'STALE_RESOURCE');}finally{await gate.query('ROLLBACK');await gate.end();await pending;}
 });
 it('does not grant platform authority from another tenant super-admin or a malformed scope',async()=>{
  const other=await actor('super_admin',foreign);await expectCode(await req(path(),undefined,'GET',other.cookie),403,'FORBIDDEN');
  await sql.query("UPDATE role_assignments SET role='coordinator' WHERE membership_id=$1",[member]);await expectCode(await req(path()),403,'FORBIDDEN');expect((await(await req('/api/v1/institutions/manageable')).json()).data).toEqual([]);
 });
 it('filters audit by normalized UTC interval and keeps equivalent precision cursors compatible',async()=>{
  await patch();await patch({name:'Next'},1);
  const first=await req(path('audit')+'?limit=1&from=2000-01-01T00:00:00Z&to=2099-01-01T00:00:00Z');expect(first.status).toBe(200);const body=await first.json();
  expect((await req(path('audit')+'?limit=1&from=2000-01-01T00:00:00.000Z&to=2099-01-01T00:00:00.000Z&cursor='+body.page.nextCursor)).status).toBe(200);
 });
 it('deactivation revokes pending tokens, cancels queued leases and preserves identities, grants and accepted mail metadata',async()=>{
  const created=await req(path('invitations'),{email:'pending-'+randomUUID()+'@example.test',role:'teacher'});expect(created.status).toBe(201);const invitation=(await created.json()).data;
  const second=await req(path('invitations'),{email:'delivered-'+randomUUID()+'@example.test',role:'teacher'});expect(second.status).toBe(201);const sent=(await second.json()).data;
  const event=(await sql.query('SELECT * FROM invitation_delivery_outbox WHERE invitation_id=$1',[invitation.id])).rows[0],lease=randomUUID();
  const {openInvitationDelivery}=await import('../../src/shared/invitations/delivery-seal'),message=openInvitationDelivery(event.payload_encrypted,event.id,unit),token=new URLSearchParams(new URL(message.text.split(/\s+/).find((word:string)=>word.startsWith('https://'))!).hash.slice(1)).get('token');
  await sql.query("UPDATE invitation_delivery_outbox SET lease_token=$1,lease_until=now()+interval '1 minute' WHERE id=$2",[lease,event.id]);
  await sql.query("UPDATE invitation_delivery_outbox SET state='accepted',provider_message_id='synthetic-delivery' WHERE invitation_id=$1",[sent.id]);
  const before=(await sql.query('SELECT auth_version,is_active FROM platform_users WHERE id=$1',[user])).rows[0];
  expect((await status('inactive')).status).toBe(200);
  expect((await sql.query('SELECT state,consumed_at FROM institution_invitations WHERE id=$1',[invitation.id])).rows[0]).toMatchObject({state:'revoked'});
  expect((await sql.query('SELECT state,lease_token,lease_until FROM invitation_delivery_outbox WHERE id=$1',[event.id])).rows[0]).toEqual({state:'cancelled',lease_token:null,lease_until:null});
  expect((await sql.query('SELECT state,provider_message_id FROM invitation_delivery_outbox WHERE invitation_id=$1',[sent.id])).rows[0]).toEqual({state:'accepted',provider_message_id:'synthetic-delivery'});
  expect((await sql.query('SELECT auth_version,is_active FROM platform_users WHERE id=$1',[user])).rows[0]).toEqual(before);
  expect((await sql.query('SELECT status FROM institution_memberships WHERE id=$1',[member])).rows[0].status).toBe('active');expect((await sql.query('SELECT revoked_at FROM role_assignments WHERE membership_id=$1',[member])).rows[0].revoked_at).toBeNull();
  expect((await status('active',1)).status).toBe(200);
  expect((await req('/api/v1/invitations/preview',{invitationId:invitation.id,token},'POST','')).status).toBe(404);
  expect((await sql.query('SELECT state FROM institution_invitations WHERE id=$1',[invitation.id])).rows[0].state).toBe('revoked');
 });
 it('rolls back institution state, version, invitation revocation and lease cancellation when status audit fails',async()=>{
  const created=await req(path('invitations'),{email:'rollback-'+randomUUID()+'@example.test',role:'teacher'});expect(created.status).toBe(201);const invitation=(await created.json()).data,lease=randomUUID();await sql.query("UPDATE invitation_delivery_outbox SET lease_token=$1,lease_until=now()+interval '1 minute' WHERE invitation_id=$2",[lease,invitation.id]);
  const name='f09_status_audit_'+randomUUID().replaceAll('-','');await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='institution.status.change' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$");await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
  try{expect((await status('suspended')).status).toBe(500);expect((await sql.query('SELECT status,admin_version FROM institutions WHERE id=$1',[unit])).rows[0]).toEqual({status:'active',admin_version:0});expect((await sql.query('SELECT state,consumed_at FROM institution_invitations WHERE id=$1',[invitation.id])).rows[0]).toEqual({state:'pending',consumed_at:null});expect((await sql.query('SELECT state,lease_token FROM invitation_delivery_outbox WHERE invitation_id=$1',[invitation.id])).rows[0]).toEqual({state:'queued',lease_token:lease});}finally{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');}
 });
 it('does not resurrect a cancelled tenant outbox after an in-flight synthetic transport returns',async()=>{
  const created=await req(path('invitations'),{email:'worker-'+randomUUID()+'@example.test',role:'teacher'});expect(created.status).toBe(201);const invitation=(await created.json()).data;
  const original={RESEND_API_KEY:process.env.RESEND_API_KEY,SIII_EMAIL_FROM:process.env.SIII_EMAIL_FROM,SIII_EMAIL_REPLY_TO:process.env.SIII_EMAIL_REPLY_TO};process.env.RESEND_API_KEY='re_synthetic_fixture_only';process.env.SIII_EMAIL_FROM='synthetic@example.test';process.env.SIII_EMAIL_REPLY_TO='reply@example.test';
  let arrived!:()=>void,release!:()=>void;const entered=new Promise<void>(resolve=>{arrived=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const pending=deliver({limit:1,transport:async()=>{arrived();await gate;return {status:'accepted',messageId:'synthetic-worker'};}});
  try{await Promise.race([entered,pending.then(()=>{throw new Error('SYNTHETIC_WORKER_NOT_CLAIMED');})]);expect((await status('inactive')).status).toBe(200);}finally{release();for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  expect((await pending).accepted).toBe(0);expect((await sql.query('SELECT state,provider_message_id,lease_token,lease_until FROM invitation_delivery_outbox WHERE invitation_id=$1',[invitation.id])).rows[0]).toEqual({state:'cancelled',provider_message_id:null,lease_token:null,lease_until:null});
 });
 it('enforces the additive version constraint on the local database',async()=>{await expect(sql.query('UPDATE institutions SET admin_version=-1 WHERE id=$1',[unit])).rejects.toMatchObject({code:'23514'});});
 it('rejects PostgreSQL-incompatible year zero audit boundaries with INVALID_PAGE',async()=>{
  for(const field of ['from','to'])await expectCode(await req(path('audit')+'?'+field+'=0000-01-01T00:00:00Z'),400,'INVALID_PAGE');
 });
});