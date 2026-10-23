import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';
import {openAcademicBody} from '@/integrations/companion/outbox/seal';

const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107),enabled=process.env.SIII_ACADEMIC_OUTBOX_ENABLED==='true';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
type Actor={id:string;member:string;session:string;grant:string;cookie:string};
type Section={id:string;teacher:string};
type Body={schemaVersion:number;eventId:string;sourceVersion:number;operation:string;payload:{sectionId:string;teachers:{sourceId:string}[]}};
let unit:string,foreign:string,admin:Actor;
const path=(tenant=unit)=>'/api/v1/institutions/'+tenant+'/assignments';
async function request(method:string,body?:unknown,actor=admin,tenant=unit,id=randomUUID(),origin=base){return fetch(base+path(tenant),{method,headers:{origin,cookie:actor.cookie,'content-type':'application/json','x-request-id':id},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function actor(role='admin',mfa=true):Promise<Actor>{
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Assignment operator') RETURNING id")).rows[0].id;
 const id=(await sql.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,'assignment-'+randomUUID()])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[unit,id])).rows[0].id;
 const grant=(await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,$3,'institution') RETURNING id",[unit,member,role])).rows[0].id;
 if(mfa)await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[id,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',id)]);
 const raw=randomBytes(32).toString('base64url');
 const session=(await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',$3) RETURNING id",[id,createHash('sha256').update(raw).digest('hex'),mfa?new Date():null])).rows[0].id;
 return {id,member,session,grant,cookie:(process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_session':'siii_session')+'='+raw};
}
async function teacher(tenant=unit){return (await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,$2,'Synthetic','Teacher') RETURNING id",[tenant,'TC'+randomUUID().slice(0,12).toUpperCase()])).rows[0].id as string;}
async function section(tenant=unit):Promise<Section>{
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Synthetic term','2026-01-01','2027-12-31') RETURNING id",[tenant,'TR'+randomUUID().slice(0,12).toUpperCase()])).rows[0].id;
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Synthetic subject',0) RETURNING id",[tenant,'CR'+randomUUID().slice(0,12).toUpperCase()])).rows[0].id;
 const id=(await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,$4,30) RETURNING id",[tenant,term,course,'SC'+randomUUID().slice(0,12).toUpperCase()])).rows[0].id;
 return {id,teacher:await teacher(tenant)};
}
async function assignment(s:Section,teacherId=s.teacher){return (await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3) RETURNING id',[unit,s.id,teacherId])).rows[0].id as string;}
async function baseline(s:Section){
 const response=await fetch(base+'/api/v1/institutions/'+unit+'/sections',{method:'PATCH',headers:{origin:base,cookie:admin.cookie,'content-type':'application/json'},body:JSON.stringify({id:s.id,status:'open'})});expect(response.status).toBe(200);
}
async function state(s:Section){return {
 assignments:(await sql.query('SELECT id,teacher_id,revoked_at,updated_at FROM section_teachers WHERE institution_id=$1 AND section_id=$2 ORDER BY id',[unit,s.id])).rows,
 events:(await sql.query('SELECT event_id,source_version,body_encrypted,body_digest FROM academic_section_outbox WHERE institution_id=$1 AND section_id=$2 ORDER BY source_version',[unit,s.id])).rows,
 versions:(await sql.query('SELECT source_version FROM academic_section_versions WHERE institution_id=$1 AND section_id=$2',[unit,s.id])).rows,
 audits:Number((await sql.query('SELECT count(*)::int n FROM security_audit_log WHERE institution_id=$1',[unit])).rows[0].n),
};}
async function latest(s:Section){const row=(await sql.query('SELECT * FROM academic_section_outbox WHERE institution_id=$1 AND section_id=$2 ORDER BY source_version DESC LIMIT 1',[unit,s.id])).rows[0];expect(row).toBeDefined();return JSON.parse(openAcademicBody(row.body_encrypted,{eventId:row.event_id,institutionId:unit,sectionId:s.id})) as Body;}
async function expectQueue(s:Section,previous:number,teachers:string[],correlation:string){
 const after=await state(s);expect(after.events).toHaveLength(previous+(enabled?1:0));
 if(enabled){const body=await latest(s);expect(body).toMatchObject({schemaVersion:1,sourceVersion:previous+1,operation:'upsert',payload:{sectionId:s.id}});expect(body.payload.teachers.map(t=>t.sourceId).sort()).toEqual([...teachers].sort());expect(after.versions).toEqual([{source_version:String(previous+1)}]);
  const audits=(await sql.query("SELECT request_id,actor_user_id FROM security_audit_log WHERE institution_id=$1 AND request_id=$2 AND action='academic.snapshot.queued'",[unit,correlation])).rows;expect(audits).toEqual([{request_id:correlation,actor_user_id:admin.id}]);
 }else{expect(after.versions).toEqual([]);}
}
async function auditFailure(s:Section,action:string,work:()=>Promise<void>){
 const name='assignment_audit_'+randomBytes(8).toString('hex');
 await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${action}' AND (NEW.target='section:${s.id}' OR EXISTS(SELECT 1 FROM section_teachers st WHERE st.section_id='${s.id}'::uuid AND st.institution_id='${unit}'::uuid AND NEW.target='assignment:'||st.id::text)) THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
 await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${name}()`);
 try{await work();}finally{await sql.query(`DROP TRIGGER ${name} ON security_audit_log`);await sql.query(`DROP FUNCTION ${name}()`);}
}
async function blocked(pid:number){const until=Date.now()+7000;while(Date.now()<until){if((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) blocked",[pid])).rows[0].blocked)return true;await new Promise(resolve=>setTimeout(resolve,25));}return false;}

describe.sequential('assignment producer HTTP outbox '+(enabled?'ON':'OFF'),()=>{
 beforeAll(async()=>{await sql.connect();const rows=(await sql.query("INSERT INTO institutions(code,name) VALUES($1,'Synthetic assignments'),($2,'Synthetic foreign') RETURNING id",['AS'+randomUUID().slice(0,12).toUpperCase(),'AF'+randomUUID().slice(0,12).toUpperCase()])).rows;unit=rows[0].id;foreign=rows[1].id;admin=await actor();expect((await request('GET')).status).toBe(200);if(enabled){expect(process.env.SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID).toBe('fixture');expect(Object.keys(JSON.parse(process.env.SIII_ACADEMIC_OUTBOX_KEYS!))).toEqual(['fixture']);}});
 afterAll(async()=>{await sql.end();});
 it('publishes creation with shared request audit only when enabled',async()=>{
  const s=await section(),correlation=randomUUID();const response=await request('POST',{sectionId:s.id,teacherId:s.teacher},admin,unit,correlation);expect(response.status).toBe(201);const row=(await response.json()).data;
  expect(row).toMatchObject({institutionId:unit,sectionId:s.id,teacherId:s.teacher,revokedAt:null});
  expect((await sql.query("SELECT request_id,actor_user_id FROM security_audit_log WHERE target=$1 AND action='teacher.assign'",['assignment:'+row.id])).rows).toEqual([{request_id:response.headers.get('x-request-id'),actor_user_id:admin.id}]);await expectQueue(s,0,[s.teacher],response.headers.get('x-request-id')!);
 });
 it('publishes revocation without losing another teacher only when enabled',async()=>{
  const s=await section(),otherTeacher=await teacher(),id=await assignment(s);await assignment(s,otherTeacher);await baseline(s);const before=await state(s),correlation=randomUUID();
  if(enabled)expect((await latest(s)).payload.teachers.map(t=>t.sourceId).sort()).toEqual([s.teacher,otherTeacher].sort());
  const response=await request('PATCH',{id,status:'withdrawn'},admin,unit,correlation);expect(response.status).toBe(200);expect((await response.json()).data.revokedAt).not.toBeNull();expect((await sql.query("SELECT request_id FROM security_audit_log WHERE target=$1 AND action='teacher.unassign'",['assignment:'+id])).rows).toEqual([{request_id:response.headers.get('x-request-id')}]);await expectQueue(s,before.events.length,[otherTeacher],response.headers.get('x-request-id')!);
 });
 it('keeps the group and emits an empty teacher array after the final revocation',async()=>{const s=await section(),id=await assignment(s),correlation=randomUUID();const response=await request('PATCH',{id,status:'withdrawn'},admin,unit,correlation);expect(response.status).toBe(200);await expectQueue(s,0,[],response.headers.get('x-request-id')!);expect((await sql.query('SELECT id FROM academic_sections WHERE id=$1',[s.id])).rows).toHaveLength(1);});
 for(const method of ['POST','PATCH'] as const)it.each(['student','missing-mfa','suspended','password-change','expired','inactive-user','no-session'] as const)(method+' denies %s without assignment/event/version/audit',async kind=>{
  const s=await section(),who=await actor(kind==='student'?'student':'admin',kind!=='missing-mfa');
  if(kind==='suspended')await sql.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[who.member]);
  if(kind==='password-change')await sql.query('UPDATE platform_users SET must_change_password=true WHERE id=$1',[who.id]);
  if(kind==='expired')await sql.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[who.session]);
  if(kind==='inactive-user')await sql.query('UPDATE platform_users SET is_active=false WHERE id=$1',[who.id]);
  if(kind==='no-session')who.cookie='';const id=method==='PATCH'?await assignment(s):null;const before=await state(s);expect((await request(method,method==='POST'?{sectionId:s.id,teacherId:s.teacher}:{id,status:'withdrawn'},who)).status).toBe(403);expect(await state(s)).toEqual(before);
 });
 it.each(['teacher-inactive','section-archived','institution-inactive'] as const)('preserves %s domain denial without an event',async kind=>{const s=await section();if(kind==='teacher-inactive')await sql.query("UPDATE institutional_teachers SET status='inactive' WHERE id=$1",[s.teacher]);if(kind==='section-archived')await sql.query("UPDATE academic_sections SET status='archived' WHERE id=$1",[s.id]);if(kind==='institution-inactive')await sql.query("UPDATE institutions SET status='inactive' WHERE id=$1",[unit]);const before=await state(s);try{expect((await request('POST',{sectionId:s.id,teacherId:s.teacher})).status).toBe(kind==='institution-inactive'?403:422);expect(await state(s)).toEqual(before);}finally{if(kind==='institution-inactive')await sql.query("UPDATE institutions SET status='active' WHERE id=$1",[unit]);}});
 it('preserves origin/body/no-membership contracts without a queued event',async()=>{const s=await section(),body={sectionId:s.id,teacherId:s.teacher},before=await state(s);expect((await request('POST',body,admin,unit,randomUUID(),'https://foreign.example')).status).toBe(403);expect((await request('POST',{...body,unexpected:true})).status).toBe(422);expect((await request('POST',body,admin,foreign)).status).toBe(403);expect(await state(s)).toEqual(before);});
 it.each(['teacher','section','assignment'] as const)('rejects foreign tenant %s references',async kind=>{const s=await section(),outside=await section(foreign),before=await state(s);if(kind==='assignment'){const id=(await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3) RETURNING id',[foreign,outside.id,outside.teacher])).rows[0].id;expect((await request('PATCH',{id,status:'withdrawn'})).status).toBe(409);}else{expect((await request('POST',{sectionId:kind==='section'?outside.id:s.id,teacherId:kind==='teacher'?outside.teacher:s.teacher})).status).toBe(422);}expect(await state(s)).toEqual(before);});
 it('unknown and already-revoked assignments remain409 without additional events',async()=>{const s=await section(),id=await assignment(s);await sql.query('UPDATE section_teachers SET revoked_at=now() WHERE id=$1',[id]);const before=await state(s);for(const target of [randomUUID(),id])expect((await request('PATCH',{id:target,status:'withdrawn'})).status).toBe(409);expect(await state(s)).toEqual(before);});
 for(const method of ['POST','PATCH'] as const){
  it(method+' business-audit failure rolls back every write',async()=>{const s=await section(),id=method==='PATCH'?await assignment(s):null,correlation=randomUUID(),before=await state(s);await auditFailure(s,method==='POST'?'teacher.assign':'teacher.unassign',async()=>{expect((await request(method,method==='POST'?{sectionId:s.id,teacherId:s.teacher}:{id,status:'withdrawn'},admin,unit,correlation)).status).toBe(500);});expect(await state(s)).toEqual(before);});
  it(method+' queued-audit failure rolls back ON and is untouched OFF',async()=>{const s=await section(),id=method==='PATCH'?await assignment(s):null,correlation=randomUUID(),before=await state(s);await auditFailure(s,'academic.snapshot.queued',async()=>{expect((await request(method,method==='POST'?{sectionId:s.id,teacherId:s.teacher}:{id,status:'withdrawn'},admin,unit,correlation)).status).toBe(enabled?500:method==='POST'?201:200);});if(enabled)expect(await state(s)).toEqual(before);else expect((await state(s)).events).toEqual([]);});
  it(method+' outbox insert failure rolls back ON and is untouched OFF',async()=>{const s=await section(),id=method==='PATCH'?await assignment(s):null,before=await state(s),name='assignment_event_'+randomBytes(8).toString('hex');await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.section_id='${s.id}'::uuid THEN RAISE EXCEPTION 'synthetic outbox failure'; END IF; RETURN NEW; END $$`);await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON academic_section_outbox FOR EACH ROW EXECUTE FUNCTION ${name}()`);try{expect((await request(method,method==='POST'?{sectionId:s.id,teacherId:s.teacher}:{id,status:'withdrawn'})).status).toBe(enabled?500:method==='POST'?201:200);if(enabled)expect(await state(s)).toEqual(before);else expect((await state(s)).events).toEqual([]);}finally{await sql.query(`DROP TRIGGER ${name} ON academic_section_outbox`);await sql.query(`DROP FUNCTION ${name}()`);}});
 }
 it('concurrent duplicate assignment has201/409 and at most one event',async()=>{const s=await section(),responses=await Promise.all([request('POST',{sectionId:s.id,teacherId:s.teacher}),request('POST',{sectionId:s.id,teacherId:s.teacher})]);expect(responses.map(r=>r.status).sort()).toEqual([201,409]);const after=await state(s);expect(after.assignments).toHaveLength(1);expect(after.events).toHaveLength(enabled?1:0);expect(after.versions).toEqual(enabled?[{source_version:'1'}]:[]);});
 it('concurrent duplicate revocation has200/409 and at most one event',async()=>{const s=await section(),id=await assignment(s),responses=await Promise.all([request('PATCH',{id,status:'withdrawn'}),request('PATCH',{id,status:'withdrawn'})]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);const after=await state(s);expect(after.assignments[0].revoked_at).not.toBeNull();expect(after.events).toHaveLength(enabled?1:0);expect(after.versions).toEqual(enabled?[{source_version:'1'}]:[]);});
 it('concurrent different assignments retain both teachers with increasing source versions',async()=>{const s=await section(),second=await teacher(),otherActor=await actor(),responses=await Promise.all([request('POST',{sectionId:s.id,teacherId:s.teacher}),request('POST',{sectionId:s.id,teacherId:second},otherActor)]);expect(responses.map(r=>r.status)).toEqual([201,201]);const after=await state(s);expect(after.events.map(e=>Number(e.source_version))).toEqual(enabled?[1,2]:[]);if(enabled)expect((await latest(s)).payload.teachers.map(t=>t.sourceId).sort()).toEqual([s.teacher,second].sort());});
 for(const method of ['POST','PATCH'] as const)it(method+' SQL-barrier concurrent changes freeze the final teacher state in the maximum version',async()=>{
  const s=await section(),secondTeacher=await teacher(),otherActor=await actor(),firstId=method==='PATCH'?await assignment(s):null,secondId=method==='PATCH'?await assignment(s,secondTeacher):null;
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();const pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid,key=randomBytes(4).readUInt32BE(0)%2147483647,name='assignment_order_'+randomBytes(8).toString('hex');
  await gate.query('SELECT pg_advisory_lock($1)',[key]);
  await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${method==='POST'?'teacher.assign':'teacher.unassign'}' AND EXISTS(SELECT 1 FROM section_teachers st WHERE st.section_id='${s.id}'::uuid AND NEW.target='assignment:'||st.id::text) THEN PERFORM pg_advisory_xact_lock(${key}); END IF; RETURN NEW; END $$`);await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  const pending:Promise<Response>[]=[];
  try{pending.push(request(method,method==='POST'?{sectionId:s.id,teacherId:s.teacher}:{id:firstId,status:'withdrawn'}));expect(await blocked(pid)).toBe(true);
   pending.push(request(method,method==='POST'?{sectionId:s.id,teacherId:secondTeacher}:{id:secondId,status:'withdrawn'},otherActor));
   const until=Date.now()+7000;let observed=false;while(Date.now()<until){if(Number((await sql.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock'")).rows[0].n)>=2){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}expect(observed).toBe(true);
   await gate.query('SELECT pg_advisory_unlock($1)',[key]);expect((await Promise.all(pending)).map(r=>r.status)).toEqual(method==='POST'?[201,201]:[200,200]);const after=await state(s);expect(after.events.map(e=>Number(e.source_version))).toEqual(enabled?[1,2]:[]);
   const current=(await sql.query("SELECT t.id FROM section_teachers st JOIN institutional_teachers t ON t.id=st.teacher_id AND t.institution_id=st.institution_id WHERE st.institution_id=$1 AND st.section_id=$2 AND st.revoked_at IS NULL AND t.status='active' ORDER BY t.id",[unit,s.id])).rows.map(t=>t.id);expect(current).toEqual(method==='POST'?[s.teacher,secondTeacher].sort():[]);
   if(enabled){const maximum=await latest(s);expect(maximum.sourceVersion).toBe(2);expect(maximum.payload.teachers.map(t=>t.sourceId).sort()).toEqual(current);}
  }finally{await gate.query('SELECT pg_advisory_unlock($1)',[key]);await Promise.allSettled(pending);await sql.query(`DROP TRIGGER ${name} ON security_audit_log`);await sql.query(`DROP FUNCTION ${name}()`);await gate.end();}
 });
 it('oversized historical enrollment snapshot fails atomically ON instead of truncating revocation',async()=>{const s=await section(),id=await assignment(s);const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Synthetic program','licenciatura','presencial') RETURNING id",[unit,'PG'+randomUUID().slice(0,12).toUpperCase()])).rows[0].id;const student=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,'Synthetic','History') RETURNING id",[unit,program,'ST'+randomUUID().slice(0,12).toUpperCase()])).rows[0].id;await sql.query("INSERT INTO section_enrollments(institution_id,section_id,student_id,status) SELECT $1,$2,$3,'withdrawn' FROM generate_series(1,501)",[unit,s.id,student]);const before=await state(s);expect((await request('PATCH',{id,status:'withdrawn'})).status).toBe(enabled?500:200);if(enabled)expect(await state(s)).toEqual(before);else expect((await state(s)).events).toEqual([]);});
 for(const change of ['grant-revoked','session-expired'] as const)it('final authority '+change+' during a real SQL wait rolls back assignment and event',async()=>{
  const s=await section(),id=await assignment(s),who=await actor(),correlation=randomUUID(),before=await state(s),name='assignment_wait_'+randomBytes(8).toString('hex'),key=randomBytes(4).readUInt32BE(0)%2147483647;
  const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();const pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid;await gate.query('SELECT pg_advisory_lock($1)',[key]);
  await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target='assignment:${id}' AND NEW.action='teacher.unassign' THEN PERFORM pg_advisory_xact_lock(${key}); END IF; RETURN NEW; END $$`);await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  if(change==='session-expired')await sql.query("UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1",[who.session]);
  const pending=request('PATCH',{id,status:'withdrawn'},who,unit,correlation);
  try{expect(await blocked(pid)).toBe(true);if(change==='grant-revoked')await sql.query('UPDATE role_assignments SET revoked_at=clock_timestamp() WHERE id=$1',[who.grant]);else{const until=Date.now()+7000;while(!(await sql.query('SELECT expires_at<=clock_timestamp() expired FROM auth_sessions WHERE id=$1',[who.session])).rows[0].expired){if(Date.now()>until)throw Error('FIXTURE_EXPIRY_NOT_OBSERVED');await new Promise(resolve=>setTimeout(resolve,25));}}
   await gate.query('SELECT pg_advisory_unlock($1)',[key]);expect((await pending).status).toBe(403);expect(await state(s)).toEqual(before);
  }finally{await gate.query('SELECT pg_advisory_unlock($1)',[key]);await pending;await sql.query(`DROP TRIGGER ${name} ON security_audit_log`);await sql.query(`DROP FUNCTION ${name}()`);await gate.end();}
 });
});
