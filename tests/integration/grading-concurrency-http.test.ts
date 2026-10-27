import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {portalFixture} from '../support/portal-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:3107';
let f:Awaited<ReturnType<typeof portalFixture>>,component:string;
async function write(scoreHundredths:number,expectedUpdatedAt?:string|null){return fetch(`${base}/api/v1/institutions/${f.tenant}/grading`,{method:'POST',headers:{origin:base,cookie:f.teacher.cookie,'content-type':'application/json'},body:JSON.stringify({kind:'score',componentId:component,studentId:f.studentId,scoreHundredths,...(expectedUpdatedAt===undefined?{}:{expectedUpdatedAt})})})}
async function snapshot(){const response=await fetch(`${base}/api/v1/institutions/${f.tenant}/grading?sectionId=${f.otherSection}`,{headers:{cookie:f.teacher.cookie}});expect(response.status).toBe(200);return response.json()}
describe.sequential('optimistic grade capture through real handlers',()=>{
 beforeAll(async()=>{await sql.connect();f=await portalFixture(sql);await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[f.tenant,f.otherSection,f.teacherId]);await sql.query('INSERT INTO section_enrollments(institution_id,section_id,student_id) VALUES($1,$2,$3)',[f.tenant,f.otherSection,f.studentId]);component=(await sql.query("INSERT INTO assessment_components(institution_id,section_id,code,title,weight) VALUES($1,$2,'FINAL','Evaluación concurrente',100) RETURNING id",[f.tenant,f.otherSection])).rows[0].id},30000);
 afterAll(async()=>{await sql.end()});
 it('requires an explicit version precondition instead of silently overwriting a private draft',async()=>{expect((await write(800)).status).toBe(422)});
 it('paginates authorized gradebook groups instead of silently limiting the teacher workspace',async()=>{
  const response=await fetch(`${base}/api/v1/institutions/${f.tenant}/grading/sections?limit=1`,{headers:{cookie:f.teacher.cookie}});expect(response.status).toBe(200);const first=await response.json();expect(first.data).toHaveLength(1);expect(first.page.nextCursor).toBeTruthy();
  const next=await fetch(`${base}/api/v1/institutions/${f.tenant}/grading/sections?limit=1&cursor=${first.page.nextCursor}`,{headers:{cookie:f.teacher.cookie}});const second=await next.json();expect(second.data).toHaveLength(1);expect(second.page.nextCursor).toBeNull();expect(first.data[0].id).not.toBe(second.data[0].id);
 });
 it('creates a score once with null precondition and exposes an exact persisted timestamp',async()=>{
  expect((await write(800,null)).status).toBe(200);const data=await snapshot();expect(data.scores[0].updatedAt).toMatch(/^\d{4}-.*\.\d{6}Z$/);expect((await write(900,null)).status).toBe(409);
 });
 it('allows exactly one concurrent update for the same observed revision and preserves the losing caller draft',async()=>{
  const before=await snapshot(),token=before.scores[0].updatedAt;const responses=await Promise.all([write(850,token),write(875,token)]);expect(responses.map(response=>response.status).sort()).toEqual([200,409]);
  const conflict=responses.find(response=>response.status===409)!;expect((await conflict.json()).error.code).toBe('GRADE_SCORE_CONFLICT');
  const after=await snapshot();expect([850,875]).toContain(after.scores[0].scoreHundredths);expect((await write(999,token)).status).toBe(409);expect((await snapshot()).scores[0].scoreHundredths).toBe(after.scores[0].scoreHundredths);
 });
});
