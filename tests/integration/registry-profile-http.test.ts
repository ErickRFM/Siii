import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';import argon2 from 'argon2';import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';import {fixtureMfaLogin} from '../support/mfa-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:3107',suffix=randomUUID().slice(0,8),password='Synthetic-profile-2026!';
let tenant:string,other:string,program:string,cookie='',studentCookie='';
const original={firstName:'Original',lastName:'Sintético',institutionalEmail:null};
async function request(path:string,method='GET',data?:unknown,session=cookie,origin=base){return fetch(base+path,{method,headers:{origin,cookie:session,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})})}
function path(resource:string){return '/api/v1/institutions/'+tenant+'/registry/'+resource}
async function fixture(resource:'students'|'teachers',institution=tenant){
 if(resource==='students')return (await sql.query(`INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,$4,$5) RETURNING *`,[institution,program,'ST'+randomUUID().slice(0,8),original.firstName,original.lastName])).rows[0];
 return (await sql.query(`INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,$2,$3,$4) RETURNING *`,[institution,'TC'+randomUUID().slice(0,8),original.firstName,original.lastName])).rows[0];
}
async function login(role:string){
 const person=(await sql.query(`INSERT INTO people(first_name,last_name) VALUES('Global','Inmutable') RETURNING id`)).rows[0].id;
 const username=role+'-profile-'+suffix,hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 const membership=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,user])).rows[0].id;
 await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[membership,role]);
 const response=await request('/api/v1/auth/login','POST',{username,password},'');expect(response.status).toBe(200);
 return fixtureMfaLogin(sql,base,username,password,response);
}
describe.sequential('institutional registry profile edits through real handlers',()=>{
 beforeAll(async()=>{
  await sql.connect();const institutions=(await sql.query(`INSERT INTO institutions(name,code) VALUES('Synthetic profile',$1),('Synthetic foreign',$2) RETURNING id`,['PRO'+suffix,'OTH'+suffix])).rows;
  tenant=institutions[0].id;other=institutions[1].id;cookie=await login('admin');studentCookie=await login('student');
  program=(await sql.query(`INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'SYS','Sistemas','ingenieria','presencial') RETURNING id`,[tenant])).rows[0].id;
 },30000);
 afterAll(async()=>{await sql.end()});
 it.each(['students','teachers'] as const)('edits %s profile without replacing institutional identifiers and audits before/after',async resource=>{
  const row=await fixture(resource),profile={firstName:'Corregido',lastName:'Pérez López',institutionalEmail:'corregido@example.test'};
  const response=await request(path(resource),'PATCH',{kind:'profile',id:row.id,expected:original,profile});expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({id:row.id,...profile,status:'active',...(resource==='students'?{programId:program,enrollmentNumber:row.enrollment_number}:{employeeNumber:row.employee_number})});
  const list=await request(path(resource));expect((await list.json()).data.find((r:{id:string})=>r.id===row.id)).toMatchObject(profile);
  const audit=(await sql.query(`SELECT request_id,details FROM security_audit_log WHERE target=$1 AND action=$2`,[resource+':'+row.id,'registry.'+resource+'.profile'])).rows;
  expect(audit).toHaveLength(1);expect(audit[0].request_id).toMatch(/^[0-9a-f-]{36}$/);expect(audit[0].details).toEqual({before:original,after:profile});
  const cleared={...profile,institutionalEmail:null};const clear=await request(path(resource),'PATCH',{kind:'profile',id:row.id,expected:profile,profile:cleared});expect(clear.status).toBe(200);expect((await clear.json()).data.institutionalEmail).toBeNull();
  const last=(await sql.query(`SELECT details FROM security_audit_log WHERE target=$1 AND action=$2 ORDER BY created_at DESC LIMIT 1`,[resource+':'+row.id,'registry.'+resource+'.profile'])).rows[0];expect(last.details).toEqual({before:profile,after:cleared});
 });
 it.each(['students','teachers'] as const)('rejects lost updates for %s under concurrent requests',async resource=>{
  const row=await fixture(resource),profiles=[{...original,firstName:'Primera'},{...original,firstName:'Segunda'}];
  const responses=await Promise.all(profiles.map(profile=>request(path(resource),'PATCH',{kind:'profile',id:row.id,expected:original,profile})));
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await responses.find(r=>r.status===409)!.json()).error.code).toBe('REGISTRY_PROFILE_CONFLICT');
  const audits=(await sql.query(`SELECT details FROM security_audit_log WHERE target=$1 AND action=$2`,[resource+':'+row.id,'registry.'+resource+'.profile'])).rows;expect(audits).toHaveLength(1);
  const table=resource==='students'?'institutional_students':'institutional_teachers';expect((await sql.query('SELECT first_name FROM '+table+' WHERE id=$1',[row.id])).rows[0].first_name).toBe(audits[0].details.after.firstName);
 });
 it('rejects malformed inputs and mass assignment without changing the row',async()=>{
  const row=await fixture('students'),valid={kind:'profile',id:row.id,expected:original,profile:{...original,firstName:'Correcto'}};
  for(const invalid of [{...valid,institutionId:other},{...valid,status:'graduated'},{...valid,profile:{...valid.profile,programId:program}},{...valid,profile:{...valid.profile,firstName:'A'}},{...valid,profile:{...valid.profile,institutionalEmail:'invalid'}},{...valid,expected:{firstName:'Original'}},{...valid,kind:'unknown'}])expect((await request(path('students'),'PATCH',invalid)).status).toBe(422);
  expect((await sql.query('SELECT first_name FROM institutional_students WHERE id=$1',[row.id])).rows[0].first_name).toBe(original.firstName);
 });
 it('keeps the linked global identity and account untouched',async()=>{
  const row=await fixture('teachers');
  const identity=(await sql.query(`SELECT u.id,u.person_id,u.username,u.is_active,u.auth_version,p.first_name,p.last_name,p.email,p.phone,m.id AS membership_id FROM platform_users u JOIN people p ON p.id=u.person_id JOIN institution_memberships m ON m.user_id=u.id WHERE u.username=$1 AND m.institution_id=$2`,['admin-profile-'+suffix,tenant])).rows[0];
  await sql.query('INSERT INTO teacher_account_links(institution_id,teacher_id,membership_id) VALUES($1,$2,$3)',[tenant,row.id,identity.membership_id]);
  expect((await request(path('teachers'),'PATCH',{kind:'profile',id:row.id,expected:original,profile:{firstName:'Nombre institucional',lastName:'Separado',institutionalEmail:'institucional@example.test'}})).status).toBe(200);
  const after=(await sql.query(`SELECT u.id,u.person_id,u.username,u.is_active,u.auth_version,p.first_name,p.last_name,p.email,p.phone,m.id AS membership_id FROM platform_users u JOIN people p ON p.id=u.person_id JOIN institution_memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.institution_id=$2`,[identity.id,tenant])).rows[0];expect(after).toEqual(identity);
  expect((await sql.query('SELECT teacher_id,membership_id FROM teacher_account_links WHERE institution_id=$1 AND teacher_id=$2',[tenant,row.id])).rows).toEqual([{teacher_id:row.id,membership_id:identity.membership_id}]);
 });
 it('enforces origin, tenant and permission and keeps the existing status contract',async()=>{
  const row=await fixture('teachers'),body={kind:'profile',id:row.id,expected:original,profile:{...original,firstName:'Correcto'}};
  expect((await request(path('teachers'),'PATCH',body,studentCookie)).status).toBe(403);
  expect((await request(path('teachers'),'PATCH',body,cookie,'https://foreign.test')).status).toBe(403);
  expect((await request('/api/v1/institutions/'+other+'/registry/teachers','PATCH',body)).status).toBe(403);
  const foreign=await fixture('teachers',other);expect((await request(path('teachers'),'PATCH',{...body,id:foreign.id})).status).toBe(404);
  const status=await request(path('teachers'),'PATCH',{id:row.id,status:'inactive'});expect(status.status).toBe(200);expect((await status.json()).data.status).toBe('inactive');
 });
 it('rolls back the profile when its audit write fails',async()=>{
  const row=await fixture('teachers'),key='profile_audit_'+suffix.replaceAll('-','');
  await sql.query(`CREATE FUNCTION ${key}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='registry.teachers.profile' AND NEW.target='teachers:${row.id}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await sql.query(`CREATE TRIGGER ${key} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${key}()`);
  try{expect((await request(path('teachers'),'PATCH',{kind:'profile',id:row.id,expected:original,profile:{...original,firstName:'Rollback'}})).status).toBe(500);
   expect((await sql.query('SELECT first_name FROM institutional_teachers WHERE id=$1',[row.id])).rows[0].first_name).toBe(original.firstName);
  }finally{await sql.query(`DROP TRIGGER ${key} ON security_audit_log`);await sql.query(`DROP FUNCTION ${key}()`)}
 });
});
