import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID,createHash} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {fixtureCookie,fixtureMfaLogin} from '../support/mfa-fixture';

const base='http://127.0.0.1:3107',sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-scopes-integration-2026!';
type User={id:string;username:string;membershipId:string;grantId:string};
let hash:string,unit:string,foreign:string,programA:string,programB:string,campusA:string,campusB:string,actor:User,target:User,cookie:string;
const path=(suffix:string)=>'/api/v1/institutions/'+unit+'/'+suffix;
async function request(url:string,method='GET',body?:unknown,session=cookie){
 return fetch(base+url,{method,headers:{origin:base,...(body===undefined?{}:{'content-type':'application/json'}),...(session?{cookie:session}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function user(role='student',institutionId=unit):Promise<User>{
 const username='scope-'+randomUUID();
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','IAM') RETURNING id")).rows[0].id;
 const id=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 const membershipId=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institutionId,id])).rows[0].id;
 const grantId=(await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2) RETURNING id',[membershipId,role])).rows[0].id;
 return {id,username,membershipId,grantId};
}
async function login(subject:User,mfa=true,critical=true){
 const response=await request('/api/v1/auth/login','POST',{username:subject.username,password},'');
 expect(response.status).toBe(200);
 return mfa?fixtureMfaLogin(sql,base,subject.username,password,response,critical):fixtureCookie(response);
}
async function scoped(subject:User,type:'program'|'campus',id:string,role='coordinator',expiresAt:Date|null=null){
 await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE membership_id=$1 AND revoked_at IS NULL',[subject.membershipId]);
 return (await sql.query('INSERT INTO role_assignments(membership_id,institution_id,role,scope_type,scope_program_id,scope_campus_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[subject.membershipId,unit,role,type,type==='program'?id:null,type==='campus'?id:null,expiresAt])).rows[0].id as string;
}
async function scopeAuthority(type='program',id=programA){
 const response=await request(path('capabilities')+'?scopeType='+type+'&scopeId='+id);
 expect(response.status).toBe(200);
 return (await response.json()).data;
}
async function waitForLock(fragment:string){
 for(let i=0;i<100;i++){
  const rows=(await sql.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE $1",['%'+fragment+'%'])).rows;
  if(rows.length)return;
  await new Promise(resolve=>setTimeout(resolve,40));
 }
 throw new Error('FIXTURE_LOCK_NOT_OBSERVED');
}
describe.sequential('F07 real backend scopes, assurance and delegation',()=>{
 beforeAll(async()=>{await sql.connect();hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});});
 beforeEach(async()=>{
  await sql.query('DELETE FROM auth_throttle');
  unit=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic scopes',$1) RETURNING id",[randomUUID()])).rows[0].id;
  foreign=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic foreign',$1) RETURNING id",[randomUUID()])).rows[0].id;
  const programs=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'A','Program A','ingenieria','presencial'),($1,'B','Program B','ingenieria','presencial') RETURNING id",[unit])).rows;
  [programA,programB]=programs.map(row=>row.id);
  const campuses=(await sql.query("INSERT INTO campuses(institution_id,code,name) VALUES($1,'A','Campus A'),($1,'B','Campus B') RETURNING id",[unit])).rows;
  [campusA,campusB]=campuses.map(row=>row.id);
  await sql.query("INSERT INTO curriculum_versions(institution_id,program_id,version) VALUES($1,$2,'A1'),($1,$2,'A2'),($1,$3,'B1')",[unit,programA,programB]);
  actor=await user('super_admin');target=await user();
  cookie=await login(actor);
 });
 afterAll(async()=>{await sql.end();});
 it('restricts privileged onboarding while keeping real factor enrollment accessible',async()=>{
  const unconfigured=await user('admin'),session=await login(unconfigured,false);
  const disclosure=await request(path('capabilities'),'GET',undefined,session);
  expect(disclosure.status).toBe(200);
  expect((await disclosure.json()).data).toMatchObject({restricted:true,capabilities:[],grantableRoles:[],assurance:{mfaRequired:true,mfaConfigured:false,mfaVerified:false}});
  expect((await request(path('academic/programs'),'GET',undefined,session)).status).toBe(403);
  const enrolled=await login(unconfigured);
  expect((await request(path('academic/programs'),'GET',undefined,enrolled)).status).toBe(200);
 });
 it('never accepts password-only step-up as privileged MFA',async()=>{
  const unconfigured=await user('admin'),session=await login(unconfigured,false);
  const stepped=await request('/api/v1/auth/mfa/step-up','POST',{currentPassword:password},session);
  expect(stepped.status).toBe(200);
  expect((await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher'},fixtureCookie(stepped))).status).toBe(403);
 });
 it('requires fresh factor step-up before critical mutations',async()=>{
  const fresh=await login(actor,true,false);
  const denied=await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher'},fresh);
  expect(denied.status).toBe(403);expect(await denied.json()).toEqual({error:{code:'STEP_UP_REQUIRED'}});
 });
 it('filters program and curriculum scopes in SQL before pagination and denies unrelated domains',async()=>{
  await scoped(target,'program',programA);const session=await login(target,false);
  const programs=await request(path('academic/programs')+'?limit=1','GET',undefined,session);
  expect(programs.status).toBe(200);expect((await programs.json()).data.map((row:{id:string})=>row.id)).toEqual([programA]);
  const first=await (await request(path('academic/curricula')+'?limit=1','GET',undefined,session)).json();
  expect(first.data).toHaveLength(1);expect(first.page.nextCursor).toBeTruthy();
  const second=await (await request(path('academic/curricula')+'?limit=1&cursor='+encodeURIComponent(first.page.nextCursor),'GET',undefined,session)).json();
  expect(second.data).toHaveLength(1);expect(second.data[0].id).not.toBe(first.data[0].id);expect(second.page.nextCursor).toBeNull();
  for(const domain of ['courses','terms','campuses','memberships'])expect((await request(path(domain==='memberships'?domain:'academic/'+domain),'GET',undefined,session)).status).toBe(403);
  expect((await request(path('academic/programs'),'PATCH',{id:programB,name:'Outside scope'},session)).status).toBe(403);
  expect((await request(path('academic/programs'),'PATCH',{id:programA,name:'Within scope'},session)).status).toBe(200);
  expect((await request(path('academic/curricula'),'POST',{programId:programA,version:'A3'},session)).status).toBe(201);
  expect((await request(path('academic/curricula'),'POST',{programId:programB,version:'Outside'},session)).status).toBe(403);
 });
 it('filters campus scope and cannot create or edit another campus',async()=>{
  await scoped(target,'campus',campusA);const session=await login(target,false);
  const listed=await (await request(path('academic/campuses'),'GET',undefined,session)).json();
  expect(listed.data.map((row:{id:string})=>row.id)).toEqual([campusA]);
  expect((await request(path('academic/campuses'),'PATCH',{id:campusB,name:'Other campus'},session)).status).toBe(403);
  expect((await request(path('academic/campuses'),'POST',{code:'NEW',name:'New campus'},session)).status).toBe(403);
 });
 it('discloses only backed capabilities and real typed domain relationships',async()=>{
  await scoped(target,'program',programA);const session=await login(target,false);
  const data=(await (await request(path('capabilities'),'GET',undefined,session)).json()).data;
  expect(data.scopedCapabilities[0].capabilities).toEqual(expect.arrayContaining(['programs.read','programs.manage','curricula.read','curricula.manage']));
  for(const denied of ['users.read','courses.read','terms.read','grades.read','groups.manage'])expect(data.scopedCapabilities[0].capabilities).not.toContain(denied);
  const authority=await scopeAuthority();
  expect(authority.scopedCapabilities[0].grantableRoles).toContain('teacher');expect(authority.scopedCapabilities[0].grantableRoles).not.toContain('admin');
  expect(authority.grantableRoles).toContain('admin');expect(authority.grantableRoles).not.toContain('super_admin');
 });
 it('enforces cross-tenant scope and membership FKs independently of HTTP',async()=>{
  const other=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'FOREIGN','Foreign','ingenieria','presencial') RETURNING id",[foreign])).rows[0].id;
  await expect(sql.query("INSERT INTO role_assignments(membership_id,institution_id,role,scope_type,scope_program_id) VALUES($1,$2,'teacher','program',$3)",[target.membershipId,unit,other])).rejects.toHaveProperty('code','23503');
  await expect(sql.query("INSERT INTO role_assignments(membership_id,institution_id,role,scope_type,scope_program_id) VALUES($1,$2,'teacher','program',$3)",[target.membershipId,foreign,other])).rejects.toHaveProperty('code','23503');
  await expect(sql.query("INSERT INTO role_assignments(membership_id,role,scope_type,scope_program_id) VALUES($1,'teacher','program',$2)",[target.membershipId,programA])).rejects.toHaveProperty('code','23514');
  const denied=await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',scopeType:'program',scopeId:other});
  expect(denied.status).toBe(422);
 });
 it('supports all eleven roles while denying ordinary super-admin provisioning and peer-admin escalation',async()=>{
  expect((await sql.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid=pg_type.oid WHERE typname='user_role'")).rows).toHaveLength(11);
  expect((await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'super_admin'})).status).toBe(403);
  await sql.query("UPDATE role_assignments SET role='admin' WHERE id=$1",[actor.grantId]);
  cookie=await login(actor);
  expect((await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'admin'})).status).toBe(403);
  expect((await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'control_escolar'})).status).toBe(201);
 });
 it('bounds delegated lifetime to one complete authorizing grant and discloses its exact limit',async()=>{
  const expiry=new Date(Date.now()+600000);
  await sql.query('UPDATE role_assignments SET expires_at=$1 WHERE id=$2',[expiry,actor.grantId]);
  const data=await scopeAuthority();
  expect(data.grantExpiryLimits.teacher).toBe(expiry.toISOString());
  for(const expiresAt of [null,new Date(expiry.getTime()+1).toISOString()]){
   const response=await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',expiresAt});
   expect(response.status).toBe(403);expect((await response.json()).error.code).toBe('GRANT_EXPIRY_DENIED');
  }
  expect((await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',expiresAt:expiry.toISOString()})).status).toBe(201);
 });
 it('rejects expiry immediately, supersedes expired slots, and retains another valid scoped grant',async()=>{
  const expiredId=await scoped(target,'program',programA,'coordinator',new Date(Date.now()-1));
  await sql.query("INSERT INTO role_assignments(membership_id,institution_id,role,scope_type,scope_program_id) VALUES($1,$2,'coordinator','program',$3)",[target.membershipId,unit,programB]);
  const session=await login(target,false);
  const listed=await (await request(path('academic/programs'),'GET',undefined,session)).json();
  expect(listed.data.map((row:{id:string})=>row.id)).toEqual([programB]);
  expect((await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'coordinator',scopeType:'program',scopeId:programA})).status).toBe(201);
  expect((await sql.query('SELECT revoked_at FROM role_assignments WHERE id=$1',[expiredId])).rows[0].revoked_at).not.toBeNull();
 });
 it('rejects archive scopes both at disclosure and grant insertion, without restoring invisible authority',async()=>{
  await scoped(target,'program',programA);await sql.query("UPDATE academic_programs SET status='archived' WHERE id=$1",[programA]);
  const session=await login(target,false);
  expect((await request(path('academic/programs'),'GET',undefined,session)).status).toBe(403);
  expect((await request(path('capabilities')+'?scopeType=program&scopeId='+programA)).status).toBe(404);
  expect((await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',scopeType:'program',scopeId:programA})).status).toBe(422);
 });
 it('reports requiredByRole only for live privileged memberships without exposing global roles or tenant identifiers',async()=>{
  const status=async()=>{
   const response=await request('/api/v1/auth/mfa');expect(response.status).toBe(200);
   const data=(await response.json()).data;
   expect(Object.keys(data).sort()).toEqual(['configured','pending','recoveryCodesRemaining','requiredByRole','stepUpExpiresAt'].sort());
   expect(JSON.stringify(data)).not.toContain(unit);expect(JSON.stringify(data)).not.toContain(actor.id);
   return data.requiredByRole as boolean;
  };
  for(const role of ['admin','super_admin','control_escolar']){
   await sql.query('UPDATE role_assignments SET role=$1 WHERE id=$2',[role,actor.grantId]);
   expect(await status()).toBe(true);
  }
  await sql.query("UPDATE role_assignments SET role='teacher' WHERE id=$1",[actor.grantId]);expect(await status()).toBe(false);
  await sql.query("UPDATE role_assignments SET role='admin' WHERE id=$1",[actor.grantId]);
  await sql.query("UPDATE institutions SET status='inactive' WHERE id=$1",[unit]);expect(await status()).toBe(false);
  await sql.query("UPDATE institutions SET status='active' WHERE id=$1",[unit]);
  await sql.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[actor.membershipId]);expect(await status()).toBe(false);
  await sql.query("UPDATE institution_memberships SET status='active' WHERE id=$1",[actor.membershipId]);
  await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[actor.grantId]);expect(await status()).toBe(false);
 });
 it('prevents MFA revocation with privileged grants, but allows it once grants expire',async()=>{
  expect((await (await request('/api/v1/auth/mfa')).json()).data.requiredByRole).toBe(true);
  let denied=await request('/api/v1/auth/mfa/revoke','POST',{});
  expect(denied.status).toBe(403);expect((await denied.json()).error.code).toBe('MFA_REQUIRED_BY_ROLE');
  await sql.query('UPDATE role_assignments SET expires_at=now()-interval \'1 second\' WHERE id=$1',[actor.grantId]);
  expect((await (await request('/api/v1/auth/mfa')).json()).data.requiredByRole).toBe(false);
  denied=await request('/api/v1/auth/mfa/revoke','POST',{});expect(denied.status).toBe(200);
 });
 it('closes bare global UUID membership creation without a consent record',async()=>{
  const outsider=await user('student',foreign);
  expect((await request(path('memberships'),'POST',{userId:outsider.id})).status).toBe(409);
  expect((await sql.query('SELECT count(*)::int AS n FROM institution_memberships WHERE user_id=$1 AND institution_id=$2',[outsider.id,unit])).rows[0].n).toBe(0);
 });
 it('invalidates sessions, challenge versions and pending enrollments atomically on a scoped grant change',async()=>{
  const session=await login(target);
  const pending=await request('/api/v1/auth/login','POST',{username:target.username,password},'');
  expect(fixtureCookie(pending,'siii_mfa_challenge')).toBeTruthy();
  const before=(await sql.query('SELECT auth_version FROM platform_users WHERE id=$1',[target.id])).rows[0].auth_version;
  const granted=await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',scopeType:'program',scopeId:programA});
  expect(granted.status).toBe(201);
  expect((await request('/api/v1/auth/me','GET',undefined,session)).status).toBe(401);
  expect((await sql.query('SELECT auth_version FROM platform_users WHERE id=$1',[target.id])).rows[0].auth_version).toBe(before+1);
  expect((await sql.query('SELECT count(*)::int AS n FROM auth_mfa_challenges WHERE user_id=$1 AND consumed_at IS NULL',[target.id])).rows[0].n).toBe(0);
  const id=(await granted.json()).data.id;
  const audit=(await sql.query("SELECT request_id,details FROM security_audit_log WHERE action='role.assign' AND target=$1",['grant:'+id])).rows[0];
  expect(audit.request_id).toBe(granted.headers.get('x-request-id'));expect(JSON.stringify(audit.details)).not.toContain(password);
 });
 it('revokes exactly one grant by id, preserving the same role in a different scope',async()=>{
  const a=await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',scopeType:'program',scopeId:programA});
  const b=await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',scopeType:'program',scopeId:programB});
  expect(a.status).toBe(201);expect(b.status).toBe(201);
  const aId=(await a.json()).data.id,bId=(await b.json()).data.id;
  expect((await request(path('roles/revoke'),'POST',{grantId:aId})).status).toBe(200);
  expect((await sql.query('SELECT revoked_at FROM role_assignments WHERE id=$1',[bId])).rows[0].revoked_at).toBeNull();
 });
 it('preserves a permanent active administrator when the only alternative is temporary',async()=>{
  await sql.query('UPDATE role_assignments SET expires_at=now()+interval \'5 minutes\' WHERE id=$1',[actor.grantId]);
  await sql.query("UPDATE role_assignments SET role='admin' WHERE id=$1",[target.grantId]);
  const suspend=await request(path('memberships/'+target.membershipId),'PATCH',{status:'suspended',reason:'security_review'});
  expect(suspend.status).toBe(409);expect((await suspend.json()).error.code).toBe('LAST_ADMIN_REQUIRED');
  const revoke=await request(path('roles/revoke'),'POST',{grantId:target.grantId});
  expect(revoke.status).toBe(409);expect((await revoke.json()).error.code).toBe('LAST_ADMIN_REQUIRED');
  await user('admin');
  expect((await request(path('memberships/'+target.membershipId),'PATCH',{status:'suspended',reason:'security_review'})).status).toBe(200);
 });
 it('rejects actor grant expiry after waiting for institutional locks without writing or auditing success',async()=>{
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');
  let pending:Promise<Response>|undefined;
  try{
   await gate.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[unit]);
   pending=request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher'});
   await waitForLock('institutions');
   await gate.query('UPDATE role_assignments SET expires_at=now()-interval \'1 second\' WHERE id=$1',[actor.grantId]);await gate.query('COMMIT');
   expect((await pending).status).toBe(403);
   expect((await sql.query("SELECT count(*)::int AS n FROM role_assignments WHERE membership_id=$1 AND role='teacher'",[target.membershipId])).rows[0].n).toBe(0);
  }finally{await gate.query('ROLLBACK').catch(()=>undefined);await gate.end();if(pending)await pending;}
 });
 it('revalidates trusted scope parents after waiting before granting',async()=>{
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');
  let pending:Promise<Response>|undefined;
  try{
   await gate.query('SELECT id FROM academic_programs WHERE id=$1 FOR UPDATE',[programA]);
   pending=request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',scopeType:'program',scopeId:programA});
   await waitForLock('academic_programs');
   await gate.query("UPDATE academic_programs SET status='archived' WHERE id=$1",[programA]);await gate.query('COMMIT');
   expect((await pending).status).toBe(422);
  }finally{await gate.query('ROLLBACK').catch(()=>undefined);await gate.end();if(pending)await pending;}
 });
 it.each(['inactive','archived'])('rechecks parent activity in list SQL after preflight when program becomes %s',async status=>{
  await scoped(target,'program',programA);const session=await login(target,false);
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');
  let pending:Promise<Response>|undefined;
  try{
   // Preflight joins memberships/grants/programs; only the final list touches curriculum_versions.
   await gate.query('LOCK TABLE curriculum_versions IN ACCESS EXCLUSIVE MODE');
   pending=request(path('academic/curricula'),'GET',undefined,session);
   await waitForLock('curriculum_versions');
   await gate.query('UPDATE academic_programs SET status=$1 WHERE id=$2',[status,programA]);await gate.query('COMMIT');
   const response=await pending;expect(response.status).toBe(200);
   expect((await response.json()).data).toEqual([]);
  }finally{await gate.query('ROLLBACK').catch(()=>undefined);await gate.end();if(pending)await pending;}
 });
 it.each(['expiry','revocation','version','suspension','assurance'])('rechecks membership PII authority at list SQL after preflight on %s',async change=>{
  const rolesGate=new pg.Client({connectionString:isolatedDatabaseUrl()}),peopleGate=new pg.Client({connectionString:isolatedDatabaseUrl()});
  await rolesGate.connect();await peopleGate.connect();await rolesGate.query('BEGIN');await peopleGate.query('BEGIN');
  let pending:Promise<Response>|undefined;
  try{
   await rolesGate.query('LOCK TABLE role_assignments IN ACCESS EXCLUSIVE MODE');
   pending=request(path('memberships')+'?limit=1');
   // Identity's people join has completed when institutionAccess waits on grants.
   await waitForLock('role_assignments');
   await peopleGate.query('LOCK TABLE people IN ACCESS EXCLUSIVE MODE');
   await rolesGate.query('COMMIT');
   await waitForLock('people');
   if(change==='expiry')await peopleGate.query("UPDATE role_assignments SET expires_at=now()-interval '1 second' WHERE id=$1",[actor.grantId]);
   if(change==='revocation')await peopleGate.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[actor.grantId]);
   if(change==='version')await peopleGate.query('UPDATE platform_users SET auth_version=auth_version+1 WHERE id=$1',[actor.id]);
   if(change==='suspension')await peopleGate.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[actor.membershipId]);
   if(change==='assurance')await peopleGate.query('UPDATE auth_sessions SET mfa_verified_at=NULL WHERE token_hash=$1',[createHash('sha256').update(cookie.split('=')[1]).digest('hex')]);
   await peopleGate.query('COMMIT');
   const response=await pending;expect(response.status).toBe(200);
   expect(await response.json()).toEqual({data:[],page:{nextCursor:null}});
  }finally{
   await rolesGate.query('ROLLBACK').catch(()=>undefined);await peopleGate.query('ROLLBACK').catch(()=>undefined);
   await rolesGate.end();await peopleGate.end();if(pending)await pending;
  }
 });
 it('requires strict scope and expiry bodies without frontend-provided authority',async()=>{
  for(const body of [
   {scopeType:'institution',scopeId:programA},{scopeType:'program',scopeId:null},{scopeType:'program',scopeId:programA,expiresAt:'tomorrow'},
   {scopeType:'program',scopeId:programA,capabilities:['roles.assign']},
  ])expect((await request(path('roles/assign'),'POST',{membershipId:target.membershipId,role:'teacher',...body})).status).toBe(422);
  expect((await request(path('capabilities')+'?scopeType=program&scopeId='+programA+'&scopeId='+programB)).status).toBe(400);
 });
});
