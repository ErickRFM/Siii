import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';
import {openAcademicBody} from '@/integrations/companion/outbox/seal';

const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107),enabled=process.env.SIII_ACADEMIC_OUTBOX_ENABLED==='true';
type Resource='students'|'teachers';
type Fixture={resource:Resource;id:string;sections:string[];untouched:string};
const original={firstName:'Original',lastName:'Synthetic',institutionalEmail:null};
let tenant:string,foreign:string,cookie:string,studentCookie:string,actorId:string;
const table=(resource:Resource)=>resource==='students'?'institutional_students':'institutional_teachers';
async function actor(role:string){
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Registry operator') RETURNING id")).rows[0].id;
 const id=(await sql.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,'registry-outbox-'+randomUUID()])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,id])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,$3,'institution')",[tenant,member,role]);
 await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[id,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',id)]);
 const raw=randomBytes(32).toString('base64url');await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',now())",[id,createHash('sha256').update(raw).digest('hex')]);
 return {id,cookie:(process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_session':'siii_session')+'='+raw};
}
async function request(f:Fixture,body:unknown,session=cookie,institution=tenant,origin=base){return fetch(base+'/api/v1/institutions/'+institution+'/registry/'+f.resource,{method:'PATCH',headers:{origin,cookie:session,'content-type':'application/json'},body:JSON.stringify({id:f.id,...body as object})});}
async function fixture(resource:Resource,institution=tenant):Promise<Fixture>{
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Synthetic term','2026-01-01','2026-12-31') RETURNING id",[institution,'TR'+randomBytes(5).toString('hex').toUpperCase()])).rows[0].id;
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Synthetic course',0) RETURNING id",[institution,'CR'+randomBytes(5).toString('hex').toUpperCase()])).rows[0].id;
 const sections:string[]=[];for(let i=0;i<3;i++)sections.push((await sql.query("INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,$4,30) RETURNING id",[institution,term,course,'SC'+randomBytes(5).toString('hex').toUpperCase()])).rows[0].id);
 let id:string;
 if(resource==='students'){
  const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Synthetic program','licenciatura','presencial') RETURNING id",[institution,'PR'+randomBytes(5).toString('hex').toUpperCase()])).rows[0].id;
  id=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,'Original','Synthetic') RETURNING id",[institution,program,'ST'+randomBytes(5).toString('hex').toUpperCase()])).rows[0].id;
  // Historical rows also carry the source profile/status; duplicates must fan out once.
  for(const section of sections.slice(0,2))await sql.query("INSERT INTO section_enrollments(institution_id,section_id,student_id,status) VALUES($1,$2,$3,'enrolled'),($1,$2,$3,'withdrawn')",[institution,section,id]);
 }else{
  id=(await sql.query("INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,$2,'Original','Synthetic') RETURNING id",[institution,'TC'+randomBytes(5).toString('hex').toUpperCase()])).rows[0].id;
  for(const section of sections.slice(0,2))await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[institution,section,id]);
  await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id,revoked_at) VALUES($1,$2,$3,now())',[institution,sections[2],id]);
 }
 return {resource,id,sections:sections.slice(0,2).sort(),untouched:sections[2]};
}
async function state(f:Fixture){return {
 record:(await sql.query('SELECT * FROM '+table(f.resource)+' WHERE id=$1',[f.id])).rows,
 events:(await sql.query('SELECT * FROM academic_section_outbox WHERE institution_id=$1 AND section_id=ANY($2::uuid[]) ORDER BY section_id,source_version',[tenant,[...f.sections,f.untouched]])).rows,
 versions:(await sql.query('SELECT * FROM academic_section_versions WHERE institution_id=$1 AND section_id=ANY($2::uuid[]) ORDER BY section_id',[tenant,[...f.sections,f.untouched]])).rows,
 audits:(await sql.query('SELECT * FROM security_audit_log WHERE institution_id=$1 ORDER BY id',[tenant])).rows,
};}
async function snapshots(f:Fixture,version:number,requestId:string){
 const rows=(await state(f)).events.filter(row=>Number(row.source_version)===version);expect(rows).toHaveLength(enabled?2:0);
 for(const row of rows){const body=JSON.parse(openAcademicBody(row.body_encrypted,{eventId:row.event_id,institutionId:tenant,sectionId:row.section_id}));expect(body).toMatchObject({schemaVersion:1,sourceVersion:version,operation:'upsert',payload:{sectionId:row.section_id}});
  expect((await sql.query("SELECT request_id,actor_user_id FROM security_audit_log WHERE action='academic.snapshot.queued' AND target=$1 AND details->'after'->>'eventId'=$2",['section:'+row.section_id,row.event_id])).rows).toEqual([{request_id:requestId,actor_user_id:actorId}]);
 }
 expect(rows.map(row=>row.section_id)).toEqual(enabled?f.sections:[]);return rows.map(row=>JSON.parse(openAcademicBody(row.body_encrypted,{eventId:row.event_id,institutionId:tenant,sectionId:row.section_id})).payload);
}

