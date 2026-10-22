import {beforeAll,afterAll,beforeEach,describe,expect,it} from 'vitest';
import pg from 'pg';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {applicantMail} from '../support/applicant-mail';
import {deliverApplicantVerifications} from '@/modules/admissions/outbox-worker';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';
const base='http://127.0.0.1:3107',sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),password='Synthetic-admissions-2026!';
async function post(path:string,body:unknown,cookie='',origin=base){return fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin,cookie},body:JSON.stringify(body),redirect:'manual'});}
async function register(){const email='aspirant-'+randomUUID()+'@example.test',response=await post('/api/v1/admissions/register',{email,firstName:'Synthetic',lastName:'Applicant',password});expect(response.status).toBe(202);expect(await response.json()).toMatchObject({data:{requested:true}});return {email,...await applicantMail(sql,email)};}
async function activate(){const applicant=await register();expect((await post('/api/v1/admissions/verify',{id:applicant.id,token:applicant.token,password})).status).toBe(200);const login=await post('/api/v1/admissions/login',{email:applicant.email,password});expect(login.status).toBe(200);return {...applicant,cookie:login.headers.get('set-cookie')!.split(';')[0]};}
async function offer(){const institution=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic admission institution',$1) RETURNING id",['C32-'+randomUUID()])).rows[0].id;const cycle=(await sql.query("INSERT INTO admission_cycles(institution_id,code,name,start_date,end_date,status) VALUES($1,'C32','Synthetic open cycle',now()-interval '1 day',now()+interval '1 day','open') RETURNING id",[institution])).rows[0].id;const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'C32','Synthetic program','ingenieria','presencial') RETURNING id",[institution])).rows[0].id;return {institution,cycle,program,path:'/api/v1/institutions/'+institution+'/admissions/applications'};}
async function institutionalCookie(institution:string,role:string,mfa=true,scopeProgram?:string){const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic staff','C32') RETURNING id")).rows[0].id;const user=(await sql.query("INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,'not-used-direct-session-fixture') RETURNING id",[person,'c32-'+randomUUID()])).rows[0].id;const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institution,user])).rows[0].id;await sql.query('INSERT INTO role_assignments(institution_id,membership_id,role,scope_type,scope_program_id) VALUES($1,$2,$3,$4,$5)',[institution,member,role,scopeProgram?'program':'institution',scopeProgram??null]);if(mfa&&role!=='guest'){await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)]);}
 const raw=randomBytes(32).toString('base64url');await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',$3)",[user,createHash('sha256').update(raw).digest('hex'),mfa?new Date():null]);return (process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_session':'siii_session')+'='+raw;}

