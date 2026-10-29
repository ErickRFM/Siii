/** Opt-in disposable cross-repository lab. Never imported by application code. */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {createServer,type Server} from 'node:http';
import pg from 'pg';
import setup from './http-setup';
import {isolatedDatabaseUrl} from './database-url';

const prefix='COMPANION_CHAIN_';
const required=(name:string)=>{const value=process.env[prefix+name];if(!value)throw Error('CHAIN_CONFIG_INVALID');return value};
const institution=required('SOURCE_INSTITUTION_ID'),origin=required('ORIGIN'),keyId=required('KEY_ID'),secret=required('SECRET_BASE64');
assert.match(institution,/^[0-9a-f-]{36}$/);
assert.match(origin,/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/);
assert.match(keyId,/^[A-Za-z0-9_-]{1,64}$/);
assert.equal(Buffer.from(secret,'base64').length,32);
assert.equal(Buffer.from(secret,'base64').toString('base64'),secret);
const database=isolatedDatabaseUrl();
process.env.SIII_COMPANERO_INSTITUTION_ID=institution;
process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON=JSON.stringify({[institution]:{origin:'https://companion-chain.invalid',keyId,secretBase64:secret}});
process.env.SIII_ACADEMIC_OUTBOX_ENABLED='true';
delete process.env.SIII_HTTP_TEST_PRODUCTION;
const sql=new pg.Client({connectionString:database});
const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
const emit=(data:unknown)=>process.stdout.write(JSON.stringify(data)+'\n');
let stop:(()=>Promise<void>)|undefined,pool:pg.Pool|undefined;
let cookie='',studentCookie='',sectionId='',assignmentId='',enrollmentId='',occurrenceId='';
let studentId='',teacherId='',roomId='';
let attendanceOrigin:string|undefined,attendanceRelay:Server|undefined;
const suffix=randomBytes(5).toString('hex').toUpperCase();
const studentExternal='ST_'+suffix,teacherExternal='TC_'+suffix;
async function request(resource:string,method:string,body:unknown,status:number){
 const response=await fetch(base+'/api/v1/institutions/'+institution+'/'+resource,{method,headers:{origin:base,cookie,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,status,'CHAIN_HTTP_'+resource+'_'+response.status);
 return (await response.json()).data;
}
async function initialize(){
 const readKey=required('ATTENDANCE_KEY_ID'),readSecret=required('ATTENDANCE_SECRET_BASE64');
 assert.match(readKey,/^[A-Za-z0-9_-]{1,64}$/);assert.equal(Buffer.from(readSecret,'base64').length,32);
 assert.equal(Buffer.from(readSecret,'base64').toString('base64'),readSecret);
 assert.notEqual(readKey,keyId);assert.notEqual(readSecret,secret);
 process.env.SIII_COMPANION_ATTENDANCE_TARGETS_JSON=JSON.stringify({[institution]:{origin:'https://companion-chain.invalid',keyId:readKey,secretBase64:readSecret}});
 attendanceRelay=createServer(async(req,res)=>{
  try{
   assert.equal(req.method,'POST');assert.equal(req.url,'/integration/v1/attendance-history');assert.ok(attendanceOrigin);
   const chunks:Buffer[]=[];let length=0;
   for await(const chunk of req){length+=chunk.length;assert.ok(length<=4096);chunks.push(Buffer.from(chunk));}
   const response=await fetch(attendanceOrigin+req.url,{method:'POST',headers:{'content-type':'application/json',
    'x-integration-key-id':String(req.headers['x-integration-key-id']??''),'x-integration-timestamp':String(req.headers['x-integration-timestamp']??''),
    'x-integration-nonce':String(req.headers['x-integration-nonce']??''),'x-integration-signature':String(req.headers['x-integration-signature']??'')},body:Buffer.concat(chunks),signal:AbortSignal.timeout(10000)});
   res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503);res.end();}
 });
 await new Promise<void>(resolve=>attendanceRelay!.listen(0,'127.0.0.1',resolve));
 const address=attendanceRelay.address();assert.ok(address&&typeof address!=='string');
 process.env.SIII_TEST_ATTENDANCE_RELAY='http://127.0.0.1:'+address.port;
 await sql.connect();stop=await setup();
 // The control harness seeds only isolated synthetic prerequisites; every scenario mutation uses HTTP.
 await sql.query("INSERT INTO institutions(id,code,name,timezone) VALUES($1,$2,'Synthetic cross-repository lab','America/Mexico_City')",[institution,'CH_'+suffix]);
 const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Synthetic program','licenciatura','presencial') RETURNING id",[institution,'PR_'+suffix])).rows[0].id;
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Synthetic term','2026-10-19','2026-10-25') RETURNING id",[institution,'TR_'+suffix])).rows[0].id;
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Synthetic subject',5) RETURNING id",[institution,'CR_'+suffix])).rows[0].id;
 const campus=(await sql.query("INSERT INTO campuses(institution_id,code,name) VALUES($1,$2,'Synthetic campus') RETURNING id",[institution,'CP_'+suffix])).rows[0].id;
 roomId=(await sql.query("INSERT INTO classrooms(institution_id,campus_id,code,building,capacity) VALUES($1,$2,$3,'Synthetic building',30) RETURNING id",[institution,campus,'RM_'+suffix])).rows[0].id;
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Chain operator') RETURNING id")).rows[0].id;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,'chain-'+randomUUID()])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institution,user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,'admin','institution')",[institution,member]);
 const {sealMfaSecret}=await import('../../src/shared/auth/mfa-primitives');
 await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)]);
 const token=randomBytes(32).toString('base64url');
 await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',now())",[user,createHash('sha256').update(token).digest('hex')]);cookie='siii_session='+token;
 sectionId=(await request('sections','POST',{termId:term,courseId:course,code:'SC_'+suffix,capacity:20},201)).id;
 studentId=(await request('registry/students','POST',{enrollmentNumber:studentExternal,programId:program,firstName:'Synthetic',lastName:'Student'},201)).id;
 teacherId=(await request('registry/teachers','POST',{employeeNumber:teacherExternal,firstName:'Synthetic',lastName:'Teacher'},201)).id;
 const studentPerson=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Personal attendance reader') RETURNING id")).rows[0].id;
 const studentUser=(await sql.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[studentPerson,'personal-chain-'+randomUUID()])).rows[0].id;
 const studentMember=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institution,studentUser])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,'student','institution')",[institution,studentMember]);
 await sql.query('INSERT INTO student_account_links(institution_id,membership_id,student_id,linked_by) VALUES($1,$2,$3,$4)',[institution,studentMember,studentId,user]);
 const studentToken=randomBytes(32).toString('base64url');
 await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[studentUser,createHash('sha256').update(studentToken).digest('hex')]);studentCookie='siii_session='+studentToken;
 process.env.DATABASE_URL=JSON.parse(readFileSync('.superpowers/sdd/2026-10-13-p0-hardening/app-connection.json','utf8')).connectionString;
 const connection=await import('../../src/infrastructure/database');pool=connection.pool;
 await connection.assertApplicationRole();
 // Compile the development route before exercising the production client's unchanged 10s bound.
 const warm=await fetch(base+'/api/integrations/companion/v1/authority',{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
 assert.equal(warm.status,401);await warm.body?.cancel();
 return {sourceInstitutionId:institution,sourceOrigin:base,sectionId,studentId,teacherId,studentExternal,teacherExternal};
}
async function delivery(){
 const {db}=await import('../../src/infrastructure/database');
 const {deliverAcademicEvents,claimAcademicEvent,completeAcademicEvent}=await import('../../src/integrations/companion/outbox/worker');
 const {signedAcademicTransport}=await import('../../src/integrations/companion/outbox/signed-transport');
 const transport=signedAcademicTransport(process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON,async(url,init)=>{
  assert.equal(String(url),'https://companion-chain.invalid/integration/v1/events');
  return fetch(origin+'/integration/v1/events',init);
 });
 // Real PostgreSQL leases/CAS and sender; narrow selection to this test's tenant.
 const totals=await deliverAcademicEvents({transport,limit:100},{
  listDue:async(now,limit)=>(await sql.query("SELECT event_id AS \"eventId\" FROM academic_section_outbox WHERE institution_id=$1 AND state='queued' AND next_attempt_at<=$2 AND (lease_until IS NULL OR lease_until<=$2) ORDER BY next_attempt_at,event_id LIMIT $3",[institution,now,limit])).rows,
  claim:(id,now)=>db.transaction(tx=>claimAcademicEvent(tx,id,now)),
  complete:(event,result,now)=>db.transaction(tx=>completeAcademicEvent(tx,event,result,now)),
 });
 const events=(await sql.query('SELECT event_id AS "eventId",source_version::int AS "sourceVersion",state,attempts,failure_code AS "failureCode" FROM academic_section_outbox WHERE institution_id=$1 ORDER BY source_version',[institution])).rows;
 return {totals,events};
}
async function command(action:string,input:Record<string,unknown>){
 switch(action){
  case 'history':{
   assert.equal(typeof input.origin,'string');assert.match(String(input.origin),/^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/);
   attendanceOrigin=String(input.origin);
   const response=await fetch(base+'/api/v1/institutions/'+institution+'/companion-attendance/'+studentId,{headers:{origin:base,cookie},signal:AbortSignal.timeout(30000)});
   const personal=await fetch(base+'/api/v1/institutions/'+institution+'/companion-attendance/mine',{headers:{origin:base,cookie:studentCookie},signal:AbortSignal.timeout(30000)});
   assert.equal(personal.status,response.status,'PERSONAL_HISTORY_AUTHORITY_MISMATCH');
   if(response.status!==200){await response.body?.cancel();await personal.body?.cancel();return {historyStatus:response.status};}
   assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(personal.headers.get('cache-control'),'no-store');
   assert.match(personal.headers.get('x-siii-attendance-session')??'',/^[0-9a-f]{64}$/);
   const history=(await response.json()).data,own=(await personal.json()).data;
   assert.deepEqual(own.records,history.records);assert.equal(own.contract,history.contract);
   return {history,personalHistoryVerified:true};
  }
  case 'deliver':return delivery();
  case 'projection-status':{
   const {readProjectionStatus}=await import('../../src/integrations/companion/projection-status');
   const events=(await sql.query('SELECT event_id AS "eventId",section_id AS "sectionId",source_version::int AS "sourceVersion" FROM academic_section_outbox WHERE institution_id=$1 ORDER BY source_version DESC LIMIT 50',[institution])).rows;
   const observation=await readProjectionStatus(institution,events,{targets:process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON,http:async(url,init)=>{
    assert.equal(String(url),'https://companion-chain.invalid/integration/v1/projection-status');
    return fetch(origin+'/integration/v1/projection-status',init);
   }});
   return {observation};
  }
  case 'retry-deliver':
   // Advance only this disposable fixture's retry clock; production backoff remains unchanged.
   await sql.query("UPDATE academic_section_outbox SET next_attempt_at=clock_timestamp() WHERE institution_id=$1 AND state='queued' AND lease_until IS NULL",[institution]);
   return delivery();
  case 'assign':assignmentId=(await request('assignments','POST',{sectionId,teacherId},201)).id;break;
  case 'enroll':enrollmentId=(await request('enrollments','POST',{sectionId,studentId},201)).id;break;
  case 'schedule':{
   await request('schedule-patterns','POST',{sectionId,roomId,weekday:4,startMinute:540,endMinute:600},201);
   const occurrences=await requestGetOccurrences();assert.equal(occurrences.length,1);occurrenceId=occurrences[0].id;return {occurrenceId,date:'2026-10-22'};
  }
  case 'online':case 'cancel':await request('occurrences','PATCH',{id:occurrenceId,state:action==='online'?'ONLINE':'CANCELLED',reason:'Synthetic chain change'},200);break;
  case 'withdraw':await request('enrollments','PATCH',{id:enrollmentId,status:'withdrawn'},200);break;
  case 'unassign':await request('assignments','PATCH',{id:assignmentId,status:'withdrawn'},200);break;
  case 'suspend-student':await request('registry/students','PATCH',{id:studentId,status:'inactive'},200);break;
  case 'disable-institution':case 'restore-institution':await sql.query('UPDATE institutions SET status=$2 WHERE id=$1',[institution,action==='disable-institution'?'inactive':'active']);break;
  default:throw Error('CHAIN_UNKNOWN_ACTION');
 }
 const sourceVersion=Number((await sql.query('SELECT source_version FROM academic_section_versions WHERE institution_id=$1 AND section_id=$2',[institution,sectionId])).rows[0].source_version);
 return {sourceVersion};
}
async function requestGetOccurrences(){
 const response=await fetch(base+'/api/v1/institutions/'+institution+'/occurrences?weekOf=2026-10-19&sectionId='+sectionId,{headers:{cookie},signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200);return (await response.json()).data;
}
async function main(){
 const input=createInterface({input:process.stdin,crlfDelay:Infinity});
 try{
  emit({ok:true,...await initialize()});
  for await(const line of input){
   const message=JSON.parse(line),action=message.action;if(action==='stop')break;
   emit({ok:true,...await command(action,message)});
  }
 }finally{input.close();await pool?.end();await stop?.();await sql.end();await new Promise<void>(resolve=>attendanceRelay?attendanceRelay.close(()=>resolve()):resolve());}
}
await main().catch(()=>{process.stderr.write('COMPANION_CHAIN_PROBE_FAILED\n');process.exitCode=1});
