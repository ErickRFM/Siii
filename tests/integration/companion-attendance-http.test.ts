import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
let tenant:string,foreign:string,admin:string,studentActor:string,noMfa:string,studentId:string,foreignStudent:string;
async function actor(role:string,mfa=true){
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Attendance operator') RETURNING id")).rows[0].id;
 const user=(await sql.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,'attendance-'+randomUUID()])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,user])).rows[0].id;
 await sql.query("INSERT INTO role_assignments(institution_id,membership_id,role,scope_type) VALUES($1,$2,$3,'institution')",[tenant,member,role]);
 if(mfa)await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)]);
 const token=randomBytes(32).toString('base64url');await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',$3)",[user,createHash('sha256').update(token).digest('hex'),mfa?new Date():null]);return 'siii_session='+token;
}
async function fixture(institution:string){
 const suffix=randomBytes(5).toString('hex').toUpperCase();
 const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Synthetic program','licenciatura','presencial') RETURNING id",[institution,'P'+suffix])).rows[0].id;
 const student=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Student') RETURNING id",[institution,program,'A'+suffix])).rows[0].id;
 const term=(await sql.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Synthetic term','2026-01-01','2026-12-31') RETURNING id",[institution,'T'+suffix])).rows[0].id;
 const course=(await sql.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Synthetic subject',1) RETURNING id",[institution,'C'+suffix])).rows[0].id;
 const section=(await sql.query('INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,$4,20) RETURNING id',[institution,term,course,'S'+suffix])).rows[0].id;
 await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3)',[institution,section,student]);
 await sql.query('INSERT INTO academic_section_versions(institution_id,section_id,source_version) VALUES($1,$2,1)',[institution,section]);return student;
}
function get(cookie=admin,institution=tenant,id=studentId,query='',origin=base){return fetch(base+'/api/v1/institutions/'+institution+'/companion-attendance/'+id+query,{headers:{cookie,origin},signal:AbortSignal.timeout(30000)});}
beforeAll(async()=>{
 await sql.connect();const rows=(await sql.query("INSERT INTO institutions(code,name) VALUES($1,'Synthetic attendance'),($2,'Synthetic foreign') RETURNING id",['AR'+randomUUID(),'AF'+randomUUID()])).rows;
 tenant=rows[0].id;foreign=rows[1].id;admin=await actor('admin');studentActor=await actor('student');noMfa=await actor('admin',false);studentId=await fixture(tenant);foreignStudent=await fixture(foreign);
});
afterAll(async()=>{await sql.end();});
describe.sequential('institutional Companion attendance HTTP boundary',()=>{
 it.each(['anonymous','student','missing-mfa','foreign-institution'] as const)('denies %s before a remote lookup',async mode=>{
  const response=await get(mode==='anonymous'?'':mode==='student'?studentActor:mode==='missing-mfa'?noMfa:admin,mode==='foreign-institution'?foreign:tenant);
  expect(response.status).toBe(403);expect(response.headers.get('cache-control')).toBe('no-store');
 });
 it('does not resolve a student belonging to another institution',async()=>{expect((await get(admin,tenant,foreignStudent)).status).toBe(404);});
 it('keeps absent reader configuration distinct from empty attendance',async()=>{
  const response=await get();expect(response.status).toBe(503);expect(await response.json()).toEqual({error:{code:'COMPANION_ATTENDANCE_UNAVAILABLE'}});
  expect((await sql.query("SELECT 1 FROM security_audit_log WHERE institution_id=$1 AND action='companion.attendance.read'",[tenant])).rows).toEqual([]);
 });
 it('rejects cross-origin and caller supplied tenant/student/destination overrides',async()=>{
  expect((await get(admin,tenant,studentId,'','https://foreign.invalid')).status).toBe(403);
  for(const query of ['?studentExternalId=OTHER','?institutionId='+foreign,'?origin=https://foreign.invalid'])expect((await get(admin,tenant,studentId,query)).status).toBe(422);
 });
 it('denies a source student revoked before the read',async()=>{
  await sql.query("UPDATE institutional_students SET status='inactive' WHERE id=$1",[studentId]);
  try{expect((await get()).status).toBe(404);}finally{await sql.query("UPDATE institutional_students SET status='active' WHERE id=$1",[studentId]);}
 });
});