describe.sequential('C32 real HTTP, mailbox proof, session ownership and PostgreSQL authorization',()=>{
 beforeAll(async()=>{await sql.connect();});afterAll(async()=>{await sql.end();});beforeEach(async()=>{await sql.query("DELETE FROM auth_throttle WHERE scope LIKE 'admissions_%'");});
 it('does not disclose tokens or verify registration; requires mailbox, password, and single-use proof',async()=>{
  const a=await register();const profile=(await sql.query('SELECT * FROM applicant_profiles WHERE id=$1',[a.id])).rows[0];expect(profile.email_verified_at).toBeNull();expect(profile.mailbox_verified_at).toBeNull();expect(profile.verification_token_hash).not.toBe(a.token);expect(profile.verification_expires_at).toBeInstanceOf(Date);
  const duplicate=await post('/api/v1/admissions/register',{email:a.email,firstName:'Different',lastName:'Person',password});expect(duplicate.status).toBe(202);expect(JSON.stringify(await duplicate.json())).not.toContain(a.id);
  expect((await post('/api/v1/admissions/login',{email:a.email,password})).status).toBe(401);
  expect((await post('/api/v1/admissions/verify',{id:a.id,token:randomBytes(32).toString('base64url'),password})).status).toBe(400);
  expect((await post('/api/v1/admissions/verify',{id:a.id,token:a.token,password:'wrong'})).status).toBe(400);
  const concurrent=await Promise.all([1,2].map(()=>post('/api/v1/admissions/verify',{id:a.id,token:a.token,password})));expect(concurrent.map(r=>r.status).sort()).toEqual([200,400]);
  expect((await sql.query('SELECT verification_token_hash FROM applicant_profiles WHERE id=$1',[a.id])).rows[0].verification_token_hash).toBeNull();
  const login=await post('/api/v1/admissions/login',{email:a.email,password});expect(login.status).toBe(200);expect(login.headers.get('set-cookie')).toContain('HttpOnly');expect(login.headers.get('set-cookie')).toContain('SameSite=strict');expect(JSON.stringify(await login.json())).not.toContain('passwordHash');
 });
 it('expires proof, rotates resend, refuses legacy auto-verification, and bounds guesses without enumeration',async()=>{
  const a=await register();await sql.query("UPDATE applicant_profiles SET verification_expires_at=clock_timestamp()-make_interval(secs => 1),email_verified_at=now() WHERE id=$1",[a.id]);expect((await post('/api/v1/admissions/verify',{id:a.id,token:a.token,password})).status).toBe(400);expect((await post('/api/v1/admissions/login',{email:a.email,password})).status).toBe(401);
  expect((await post('/api/v1/admissions/resend',{email:a.email,password})).status).toBe(202);const fresh=await applicantMail(sql,a.email);expect(fresh.token).not.toBe(a.token);expect((await post('/api/v1/admissions/verify',{id:a.id,token:a.token,password})).status).toBe(400);expect((await post('/api/v1/admissions/verify',{id:fresh.id,token:fresh.token,password})).status).toBe(200);
  const responses=[];for(let n=0;n<11;n++)responses.push((await post('/api/v1/admissions/login',{email:'missing-'+a.email,password})).status);expect(responses.slice(0,10)).toEqual(Array(10).fill(401));expect(responses[10]).toBe(429);
 });
 it('keeps the same legacy identity when the stored email has uppercase characters',async()=>{
  const a=await register();await sql.query('UPDATE applicant_profiles SET email=upper(email) WHERE id=$1',[a.id]);
  const duplicate=await post('/api/v1/admissions/register',{email:a.email,firstName:'Other',lastName:'Attempt',password});expect(duplicate.status).toBe(202);
  expect((await sql.query('SELECT id FROM applicant_profiles WHERE lower(email)=$1',[a.email])).rows.map(row=>row.id)).toEqual([a.id]);
  expect((await post('/api/v1/admissions/resend',{email:a.email,password})).status).toBe(202);const mail=await applicantMail(sql,a.email.toUpperCase());expect(mail.id).toBe(a.id);
  expect((await post('/api/v1/admissions/verify',{id:mail.id,token:mail.token,password})).status).toBe(200);expect((await post('/api/v1/admissions/login',{email:a.email,password})).status).toBe(200);
 });
 it('keeps failed and unconfigured delivery honest, retries immutable encrypted mail, and never verifies on provider acceptance',async()=>{
  const a=await register();expect((await sql.query('SELECT payload_encrypted FROM applicant_verification_outbox WHERE id=$1',[a.eventId])).rows[0].payload_encrypted).not.toContain(a.token);
  // Isolate this delivery from unrelated registered applicants; all fixtures are disposable.
  await sql.query("UPDATE applicant_verification_outbox SET state='cancelled' WHERE state='queued' AND id<>$1",[a.eventId]);
  expect((await deliverApplicantVerifications({transport:async()=>{throw Error('must not send without sender');}})).claimed).toBe(0);
  await sql.query("UPDATE applicant_verification_outbox SET sender_email='sender@example.test',reply_to_email='reply@example.test',next_attempt_at=clock_timestamp()-make_interval(secs => 1) WHERE id=$1",[a.eventId]);
  let first='';expect((await deliverApplicantVerifications({transport:async message=>{first=JSON.stringify(message);return {status:'retryable',code:'EMAIL_PROVIDER_RETRY'};}})).retried).toBe(1);
  await sql.query('UPDATE applicant_verification_outbox SET next_attempt_at=clock_timestamp()-make_interval(secs => 1) WHERE id=$1',[a.eventId]);let accepted=0;const competing=await Promise.all([1,2].map(()=>deliverApplicantVerifications({transport:async message=>{accepted++;expect(JSON.stringify(message)).toBe(first);return {status:'accepted',messageId:randomUUID()};}})));expect(competing.reduce((sum,result)=>sum+result.accepted,0)).toBe(1);expect(accepted).toBe(1);
  expect((await sql.query('SELECT mailbox_verified_at FROM applicant_profiles WHERE id=$1',[a.id])).rows[0].mailbox_verified_at).toBeNull();
 });
 it('rejects arbitrary ownership, absent session, cross-tenant catalog IDs, closed cycles, and CSRF; generates concurrent unique folios',async()=>{
  const a=await activate(),b=await activate(),o=await offer(),other=await offer(),body={cycleId:o.cycle,programId:o.program};
  expect((await post(o.path,body)).status).toBe(401);expect((await post(o.path,{...body,applicantId:b.id},a.cookie)).status).toBe(422);
  expect((await post(o.path,body,a.cookie,'https://attacker.example')).status).toBe(403);expect((await post(o.path,{...body,programId:other.program},a.cookie)).status).toBe(404);expect((await post(o.path,{...body,cycleId:other.cycle},a.cookie)).status).toBe(409);
  const concurrent=await Promise.all([a,b].map(applicant=>post(o.path,body,applicant.cookie)));expect(concurrent.map(r=>r.status)).toEqual([201,201]);const applications=await Promise.all(concurrent.map(r=>r.json()));expect(new Set(applications.map(r=>r.data.applicationNumber)).size).toBe(2);
  const retry=await post(o.path,body,a.cookie);expect(retry.status).toBe(200);expect((await retry.json()).data.applicationNumber).toBe(applications[0].data.applicationNumber);
  expect((await sql.query('SELECT applicant_id FROM admission_applications WHERE id=$1',[applications[0].data.id])).rows[0].applicant_id).toBe(a.id);
  await sql.query("UPDATE admission_cycles SET status='closed' WHERE id=$1",[o.cycle]);expect((await post(o.path,body,a.cookie)).status).toBe(409);
 });
 it('checks session rotation, expiry and revocation; every mutation enforces explicit same origin',async()=>{
  const a=await activate();expect((await post('/api/v1/admissions/logout',{},a.cookie,'https://attacker.example')).status).toBe(403);
  const rotated=await post('/api/v1/admissions/login',{email:a.email,password});const newCookie=rotated.headers.get('set-cookie')!.split(';')[0];expect((await fetch(base+'/api/v1/admissions/session',{headers:{cookie:a.cookie}})).status).toBe(401);
  expect((await post('/api/v1/admissions/logout',{},newCookie)).status).toBe(200);expect((await fetch(base+'/api/v1/admissions/session',{headers:{cookie:newCookie}})).status).toBe(401);
  const login=await post('/api/v1/admissions/login',{email:a.email,password}),cookie=login.headers.get('set-cookie')!.split(';')[0];await sql.query("UPDATE applicant_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE applicant_id=$1 AND revoked_at IS NULL",[a.id]);expect((await fetch(base+'/api/v1/admissions/session',{headers:{cookie}})).status).toBe(401);
  for(const endpoint of ['register','resend','verify','login','logout'])expect((await post('/api/v1/admissions/'+endpoint,{},'', 'https://attacker.example')).status).toBe(403);
  expect((await fetch(base+'/api/v1/admissions/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(403);
 });
 it('denies guest, missing MFA, scoped and foreign staff in API and SSR; permits institution-wide control escolar with MFA',async()=>{
  const o=await offer(),foreign=await offer();
  for(const cookie of [await institutionalCookie(o.institution,'guest'),await institutionalCookie(o.institution,'control_escolar',false),await institutionalCookie(foreign.institution,'control_escolar'),await institutionalCookie(o.institution,'control_escolar',true,o.program)]){
   expect((await fetch(base+o.path,{headers:{cookie}})).status).toBe(403);const page=await fetch(base+'/dashboard/institutions/'+o.institution+'/admissions',{headers:{cookie},redirect:'manual'});expect(page.status).toBe(307);expect(page.headers.get('location')).toBe('/dashboard');
  }
  const staff=await institutionalCookie(o.institution,'control_escolar');expect((await fetch(base+o.path,{headers:{cookie:staff}})).status).toBe(200);const page=await fetch(base+'/dashboard/institutions/'+o.institution+'/admissions',{headers:{cookie:staff}});expect(page.status).toBe(200);expect(await page.text()).toContain('Gestión de Admisiones');
 });
 it.each(['api-session','api-grant','ssr-session','ssr-grant'])('does not leak PII after final-read authorization changes: %s',async(kind)=>{
  const o=await offer(),cookie=await institutionalCookie(o.institution,'control_escolar'),privateEmail='private-'+randomUUID()+'@example.test';
  const applicant=(await sql.query("INSERT INTO applicant_profiles(email,first_name,last_name,password_hash) VALUES($1,'Private','Applicant','fixture-only') RETURNING id",[privateEmail])).rows[0].id;
  await sql.query("INSERT INTO admission_applications(institution_id,cycle_id,program_id,applicant_id,application_number,status) VALUES($1,$2,$3,$4,$5,'submitted')",[o.institution,o.cycle,o.program,applicant,'C32-race-'+randomUUID()]);
  const path=kind.startsWith('api')?o.path:'/dashboard/institutions/'+o.institution+'/admissions';
  const baseline=await fetch(base+path,{headers:{cookie}});expect(baseline.status).toBe(200);expect(await baseline.text()).toContain(privateEmail);
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE admission_applications IN ACCESS EXCLUSIVE MODE');
  const pending=fetch(base+path,{headers:{cookie},redirect:'manual'});let waiting=false;
  try{
   const until=Date.now()+7000;while(Date.now()<until){waiting=(await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%admission_applications%') AS blocked")).rows[0].blocked;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,25));}expect(waiting).toBe(true);
   const hash=createHash('sha256').update(cookie.split('=')[1]).digest('hex');
   if(kind.endsWith('session'))await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1',[hash]);
   else await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE membership_id IN (SELECT m.id FROM institution_memberships m JOIN auth_sessions s ON s.user_id=m.user_id WHERE s.token_hash=$1)',[hash]);
   await gate.query('COMMIT');const response=await pending;expect([200,307,403]).toContain(response.status);const body=await response.text();expect(body).not.toContain(privateEmail);if(kind.startsWith('api')&&response.status===200)expect(JSON.parse(body).data).toEqual([]);
  }finally{await gate.query('ROLLBACK');await gate.end();await pending;}
 });

 it('rolls back proof, session rotation, folio and application when sensitive audit fails',async()=>{
  const pending=await register(),active=await activate(),o=await offer(),name='c32_audit_'+randomUUID().replaceAll('-','');
  await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('admissions.email.verified','admissions.login','admissions.application.submitted') THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
  await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
  try{
   expect((await post('/api/v1/admissions/verify',{id:pending.id,token:pending.token,password})).status).toBe(500);
   expect((await sql.query('SELECT mailbox_verified_at,verification_token_hash IS NOT NULL AS pending FROM applicant_profiles WHERE id=$1',[pending.id])).rows[0]).toEqual({mailbox_verified_at:null,pending:true});
   expect((await post('/api/v1/admissions/login',{email:active.email,password})).status).toBe(500);
   expect((await fetch(base+'/api/v1/admissions/session',{headers:{cookie:active.cookie}})).status).toBe(200);
   expect((await post(o.path,{cycleId:o.cycle,programId:o.program},active.cookie)).status).toBe(500);
   expect((await sql.query('SELECT count(*)::int AS n FROM admission_applications WHERE institution_id=$1',[o.institution])).rows[0].n).toBe(0);expect((await sql.query('SELECT application_sequence FROM admission_cycles WHERE id=$1',[o.cycle])).rows[0].application_sequence).toBe(0);
  }finally{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');}
 });
 it('protects both credential and delivery tables from Data API roles and unsafe runtime privileges',async()=>{
  for(const table of ['applicant_sessions','applicant_verification_outbox']){
   const row=(await sql.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner,has_table_privilege('siii_app',oid,'SELECT,INSERT,UPDATE') AS backend,has_table_privilege('siii_app',oid,'DELETE,TRUNCATE,REFERENCES,TRIGGER') AS unsafe FROM pg_class WHERE oid=$1::regclass",[table])).rows[0];expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'siii_migrator',backend:true,unsafe:false});
   for(const role of ['anon','authenticated'])expect((await sql.query("SELECT has_table_privilege($1,$2::regclass,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any",[role,table])).rows[0].any).toBe(false);
  }
 });

 it('rejects inactive tenant/program/campus and mismatched campus without writing applications',async()=>{
  const a=await activate(),o=await offer(),other=await offer(),body={cycleId:o.cycle,programId:o.program};
  const foreignCampus=(await sql.query("INSERT INTO campuses(institution_id,name,code) VALUES($1,'Foreign campus','C32') RETURNING id",[other.institution])).rows[0].id;
  expect((await post(o.path,{...body,campusId:foreignCampus},a.cookie)).status).toBe(404);
  const ownCampus=(await sql.query("INSERT INTO campuses(institution_id,name,code,status) VALUES($1,'Inactive campus','C32','inactive') RETURNING id",[o.institution])).rows[0].id;
  expect((await post(o.path,{...body,campusId:ownCampus},a.cookie)).status).toBe(404);
  await sql.query("UPDATE academic_programs SET status='inactive' WHERE id=$1",[o.program]);expect((await post(o.path,body,a.cookie)).status).toBe(404);
  await sql.query("UPDATE academic_programs SET status='active' WHERE id=$1",[o.program]);await sql.query("UPDATE institutions SET status='inactive' WHERE id=$1",[o.institution]);expect((await post(o.path,body,a.cookie)).status).toBe(404);
  expect((await sql.query('SELECT count(*)::int n FROM admission_applications WHERE institution_id=$1',[o.institution])).rows[0].n).toBe(0);
 });

 it('rolls back the application if its applicant session expires while waiting for a cycle lock',async()=>{
  const o=await offer(),body={cycleId:o.cycle,programId:o.program};expect((await post(o.path,body)).status).toBe(401);
  const applicant=(await sql.query("INSERT INTO applicant_profiles(email,first_name,last_name,password_hash,email_verified_at,mailbox_verified_at) VALUES($1,'Expiry','Fixture','not-used-for-login',now(),now()) RETURNING id",['expiry-'+randomUUID()+'@example.test'])).rows[0].id;
  const raw=randomBytes(32).toString('base64url'),hash=createHash('sha256').update('SIII:applicant:v1\0'+raw).digest('hex');
  const session=(await sql.query("INSERT INTO applicant_sessions(applicant_id,token_hash,created_at,expires_at) VALUES($1,$2,now()-interval '1 hour',clock_timestamp()+interval '5 seconds') RETURNING expires_at",[applicant,hash])).rows[0];
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('SELECT id FROM admission_cycles WHERE id=$1 FOR UPDATE',[o.cycle]);
  const pending=post(o.path,body,(process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_applicant_session=':'siii_applicant_session=')+raw);let waiting=false;
  try{
   const until=Date.now()+4000;while(Date.now()<until){waiting=(await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%admission_cycles%') blocked")).rows[0].blocked;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,25));}expect(waiting).toBe(true);
   await sql.query('SELECT pg_sleep(greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.1)',[session.expires_at]);await gate.query('COMMIT');expect((await pending).status).toBe(401);
   expect((await sql.query('SELECT count(*)::int n FROM admission_applications WHERE institution_id=$1',[o.institution])).rows[0].n).toBe(0);expect((await sql.query('SELECT application_sequence FROM admission_cycles WHERE id=$1',[o.cycle])).rows[0].application_sequence).toBe(0);
   expect((await sql.query("SELECT count(*)::int n FROM security_audit_log WHERE institution_id=$1 AND action='admissions.application.submitted'",[o.institution])).rows[0].n).toBe(0);
  }finally{await gate.query('ROLLBACK');await gate.end();await pending;}
 });

});