describe.sequential('registry snapshot fanout HTTP '+(enabled?'ON':'OFF'),()=>{
 beforeAll(async()=>{await sql.connect();const rows=(await sql.query("INSERT INTO institutions(code,name) VALUES($1,'Synthetic registry'),($2,'Synthetic foreign') RETURNING id",['RO'+randomUUID(),'RF'+randomUUID()])).rows;tenant=rows[0].id;foreign=rows[1].id;const admin=await actor('admin');cookie=admin.cookie;actorId=admin.id;studentCookie=(await actor('student')).cookie;});
 afterAll(async()=>{await sql.end();});
 for(const resource of ['students','teachers'] as const){
  it(resource+' status changes fan out once per affected section with versioned revocation and restoration',async()=>{
   const f=await fixture(resource),statuses=resource==='students'?['inactive','withdrawn','graduated','active']:['inactive','active'];for(const [index,status]of statuses.entries()){
    const response=await request(f,{status});expect(response.status).toBe(200);const payloads=await snapshots(f,index+1,response.headers.get('x-request-id')!);
    for(const payload of payloads)if(resource==='students'){expect(payload.enrollments).toHaveLength(2);expect(payload.enrollments.every((item:{studentStatus:string})=>item.studentStatus===status)).toBe(true);}else expect(payload.teachers.map((item:{sourceId:string})=>item.sourceId)).toEqual(status==='active'?[f.id]:[]);
   }
   expect((await state(f)).events).toHaveLength(enabled?statuses.length*2:0);expect((await state(f)).versions.map(row=>Number(row.source_version))).toEqual(enabled?[statuses.length,statuses.length]:[]);
  });
  it(resource+' changed name propagates while email-only and identical status/name produce no new payload',async()=>{
   const f=await fixture(resource),profile={...original,firstName:'Corrected'};const response=await request(f,{kind:'profile',expected:original,profile});expect(response.status).toBe(200);
   for(const payload of await snapshots(f,1,response.headers.get('x-request-id')!)){const entries=resource==='students'?payload.enrollments:payload.teachers;expect(entries.every((item:{fullName:string})=>item.fullName==='Corrected Synthetic')).toBe(true);}
   const before=(await state(f)).events;
   expect((await request(f,{kind:'profile',expected:profile,profile:{...profile,institutionalEmail:'changed@example.test'}})).status).toBe(200);
   expect((await request(f,{status:'active'})).status).toBe(200);expect((await state(f)).events).toEqual(before);
  });
  it(resource+' rejects foreign records, unprivileged actors and invalid origin without any effects',async()=>{
   const f=await fixture(resource),outside=await fixture(resource,foreign),before=await state(f);
   expect((await request(f,{status:'inactive'},studentCookie)).status).toBe(403);expect((await request(f,{status:'inactive'},cookie,foreign)).status).toBe(403);
   expect((await request(outside,{status:'inactive'})).status).toBe(404);expect((await request(f,{status:'inactive'},cookie,tenant,'https://foreign.test')).status).toBe(403);expect(await state(f)).toEqual(before);
  });
  it.each(['status','profile'] as const)(resource+' %s outbox failure on the second section rolls back registry, first event, versions and audit only when enabled',async mutation=>{
   const f=await fixture(resource),before=await state(f),name='registry_outbox_'+randomBytes(6).toString('hex');
   await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.section_id='${f.sections[1]}'::uuid THEN RAISE EXCEPTION 'synthetic second-section failure'; END IF; RETURN NEW; END $$`);await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON academic_section_outbox FOR EACH ROW EXECUTE FUNCTION ${name}()`);
   try{const body=mutation==='status'?{status:'inactive'}:{kind:'profile',expected:original,profile:{...original,firstName:'Rollback'}};expect((await request(f,body)).status).toBe(enabled?500:200);if(enabled)expect(await state(f)).toEqual(before);else expect((await state(f)).events).toEqual([]);}finally{await sql.query(`DROP TRIGGER ${name} ON academic_section_outbox`);await sql.query(`DROP FUNCTION ${name}()`);}
  });
 }
 it('enqueues overlapping sections in stable UUID order',async()=>{
  const f=await fixture('students'),name='registry_order_'+randomBytes(6).toString('hex');await sql.query(`CREATE TABLE ${name}(position bigint GENERATED ALWAYS AS IDENTITY,section_id uuid)`);
  // Test-owned observer writes its private table without expanding application grants.
  await sql.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN IF NEW.institution_id='${tenant}'::uuid THEN INSERT INTO public.${name}(section_id) VALUES(NEW.section_id); END IF; RETURN NEW; END $$`);await sql.query(`CREATE TRIGGER ${name} BEFORE INSERT ON academic_section_outbox FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  try{expect((await request(f,{status:'inactive'})).status).toBe(200);expect((await sql.query(`SELECT section_id FROM ${name} ORDER BY position`)).rows.map(row=>row.section_id)).toEqual(enabled?f.sections:[]);}finally{await sql.query(`DROP TRIGGER ${name} ON academic_section_outbox`);await sql.query(`DROP FUNCTION ${name}()`);await sql.query(`DROP TABLE ${name}`);}
 });
});
