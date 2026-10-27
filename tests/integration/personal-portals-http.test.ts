import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {portalFixture} from '../support/portal-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:3107';
let f:Awaited<ReturnType<typeof portalFixture>>;
async function read(resource:string,kind='student',cookie=f.student.cookie,tenant=f.tenant){return fetch(`${base}/api/v1/institutions/${tenant}/portal/${kind}/${resource}`,{headers:{cookie}})}
describe.sequential('personal portal real HTTP ownership and publication contracts',()=>{
 beforeAll(async()=>{await sql.connect();f=await portalFixture(sql)},30000);
 afterAll(async()=>{await sql.end()});
 it('loads the linked academic profile without private identity data',async()=>{
  const response=await read('profile');expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
  const text=await response.text();expect(text).not.toContain('private-phone');expect(text).not.toContain('private@example');
  expect(JSON.parse(text).data).toMatchObject({id:f.studentId,firstName:'Alumna propia',programName:'Ingeniería de Sistemas',timeZone:'America/Mexico_City',verifiedEmail:null});
 });
 it('binds personal responses to the current actor, session, record and authority',async()=>{
  const profile=await read('profile'),courses=await read('courses');
  const revision=profile.headers.get('x-siii-portal-context');expect(revision).toMatch(/^[a-f0-9]{64}$/);
  expect(profile.headers.get('x-siii-portal-actor')).toBe(f.student.id);
  expect(courses.headers.get('x-siii-portal-context')).toBe(revision);
  expect((await read('profile','student',f.secondStudent.cookie)).headers.get('x-siii-portal-context')).not.toBe(revision);
  const token=randomBytes(32).toString('base64url');
  const session=(await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour') RETURNING id",[f.student.id,createHash('sha256').update(token).digest('hex')])).rows[0].id;
  try{const anotherSession=await read('profile','student','siii_session='+token);expect(anotherSession.status).toBe(200);expect(anotherSession.headers.get('x-siii-portal-context')).not.toBe(revision)}finally{await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',[session])}
  await sql.query("UPDATE role_assignments SET scope_type='program',scope_program_id=$1,institution_id=$3 WHERE id=$2",[f.program,f.student.grant,f.tenant]);
  try{expect((await read('profile')).headers.get('x-siii-portal-context')).not.toBe(revision)}finally{await sql.query("UPDATE role_assignments SET scope_type='institution',scope_program_id=null WHERE id=$1",[f.student.grant])}
 });
 it('reads enrolled courses, assigned teachers and recorded schedule without teacher private contact',async()=>{
  const courses=await read('courses');expect(courses.status).toBe(200);expect((await courses.json()).data).toEqual([expect.objectContaining({sectionId:f.section,courseName:'Álgebra institucional',credits:6})]);
  const teachers=await read('teachers');expect(teachers.status).toBe(200);const body=await teachers.text();expect(body).toContain('Docente oficial');expect(body).not.toContain('private-teacher');
  const schedule=await read('schedule');expect(schedule.status).toBe(200);expect((await schedule.json()).data).toEqual([expect.objectContaining({date:'2026-10-26',campusName:'Campus central',startMinute:480,endMinute:540})]);
 });
 it('shows only published unexpired institutional announcements, never drafts or foreign notices',async()=>{
  await sql.query("INSERT INTO institutional_announcements(institution_id,title,body,status,author_user_id,published_at,expires_at) VALUES($1,'Aviso vigente','Información institucional publicada','PUBLISHED',$2,now(),null),($1,'Borrador privado','No divulgar','DRAFT',$2,null,null),($1,'Aviso vencido','No vigente','PUBLISHED',$2,now(),now()-interval '1 minute'),($3,'Aviso ajeno','Otro tenant','PUBLISHED',$2,now(),null)",[f.tenant,f.admin.id,f.other]);
  const response=await read('announcements');expect(response.status).toBe(200);const body=await response.json();expect(body.data).toEqual([expect.objectContaining({title:'Aviso vigente',body:'Información institucional publicada'})]);
 });
 it('returns only own final published grades and takes the latest publication version',async()=>{
  let response=await read('grades');expect(response.status).toBe(200);expect((await response.json()).data).toEqual([expect.objectContaining({scoreHundredths:850,version:1})]);
  const publication=(await sql.query('INSERT INTO grade_publications(institution_id,section_id,operation_id,published_by,version) VALUES($1,$2,$3,$4,2) RETURNING id',[f.tenant,f.section,randomUUID(),f.teacher.id])).rows[0].id;
  await sql.query('INSERT INTO final_grades(institution_id,publication_id,student_id,score_hundredths) VALUES($1,$2,$3,900)',[f.tenant,publication,f.studentId]);
  response=await read('grades');const data=(await response.json()).data;expect(data).toHaveLength(1);expect(data[0]).toMatchObject({scoreHundredths:900,version:2});expect(JSON.stringify(data)).not.toContain('999');
  const unaffected=await read('grades','student',f.secondStudent.cookie);expect((await unaffected.json()).data).toEqual([expect.objectContaining({scoreHundredths:700,version:1})]);
 });
 it('reads only own orders; rejects IDOR query parameters and foreign contexts',async()=>{
  const response=await read('orders');expect(response.status).toBe(200);expect((await response.json()).data.map((r:{id:string})=>r.id)).toEqual([f.orderId]);
  expect((await read('orders?studentId='+f.secondStudentId)).status).toBe(422);
  expect((await read('profile','student',f.student.cookie,f.other)).status).toBe(403);
  expect((await read('profile','student',f.guest.cookie)).status).toBe(403);
  expect((await read('profile','student','')).status).toBe(401);
 });
 it('lists only assigned teacher groups and no groups for an unlinked teacher',async()=>{
  const response=await read('groups','teacher',f.teacher.cookie);expect(response.status).toBe(200);expect((await response.json()).data).toEqual([expect.objectContaining({id:f.section,enrolledCount:2})]);
  const empty=await read('groups','teacher',f.secondTeacher.cookie);expect(empty.status).toBe(200);expect((await empty.json()).data).toEqual([]);
  expect((await read('groups','teacher',f.student.cookie)).status).toBe(403);
 });
 it('paginates tied timestamps without losing or duplicating rows and binds cursors to actor/resource',async()=>{
  for(let i=0;i<3;i++)await f.order();
  const first=await read('orders?limit=2');expect(first.status).toBe(200);const one=await first.json();expect(one.data).toHaveLength(2);expect(one.page.nextCursor).toBeTruthy();
  const two=await (await read('orders?limit=2&cursor='+one.page.nextCursor)).json();expect(two.data).toHaveLength(2);expect(two.page.nextCursor).toBeNull();
  expect(new Set([...one.data,...two.data].map((r:{id:string})=>r.id)).size).toBe(4);
  expect((await read('orders?cursor='+one.page.nextCursor,'student',f.secondStudent.cookie)).status).toBe(422);
  expect((await read('grades?cursor='+one.page.nextCursor)).status).toBe(422);
 });
 it('stops reading student data immediately after link revocation',async()=>{
  await sql.query('UPDATE student_account_links SET revoked_at=now() WHERE membership_id=$1',[f.student.member]);
  try{expect((await (await read('profile')).json()).data).toBeNull();expect((await (await read('orders')).json()).data).toEqual([])}finally{await sql.query('UPDATE student_account_links SET revoked_at=null WHERE membership_id=$1',[f.student.member])}
 });
 it('honors a student program scope against the linked official record',async()=>{
  await sql.query("UPDATE role_assignments SET scope_type='program',scope_program_id=$1,institution_id=$3 WHERE id=$2",[f.program,f.student.grant,f.tenant]);
  try{
   expect((await (await read('profile')).json()).data).toMatchObject({id:f.studentId});
   const disclosure=await fetch(`${base}/api/v1/institutions/${f.tenant}/capabilities`,{headers:{cookie:f.student.cookie}});expect((await disclosure.json()).data.scopedCapabilities[0].capabilities).toContain('student.self.read');
   const otherProgram=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'NOPE','Otro programa','ingenieria','presencial') RETURNING id",[f.tenant])).rows[0].id;
   await sql.query('UPDATE role_assignments SET scope_program_id=$1 WHERE id=$2',[otherProgram,f.student.grant]);
   expect((await (await read('profile')).json()).data).toBeNull();expect((await (await read('grades')).json()).data).toEqual([]);
  }finally{await sql.query("UPDATE role_assignments SET scope_type='institution',scope_program_id=null WHERE id=$1",[f.student.grant])}
 });
 it('stops reading teacher groups after assignment or account-link revocation',async()=>{
  await sql.query('UPDATE section_teachers SET revoked_at=now() WHERE section_id=$1',[f.section]);
  try{expect((await (await read('groups','teacher',f.teacher.cookie)).json()).data).toEqual([])}finally{await sql.query('UPDATE section_teachers SET revoked_at=null WHERE section_id=$1',[f.section])}
  await sql.query('UPDATE teacher_account_links SET revoked_at=now() WHERE membership_id=$1',[f.teacher.member]);
  try{expect((await (await read('groups','teacher',f.teacher.cookie)).json()).data).toEqual([])}finally{await sql.query('UPDATE teacher_account_links SET revoked_at=null WHERE membership_id=$1',[f.teacher.member])}
 });
 it('denies suspended membership, revoked grant and session without leaking cached personal data',async()=>{
  await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[f.student.grant]);
  try{expect((await read('profile')).status).toBe(403)}finally{await sql.query('UPDATE role_assignments SET revoked_at=null WHERE id=$1',[f.student.grant])}
  await sql.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[f.student.member]);
  try{expect((await read('courses')).status).toBe(403)}finally{await sql.query("UPDATE institution_memberships SET status='active' WHERE id=$1",[f.student.member])}
  await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',[f.student.session]);
  expect((await read('profile')).status).toBe(401);
 });
});
