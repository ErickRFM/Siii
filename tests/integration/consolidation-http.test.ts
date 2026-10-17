import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';import argon2 from 'argon2';import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';import {fixtureMfaLogin} from '../support/mfa-fixture';
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()}),base='http://127.0.0.1:3107',suffix=randomUUID().slice(0,8),password='Synthetic-consolidation-2026!';
let tenant:string,other:string,program:string,section:string,unassigned:string,teacherUser:string,teacherMember:string,adminCookie='',teacherCookie='',studentCookie='';
async function request(path:string,method='GET',data?:unknown,cookie=adminCookie){return fetch(base+path,{method,headers:{origin:base,cookie,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})})}
async function account(role:string){const person=(await sql.query(`INSERT INTO people(first_name,last_name) VALUES('Synthetic','Consolidation') RETURNING id`)).rows[0].id;
 const username=role+'-consolidation-'+suffix,hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
 const user=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,user])).rows[0].id;
 await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,role]);
 const response=await request('/api/v1/auth/login','POST',{username,password},'');expect(response.status).toBe(200);
 return {user,member,cookie:await fixtureMfaLogin(sql,base,username,password,response)};
}
describe.sequential('consolidated real domain handlers',()=>{
 beforeAll(async()=>{await sql.connect();
  const units=(await sql.query(`INSERT INTO institutions(name,code) VALUES('Synthetic consolidated',$1),('Synthetic other',$2) RETURNING id`,['CON'+suffix,'OTH'+suffix])).rows;tenant=units[0].id;other=units[1].id;
  adminCookie=(await account('admin')).cookie;const teacher=await account('teacher');teacherCookie=teacher.cookie;teacherUser=teacher.user;teacherMember=teacher.member;studentCookie=(await account('student')).cookie;
  program=(await sql.query(`INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'SYS','Sistemas','ingenieria','presencial') RETURNING id`,[tenant])).rows[0].id;
  const course=(await sql.query(`INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,'PROG','Programación',6) RETURNING id`,[tenant])).rows[0].id;
  const term=(await sql.query(`INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,'2026','Periodo','2026-01-01','2026-06-30') RETURNING id`,[tenant])).rows[0].id;
  const sections=(await sql.query(`INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,'A',1),($1,$2,$3,'B',2) RETURNING id`,[tenant,term,course])).rows;section=sections[0].id;unassigned=sections[1].id;
  const teacherId=(await sql.query(`INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,'T1','Docente','Sintético') RETURNING id`,[tenant])).rows[0].id;
  await sql.query('INSERT INTO teacher_account_links(institution_id,teacher_id,membership_id) VALUES($1,$2,$3)',[tenant,teacherId,teacherMember]);await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[tenant,section,teacherId]);
 },30000);
 afterAll(async()=>{await sql.end()});
 it('allows assigned teachers to open their persisted gradebook',async()=>{const r=await request('/api/v1/institutions/'+tenant+'/grading?sectionId='+section,'GET',undefined,teacherCookie);expect(r.status).toBe(200);expect(await r.json()).toMatchObject({components:[],roster:[]})});
 it('lists only the teacher assigned section',async()=>{const r=await request('/api/v1/institutions/'+tenant+'/grading/sections','GET',undefined,teacherCookie);expect(r.status).toBe(200);expect((await r.json()).data.map((row:{id:string})=>row.id)).toEqual([section])});
 it('denies unassigned and foreign gradebooks',async()=>{for(const [unit,id] of [[tenant,unassigned],[other,section]])expect((await request('/api/v1/institutions/'+unit+'/grading?sectionId='+id,'GET',undefined,teacherCookie)).status).toBe(403)});
 it('allows administrators to inspect an institutional gradebook',async()=>{expect((await request('/api/v1/institutions/'+tenant+'/grading?sectionId='+section)).status).toBe(200)});
 it('persists registry changes with a request id and denies student management',async()=>{
  const path='/api/v1/institutions/'+tenant+'/registry/students',body={programId:program,enrollmentNumber:'ST'+suffix,firstName:'Alumno',lastName:'Sintético'};
  expect((await request(path,'POST',body,studentCookie)).status).toBe(403);const r=await request(path,'POST',body);expect(r.status).toBe(201);const row=(await r.json()).data;
  expect((await sql.query(`SELECT request_id FROM security_audit_log WHERE target=$1 AND action='registry.student.create'`,['student:'+row.id])).rows[0].request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect((await request('/api/v1/institutions/'+other+'/registry/students')).status).toBe(403);
 });
 it('serializes concurrent claims for the final seat and publishes immutable grades',async()=>{
  const students=(await sql.query(`INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,'SEAT1','Uno','Sintético'),($1,$2,'SEAT2','Dos','Sintético') RETURNING id`,[tenant,program])).rows;
  const responses=await Promise.all(students.map(student=>request('/api/v1/institutions/'+tenant+'/enrollments','POST',{sectionId:section,studentId:student.id})));
  expect(responses.map(response=>response.status).sort()).toEqual([201,409]);
  const enrolled=(await sql.query(`SELECT student_id FROM section_enrollments WHERE section_id=$1 AND status='enrolled'`,[section])).rows;expect(enrolled).toHaveLength(1);
  const path='/api/v1/institutions/'+tenant+'/grading';
  const component=await request(path,'POST',{kind:'component',sectionId:section,code:'FINAL',title:'Evaluación final',weight:100},teacherCookie);expect(component.status).toBe(201);const part=(await component.json()).data;
  expect((await request(path,'POST',{kind:'score',componentId:part.id,studentId:enrolled[0].student_id,scoreHundredths:888},teacherCookie)).status).toBe(200);
  const publish={kind:'publish',sectionId:section,operationId:randomUUID()};
  await sql.query(`UPDATE auth_sessions SET step_up_at=now()-interval '11 minutes' WHERE user_id=$1`,[teacherUser]);
  expect((await request(path,'POST',publish,teacherCookie)).status).toBe(403);
  const username='teacher-consolidation-'+suffix;const login=await request('/api/v1/auth/login','POST',{username,password},'');teacherCookie=await fixtureMfaLogin(sql,base,username,password,login);
  expect((await request(path,'POST',publish,teacherCookie)).status).toBe(201);expect((await request(path,'POST',publish,teacherCookie)).status).toBe(200);
  expect((await request(path,'POST',{kind:'score',componentId:part.id,studentId:enrolled[0].student_id,scoreHundredths:999},teacherCookie)).status).toBe(409);
  expect((await sql.query('SELECT score_hundredths FROM final_grades WHERE student_id=$1',[enrolled[0].student_id])).rows).toEqual([{score_hundredths:888}]);
 });
 it('freezes enrollment and withdrawal after an official acta',async()=>{
  await sql.query('UPDATE academic_sections SET capacity=10 WHERE id=$1',[section]);
  const enrolled=(await sql.query(`SELECT id,student_id FROM section_enrollments WHERE section_id=$1 AND status='enrolled'`,[section])).rows[0];
  const otherStudent=(await sql.query('SELECT id FROM institutional_students WHERE institution_id=$1 AND id<>$2 LIMIT 1',[tenant,enrolled.student_id])).rows[0].id;
  expect((await request('/api/v1/institutions/'+tenant+'/enrollments','POST',{sectionId:section,studentId:otherStudent})).status).toBe(409);
  expect((await request('/api/v1/institutions/'+tenant+'/enrollments','PATCH',{id:enrolled.id,status:'withdrawn'})).status).toBe(409);
 });
 it('does not let enrollment introduce an existing timetable collision',async()=>{
  const g=await timetableFixture();expect((await request('/api/v1/institutions/'+tenant+'/enrollments','POST',{sectionId:g.sections[0],studentId:g.student})).status).toBe(201);
  expect((await request('/api/v1/institutions/'+tenant+'/enrollments','POST',{sectionId:g.sections[1],studentId:g.student})).status).toBe(409);
 });
 it('does not let teacher assignment introduce an existing timetable collision',async()=>{
  const g=await timetableFixture();expect((await request('/api/v1/institutions/'+tenant+'/assignments','POST',{sectionId:g.sections[1],teacherId:g.teachers[0]})).status).toBe(409);
 });
 it('rejects room overlap between distinct terms with overlapping dates',async()=>{
  const g=await timetableFixture();const key=randomUUID().slice(0,8);
  const [source]=(await sql.query('SELECT course_id FROM academic_sections WHERE id=$1',[g.sections[0]])).rows;
  const term=(await sql.query(`INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Periodo superpuesto','2026-02-01','2026-04-30') RETURNING id`,[tenant,'OVER'+key])).rows[0].id;
  const target=(await sql.query(`INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,$4,10) RETURNING id`,[tenant,term,source.course_id,'OVER'+key])).rows[0].id;
  await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[tenant,target,g.teachers[1]]);
  expect((await request('/api/v1/institutions/'+tenant+'/schedule-patterns','POST',{sectionId:target,roomId:g.rooms[0],weekday:1,startMinute:600,endMinute:660})).status).toBe(409);
 });
 it('audits access to confidential tutoring notes without copying the notes',async()=>{
  const g=await timetableFixture();const row=(await sql.query(`INSERT INTO tutoring_cases(institution_id,student_id,teacher_id,subject,private_notes) VALUES($1,$2,$3,'Seguimiento sintético','Confidential synthetic note') RETURNING id`,[tenant,g.student,g.teachers[0]])).rows[0];
  const response=await request('/api/v1/institutions/'+tenant+'/tutoring-cases');expect(response.status).toBe(200);expect((await response.json()).data.some((x:{id:string})=>x.id===row.id)).toBe(true);
  const event=(await sql.query(`SELECT request_id,details FROM security_audit_log WHERE institution_id=$1 AND action='tutoring.notes.read' ORDER BY created_at DESC LIMIT 1`,[tenant])).rows[0];expect(event?.request_id).toMatch(/^[0-9a-f-]{36}$/);expect(JSON.stringify(event.details)).not.toContain('Confidential synthetic note');
 });
 it('revokes every Companion endpoint when its tenant is suspended',async()=>{
  const id=process.env.SIII_COMPANERO_INSTITUTION_ID!,token=process.env.SIII_COMPANERO_TEST_TOKEN!;await sql.query(`INSERT INTO institutions(id,name,code) VALUES($1,'Synthetic integration',$2) ON CONFLICT(id) DO UPDATE SET status='active'`,[id,'S2S'+suffix]);
  const paths=['teachers','courses','students/ABSENT','students/ABSENT/academic-load','schedules/'+randomUUID()];
  expect((await fetch(base+'/api/integrations/companion/v1/teachers',{headers:{authorization:'Bearer '+token}})).status).toBe(200);
  await sql.query(`UPDATE institutions SET status='suspended' WHERE id=$1`,[id]);
  try{for(const path of paths)expect((await fetch(base+'/api/integrations/companion/v1/'+path,{headers:{authorization:'Bearer '+token}})).status).toBe(403)}finally{await sql.query(`UPDATE institutions SET status='active' WHERE id=$1`,[id])}
 });
 it.each(['students','teachers'])('paginates every %s registry record beyond the old 200-row cap with stable scoped cursors',async resource=>{
  const table=resource==='students'?'institutional_students':'institutional_teachers';
  if(resource==='students')await sql.query(`INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name,created_at) SELECT $1,$2,'PAGE'||n,'Persona','Sintética',('2026-10-01 12:00:00.12345'||(n%2+6)||'+00')::timestamptz FROM generate_series(1,205)n`,[tenant,program]);
  else await sql.query(`INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name,created_at) SELECT $1,'PAGE'||n,'Persona','Sintética',('2026-10-01 12:00:00.12345'||(n%2+6)||'+00')::timestamptz FROM generate_series(1,205)n`,[tenant]);
  const expected=(await sql.query('SELECT id FROM '+table+' WHERE institution_id=$1 ORDER BY created_at DESC,id DESC',[tenant])).rows.map(row=>row.id);
  const path='/api/v1/institutions/'+tenant+'/registry/'+resource,ids:string[]=[],cursors=new Set<string>();let cursor:string|null=null;
  do{
   const response=await request(path+'?limit=37'+(cursor?'&cursor='+encodeURIComponent(cursor):''));expect(response.status).toBe(200);
   const body=await response.json();expect(body).toHaveProperty('page.nextCursor');expect(body.data.length).toBeLessThanOrEqual(37);
   expect(body.data.every((row:{institutionId:string})=>row.institutionId===tenant)).toBe(true);
   ids.push(...body.data.map((row:{id:string})=>row.id));cursor=body.page.nextCursor;
   if(cursor){expect(cursors.has(cursor)).toBe(false);cursors.add(cursor)}
  }while(cursor);
  expect(ids).toEqual(expected);expect(new Set(ids).size).toBe(expected.length);expect(ids.length).toBeGreaterThan(200);
  const first=await request(path+'?limit=1'),firstCursor=(await first.json()).page.nextCursor;
  expect((await request('/api/v1/institutions/'+tenant+'/registry/'+(resource==='students'?'teachers':'students')+'?cursor='+firstCursor)).status).toBe(422);
  for(const query of ['limit=0','limit=101','limit=1&limit=2','cursor=invalid','unknown=1'])expect((await request(path+'?'+query)).status).toBe(422);
  expect((await request(path+'?limit=1','GET',undefined,studentCookie)).status).toBe(403);
 });
 it('rejects a grading session revoked after login',async()=>{await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',[teacherUser]);expect((await request('/api/v1/institutions/'+tenant+'/grading?sectionId='+section,'GET',undefined,teacherCookie)).status).toBe(403)});
});

async function timetableFixture(){const key=randomUUID().slice(0,8);const source=(await sql.query('SELECT term_id,course_id FROM academic_sections WHERE id=$1',[section])).rows[0];
 const sections=(await sql.query(`INSERT INTO academic_sections(institution_id,term_id,course_id,code,capacity) VALUES($1,$2,$3,$4,10),($1,$2,$3,$5,10) RETURNING id`,[tenant,source.term_id,source.course_id,'SA'+key,'SB'+key])).rows.map(x=>x.id);
 const teachers=(await sql.query(`INSERT INTO institutional_teachers(institution_id,employee_number,first_name,last_name) VALUES($1,$2,'Uno','Docente'),($1,$3,'Dos','Docente') RETURNING id`,[tenant,'TA'+key,'TB'+key])).rows.map(x=>x.id);
 for(let i=0;i<2;i++)await sql.query('INSERT INTO section_teachers(institution_id,section_id,teacher_id) VALUES($1,$2,$3)',[tenant,sections[i],teachers[i]]);
 const campus=(await sql.query(`INSERT INTO campuses(institution_id,name,code) VALUES($1,'Campus sintético',$2) RETURNING id`,[tenant,'CA'+key])).rows[0].id;
 const rooms=(await sql.query(`INSERT INTO classrooms(institution_id,campus_id,code,building,capacity) VALUES($1,$2,$3,'A',20),($1,$2,$4,'A',20) RETURNING id`,[tenant,campus,'RA'+key,'RB'+key])).rows.map(x=>x.id);
 for(let i=0;i<2;i++)expect((await request('/api/v1/institutions/'+tenant+'/schedule-patterns','POST',{sectionId:sections[i],roomId:rooms[i],weekday:1,startMinute:600,endMinute:660})).status).toBe(201);
 const student=(await sql.query(`INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,$3,'Alumno','Sintético') RETURNING id`,[tenant,program,'SC'+key])).rows[0].id;return {sections,teachers,rooms,student};}
