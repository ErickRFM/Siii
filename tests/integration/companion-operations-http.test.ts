import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';

const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107),enabled=process.env.SIII_ACADEMIC_OUTBOX_ENABLED==='true';
let tenant:string,foreign:string,admin:string,student:string,noMfa:string;
async function actor(role:string,mfa=true){
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Sync operator') RETURNING id")).rows[0].id;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,'sync-'+randomUUID()])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,$3,'institution')",[tenant,member,role]);
 if(mfa)await sql.query('INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now())',[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)]);
 const token=randomBytes(32).toString('base64url');await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',$3)",[user,createHash('sha256').update(token).digest('hex'),mfa?new Date():null]);return 'siii_session='+token;
}
function request(method='GET',body?:unknown,cookie=admin,id=tenant,origin=base){return fetch(base+'/api/v1/institutions/'+id+'/companion-sync',{method,headers:{origin,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})}
async function section(id=tenant){
 const code=randomBytes(5).toString('hex').toUpperCase();
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Synthetic term','2026-01-01','2026-12-31') RETURNING id",[id,'T'+code])).rows[0].id;
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Synthetic course',0) RETURNING id",[id,'C'+code])).rows[0].id;
 return (await sql.query('INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,$4,20) RETURNING id',[id,term,course,'S'+code])).rows[0].id;
}
const recovery=(sectionId:string,expectedSourceVersion=0)=>({sectionId,expectedSourceVersion,reason:'Synthetic operator reconciliation'});
beforeAll(async()=>{await sql.connect();const rows=(await sql.query("INSERT INTO institutions(code,name) VALUES($1,'Synthetic operations'),($2,'Synthetic foreign') RETURNING id",['OP'+randomUUID(),'OF'+randomUUID()])).rows;tenant=rows[0].id;foreign=rows[1].id;admin=await actor('admin');student=await actor('student');noMfa=await actor('admin',false)});
afterAll(async()=>{await sql.end()});
describe.sequential('authorized outbox observation and audited snapshot reconciliation '+(enabled?'ON':'OFF'),()=>{
 for(const method of ['GET','POST'])it.each(['anonymous','student','missing-mfa','foreign'] as const)(method+' denies %s',async mode=>{
  const response=await request(method,method==='POST'?recovery(await section()):undefined,mode==='anonymous'?'':mode==='student'?student:mode==='missing-mfa'?noMfa:admin,mode==='foreign'?foreign:tenant);expect(response.status).toBe(403);
 });
 it('exposes bounded metadata without encrypted bodies, hashes, PII or invented projection acknowledgement',async()=>{
  const response=await request();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const body=await response.json();expect(body.data.enabled).toBe(enabled);expect(body.data.projectionStatus).toBe('unverified');const text=JSON.stringify(body);expect(text).not.toMatch(/bodyEncrypted|bodyDigest|secret|firstName|lastName/);
 });
 it('rebuilds a current snapshot once with optimistic version and operator audit',async()=>{
  const sectionId=await section(),response=await request('POST',recovery(sectionId));expect(response.status).toBe(enabled?201:503);
  if(!enabled){expect((await sql.query('SELECT 1 FROM academic_section_outbox WHERE section_id=$1',[sectionId])).rows).toEqual([]);return}
  expect((await response.json()).data).toMatchObject({status:'queued',sourceVersion:1});
  const before=(await sql.query('SELECT * FROM academic_section_outbox WHERE section_id=$1',[sectionId])).rows;
  expect((await request('POST',recovery(sectionId))).status).toBe(409);expect((await sql.query('SELECT * FROM academic_section_outbox WHERE section_id=$1',[sectionId])).rows).toEqual(before);
  expect((await sql.query("SELECT details->'after'->>'reason' reason FROM security_audit_log WHERE institution_id=$1 AND action='academic.snapshot.reconciled' AND target=$2",[tenant,'section:'+sectionId])).rows).toEqual([{reason:'Synthetic operator reconciliation'}]);
  expect((await request('POST',recovery(sectionId,1))).status).toBe(201);
  expect((await sql.query('SELECT state,attempts FROM academic_section_outbox WHERE section_id=$1 ORDER BY source_version',[sectionId])).rows).toEqual([{state:'queued',attempts:0},{state:'queued',attempts:0}]);
 });
 it('rejects foreign section and invalid origin without queuing',async()=>{
  const sectionId=await section(foreign);expect((await request('POST',recovery(sectionId))).status).toBe(enabled?404:503);expect((await request('POST',recovery(sectionId),admin,tenant,'https://foreign.invalid')).status).toBe(403);
  expect((await sql.query('SELECT 1 FROM academic_section_outbox WHERE section_id=$1',[sectionId])).rows).toEqual([]);
 });
 it('rejects malformed recovery controls',async()=>{expect((await request('POST',{...recovery(await section()),expectedSourceVersion:-1})).status).toBe(422)});
 it('serializes concurrent reconciliation without duplicate versions',async()=>{
  const sectionId=await section(),responses=await Promise.all([request('POST',recovery(sectionId)),request('POST',recovery(sectionId))]);
  expect(responses.map(response=>response.status).sort()).toEqual(enabled?[201,409]:[503,503]);
  expect((await sql.query('SELECT source_version::int version FROM academic_section_versions WHERE section_id=$1',[sectionId])).rows).toEqual(enabled?[{version:1}]:[]);
 });
 it('rolls back recovery event, version and queued audit if final operator audit fails',async()=>{
  const sectionId=await section(),name='sync_audit_'+randomBytes(5).toString('hex');
  await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='academic.snapshot.reconciled' AND NEW.target='section:${sectionId}' THEN RAISE EXCEPTION 'synthetic operator audit failure'; END IF; RETURN NEW; END $$`);
  await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  try{
   expect((await request('POST',recovery(sectionId))).status).toBe(enabled?500:503);
   expect((await sql.query('SELECT 1 FROM academic_section_outbox WHERE section_id=$1',[sectionId])).rows).toEqual([]);
   expect((await sql.query('SELECT 1 FROM academic_section_versions WHERE section_id=$1',[sectionId])).rows).toEqual([]);
   expect((await sql.query('SELECT 1 FROM security_audit_log WHERE target=$1',['section:'+sectionId])).rows).toEqual([]);
  }finally{await sql.query(`DROP TRIGGER ${name} ON security_audit_log`);await sql.query(`DROP FUNCTION ${name}()`)}
 });
 it('observes pending, accepted, failed and retry metadata independently of projection',async()=>{
  if(!enabled)return;
  const sectionId=await section();for(let version=0;version<3;version++)expect((await request('POST',recovery(sectionId,version))).status).toBe(201);
  await sql.query("UPDATE academic_section_outbox SET state='accepted',accepted_at=now(),attempts=1 WHERE section_id=$1 AND source_version=1",[sectionId]);
  await sql.query("UPDATE academic_section_outbox SET state='failed',failure_code='RETRY_EXHAUSTED',attempts=8 WHERE section_id=$1 AND source_version=2",[sectionId]);
  await sql.query("UPDATE academic_section_outbox SET failure_code='TRANSPORT_RETRY',attempts=1 WHERE section_id=$1 AND source_version=3",[sectionId]);
  const response=await request(),data=(await response.json()).data;expect(data.summary.accepted).toBeGreaterThanOrEqual(1);expect(data.summary.failed).toBeGreaterThanOrEqual(1);expect(data.summary.retrying).toBeGreaterThanOrEqual(1);expect(data.projectionStatus).toBe('unverified');
  expect(data.events.filter((event:{sectionId:string})=>event.sectionId===sectionId).map((event:{state:string})=>event.state).sort()).toEqual(['accepted','failed','queued']);
 });
});
