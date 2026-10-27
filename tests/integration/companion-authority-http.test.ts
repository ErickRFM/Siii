import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';

const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const path='/api/integrations/companion/v1/authority';
const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
const enabled=process.env.SIII_ACADEMIC_OUTBOX_ENABLED==='true';
let institution:string,target:{keyId:string;secretBase64:string};
beforeAll(async()=>{
 await sql.connect();institution=process.env.SIII_COMPANERO_INSTITUTION_ID!;
 target=JSON.parse(process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON!)[institution];
 await sql.query("INSERT INTO institutions(id,name,code) VALUES($1,'Synthetic authority',$2) ON CONFLICT(id) DO UPDATE SET status='active'",[institution,'AUTH-'+randomBytes(5).toString('hex')]);
});
afterAll(async()=>{await sql.end()});

async function fixture(){
 const suffix=randomBytes(5).toString('hex').toUpperCase();
 const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Authority Program','ingenieria','presencial') RETURNING id",[institution,'AP-'+suffix])).rows[0].id;
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Authority term','2026-01-01','2026-12-31') RETURNING id",[institution,'AT-'+suffix])).rows[0].id;
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Authority subject',5) RETURNING id",[institution,'AC-'+suffix])).rows[0].id;
 const section=(await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,$4,20) RETURNING id",[institution,term,course,'AG-'+suffix])).rows[0].id;
 const student=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Student') RETURNING id",[institution,program,'AS-'+suffix])).rows[0].id;
 const teacher=(await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,$2,'Synthetic','Teacher') RETURNING id",[institution,'AD-'+suffix])).rows[0].id;
 const enrollment=(await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3) RETURNING id',[institution,section,student])).rows[0].id;
 const assignment=(await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3) RETURNING id',[institution,section,teacher])).rows[0].id;
 await sql.query('INSERT INTO academic_section_versions(institution_id,section_id,source_version) VALUES($1,$2,3)',[institution,section]);
 return {program,term,course,section,student,teacher,enrollment,assignment,studentExternal:'AS-'+suffix,teacherExternal:'AD-'+suffix};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function encoded(f:Fixture,kind:'student'|'teacher'='student'){
 return JSON.stringify({contract:'siii.academic_authority_request.v1',institutionId:institution,kind,externalId:kind==='student'?f.studentExternal:f.teacherExternal});
}
function signed(body:string,options:{offset?:number;nonce?:string;secret?:string;keyId?:string}={}){
 const timestamp=String(Math.floor(Date.now()/1000)+(options.offset??0)),nonce=options.nonce??randomBytes(24).toString('base64url');
 const canonical=['POST',path,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
 return {'content-type':'application/json','x-integration-key-id':options.keyId??target.keyId,'x-integration-timestamp':timestamp,'x-integration-nonce':nonce,'x-integration-signature':'v1='+createHmac('sha256',Buffer.from(options.secret??target.secretBase64,'base64')).update(canonical).digest('hex')};
}
function post(body:string,options:Parameters<typeof signed>[1]={}){return fetch(base+path,{method:'POST',headers:signed(body,options),body})}
async function sourceAccount(f:Fixture,kind:'student'|'teacher'){
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Source','Account') RETURNING id")).rows[0].id;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,'authority-'+randomUUID()])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institution,user])).rows[0].id;
 const role=(await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2) RETURNING id',[member,kind])).rows[0].id;
 const table=kind==='student'?'student_account_links':'teacher_account_links',column=kind==='student'?'student_id':'teacher_id';
 const link=(await sql.query(`INSERT INTO ${table}(institution_id,membership_id,${column}) VALUES($1,$2,$3) RETURNING id`,[institution,member,kind==='student'?f.student:f.teacher])).rows[0].id;
 return {user,member,role,link,table};
}
async function blockedBy(pid:number,finished=()=>false){
 const until=Date.now()+5000;
 while(Date.now()<until){
  const blocked=(await sql.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) AS blocked",[pid])).rows[0].blocked;
  if(blocked)return true;if(finished())return false;await new Promise(resolve=>setTimeout(resolve,20));
 }
 return false;
}
async function afterDatabaseTime(instant:Date){
 const until=Date.now()+5000;
 while(Date.now()<until){if((await sql.query('SELECT clock_timestamp()>$1::timestamptz AS expired',[instant])).rows[0].expired)return;await new Promise(resolve=>setTimeout(resolve,20));}
 throw Error('AUTHORITY_TEST_EXPIRY_NOT_REACHED');
}

it.skipIf(enabled)('refuses a valid authority request with producer OFF before touching outbox or reserving its nonce',async()=>{
 const body=JSON.stringify({contract:'siii.academic_authority_request.v1',institutionId:institution,kind:'student',externalId:'ST_OFF'}),correlation=randomUUID();
 const response=await fetch(base+path,{method:'POST',headers:{...signed(body),'x-request-id':correlation},body});expect(response.status).toBe(503);expect((await response.json()).error.code).toBe('SOURCE_AUTHORITY_DISABLED');
 expect((await sql.query("SELECT action FROM security_audit_log WHERE request_id=$1 AND action IN('companion.authority.requested','companion.authority.read')",[correlation])).rows).toEqual([]);
});

describe.skipIf(!enabled)('live academic source authority over the existing HMAC bridge',()=>{
 for(const kind of ['student','teacher'] as const){
  it(kind+' accepts a currently active source account as well as the verified-native-only policy',async()=>{
   const f=await fixture();await sourceAccount(f,kind);const response=await post(encoded(f,kind));expect(response.status).toBe(200);expect((await response.json()).sections).toEqual([{sectionId:f.section,sourceVersion:3}]);
  });
  it(kind+' returns only its current tenant relation and exact version',async()=>{
   const f=await fixture(),response=await post(encoded(f,kind));expect(response.status).toBe(200);
   expect(response.headers.get('cache-control')).toBe('no-store');
   const data=await response.json();expect(data).toMatchObject({contract:'siii.academic_authority.v1',institutionId:institution,kind,externalId:kind==='student'?f.studentExternal:f.teacherExternal,sections:[{sectionId:f.section,sourceVersion:3}]});
   expect(Math.abs(Date.now()-Date.parse(data.verifiedAt))).toBeLessThan(5000);
  });
 }
 it.each(['missing','wrong-secret','wrong-key','stale','future','tampered','malformed-nonce'] as const)('rejects %s before exposing authority',async mode=>{
  const f=await fixture(),body=encoded(f),headers=signed(body,mode==='wrong-secret'?{secret:randomBytes(32).toString('base64')}:mode==='wrong-key'?{keyId:'foreign-key'}:mode==='stale'?{offset:-120}:mode==='future'?{offset:120}:mode==='malformed-nonce'?{nonce:'short'}:{});
  const response=await fetch(base+path,{method:'POST',headers:mode==='missing'?{'content-type':'application/json'}:headers,body:mode==='tampered'?body.replace(f.studentExternal,'FOREIGN-ID'):body});
  expect(response.status).toBe(401);
 });
 it('atomically refuses a concurrent reused nonce',async()=>{
  const f=await fixture(),body=encoded(f),headers=signed(body);
  const outcomes=await Promise.all([fetch(base+path,{method:'POST',headers,body}),fetch(base+path,{method:'POST',headers,body})]);
  expect(outcomes.map(r=>r.status).sort()).toEqual([200,401]);
 });
 it('binds a credential to its configured source tenant',async()=>{
  const f=await fixture(),body=JSON.parse(encoded(f));body.institutionId=randomUUID();expect((await post(JSON.stringify(body))).status).toBe(401);
 });
 it('rejects extra fields and unknown contracts without a successful manifest',async()=>{
  const f=await fixture(),body=JSON.parse(encoded(f));expect((await post(JSON.stringify({...body,nativeUserId:randomUUID()}))).status).toBe(422);
  expect((await post(JSON.stringify({...body,contract:'unrecognized'}))).status).toBe(422);
 });
 it('denies a disabled source institution',async()=>{
  const f=await fixture();await sql.query("UPDATE institutions SET status='inactive' WHERE id=$1",[institution]);
  try{expect((await post(encoded(f))).status).toBe(403)}finally{await sql.query("UPDATE institutions SET status='active' WHERE id=$1",[institution])}
 });
 for(const kind of ['student','teacher'] as const){
  it(kind+' denies a suspended academic record',async()=>{
   const f=await fixture(),table=kind==='student'?'institutional_students':'institutional_teachers';
   await sql.query(`UPDATE ${table} SET status='inactive' WHERE id=$1`,[kind==='student'?f.student:f.teacher]);expect((await post(encoded(f,kind))).status).toBe(403);
  });
  it(kind+' removes withdrawn relations instead of retaining cached authority',async()=>{
   const f=await fixture();if(kind==='student')await sql.query("UPDATE section_enrollments SET status='withdrawn' WHERE id=$1",[f.enrollment]);else await sql.query('UPDATE section_teachers SET revoked_at=now() WHERE id=$1',[f.assignment]);
   const response=await post(encoded(f,kind));expect(response.status).toBe(200);expect((await response.json()).sections).toEqual([]);
  });
  it.each(['account','membership','role','expiry','link'] as const)(kind+' denies revoked source %s',async mode=>{
   const f=await fixture(),account=await sourceAccount(f,kind);
   if(mode==='account')await sql.query('UPDATE platform_users SET is_active=false WHERE id=$1',[account.user]);
   if(mode==='membership')await sql.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[account.member]);
   if(mode==='role')await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[account.role]);
   if(mode==='expiry')await sql.query("UPDATE role_assignments SET expires_at=now()-interval '1 second' WHERE id=$1",[account.role]);
   if(mode==='link')await sql.query(`UPDATE ${account.table} SET revoked_at=now() WHERE id=$1`,[account.link]);
   expect((await post(encoded(f,kind))).status).toBe(403);
  });
  it(kind+' waits for an in-flight account revocation and denies after that writer commits',async()=>{
   const f=await fixture(),account=await sourceAccount(f,kind),writer=new pg.Client({connectionString:isolatedDatabaseUrl()});await writer.connect();let pending:Promise<Response>|undefined,finished=false;
   try{
    await writer.query('BEGIN');const blocker=(await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    // Global account administration owns the user row without an institution lock.
    // The reader must serialize on that user, then re-read its now committed state.
    await writer.query('UPDATE platform_users SET is_active=false WHERE id=$1',[account.user]);
    pending=post(encoded(f,kind)).finally(()=>{finished=true;});expect(await blockedBy(blocker,()=>finished)).toBe(true);
    await writer.query('COMMIT');expect((await pending).status).toBe(403);
   }finally{await writer.query('ROLLBACK');await pending?.catch(()=>undefined);await writer.end();}
  });
  it(kind+' denies a source grant that expires while its audited manifest is blocked',async()=>{
   const f=await fixture(),account=await sourceAccount(f,kind),name='authority_expiry_'+randomBytes(6).toString('hex'),key=randomBytes(4).readUInt32BE(0);
   const externalId=kind==='student'?f.studentExternal:f.teacherExternal,target='academic-identity:'+createHash('sha256').update(institution+'\0'+kind+'\0'+externalId).digest('hex');
   const blocker=new pg.Client({connectionString:isolatedDatabaseUrl()});await blocker.connect();let pending:Promise<Response>|undefined;
   await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='companion.authority.read' AND NEW.target='${target}' THEN PERFORM pg_advisory_xact_lock(${key}::bigint); END IF; RETURN NEW; END $$`);
   await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION ${name}()`);
   try{
    await blocker.query('SELECT pg_advisory_lock($1::bigint)',[key]);const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const expiresAt=(await sql.query("UPDATE role_assignments SET expires_at=clock_timestamp()+interval '1500 milliseconds' WHERE id=$1 RETURNING expires_at",[account.role])).rows[0].expires_at as Date;
    const body=encoded(f,kind);pending=fetch(base+path,{method:'POST',headers:signed(body),body});expect(await blockedBy(pid)).toBe(true);
    await afterDatabaseTime(expiresAt);await blocker.query('SELECT pg_advisory_unlock($1::bigint)',[key]);const response=await pending;expect(response.status).toBe(403);
    const correlation=response.headers.get('x-request-id');expect(correlation).toMatch(/^[0-9a-f-]{36}$/);
    // A denied final revalidation rolls back the successful-read audit, while the
    // independently committed nonce reservation remains consumed.
    expect((await sql.query("SELECT action FROM security_audit_log WHERE request_id=$1 AND action IN('companion.authority.requested','companion.authority.read') ORDER BY action",[correlation])).rows).toEqual([{action:'companion.authority.requested'}]);
   }finally{await blocker.query('SELECT pg_advisory_unlock($1::bigint)',[key]);await pending?.catch(()=>undefined);await blocker.end();await sql.query(`DROP TRIGGER ${name} ON security_audit_log`);await sql.query(`DROP FUNCTION ${name}()`);}
  });
 }
 it('requires current snapshot version metadata instead of guessing a version',async()=>{
  const f=await fixture();await sql.query('DELETE FROM academic_section_versions WHERE section_id=$1',[f.section]);expect((await post(encoded(f))).status).toBe(503);
 });
 it('returns no archived section and exposes no student roster or names',async()=>{
  const f=await fixture();await sql.query("UPDATE academic_sections SET status='archived' WHERE id=$1",[f.section]);const response=await post(encoded(f));expect(response.status).toBe(200);const text=await response.text();expect(JSON.parse(text).sections).toEqual([]);expect(text).not.toContain('Synthetic');expect(text).not.toContain('enrollments');
 });
});
