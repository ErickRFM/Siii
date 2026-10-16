import {isolatedDatabaseUrl} from '../support/database-url';
const testDatabaseUrl=isolatedDatabaseUrl();
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID,createHash} from 'node:crypto';
import {fixtureMfaLogin} from '../support/mfa-fixture';
const base='http://127.0.0.1:3107',suffix=randomUUID().slice(0,8);
const username='local-p0-'+suffix,password='Synthetic-password-2026!';
const sql=new pg.Client({connectionString:testDatabaseUrl});
let userId:string,institutionA:string,institutionB:string,cookie='';
async function request(path:string,method='GET',body?:unknown,session=cookie,headers:Record<string,string>={}){
 return fetch(base+path,{method,redirect:'manual',headers:{origin:base,...(body?{'content-type':'application/json'}:{}),...(session?{cookie:session}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
}
async function login(name=username,pass=password){
 const r=await request('/api/v1/auth/login','POST',{username:name,password:pass},'');
 return {r,cookie:await fixtureMfaLogin(sql,base,name,pass,r)};
}
describe.sequential('real HTTP handlers and authorization',()=>{
 beforeAll(async()=>{
  await sql.connect();
  const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','P0') RETURNING id")).rows[0].id;
  const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
  userId=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
  const units=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic A',$1),('Synthetic B',$2) RETURNING id",[suffix+'A',suffix+'B'])).rows;
  institutionA=units[0].id;institutionB=units[1].id;
  const membership=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institutionA,userId])).rows[0].id;
  await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'admin')",[membership]);
  cookie=(await login()).cookie;
 },30000);
 beforeEach(async()=>{
  await sql.query('DELETE FROM auth_throttle');
  await sql.query('UPDATE platform_users SET failed_login_attempts=0,locked_until=NULL WHERE id=$1',[userId]);
 });
 it('audits successful login with a generated request_id',async()=>{
  const result=await login();expect(result.r.status).toBe(200);cookie=result.cookie;
  const events=(await sql.query("SELECT request_id FROM security_audit_log WHERE actor_user_id=$1 AND action='auth.login' ORDER BY created_at DESC LIMIT 1",[userId])).rows;
  expect(events[0].request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(result.r.headers.get('cache-control')).toContain('no-store');
 });
 it('audits rejected and unknown credentials with the same response',async()=>{
  const known=await login(username,'wrong'),missing=await login('missing-'+suffix,'wrong');
  expect(known.r.status).toBe(401);expect(await known.r.json()).toEqual(await missing.r.json());
  expect((await sql.query("SELECT count(*)::int AS n FROM security_audit_log WHERE action='auth.login.failed' AND request_id IS NOT NULL")).rows[0].n).toBeGreaterThanOrEqual(2);
 });
 it('does not reveal account existence through login work time',async()=>{
  const times={known:[] as number[],missing:[] as number[]};
  for(let i=0;i<7;i++)for(const kind of ['known','missing'] as const){
   await sql.query('DELETE FROM auth_throttle');
   await sql.query('UPDATE platform_users SET failed_login_attempts=0,locked_until=NULL WHERE id=$1',[userId]);
   const start=performance.now();await login(kind==='known'?username:'missing-'+suffix,'wrong');times[kind].push(performance.now()-start);
  }
  const median=(xs:number[])=>xs.sort((a,b)=>a-b)[3],ratio=median(times.missing)/median(times.known);
  expect(ratio).toBeGreaterThan(0.6);expect(ratio).toBeLessThan(1.6);
 },30000);
 it('resets attempts when an account block expires',async()=>{
  for(let i=0;i<5;i++)await login(username,'wrong');
  expect((await login()).r.status).toBe(401);
  await sql.query("UPDATE platform_users SET locked_until=now()-interval '1 minute' WHERE id=$1",[userId]);
  await sql.query("UPDATE auth_throttle SET blocked_until=now()-interval '1 minute'");
  await login(username,'wrong');
  expect((await sql.query('SELECT failed_login_attempts FROM platform_users WHERE id=$1',[userId])).rows[0].failed_login_attempts).toBe(1);
  const success=await login();expect(success.r.status).toBe(200);cookie=success.cookie;
 });
 it('limits attempts across accounts from the same IP',async()=>{
  let response:Response|undefined;
  for(let i=0;i<32;i++)response=(await login('absent-'+suffix+'-'+i,'wrong')).r;
  expect(response!.status).toBe(429);
 },30000);
 it('rejects forged origins on all auth mutations',async()=>{
  for(const path of ['/api/v1/auth/login','/api/v1/auth/logout','/api/v1/auth/password/change'])
   expect((await request(path,'POST',{},cookie,{origin:'https://attacker.example'})).status).toBe(403);
 });
 it('rejects inactive sessions before absolute expiry',async()=>{
  const session=await login(),token=session.cookie.split('=')[1];
  await sql.query("UPDATE auth_sessions SET last_seen_at=now()-interval '31 minutes' WHERE token_hash=$1",[createHash('sha256').update(token).digest('hex')]);
  expect((await request('/api/v1/auth/me','GET',undefined,session.cookie)).status).toBe(401);
 });
 it('denies expired and revoked sessions',async()=>{
  const first=await login();await sql.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[userId]);
  expect((await request('/api/v1/auth/me','GET',undefined,first.cookie)).status).toBe(401);
  const second=await login();await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',[userId]);
  expect((await request('/api/v1/auth/me','GET',undefined,second.cookie)).status).toBe(401);
  cookie=(await login()).cookie;
 });
 it('bounds active devices and preserves the newest session',async()=>{
  for(let i=0;i<7;i++)cookie=(await login()).cookie;
  expect((await sql.query("SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()",[userId])).rows[0].n).toBeLessThanOrEqual(5);
  expect((await request('/api/v1/auth/me')).status).toBe(200);
 },30000);
 it.each(['campuses','terms','programs','courses','curricula'])('denies tenant B at all %s handlers',async resource=>{
  const path='/api/v1/institutions/'+institutionB+'/academic/'+resource;
  for(const method of ['GET','POST','PATCH'])expect((await request(path,method,method==='GET'?undefined:{id:randomUUID()})).status).toBe(403);
 });
 it('sends security headers and replaces a supplied request_id',async()=>{
  const response=await request('/api/health','GET',undefined,'',{'x-request-id':'attacker-controlled'});
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
 });

describe('academic handler contracts',()=>{
 const payloads:Record<string,Record<string,unknown>>={
  campuses:{code:'C'+suffix,name:'Synthetic campus'},
  terms:{code:'T'+suffix,name:'Synthetic term',startDate:'2026-01-01',endDate:'2026-06-30'},
  programs:{code:'P'+suffix,name:'Synthetic program',level:'ingenieria',modality:'presencial'},
  courses:{code:'M'+suffix,name:'Synthetic course',credits:6},
 };
 async function auth(){await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;expect((await request('/api/v1/auth/me')).status).toBe(200);}
 it.each(['campuses','terms','programs','courses'])('rejects mass assignment in %s',async resource=>{
  await auth();
  const response=await request('/api/v1/institutions/'+institutionA+'/academic/'+resource,'POST',{...payloads[resource],code:'MA'+suffix,institutionId:institutionB});
  expect(response.status).toBe(422);
 });
 it.each(['campuses','terms','programs','courses'])('audits %s before/after and blocks cross-tenant IDOR',async resource=>{
  await auth();
  const path='/api/v1/institutions/'+institutionA+'/academic/'+resource;
  const created=await request(path,'POST',payloads[resource]);expect(created.status).toBe(201);
  const {data}=await created.json();
  const renamed=await request(path,'PATCH',{id:data.id,name:'Corrected synthetic name'});expect(renamed.status).toBe(200);
  const event=(await sql.query("SELECT details,request_id FROM security_audit_log WHERE target=$1 AND action=$2 ORDER BY created_at DESC LIMIT 1",[resource+':'+data.id,'academic.'+resource+'.update'])).rows[0];
  expect(event.request_id).toBe(renamed.headers.get('x-request-id'));
  expect(event.details.before.name).toBe(payloads[resource].name);expect(event.details.after.name).toBe('Corrected synthetic name');
  const foreign=(await sql.query(resource==='programs'?"INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Foreign','ingenieria','presencial') RETURNING id":resource==='courses'?"INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Foreign',3) RETURNING id":resource==='terms'?"INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Foreign','2026-01-01','2026-02-01') RETURNING id":"INSERT INTO campuses(institution_id,code,name) VALUES($1,$2,'Foreign') RETURNING id",[institutionB,'B'+suffix])).rows[0];
  expect((await request(path,'PATCH',{id:foreign.id,name:'Intrusion'})).status).toBe(404);
  expect((await request(path,'PATCH',{id:data.id,status:'suspended'})).status).toBe(422);
 });
 it('paginates deterministically, rejects foreign cursors and retains exact dates',async()=>{
  await auth();
  const path='/api/v1/institutions/'+institutionA+'/academic/terms';
  await request(path,'POST',{code:'X'+suffix,name:'Second synthetic term',startDate:'2027-01-01',endDate:'2027-02-01'});
  const first=await (await request(path+'?limit=1')).json();expect(first.data).toHaveLength(1);expect(first.page.nextCursor).toBeTruthy();
  const second=await (await request(path+'?limit=1&cursor='+encodeURIComponent(first.page.nextCursor))).json();
  expect(second.data[0].id).not.toBe(first.data[0].id);
  expect(first.data[0].startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(first.data[0]).not.toHaveProperty('legacyStartDate');
  expect((await request('/api/v1/institutions/'+institutionA+'/academic/courses?cursor='+encodeURIComponent(first.page.nextCursor))).status).toBe(400);
 });
 it('blocks archiving a program with an active curriculum and cross-tenant plan references',async()=>{
  await auth();
  const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Plan parent','ingenieria','presencial') RETURNING id",[institutionA,'PLAN'+suffix])).rows[0];
  const planPath='/api/v1/institutions/'+institutionA+'/academic/curricula';
  const created=await request(planPath,'POST',{programId:program.id,version:'V1'});expect(created.status).toBe(201);
  const plan=(await created.json()).data;
  expect((await request('/api/v1/institutions/'+institutionA+'/academic/programs','PATCH',{id:program.id,status:'archived'})).status).toBe(409);
  const foreign=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Foreign plan parent','ingenieria','presencial') RETURNING id",[institutionB,'PLANB'+suffix])).rows[0];
  expect((await request(planPath,'POST',{programId:foreign.id,version:'V2'})).status).toBe(422);
  expect((await request(planPath,'PATCH',{id:plan.id,name:'mass assignment'})).status).toBe(422);
  const foreignPlan=(await sql.query("INSERT INTO curriculum_versions(institution_id,program_id,version) VALUES($1,$2,'FB') RETURNING id",[institutionB,foreign.id])).rows[0];
  expect((await request(planPath,'PATCH',{id:foreignPlan.id,status:'inactive'})).status).toBe(404);
  const ownPlans=(await (await request(planPath)).json()).data;
  expect(ownPlans.some((row:{id:string})=>row.id===foreignPlan.id)).toBe(false);
  expect((await request(planPath,'POST',{programId:program.id,version:'V3',institutionId:institutionB})).status).toBe(422);
 });
});


describe('institutional handlers',()=>{
 async function target(withMembership=true,unit=institutionA){
  const key=randomUUID().slice(0,8),name='local-target-'+key;
  const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Target') RETURNING id")).rows[0].id;
  const user=(await sql.query("INSERT INTO platform_users(person_id,username,password_hash) SELECT $1,$2,password_hash FROM platform_users WHERE id=$3 RETURNING id",[person,name,userId])).rows[0];
  let member:string|undefined;
  if(withMembership){member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[unit,user.id])).rows[0].id;await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'student')",[member]);}
  return {userId:user.id,username:name,membershipId:member};
 }
 async function auth(){await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;expect((await request('/api/v1/auth/me')).status).toBe(200);}
 it('paginates memberships and institutions without silent limits',async()=>{
  await auth();await target();await target();
  const path='/api/v1/institutions/'+institutionA+'/memberships';
  const first=await (await request(path+'?limit=1')).json();expect(first.data).toHaveLength(1);expect(first.page.nextCursor).toBeTruthy();
  const second=await (await request(path+'?limit=1&cursor='+encodeURIComponent(first.page.nextCursor))).json();expect(second.data[0].id).not.toBe(first.data[0].id);
  const own=await (await request('/api/v1/institutions?limit=1')).json();expect(own.page).toHaveProperty('nextCursor');
  expect((await request('/api/v1/institutions/'+institutionB+'/memberships')).status).toBe(403);
 });
 it('rejects mass assignment when adding a membership',async()=>{
  await auth();const subject=await target(false);
  expect((await request('/api/v1/institutions/'+institutionA+'/memberships','POST',{userId:subject.userId,status:'active'})).status).toBe(422);
 });
 it('requires consent instead of global UUID attachment and audits tenant-bound status changes',async()=>{
  await auth();const subject=await target(false);
  const path='/api/v1/institutions/'+institutionA+'/memberships';
  const created=await request(path,'POST',{userId:subject.userId});expect(created.status).toBe(409);
  expect(await created.json()).toEqual({error:{code:'INVITATION_REQUIRED'}});
  expect((await sql.query('SELECT count(*)::int AS n FROM institution_memberships WHERE institution_id=$1 AND user_id=$2',[institutionA,subject.userId])).rows[0].n).toBe(0);
  const data=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institutionA,subject.userId])).rows[0];
  const changed=await request(path+'/'+data.id,'PATCH',{status:'suspended',reason:'security_review'});expect(changed.status).toBe(200);
  const status=(await sql.query("SELECT details,request_id FROM security_audit_log WHERE action='membership.status.change' AND target LIKE $1 ORDER BY created_at DESC LIMIT 1",['membership:'+data.id+'%'])).rows[0];
  expect(status.details.before.status).toBe('active');expect(status.details.after.status).toBe('suspended');expect(status.request_id).toBe(changed.headers.get('x-request-id'));
  const foreign=await target(true,institutionB);
  expect((await request(path+'/'+foreign.membershipId,'PATCH',{status:'suspended',reason:'security_review'})).status).toBe(404);
 });
 it('enforces grant/revoke tenant scope, audit and privilege-session revocation',async()=>{
  await auth();const subject=await target(),foreign=await target(true,institutionB);
  const path='/api/v1/institutions/'+institutionA+'/roles';
  const live=await login(subject.username);expect(live.r.status).toBe(200);
  expect((await request(path+'/assign','POST',{membershipId:foreign.membershipId,role:'teacher'})).status).toBe(403);
  expect((await request(path+'/revoke','POST',{membershipId:foreign.membershipId,role:'student'})).status).toBe(404);
  const grant=await request(path+'/assign','POST',{membershipId:subject.membershipId,role:'teacher'});expect(grant.status).toBe(201);
  expect((await request('/api/v1/auth/me','GET',undefined,live.cookie)).status).toBe(401);
  const granted=(await grant.json()).data;
  const event=(await sql.query("SELECT request_id,details FROM security_audit_log WHERE action='role.assign' AND target=$1 ORDER BY created_at DESC LIMIT 1",['grant:'+granted.id])).rows[0];
  expect(event.request_id).toBe(grant.headers.get('x-request-id'));expect(event.details.after.role).toBe('teacher');
  const second=await login(subject.username);
  const revoked=await request(path+'/revoke','POST',{membershipId:subject.membershipId,role:'teacher'});expect(revoked.status).toBe(200);
  expect((await request('/api/v1/auth/me','GET',undefined,second.cookie)).status).toBe(401);
 });
 it('rejects role mass assignment and CSRF on every institutional mutation',async()=>{
  await auth();const subject=await target();
  const root='/api/v1/institutions/'+institutionA;
  expect((await request(root+'/roles/assign','POST',{membershipId:subject.membershipId,role:'teacher',institutionId:institutionB})).status).toBe(422);
  for(const [path,method]of [[root+'/memberships','POST'],[root+'/memberships/'+subject.membershipId,'PATCH'],[root+'/roles/assign','POST'],[root+'/roles/revoke','POST'],[root+'/academic/programs','POST'],[root+'/academic/programs','PATCH']])
   expect((await request(path,method,{},cookie,{'sec-fetch-site':'cross-site'})).status).toBe(403);
 });
});


