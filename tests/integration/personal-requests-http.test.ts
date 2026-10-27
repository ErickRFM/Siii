import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {portalFixture} from '../support/portal-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:'+Number(process.env.SIII_TEST_PORT??3107);
let f:Awaited<ReturnType<typeof portalFixture>>;
function path(resource='requests',tenant=f.tenant){return `${base}/api/v1/institutions/${tenant}/portal/student/${resource}`}
async function submit(body:unknown,cookie=f.student.cookie,tenant=f.tenant,origin=base){return fetch(path('requests',tenant),{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)})}
const input=()=>({operationId:randomUUID(),requestType:'CERTIFICATE',summary:'Solicito constancia de inscripción para seguimiento.'});
describe.sequential('student own service requests over real HTTP',()=>{
 beforeAll(async()=>{await sql.connect();f=await portalFixture(sql)},30000);afterAll(async()=>{await sql.end()});
 it('persists an own request and returns a stable tracking identifier without emitting an official document',async()=>{
  const body=input(),response=await submit(body);expect(response.status).toBe(201);const data=(await response.json()).data;
  expect(data).toMatchObject({id:body.operationId,requestType:'CERTIFICATE',summary:body.summary,status:'SUBMITTED'});
  expect((await sql.query('SELECT student_id,institution_id,status FROM student_service_requests WHERE id=$1',[body.operationId])).rows).toEqual([{student_id:f.studentId,institution_id:f.tenant,status:'SUBMITTED'}]);
  expect((await sql.query("SELECT action,request_id FROM security_audit_log WHERE target=$1",['request:'+body.operationId])).rows).toEqual([expect.objectContaining({action:'service.request.submit',request_id:expect.any(String)})]);
 });
 it('replays the same key once under concurrency and rejects a changed payload',async()=>{
  const body=input(),responses=await Promise.all([submit(body),submit({...body,operationId:body.operationId.toUpperCase()})]);expect(responses.map(response=>response.status).sort()).toEqual([200,201]);
  expect((await sql.query('SELECT count(*)::int AS n FROM student_service_requests WHERE id=$1',[body.operationId])).rows[0].n).toBe(1);
  expect((await submit({...body,summary:'Otro contenido para la misma operación.'})).status).toBe(409);
  expect((await submit(body,f.secondStudent.cookie)).status).toBe(409);
 });
 it('rejects ownership/status mass assignment, missing authority, cross tenant and CSRF',async()=>{
  expect((await submit(input(),'')).status).toBe(401);
  expect((await submit({...input(),summary:'corta'})).status).toBe(422);
  expect((await submit({...input(),studentId:f.secondStudentId})).status).toBe(422);
  expect((await submit({...input(),status:'APPROVED'})).status).toBe(422);
  expect((await submit(input(),f.teacher.cookie)).status).toBe(403);
  expect((await submit(input(),f.guest.cookie)).status).toBe(403);
  expect((await submit(input(),f.student.cookie,f.other)).status).toBe(403);
  expect((await submit(input(),f.student.cookie,f.tenant,'https://foreign.invalid')).status).toBe(403);
 });
 it('reads only the linked record requests and whitelisted request history',async()=>{
  const own=input(),other=input();expect((await submit(own)).status).toBe(201);expect((await submit(other,f.secondStudent.cookie)).status).toBe(201);
  const response=await fetch(path(),{headers:{cookie:f.student.cookie}});expect(response.status).toBe(200);const rows=(await response.json()).data;expect(rows.some((row:{id:string})=>row.id===own.operationId)).toBe(true);expect(rows.some((row:{id:string})=>row.id===other.operationId)).toBe(false);
  expect((await fetch(path()+'?studentId='+f.secondStudentId,{headers:{cookie:f.student.cookie}})).status).toBe(422);
  const history=await fetch(path('request-history'),{headers:{cookie:f.student.cookie}});expect(history.status).toBe(200);const events=(await history.json()).data;expect(events).toContainEqual(expect.objectContaining({requestId:own.operationId,status:'SUBMITTED'}));expect(events.some((row:{requestId:string})=>row.requestId===other.operationId)).toBe(false);
  const pending=await fetch(path('pending-requests'),{headers:{cookie:f.student.cookie}});expect(pending.status).toBe(200);const pendingRows=(await pending.json()).data;expect(pendingRows).toContainEqual(expect.objectContaining({id:own.operationId,status:'SUBMITTED'}));expect(pendingRows.some((row:{id:string})=>row.id===other.operationId)).toBe(false);
  for(const resource of ['requests','pending-requests','request-history']){expect((await fetch(path(resource,f.other),{headers:{cookie:f.student.cookie}})).status).toBe(403);expect((await fetch(path(resource)+'?studentId='+f.secondStudentId,{headers:{cookie:f.student.cookie}})).status).toBe(422)}
 });
 it('keeps administrative resolutions and replay traceable without exposing audit actors or unrelated events',async()=>{
  const body=input();expect((await submit(body)).status).toBe(201);
  for(const [status,decisionReason] of [['IN_REVIEW','Se revisa la documentación de la solicitud.'],['APPROVED','La solicitud fue revisada por Control Escolar.']]){
   const response=await fetch(`${base}/api/v1/institutions/${f.tenant}/requests`,{method:'PATCH',headers:{cookie:f.admin.cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({id:body.operationId,status,decisionReason})});expect(response.status).toBe(200);
  }
  const replay=await submit(body);expect(replay.status).toBe(200);expect((await replay.json()).data).toMatchObject({status:'APPROVED',decisionReason:'La solicitud fue revisada por Control Escolar.'});
  await sql.query("INSERT INTO security_audit_log(institution_id,actor_user_id,action,target,details) VALUES($1,$2,'auth.login.failed',$3,'{\"reason\":\"PRIVATE-AUDIT-DETAIL\"}'),($4,$2,'service.request.approved',$3,null)",[f.tenant,f.admin.id,'request:'+body.operationId,f.other]);
  const history=await fetch(path('request-history'),{headers:{cookie:f.student.cookie}}),text=await history.text();expect(history.status).toBe(200);expect(text).not.toContain('PRIVATE-AUDIT');expect(text).not.toContain(f.admin.id);expect(text).not.toContain('actorUserId');
  const own=JSON.parse(text).data.filter((row:{requestId:string})=>row.requestId===body.operationId);expect(own.map((row:{status:string})=>row.status).sort()).toEqual(['APPROVED','IN_REVIEW','SUBMITTED']);expect(own).toContainEqual(expect.objectContaining({status:'APPROVED',decisionReason:'La solicitud fue revisada por Control Escolar.'}));
  const audit=(await sql.query("SELECT details FROM security_audit_log WHERE institution_id=$1 AND target=$2 AND action='service.request.approved'",[f.tenant,'request:'+body.operationId])).rows[0].details;expect(audit).toMatchObject({before:{status:'IN_REVIEW'},after:{status:'APPROVED',decisionReason:'La solicitud fue revisada por Control Escolar.'}});
 });
 it('denies creation after link revocation, inactive record or mismatched program scope',async()=>{
  await sql.query('UPDATE student_account_links SET revoked_at=now() WHERE membership_id=$1',[f.student.member]);
  try{expect((await submit(input())).status).toBe(403);expect((await (await fetch(path(),{headers:{cookie:f.student.cookie}})).json()).data).toEqual([])}finally{await sql.query('UPDATE student_account_links SET revoked_at=null WHERE membership_id=$1',[f.student.member])}
  await sql.query("UPDATE institutional_students SET status='inactive' WHERE id=$1",[f.studentId]);
  try{expect((await submit(input())).status).toBe(403)}finally{await sql.query("UPDATE institutional_students SET status='active' WHERE id=$1",[f.studentId])}
  await sql.query("UPDATE role_assignments SET scope_type='program',scope_program_id=$1,institution_id=$3 WHERE id=$2",[f.program,f.student.grant,f.tenant]);
  try{
   expect((await submit(input())).status).toBe(201);
   const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'WRONG','Programa ajeno','ingenieria','presencial') RETURNING id",[f.tenant])).rows[0].id;
   await sql.query('UPDATE role_assignments SET scope_program_id=$1 WHERE id=$2',[program,f.student.grant]);expect((await submit(input())).status).toBe(403);
  }finally{await sql.query("UPDATE role_assignments SET scope_type='institution',scope_program_id=null WHERE id=$1",[f.student.grant])}
 });
 it('rolls back the request if its audit cannot be recorded',async()=>{
  const body=input(),name='v3_request_audit_'+randomUUID().replaceAll('-','');
  await sql.query(`CREATE FUNCTION ${pg.escapeIdentifier(name)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target=${pg.escapeLiteral('request:'+body.operationId)} THEN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END IF; RETURN NEW; END $$`);
  await sql.query(`CREATE TRIGGER ${pg.escapeIdentifier(name)} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${pg.escapeIdentifier(name)}()`);
  try{expect((await submit(body)).status).toBe(500);expect((await sql.query('SELECT count(*)::int AS n FROM student_service_requests WHERE id=$1',[body.operationId])).rows[0].n).toBe(0)}finally{await sql.query(`DROP TRIGGER ${pg.escapeIdentifier(name)} ON security_audit_log`);await sql.query(`DROP FUNCTION ${pg.escapeIdentifier(name)}()`)}
 });
 it('rechecks grant expiry after waiting for the audit and rolls the write back',async()=>{
  const body=input(),name='v3_request_gate_'+randomUUID().replaceAll('-',''),key=Math.floor(Math.random()*1000000000)+1,blocker=new pg.Client({connectionString:isolatedDatabaseUrl()});await blocker.connect();
  await sql.query(`CREATE FUNCTION ${pg.escapeIdentifier(name)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target=${pg.escapeLiteral('request:'+body.operationId)} THEN PERFORM pg_advisory_xact_lock(${key}); END IF; RETURN NEW; END $$`);
  await sql.query(`CREATE TRIGGER ${pg.escapeIdentifier(name)} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${pg.escapeIdentifier(name)}()`);
  let pending:Promise<Response>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock($1)',[key]);pending=submit(body);
   let waiting=false;for(let n=0;n<200&&!waiting;n++){waiting=(await sql.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted) AS waiting",[key])).rows[0].waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,25))}expect(waiting).toBe(true);
   await sql.query("UPDATE role_assignments SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[f.student.grant]);await blocker.query('COMMIT');expect((await pending).status).toBe(403);
   expect((await sql.query('SELECT count(*)::int AS n FROM student_service_requests WHERE id=$1',[body.operationId])).rows[0].n).toBe(0);expect((await sql.query('SELECT count(*)::int AS n FROM security_audit_log WHERE target=$1',['request:'+body.operationId])).rows[0].n).toBe(0);
  }finally{await blocker.query('ROLLBACK');await blocker.end();await pending?.catch(()=>undefined);await sql.query('UPDATE role_assignments SET expires_at=null WHERE id=$1',[f.student.grant]);await sql.query(`DROP TRIGGER ${pg.escapeIdentifier(name)} ON security_audit_log`);await sql.query(`DROP FUNCTION ${pg.escapeIdentifier(name)}()`)}
 });
});
