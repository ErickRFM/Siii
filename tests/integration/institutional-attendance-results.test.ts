import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,pool} from '@/infrastructure/database';
import {institutions,academicPrograms,academicTerms,academicCourses,academicSections,institutionalStudents,people,platformUsers,campuses,classrooms,schedulePatterns,classOccurrences} from '../../db/schema';
vi.mock('server-only',()=>({}));
import {materializeSectionOccurrences} from '@/modules/scheduling/materialize';
import {reconcileAttendanceResults} from '@/integrations/companion/results-worker';
import {enqueueAcademicSection} from '@/integrations/companion/outbox/enqueue';
import {archivalAttendanceAuthority} from '@/integrations/companion/attendance-archive-authority';
import {persistAcceptedAttendance,persistAcceptedClasses} from '@/integrations/companion/attendance-results';
import type {CompanionAttendanceHistory} from '@/integrations/companion/attendance-history';
beforeAll(()=>{process.env.SIII_ACADEMIC_OUTBOX_ENABLED='true';process.env.SIII_ACADEMIC_OUTBOX_KEYS=JSON.stringify({archive:randomBytes(32).toString('base64')});process.env.SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID='archive'});
async function fixture(id?:string){return db.transaction(async tx=>{
 const [tenant]=await tx.insert(institutions).values({...(id?{id}:{}),code:'AR'+randomUUID(),name:'Synthetic institutional results'}).returning();
 const [program]=await tx.insert(academicPrograms).values({institutionId:tenant.id,code:'QA',name:'Synthetic program',level:'licenciatura',modality:'presencial'}).returning();
 const [student]=await tx.insert(institutionalStudents).values({institutionId:tenant.id,programId:program.id,enrollmentNumber:'MAT001',firstName:'Synthetic',lastName:'Student'}).returning();
 const [term]=await tx.insert(academicTerms).values({institutionId:tenant.id,code:'QA',name:'Synthetic term',startDate:'2026-01-01',endDate:'2026-12-31'}).returning();
 const [course]=await tx.insert(academicCourses).values({institutionId:tenant.id,code:'QA',name:'Synthetic subject',credits:1}).returning();
 const [section]=await tx.insert(academicSections).values({institutionId:tenant.id,termId:term.id,courseId:course.id,code:'QA',capacity:20}).returning();
 const [person]=await tx.insert(people).values({firstName:'Synthetic',lastName:'Actor'}).returning();
 const [user]=await tx.insert(platformUsers).values({personId:person.id,username:'ar-'+randomUUID()}).returning();
 const [campus]=await tx.insert(campuses).values({institutionId:tenant.id,code:'QA',name:'Synthetic campus'}).returning();
 const [room]=await tx.insert(classrooms).values({institutionId:tenant.id,campusId:campus.id,code:'QA',building:'QA',capacity:20}).returning();
 const [pattern]=await tx.insert(schedulePatterns).values({institutionId:tenant.id,sectionId:section.id,roomId:room.id,weekday:1,startMinute:600,endMinute:660}).returning();
 const [occurrence]=await tx.insert(classOccurrences).values({institutionId:tenant.id,sectionId:section.id,patternId:pattern.id,onDate:'2026-10-05'}).returning();
 await tx.execute(sql`insert into section_enrollments(institution_id,section_id,student_id) values(${tenant.id},${section.id},${student.id})`);
 const teacher=await tx.execute<{id:string}>(sql`insert into institutional_teachers(institution_id,employee_number,first_name,last_name) values(${tenant.id},'EMP001','Synthetic','Teacher') returning id`);
 await tx.execute(sql`insert into section_teachers(institution_id,section_id,teacher_id) values(${tenant.id},${section.id},${teacher.rows[0].id})`);
 await enqueueAcademicSection(tx,{institutionId:tenant.id,sectionId:section.id,requestId:randomUUID()});
 const history:CompanionAttendanceHistory={contract:'siii.attendance_archive.v1',classSessions:[],page:1,observedAtEpochSeconds:1791248400,sampleLimit:100,records:[{auditRecordId:'a'.repeat(64),recordRevision:1,sessionId:randomUUID(),sectionId:section.id,occurrenceId:occurrence.id,sourceVersion:1,occurrenceDate:'2026-10-05',status:'review_required',disposition:null,reasonCode:'class_call_confirmed',receivedAtEpochSeconds:1791248400,reviewedAtEpochSeconds:null}]};
 return {tenant:tenant.id,student:student.id,user:user.id,section:section.id,occurrence:occurrence.id,teacher:teacher.rows[0].id,history};
})}
type Fixture=Awaited<ReturnType<typeof fixture>>;
function accept(f:Fixture,history:CompanionAttendanceHistory=f.history){return db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE siii_app'));const authority=await archivalAttendanceAuthority(tx,f.tenant,{id:f.student,externalId:'MAT001'},history);if(history.contract==='siii.attendance_archive.v1'&&!authority)throw Error('ATTENDANCE_SOURCE_PROOF_REQUIRED');return persistAcceptedAttendance(tx,f.tenant,f.student,history,f.user,randomUUID(),authority?.records??new Map())})}
afterAll(async()=>{delete process.env.SIII_ACADEMIC_OUTBOX_ENABLED;await pool.end()});
describe('institutional attendance immutable PostgreSQL revisions',()=>{
 it('deduplicates delivery and selects latest correction even when received out of order in the same second',async()=>{
  const f=await fixture();expect(await accept(f)).toBe(1);expect(await accept(f)).toBe(0);
  const correction=(revision:number,disposition:'present'|'absent'):CompanionAttendanceHistory=>({...f.history,records:f.history.records.map(r=>({...r,recordRevision:revision,disposition,reviewedAtEpochSeconds:1791248401}))});
  await accept(f,correction(3,'present'));await accept(f,correction(2,'absent'));
  const latest=await pool.query('select body from institutional_attendance_results where institution_id=$1 order by record_revision desc limit 1',[f.tenant]);
  expect(latest.rows[0].body).toMatchObject({recordRevision:3,disposition:'present'});
  expect((await pool.query('select count(*)::int n from institutional_attendance_results where institution_id=$1',[f.tenant])).rows[0].n).toBe(3);
  await expect(accept(f,correction(3,'absent'))).rejects.toThrow('ATTENDANCE_REVISION_CONFLICT');
 });
 it('rolls back accepted rows together with an audit failure and never deletes history on cancellation or empty samples',async()=>{
  const f=await fixture();
  await expect(db.transaction(async tx=>{const authority=await archivalAttendanceAuthority(tx,f.tenant,{id:f.student,externalId:'MAT001'},f.history);await persistAcceptedAttendance(tx,f.tenant,f.student,f.history,f.user,randomUUID(),authority!.records);throw Error('AUDIT_FAILURE')})).rejects.toThrow('AUDIT_FAILURE');
  expect((await pool.query('select 1 from institutional_attendance_results where institution_id=$1',[f.tenant])).rows).toHaveLength(0);
  await accept(f);await pool.query("update class_occurrences set state='CANCELLED',reason='Synthetic cancellation' where id=$1",[f.occurrence]);
  expect(await accept(f,{...f.history,records:[]})).toBe(0);
  expect((await pool.query('select 1 from institutional_attendance_results where institution_id=$1',[f.tenant])).rows).toHaveLength(1);
 });
 it('rejects record identity substitution and cross institution occurrence references',async()=>{
  const f=await fixture(),other=await fixture();await accept(f);
  await expect(accept(f,{...f.history,records:f.history.records.map(r=>({...r,recordRevision:2,sectionId:other.section,occurrenceId:other.occurrence}))})).rejects.toThrow('ATTENDANCE_SOURCE_PROOF_REQUIRED');
  await expect(accept({...f,tenant:other.tenant})).rejects.toThrow();
 });
 it('denies unversioned results and backend updates/deletes; API roles cannot read the archive',async()=>{
  const f=await fixture();await expect(accept(f,{...f.history,contract:'siii.attendance_history.v1'})).rejects.toThrow('ATTENDANCE_REVISION_REQUIRED');await accept(f);
  for(const statement of ['UPDATE institutional_attendance_results SET record_revision=99','DELETE FROM institutional_attendance_results'])await expect(db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE siii_app'));await tx.execute(sql.raw(statement))})).rejects.toThrow();
  for(const role of ['anon','authenticated'])await expect(db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE '+role));await tx.execute(sql.raw('SELECT * FROM public.institutional_attendance_results'))})).rejects.toThrow();
 });
 it('materializes missing official dates once without reviving a cancellation',async()=>{
  const f=await fixture();await pool.query("update class_occurrences set state='CANCELLED',reason='Synthetic cancellation' where id=$1",[f.occurrence]);
  const count=await db.transaction(tx=>materializeSectionOccurrences(tx,f.tenant,f.section));expect(count).toBeGreaterThan(0);
  expect(await db.transaction(tx=>materializeSectionOccurrences(tx,f.tenant,f.section))).toBe(0);
  expect((await pool.query('select state from class_occurrences where id=$1',[f.occurrence])).rows[0].state).toBe('CANCELLED');
 });
 it('background reconciliation deduplicates independent workers and rechecks source after transport',async()=>{
  const f=await fixture();vi.stubEnv('SIII_COMPANION_RESULTS_ENABLED','true');vi.stubEnv('SIII_COMPANION_RESULTS_TARGETS_JSON',JSON.stringify({[f.tenant]:{}}));
  try{
   let calls=0;
   const read:typeof import('@/integrations/companion/attendance-history').readCompanionAttendance=async(tenant,external,options)=>{calls++;expect(tenant).toBe(f.tenant);expect(external).toBe('MAT001');expect(options?.page).toBe(1);await new Promise(resolve=>setTimeout(resolve,100));return f.history};
   const results=await Promise.all([reconcileAttendanceResults({subjectType:'student',limit:1,read}),reconcileAttendanceResults({subjectType:'student',limit:1,read})]);
   expect(calls).toBe(1);expect(results.reduce((n,result)=>n+result.accepted,0)).toBe(1);
   await pool.query('update attendance_result_reconciliation set next_attempt_at=now() where institution_id=$1',[f.tenant]);
   const changed:typeof read=async()=>{await pool.query('update academic_section_versions set source_version=2 where institution_id=$1',[f.tenant]);await pool.query("update academic_sections set status='closed' where id=$1",[f.section]);await pool.query("update section_enrollments set status='withdrawn' where institution_id=$1",[f.tenant]);return {...f.history,records:f.history.records.map(record=>({...record,recordRevision:2,disposition:'present' as const,reviewedAtEpochSeconds:1791248401}))}};
   const archived=await reconcileAttendanceResults({subjectType:'student',limit:1,read:changed});expect(archived.accepted).toBe(1);
   expect((await pool.query('select count(*)::int n from institutional_attendance_results where institution_id=$1',[f.tenant])).rows[0].n).toBe(2);
  }finally{vi.unstubAllEnvs()}
 });
 it('repeated provider failures dead letter a student job without recording absence',async()=>{
  const f=await fixture();vi.stubEnv('SIII_COMPANION_RESULTS_ENABLED','true');vi.stubEnv('SIII_COMPANION_RESULTS_TARGETS_JSON',JSON.stringify({[f.tenant]:{}}));
  try{
   await reconcileAttendanceResults({subjectType:'student',limit:1,read:async()=>null});
   await pool.query('update attendance_result_reconciliation set attempts=7,next_attempt_at=now() where institution_id=$1',[f.tenant]);
   expect((await reconcileAttendanceResults({subjectType:'student',limit:1,read:async()=>null})).failed).toBe(1);
   const job=(await pool.query('select state,page from attendance_result_reconciliation where institution_id=$1',[f.tenant])).rows[0];expect(job).toMatchObject({state:'failed',page:1});
   expect((await pool.query('select 1 from institutional_attendance_results where institution_id=$1',[f.tenant])).rows).toHaveLength(0);
  }finally{vi.unstubAllEnvs()}
 });

 it('archives teacher closures without student attendance and preserves revisions and source ownership',async()=>{
  const f=await fixture();
  const session={sessionId:f.history.records[0].sessionId,sectionId:f.section,occurrenceId:f.occurrence,sourceVersion:1,occurrenceDate:'2026-10-05',teacherExternalId:'EMP001',sessionRevision:1,status:'open' as const,openedAtEpochSeconds:1791248400,closedAtEpochSeconds:null,closedByTeacher:false};
  const opened:CompanionAttendanceHistory={...f.history,records:[],classSessions:[session]};
  const closed:CompanionAttendanceHistory={...opened,classSessions:[{...session,sessionRevision:2,status:'closed',closedAtEpochSeconds:1791248500,closedByTeacher:true}]};
  vi.stubEnv('SIII_COMPANION_RESULTS_ENABLED','true');vi.stubEnv('SIII_COMPANION_RESULTS_TARGETS_JSON',JSON.stringify({[f.tenant]:{}}));
  try{
   const first=await reconcileAttendanceResults({subjectType:'teacher',limit:1,read:async(tenant,external,options)=>{expect(tenant).toBe(f.tenant);expect(external).toBe('EMP001');expect(options?.subjectType).toBe('teacher');return closed}});
   expect(first).toMatchObject({accepted:0,classSessions:1,pages:1});
   const acceptClass=(history:CompanionAttendanceHistory)=>db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE siii_app'));const authority=await archivalAttendanceAuthority(tx,f.tenant,{id:f.teacher,externalId:'EMP001'},history,'teacher');if(!authority)throw Error('CLASS_SOURCE_PROOF_REQUIRED');return persistAcceptedClasses(tx,f.tenant,history,randomUUID(),authority.sessions)});
   expect(await acceptClass(closed)).toBe(0);expect(await acceptClass(opened)).toBe(1);
   await expect(acceptClass({...closed,classSessions:[{...closed.classSessions[0],closedByTeacher:false}]})).rejects.toThrow('CLASS_REVISION_CONFLICT');
   const retained=(await pool.query('select session_revision,teacher_id,student_source_ids,body from institutional_class_sessions where institution_id=$1 order by session_revision desc',[f.tenant])).rows;
   expect(retained).toHaveLength(2);expect(retained[0]).toMatchObject({session_revision:2,teacher_id:f.teacher,student_source_ids:[f.student],body:{closedByTeacher:true}});
   await expect(acceptClass({...closed,classSessions:[{...closed.classSessions[0],teacherExternalId:'EMP-FOREIGN'}]})).rejects.toThrow('CLASS_SOURCE_PROOF_REQUIRED');
   for(const statement of ['UPDATE institutional_class_sessions SET session_revision=99','DELETE FROM institutional_class_sessions'])await expect(db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE siii_app'));await tx.execute(sql.raw(statement))})).rejects.toThrow();
   for(const role of ['anon','authenticated'])await expect(db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE '+role));await tx.execute(sql.raw('SELECT * FROM institutional_class_sessions'))})).rejects.toThrow();
   expect((await pool.query('select 1 from institutional_attendance_results where institution_id=$1',[f.tenant])).rows).toHaveLength(0);
  }finally{vi.unstubAllEnvs()}
 });

 it('serves retained student and original teacher history through the real authorized HTTP boundary',async()=>{
  const f=await fixture(process.env.SIII_RESULTS_HISTORY_TEST_TENANT);await accept(f,{...f.history,records:f.history.records.map(record=>({...record,disposition:'present' as const,reviewedAtEpochSeconds:1791248401}))});
  async function actor(kind:'student'|'teacher'){
   const person=(await pool.query("insert into people(first_name,last_name) values('Synthetic','Reader') returning id")).rows[0].id;
   const user=(await pool.query('insert into platform_users(person_id,username) values($1,$2) returning id',[person,'ar-reader-'+randomUUID()])).rows[0].id;
   const membership=(await pool.query('insert into institution_memberships(institution_id,user_id) values($1,$2) returning id',[f.tenant,user])).rows[0].id;
   await pool.query("insert into role_assignments(institution_id,membership_id,role,scope_type) values($1,$2,$3,'institution')",[f.tenant,membership,kind]);
   await pool.query(kind==='student'?'insert into student_account_links(institution_id,membership_id,student_id,linked_by) values($1,$2,$3,$4)':'insert into teacher_account_links(institution_id,membership_id,teacher_id) values($1,$2,$3)',kind==='student'?[f.tenant,membership,f.student,user]:[f.tenant,membership,f.teacher]);
   const token=randomBytes(32).toString('base64url');const session=(await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour') returning id",[user,createHash('sha256').update(token).digest('hex')])).rows[0].id;
   return {membership,session,cookie:'siii_session='+token};
  }
  const closed:CompanionAttendanceHistory={...f.history,records:[],classSessions:[{sessionId:f.history.records[0].sessionId,sectionId:f.section,occurrenceId:f.occurrence,sourceVersion:1,occurrenceDate:'2026-10-05',teacherExternalId:'EMP001',sessionRevision:2,status:'closed',openedAtEpochSeconds:1791248400,closedAtEpochSeconds:1791248500,closedByTeacher:true}]};
  await db.transaction(async tx=>{const authority=await archivalAttendanceAuthority(tx,f.tenant,{id:f.teacher,externalId:'EMP001'},closed,'teacher');await persistAcceptedClasses(tx,f.tenant,closed,randomUUID(),authority!.sessions)});
  const student=await actor('student'),teacher=await actor('teacher');
  const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
  const read=(kind:string,cookie:string,query='')=>fetch(`${base}/api/v1/institutions/${f.tenant}/institutional-attendance/${kind}${query}`,{headers:{origin:base,cookie},signal:AbortSignal.timeout(30000)});
  // Runtime flag is enabled only for this disposable integration server.
  const studentResponse=await read('student',student.cookie);expect(studentResponse.status).toBe(200);expect(studentResponse.headers.get('cache-control')).toBe('no-store');
  const mine=(await studentResponse.json()).data;expect(mine.metrics).toMatchObject({present:1,absent:0,attendancePercentage:100});expect(mine.records).toHaveLength(1);expect(mine.classes.metrics).toMatchObject({scheduled:1,performed:1,pending:0,cancelled:0});expect(mine.classes.records[0].status).toBe('performed');
  await pool.query('update section_teachers set revoked_at=now() where institution_id=$1',[f.tenant]);await pool.query("update academic_sections set status='closed' where id=$1",[f.section]);
  const formerTeaching=await read('teacher',teacher.cookie);expect(formerTeaching.status).toBe(200);const teacherHistory=(await formerTeaching.json()).data;expect(teacherHistory.records).toHaveLength(1);expect(teacherHistory.records[0].studentName).toBe('Synthetic Student');expect(teacherHistory.classes.metrics.performed).toBe(1);
  await pool.query("update class_occurrences set state='CANCELLED',reason='Synthetic cancellation' where id=$1",[f.occurrence]);const cancelled=(await (await read('student',student.cookie)).json()).data;expect(cancelled.classes.metrics).toMatchObject({performed:0,cancelled:1});expect(cancelled.metrics.attendancePercentage).toBeNull();
  expect((await read('teacher',student.cookie)).status).toBe(403);
  expect((await read('student',student.cookie,'?studentId='+randomUUID())).status).toBe(422);
  expect((await read('student',student.cookie,'?page=1&page=2')).status).toBe(422);
  await pool.query('update student_account_links set revoked_at=now() where institution_id=$1 and membership_id=$2',[f.tenant,student.membership]);expect((await read('student',student.cookie)).status).toBe(403);
  await pool.query("update auth_sessions set expires_at=now()-interval '1 second' where id=$1",[teacher.session]);expect((await read('teacher',teacher.cookie)).status).toBe(403);
 });

});