describe('password and cleanup handlers',()=>{
 it('returns a stable denial for a corrupted password hash',async()=>{
  await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
  const original=(await sql.query('SELECT password_hash FROM platform_users WHERE id=$1',[userId])).rows[0].password_hash;
  try{
   await sql.query("UPDATE platform_users SET password_hash='corrupt' WHERE id=$1",[userId]);
   const result=await request('/api/v1/auth/password/change','POST',{currentPassword:password,newPassword:'Replacement-synthetic-password!'});
   expect(result.status).toBe(401);expect(await result.json()).toEqual({error:{code:'INVALID_CREDENTIALS'}});
  }finally{await sql.query('UPDATE platform_users SET password_hash=$1 WHERE id=$2',[original,userId]);}
 });
 it('rotates the current token and revokes every older device after a password change',async()=>{
  await sql.query('DELETE FROM auth_throttle');const old=await login(),current=await login();
  const original=(await sql.query('SELECT password_hash FROM platform_users WHERE id=$1',[userId])).rows[0].password_hash;
  try{
   const result=await request('/api/v1/auth/password/change','POST',{currentPassword:password,newPassword:'Replacement-synthetic-password!'},current.cookie);
   expect(result.status).toBe(200);
   const rotated=result.headers.get('set-cookie')!.split(';')[0];expect(rotated).not.toBe(current.cookie);
   for(const expired of [old.cookie,current.cookie])expect((await request('/api/v1/auth/me','GET',undefined,expired)).status).toBe(401);
   expect((await request('/api/v1/auth/me','GET',undefined,rotated)).status).toBe(200);
   const event=(await sql.query("SELECT request_id FROM security_audit_log WHERE action='auth.password.change' AND actor_user_id=$1 ORDER BY created_at DESC LIMIT 1",[userId])).rows[0];
   expect(event.request_id).toBe(result.headers.get('x-request-id'));
  }finally{
   await sql.query('UPDATE platform_users SET password_hash=$1,failed_login_attempts=0,locked_until=NULL WHERE id=$2',[original,userId]);
   await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
  }
 });
 it('applies account throttle to password changes',async()=>{
  cookie=(await login()).cookie;
  for(let i=0;i<5;i++)expect((await request('/api/v1/auth/password/change','POST',{currentPassword:'wrong',newPassword:'Replacement-synthetic-password!'})).status).toBe(401);
  expect((await request('/api/v1/auth/password/change','POST',{currentPassword:password,newPassword:'Replacement-synthetic-password!'})).status).toBe(401);
 });
 it('audits logout and makes that session unusable',async()=>{
  await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
  const result=await request('/api/v1/auth/logout','POST',{});expect(result.status).toBe(303);
  expect((await request('/api/v1/auth/me')).status).toBe(401);
  const event=(await sql.query("SELECT request_id FROM security_audit_log WHERE action='auth.logout' AND actor_user_id=$1 ORDER BY created_at DESC LIMIT 1",[userId])).rows[0];
  expect(event.request_id).toBe(result.headers.get('x-request-id'));
 });
 it('runs the real expiry cleanup job and preserves live sessions',async()=>{
  await sql.query('DELETE FROM auth_throttle');const live=await login();
  await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,last_seen_at) VALUES($1,$2,now()-interval '1 day',now()-interval '1 day')",[userId,'expired-'+suffix]);
  const {spawnSync}=await import('node:child_process');
  const {readFileSync}=await import('node:fs');
  const appConnection=JSON.parse(readFileSync('.superpowers/sdd/2026-10-13-p0-hardening/app-connection.json','utf8')).connectionString;
  const job=spawnSync(process.execPath,['--import','tsx','worker/index.ts','--once'],{env:{...process.env,DATABASE_URL:appConnection},encoding:'utf8',windowsHide:true,timeout:20000});
  expect(job.status).toBe(0);
  expect((await sql.query("SELECT count(*)::int AS n FROM auth_sessions WHERE token_hash=$1",['expired-'+suffix])).rows[0].n).toBe(0);
  expect((await request('/api/v1/auth/me','GET',undefined,live.cookie)).status).toBe(200);
 });
});


