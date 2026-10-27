import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret} from '../../src/shared/auth/mfa-primitives';
import {portalFixture} from '../support/portal-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:3107';
let f:Awaited<ReturnType<typeof portalFixture>>,component:string;
const url=(section=f.section,tenant=f.tenant)=>`${base}/api/v1/institutions/${tenant}/grading?sectionId=${section}`;
const read=(cookie=f.teacher.cookie,section=f.section,tenant=f.tenant)=>fetch(url(section,tenant),{headers:{cookie}});
const command=(payload:Record<string,unknown>,cookie=f.teacher.cookie)=>fetch(`${base}/api/v1/institutions/${f.tenant}/grading`,{method:'POST',headers:{origin:base,cookie,'content-type':'application/json'},body:JSON.stringify(payload)});
describe.sequential('teacher institutional workspace contracts',()=>{
 beforeAll(async()=>{await sql.connect();f=await portalFixture(sql);await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.tenant,f.otherSection,f.teacherId]);await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3)',[f.tenant,f.otherSection,f.studentId]);component=(await sql.query("INSERT INTO assessment_components(institution_id,section_id,code,title,weight) VALUES($1,$2,'ALL','Resultado en borrador',100) RETURNING id",[f.tenant,f.otherSection])).rows[0].id},30000);
 afterAll(async()=>{await sql.end()});
 it('returns official publication results separately from private capture and minimum roster fields',async()=>{
  const response=await read();expect(response.status).toBe(200);const data=await response.json();
  expect(data.section).toMatchObject({id:f.section,code:'SYS-101',termStatus:'active',termName:'Otoño 2026'});
  expect(data.results).toContainEqual(expect.objectContaining({publicationId:f.publication,studentId:f.studentId,scoreHundredths:850}));
  expect(data.scores[0].scoreHundredths).toBe(999);
  expect(Object.keys(data.roster[0]).sort()).toEqual(['enrollmentNumber','firstName','lastName','studentId']);
  expect(JSON.stringify(data)).not.toMatch(/private-phone|private@example|private-teacher/);
 });
 it('does not disclose another teacher roster or grades across users and institutions',async()=>{
  expect((await read(f.secondTeacher.cookie)).status).toBe(403);expect((await read(f.student.cookie)).status).toBe(403);expect((await read(f.teacher.cookie,f.section,f.other)).status).toBe(403);
 });
 it('checks closed sections and inactive terms inside the writer, without persisting scores or audits',async()=>{
  const payload={kind:'score',componentId:component,studentId:f.studentId,scoreHundredths:800,expectedUpdatedAt:null};
  for(const target of ['section','term']){
   if(target==='section')await sql.query("UPDATE academic_sections SET status='closed' WHERE id=$1",[f.otherSection]);else await sql.query("UPDATE academic_terms SET status='inactive' WHERE id=$1",[f.term]);
   try{
    const response=await command(payload);expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('GRADE_PERIOD_CLOSED');
    const snapshot=await read(f.teacher.cookie,f.otherSection);expect(snapshot.status).toBe(200);expect((await snapshot.json()).scores).toEqual([]);
   }finally{await sql.query("UPDATE academic_sections SET status='open' WHERE id=$1",[f.otherSection]);await sql.query("UPDATE academic_terms SET status='active' WHERE id=$1",[f.term]);}
  }
  expect((await sql.query("SELECT count(*)::int n FROM security_audit_log WHERE institution_id=$1 AND action='grade.score.save'",[f.tenant])).rows[0].n).toBe(0);
 });
 it('persists a server draft across reads with exact concurrency token and transactional audit',async()=>{
  expect((await command({kind:'score',componentId:component,studentId:f.studentId,scoreHundredths:825,expectedUpdatedAt:null})).status).toBe(200);
  const data=await (await read(f.teacher.cookie,f.otherSection)).json();expect(data.scores[0]).toMatchObject({scoreHundredths:825,updatedAt:expect.any(String)});expect(data.results).toEqual([]);
  expect((await command({kind:'score',componentId:component,studentId:f.studentId,scoreHundredths:900,expectedUpdatedAt:null})).status).toBe(409);
  expect((await sql.query("SELECT request_id,details FROM security_audit_log WHERE institution_id=$1 AND action='grade.score.save'",[f.tenant])).rows[0]).toMatchObject({request_id:expect.any(String),details:{after:{scoreHundredths:825}}});
 });
 it('keeps teacher privileges separate from administrative actions and publication assurance',async()=>{
  const denied=await command({kind:'publish',sectionId:f.otherSection,operationId:randomUUID()});expect(denied.status).toBe(403);
  expect((await fetch(`${base}/api/v1/institutions/${f.tenant}/enrollments`,{method:'POST',headers:{origin:base,cookie:f.teacher.cookie,'content-type':'application/json'},body:JSON.stringify({sectionId:f.otherSection,studentId:f.secondStudentId,operationId:randomUUID()})})).status).toBe(403);
 });
 it('returns real group evaluation aggregates without requesting or modifying schedule data',async()=>{
  const response=await fetch(`${base}/api/v1/institutions/${f.tenant}/portal/teacher/groups`,{headers:{cookie:f.teacher.cookie}});expect(response.status).toBe(200);
  const data=(await response.json()).data;expect(data.find((r:{id:string})=>r.id===f.otherSection)).toMatchObject({termStatus:'active',componentCount:1,savedScoreCount:1,weightTotal:100,enrolledCount:1,published:false});
 });
 it('blocks component creation and assured publication in closed periods, then publishes once with an immutable result',async()=>{
  await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[f.teacher.id,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',f.teacher.id)]);
  await sql.query('UPDATE auth_sessions SET mfa_verified_at=now(),step_up_at=now() WHERE id=$1',[f.teacher.session]);
  const operationId=randomUUID(),publish={kind:'publish',sectionId:f.otherSection,operationId};
  await sql.query("UPDATE academic_terms SET status='inactive' WHERE id=$1",[f.term]);
  try{for(const payload of [publish,{kind:'component',sectionId:f.otherSection,code:'EXTRA',title:'No autorizada por cierre',weight:1}]){const response=await command(payload);expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('GRADE_PERIOD_CLOSED');}}finally{await sql.query("UPDATE academic_terms SET status='active' WHERE id=$1",[f.term]);}
  const response=await command(publish);expect(response.status).toBe(201);const publication=(await response.json()).data;
  expect((await command(publish)).status).toBe(200);
  const data=await (await read(f.teacher.cookie,f.otherSection)).json();expect(data.results).toEqual([expect.objectContaining({publicationId:publication.id,studentId:f.studentId,scoreHundredths:825})]);
  expect((await command({kind:'score',componentId:component,studentId:f.studentId,scoreHundredths:100,expectedUpdatedAt:data.scores[0].updatedAt})).status).toBe(409);
  expect((await command({...publish,operationId:randomUUID()})).status).toBe(409);
  expect((await sql.query("SELECT count(*)::int n FROM security_audit_log WHERE institution_id=$1 AND action='grade.acta.publish'",[f.tenant])).rows[0].n).toBe(1);
 });

});