it('rejects password mutation when the session is revoked while waiting for its account lock',async()=>{
 await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
 const original=(await sql.query('SELECT password_hash FROM platform_users WHERE id=$1',[userId])).rows[0].password_hash;
 const gate=new pg.Client({connectionString:testDatabaseUrl});await gate.connect();await gate.query('BEGIN');
 let pending:Promise<Response>|undefined;
 try{
  await gate.query('SELECT id FROM platform_users WHERE id=$1 FOR UPDATE',[userId]);
  pending=request('/api/v1/auth/password/change','POST',{currentPassword:password,newPassword:'Race-replacement-synthetic-password!'});
  let blocked=false;
  for(let i=0;i<40;i++){
   const wait=(await sql.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%platform_users%'")).rows[0].n;
   if(wait>0){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,50));
  }
  expect(blocked).toBe(true);
  await gate.query('UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1',[createHash('sha256').update(cookie.split('=')[1]).digest('hex')]);
  await gate.query('COMMIT');
  expect((await pending).status).toBe(401);
 }finally{
  await gate.query('ROLLBACK').catch(()=>undefined);await gate.end();if(pending)await pending;
  await sql.query('UPDATE platform_users SET password_hash=$1,failed_login_attempts=0,locked_until=NULL WHERE id=$2',[original,userId]);
 }
});


it('rechecks expiry after waiting for the session row lock',async()=>{
 await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
 const digest=createHash('sha256').update(cookie.split('=')[1]).digest('hex');
 await sql.query("UPDATE auth_sessions SET expires_at=now()+interval '1 second' WHERE token_hash=$1",[digest]);
 const gate=new pg.Client({connectionString:testDatabaseUrl});await gate.connect();await gate.query('BEGIN');
 let pending:Promise<Response>|undefined;
 try{
  await gate.query('SELECT id FROM auth_sessions WHERE token_hash=$1 FOR UPDATE',[digest]);
  pending=request('/api/v1/auth/me');
  let blocked=false;
  for(let i=0;i<30;i++){
   if((await sql.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%auth_sessions%'")).rows[0].n){blocked=true;break;}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  expect(blocked).toBe(true);await new Promise(resolve=>setTimeout(resolve,1300));
  await gate.query('COMMIT');expect((await pending).status).toBe(401);
 }finally{await gate.query('ROLLBACK').catch(()=>undefined);await gate.end();if(pending)await pending;}
});


it('rolls back a catalog write when its audit insert fails',async()=>{
 await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
 const name='p0_audit_fail_'+suffix.replaceAll('-','');
 await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='academic.courses.create' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
 await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
 try{
  const result=await request('/api/v1/institutions/'+institutionA+'/academic/courses','POST',{code:'ROLLBACK'+suffix,name:'Synthetic rollback',credits:3});
  expect(result.status).toBe(500);expect(await result.json()).toEqual({error:{code:'INTERNAL_ERROR'}});
  expect((await sql.query('SELECT count(*)::int AS n FROM academic_courses WHERE institution_id=$1 AND code=$2',[institutionA,('ROLLBACK'+suffix).toUpperCase()])).rows[0].n).toBe(0);
 }finally{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');}
});

it.each(['POST','PATCH'])('rechecks catalog permission after session revocation during %s authorization',async method=>{
 await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
 const digest=createHash('sha256').update(cookie.split('=')[1]).digest('hex');
 const row=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Before revocation',3) RETURNING id",[institutionA,'DELAY'+method+suffix])).rows[0];
 const body=method==='POST'?{code:'AFTER'+method+suffix,name:'Unauthorized after revocation',credits:3}:{id:row.id,name:'Unauthorized after revocation'};
 const gate=new pg.Client({connectionString:testDatabaseUrl});await gate.connect();await gate.query('BEGIN');
 let pending:Promise<Response>|undefined;
 try{
  await gate.query('LOCK TABLE role_assignments IN ACCESS EXCLUSIVE MODE');
  pending=request('/api/v1/institutions/'+institutionA+'/academic/courses',method,body);
  let blocked=false;
  for(let i=0;i<60;i++){
   blocked=(await sql.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE '%role_assignments%'")).rows[0].n>0;
   if(blocked)break;await new Promise(resolve=>setTimeout(resolve,50));
  }
  expect(blocked).toBe(true);
  await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1',[digest]);
  await gate.query('COMMIT');
  expect((await pending).status).toBe(403);
  expect((await sql.query('SELECT name FROM academic_courses WHERE id=$1',[row.id])).rows[0].name).toBe('Before revocation');
  expect((await sql.query('SELECT count(*)::int AS n FROM academic_courses WHERE institution_id=$1 AND code=$2',[institutionA,('AFTER'+method+suffix).toUpperCase()])).rows[0].n).toBe(0);
  expect((await sql.query("SELECT count(*)::int AS n FROM security_audit_log WHERE actor_user_id=$1 AND action='academic.courses.update' AND target=$2",[userId,'courses:'+row.id])).rows[0].n).toBe(0);
 }finally{await gate.query('ROLLBACK').catch(()=>undefined);await gate.end();if(pending)await pending;}
});
it('does not reactivate a curriculum beneath an archived program',async()=>{
 await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
 const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Reactivation parent','ingenieria','presencial') RETURNING id",[institutionA,'REACT'+suffix])).rows[0];
 const plan=(await sql.query("INSERT INTO curriculum_versions(institution_id,program_id,version,status) VALUES($1,$2,'reactivate','inactive') RETURNING id",[institutionA,program.id])).rows[0];
 expect((await request('/api/v1/institutions/'+institutionA+'/academic/programs','PATCH',{id:program.id,status:'archived'})).status).toBe(200);
 const result=await request('/api/v1/institutions/'+institutionA+'/academic/curricula','PATCH',{id:plan.id,status:'active'});
 expect(result.status).toBe(409);
 expect((await sql.query('SELECT status FROM curriculum_versions WHERE id=$1',[plan.id])).rows[0].status).toBe('inactive');
});
it('serializes competing program archival and curriculum activation',async()=>{
 await sql.query('DELETE FROM auth_throttle');cookie=(await login()).cookie;
 const actor=(await sql.query("INSERT INTO platform_users(person_id,username,password_hash) SELECT person_id,$1,password_hash FROM platform_users WHERE id=$2 RETURNING id",['competing-'+suffix,userId])).rows[0];
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institutionA,actor.id])).rows[0];
 await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'admin')",[member.id]);
 const otherCookie=(await login('competing-'+suffix)).cookie;
 for(let round=0;round<3;round++){
  const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Competing parent','ingenieria','presencial') RETURNING id",[institutionA,'RACE'+suffix+round])).rows[0];
  const plan=(await sql.query("INSERT INTO curriculum_versions(institution_id,program_id,version,status) VALUES($1,$2,'competing','inactive') RETURNING id",[institutionA,program.id])).rows[0];
  const root='/api/v1/institutions/'+institutionA+'/academic/';
  const responses=await Promise.all([request(root+'programs','PATCH',{id:program.id,status:'archived'},cookie),request(root+'curricula','PATCH',{id:plan.id,status:'active'},otherCookie)]);
  expect(responses.map(result=>result.status).sort()).toEqual([200,409]);
  expect((await sql.query("SELECT p.status='archived' AND c.status='active' AS invalid FROM academic_programs p JOIN curriculum_versions c ON c.program_id=p.id WHERE c.id=$1",[plan.id])).rows[0].invalid).toBe(false);
 }
});
 afterAll(async()=>{await sql.end();});
});
