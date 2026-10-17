import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {APPLICATION_ROLE_QUERY,assertRoleInspection} from '@/infrastructure/database/role-policy';
import {eq,sql} from 'drizzle-orm';
import {db,pool} from '@/infrastructure/database';
import {institutions,campuses,academicTerms,academicCourses,academicPrograms,academicSections,institutionalStudents,institutionalTeachers,sectionTeachers,sectionEnrollments,classrooms,schedulePatterns,classOccurrences} from '../../db/schema';
import {enqueueAcademicSection} from '@/integrations/companion/outbox/enqueue';
import {openAcademicBody} from '@/integrations/companion/outbox/seal';
import {claimAcademicEvent,completeAcademicEvent,deliverAcademicEvents} from '@/integrations/companion/outbox/worker';
import {readFileSync} from 'node:fs';
import {readReleaseMigrations} from '../../db/release-profile';
beforeAll(()=>{process.env.SIII_ACADEMIC_OUTBOX_ENABLED='true';process.env.SIII_ACADEMIC_OUTBOX_KEYS=JSON.stringify({test:randomBytes(32).toString('base64')});process.env.SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID='test'});
afterEach(()=>{process.env.SIII_ACADEMIC_OUTBOX_ENABLED='true'});
afterAll(async()=>{delete process.env.SIII_ACADEMIC_OUTBOX_ENABLED;await pool.end()});
async function fixture(){return db.transaction(async tx=>{
 const [institution]=await tx.insert(institutions).values({code:'OUT-'+randomUUID(),name:'Synthetic university',timezone:'America/Mexico_City'}).returning();
 const [term]=await tx.insert(academicTerms).values({institutionId:institution.id,code:'2026-A',name:'Synthetic term',startDate:'2025-01-01',endDate:'2027-12-31'}).returning();
 const [subject]=await tx.insert(academicCourses).values({institutionId:institution.id,code:'TEST01',name:'Synthetic subject',credits:0}).returning();
 const [section]=await tx.insert(academicSections).values({institutionId:institution.id,termId:term.id,courseId:subject.id,code:'TEST-A',capacity:30}).returning();
 return {institutionId:institution.id,sectionId:section.id,requestId:randomUUID()};
})}
const enqueue=(scope:Awaited<ReturnType<typeof fixture>>)=>db.transaction(tx=>enqueueAcademicSection(tx,scope));
async function frozen(eventId:string){const {rows}=await pool.query('SELECT * FROM academic_section_outbox WHERE event_id=$1',[eventId]);const row=rows[0];return {row,body:JSON.parse(openAcademicBody(row.body_encrypted,{eventId,institutionId:row.institution_id,sectionId:row.section_id}))}}
describe('transactional academic outbox PostgreSQL',()=>{
 it('default disabled touches no new tables even with invalid scope/transport',async()=>{delete process.env.SIII_ACADEMIC_OUTBOX_ENABLED;expect(await enqueueAcademicSection({} as never,{} as never)).toEqual({status:'disabled'});expect(await deliverAcademicEvents({transport:async()=>{throw Error('must not call')}})).toMatchObject({disabled:true})});
 it('freezes an empty real open section without inventing a teacher and preserves a long term/zero credits',async()=>{const scope=await fixture();const event=await enqueue(scope);expect(event.status).toBe('queued');if(event.status!=='queued')throw Error('missing');const {row,body}=await frozen(event.eventId);expect(row.body_encrypted).not.toContain('Synthetic');expect(body.payload).toMatchObject({sectionId:scope.sectionId,teachers:[],enrollments:[],occurrences:[],subject:{credits:0},term:{startsOn:'2025-01-01',endsOn:'2027-12-31'}});expect(body.sourceVersion).toBe(1)});
 it('serializes teacher, historical withdrawal plus reenrollment and persisted Saturday24:00 occurrence UUIDs',async()=>{
  const scope=await fixture();const refs=await db.transaction(async tx=>{
   const [program]=await tx.insert(academicPrograms).values({institutionId:scope.institutionId,code:'TEST',name:'Synthetic program',level:'licenciatura',modality:'presencial'}).returning();
   const [student]=await tx.insert(institutionalStudents).values({institutionId:scope.institutionId,programId:program.id,enrollmentNumber:'ST01',firstName:'Persona',lastName:'Sintética'}).returning();
   const [teacher]=await tx.insert(institutionalTeachers).values({institutionId:scope.institutionId,employeeNumber:'TC01',firstName:'Docente',lastName:'Sintético'}).returning();
   await tx.insert(sectionTeachers).values({institutionId:scope.institutionId,sectionId:scope.sectionId,teacherId:teacher.id});
   const enrollments=await tx.insert(sectionEnrollments).values(['withdrawn','enrolled'].map(status=>({institutionId:scope.institutionId,sectionId:scope.sectionId,studentId:student.id,status}))).returning();
   const [campus]=await tx.insert(campuses).values({institutionId:scope.institutionId,code:'MAIN',name:'Synthetic campus'}).returning();
   const [room]=await tx.insert(classrooms).values({institutionId:scope.institutionId,campusId:campus.id,code:'A01',building:'Synthetic building',capacity:40}).returning();
   const [pattern]=await tx.insert(schedulePatterns).values({institutionId:scope.institutionId,sectionId:scope.sectionId,roomId:room.id,weekday:6,startMinute:1380,endMinute:1440}).returning();
   const [occurrence]=await tx.insert(classOccurrences).values({institutionId:scope.institutionId,sectionId:scope.sectionId,patternId:pattern.id,onDate:'2026-10-17',state:'CANCELLED'}).returning();
   return {student,teacher,enrollments,occurrence,pattern};
  });const event=await enqueue(scope);if(event.status!=='queued')throw Error('missing');const {body}=await frozen(event.eventId);
  expect(body.payload.teachers[0].sourceId).toBe(refs.teacher.id);expect(body.payload.enrollments.map((r:{sourceId:string})=>r.sourceId).sort()).toEqual(refs.enrollments.map(r=>r.id).sort());
  expect(body.payload.occurrences).toEqual([expect.objectContaining({sourceId:refs.occurrence.id,patternSourceId:refs.pattern.id,status:'CANCELLED',startsAt:'2026-10-18T05:00:00Z',endsAt:'2026-10-18T06:00:00Z'})]);
 });
 it('rolls back event/version/audit together and serializes concurrent source versions',async()=>{
  const scope=await fixture();await expect(db.transaction(async tx=>{await enqueueAcademicSection(tx,scope);throw Error('rollback')})).rejects.toThrow('rollback');
  const results=await Promise.all([enqueue(scope),enqueue(scope),enqueue(scope)]);expect(results.map(r=>r.status==='queued'?r.sourceVersion:0).sort()).toEqual([1,2,3]);
  expect((await pool.query('SELECT count(*)::int AS n FROM security_audit_log WHERE institution_id=$1 AND action=$2',[scope.institutionId,'academic.snapshot.queued'])).rows[0].n).toBe(3);
 });
 it('retries the identical body after source changes and fences a worker whose lease was reclaimed',async()=>{
  const scope=await fixture();const event=await enqueue(scope);if(event.status!=='queued')throw Error('missing');const old=await db.transaction(tx=>claimAcademicEvent(tx,event.eventId,new Date()));if(!old)throw Error('claim');
  await db.update(academicSections).set({code:'NEW-CODE'}).where(eq(academicSections.id,scope.sectionId));await pool.query("UPDATE academic_section_outbox SET lease_until=now()-interval '1 second' WHERE event_id=$1",[event.eventId]);
  const fresh=await db.transaction(tx=>claimAcademicEvent(tx,event.eventId,new Date()));if(!fresh)throw Error('reclaim');expect(fresh.leaseToken).not.toBe(old.leaseToken);
  expect(await db.transaction(tx=>completeAcademicEvent(tx,old,{status:'accepted'},new Date()))).toBeNull();
  expect(await db.transaction(tx=>completeAcademicEvent(tx,fresh,{status:'retryable'},new Date()))).toBe('queued');
  await pool.query("UPDATE academic_section_outbox SET next_attempt_at=now()-interval '1 second' WHERE event_id=$1",[event.eventId]);
  const sent:string[]=[];await deliverAcademicEvents({limit:100,transport:async({body,eventId})=>{if(eventId===event.eventId)sent.push(body);return {status:'accepted'}}});
  expect(sent).toHaveLength(1);expect(JSON.parse(sent[0]).payload.sectionCode).toBe('TEST-A');expect((await frozen(event.eventId)).row.state).toBe('accepted');
 });
 it('rejects foreign tenant section and never silently truncates501 historical rows',async()=>{
  const scope=await fixture(),other=await fixture();await expect(enqueue({...scope,institutionId:other.institutionId})).rejects.toThrow('ACADEMIC_SECTION_NOT_FOUND');
  await db.transaction(async tx=>{const [program]=await tx.insert(academicPrograms).values({institutionId:scope.institutionId,code:'CAP',name:'Synthetic program',level:'licenciatura',modality:'presencial'}).returning();const [student]=await tx.insert(institutionalStudents).values({institutionId:scope.institutionId,programId:program.id,enrollmentNumber:'CAP01',firstName:'Persona',lastName:'Sintética'}).returning();await tx.insert(sectionEnrollments).values(Array.from({length:501},()=>({institutionId:scope.institutionId,sectionId:scope.sectionId,studentId:student.id,status:'withdrawn'})))});
  await expect(enqueue(scope)).rejects.toThrow('ACADEMIC_SNAPSHOT_LIMIT_EXCEEDED');expect((await pool.query('SELECT count(*)::int AS n FROM academic_section_outbox WHERE institution_id=$1',[scope.institutionId])).rows[0].n).toBe(0);
 });
 it('keeps canonical and managed0018 identical and denies API grants/immutable update under backend role',async()=>{
  expect(readReleaseMigrations('supabase-v1')[18].sql.join('')).toContain('academic_section_outbox');
  const tables=(await pool.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('academic_section_outbox','academic_section_versions')")).rows;expect(tables).toHaveLength(2);expect(tables.every(r=>r.relrowsecurity&&r.relforcerowsecurity)).toBe(true);
  for(const role of ['anon','authenticated']){expect((await pool.query("SELECT has_any_column_privilege($1,'academic_section_outbox','SELECT,INSERT,UPDATE,REFERENCES') AS allowed",[role])).rows[0].allowed).toBe(false)}
  await expect(db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE siii_app'));await tx.execute(sql.raw("UPDATE academic_section_outbox SET body_encrypted='tamper'"))})).rejects.toThrow();
 });
});

it('allows backend enqueue/lease/completion but rejects updates to every frozen event column',async()=>{
 const scope=await fixture();const event=await db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE siii_app'));return enqueueAcademicSection(tx,scope)});if(event.status!=='queued')throw Error('missing');
 const columns={event_id:randomUUID(),institution_id:randomUUID(),section_id:randomUUID(),source_version:42,body_encrypted:'tamper',body_digest:'a'.repeat(64),occurred_at:new Date().toISOString(),operation:'delete',created_at:new Date().toISOString()};
 for(const [column,value] of Object.entries(columns)){
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL ROLE siii_app');await expect(client.query('UPDATE academic_section_outbox SET '+column+'=$1 WHERE event_id=$2',[value,event.eventId])).rejects.toHaveProperty('code','42501')}finally{await client.query('ROLLBACK');client.release()}
 }
 const lease=await db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE siii_app'));return claimAcademicEvent(tx,event.eventId,new Date())});if(!lease)throw Error('claim');expect(await db.transaction(async tx=>{await tx.execute(sql.raw('SET LOCAL ROLE siii_app'));return completeAcademicEvent(tx,lease,{status:'accepted'},new Date())})).toBe('accepted');
});
it('fails source-version overflow atomically and preserves empty delete tombstone identity',async()=>{
 const scope=await fixture();const event=await db.transaction(tx=>enqueueAcademicSection(tx,{...scope,operation:'delete'}));if(event.status!=='queued')throw Error('missing');const {body}=await frozen(event.eventId);expect(body.operation).toBe('delete');expect(body.payload).toEqual({});expect(body.externalId).toBe(scope.sectionId);
 await pool.query('UPDATE academic_section_versions SET source_version=9007199254740991 WHERE institution_id=$1 AND section_id=$2',[scope.institutionId,scope.sectionId]);await expect(enqueue(scope)).rejects.toThrow();
 expect((await pool.query('SELECT source_version::text AS version FROM academic_section_versions WHERE institution_id=$1 AND section_id=$2',[scope.institutionId,scope.sectionId])).rows[0].version).toBe('9007199254740991');expect((await pool.query('SELECT count(*)::int AS n FROM academic_section_outbox WHERE section_id=$1',[scope.sectionId])).rows[0].n).toBe(1);
});
it('rejects3001 persisted occurrences without truncating or committing a version',async()=>{
 const scope=await fixture();await pool.query("UPDATE academic_terms SET end_date='2036-01-01' WHERE institution_id=$1",[scope.institutionId]);
 await db.transaction(async tx=>{const [campus]=await tx.insert(campuses).values({institutionId:scope.institutionId,code:'CAP',name:'Synthetic campus'}).returning();const [room]=await tx.insert(classrooms).values({institutionId:scope.institutionId,campusId:campus.id,code:'CAP01',building:'Synthetic building',capacity:30}).returning();const [pattern]=await tx.insert(schedulePatterns).values({institutionId:scope.institutionId,sectionId:scope.sectionId,roomId:room.id,weekday:6,startMinute:600,endMinute:660}).returning();await tx.execute(sql`INSERT INTO class_occurrences(institution_id,section_id,pattern_id,on_date) SELECT ${scope.institutionId}::uuid,${scope.sectionId}::uuid,${pattern.id}::uuid,'2025-01-01'::date+generate_series(0,3000)`)});
 await expect(enqueue(scope)).rejects.toThrow('ACADEMIC_SNAPSHOT_LIMIT_EXCEEDED');expect((await pool.query('SELECT count(*)::int AS n FROM academic_section_versions WHERE section_id=$1',[scope.sectionId])).rows[0].n).toBe(0);
});
it('fences an expired lease even before reclaim and bounds exhausted retries',async()=>{
 const scope=await fixture();const event=await enqueue(scope);if(event.status!=='queued')throw Error('missing');const lease=await db.transaction(tx=>claimAcademicEvent(tx,event.eventId,new Date()));if(!lease)throw Error('claim');
 expect(await db.transaction(tx=>completeAcademicEvent(tx,lease,{status:'accepted'},new Date(Date.now()+61000)))).toBeNull();
 await pool.query("UPDATE academic_section_outbox SET attempts=8,lease_until=now()-interval '1 second' WHERE event_id=$1",[event.eventId]);expect(await db.transaction(tx=>claimAcademicEvent(tx,event.eventId,new Date()))).toBeNull();expect((await frozen(event.eventId)).row).toMatchObject({state:'failed',failure_code:'RETRY_EXHAUSTED',attempts:8});
});
it('detects a SET-only inherited API path using isolated test roles without granting actual API membership',async()=>{
 const token=randomUUID().replaceAll('-','').slice(0,12),api='outbox_api_'+token,proxy='outbox_proxy_'+token;
 const migration=readFileSync('db/migrations/0018_academic_section_outbox.sql','utf8'),guard=migration.slice(migration.lastIndexOf('DO $$')).replace("IN('anon','authenticated')","IN('"+api+"')");
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('CREATE ROLE '+api+' NOLOGIN NOINHERIT');await client.query('CREATE ROLE '+proxy+' NOLOGIN');await client.query('GRANT siii_app TO '+proxy);await client.query('GRANT '+proxy+' TO '+api+' WITH INHERIT FALSE, SET TRUE');await expect(client.query(guard)).rejects.toHaveProperty('message','ACADEMIC_OUTBOX_API_PATH_UNSAFE')}finally{await client.query('ROLLBACK');client.release()}
});

it('passes the live application-role guard with a dedicated login and no DDL or immutable-column privilege',async()=>{
 const role='outbox_runtime_'+randomUUID().replaceAll('-','').slice(0,12);await pool.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');await pool.query('GRANT siii_app TO '+role);const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';const client=new pg.Client({connectionString:url.toString()});
 try{await client.connect();const inspection=(await client.query(APPLICATION_ROLE_QUERY)).rows[0];expect(()=>assertRoleInspection(inspection)).not.toThrow();await expect(client.query('CREATE TABLE public.outbox_forbidden(id int)')).rejects.toHaveProperty('code','42501');expect((await client.query("SELECT has_column_privilege(current_user,'academic_section_outbox','body_encrypted','UPDATE') AS allowed")).rows[0].allowed).toBe(false)}finally{await client.end();await pool.query('DROP ROLE '+role)}
});
it('retains restrictive API denial even if a future SQL caller accidentally adds public schema/table grants',async()=>{
 for(const role of ['anon','authenticated']){const client=await pool.connect();try{await client.query('BEGIN');await client.query('GRANT USAGE ON SCHEMA public TO '+role);await client.query('GRANT SELECT,INSERT,UPDATE ON academic_section_outbox,academic_section_versions TO '+role);await client.query('SET LOCAL ROLE '+role);expect((await client.query('SELECT count(*)::int AS n FROM academic_section_outbox')).rows[0].n).toBe(0);expect((await client.query('SELECT count(*)::int AS n FROM academic_section_versions')).rows[0].n).toBe(0);await expect(client.query("INSERT INTO academic_section_versions(institution_id,section_id,source_version) VALUES($1,$2,1)",[randomUUID(),randomUUID()])).rejects.toHaveProperty('code','42501')}finally{await client.query('ROLLBACK');client.release()}}
});

it('freezes source identity status explicitly while preserving enrolled and withdrawn history',async()=>{
 const scope=await fixture();const student=await db.transaction(async tx=>{const [program]=await tx.insert(academicPrograms).values({institutionId:scope.institutionId,code:'LIFE',name:'Synthetic program',level:'licenciatura',modality:'presencial'}).returning();const [person]=await tx.insert(institutionalStudents).values({institutionId:scope.institutionId,programId:program.id,enrollmentNumber:'LIFE01',firstName:'Persona',lastName:'Sintética'}).returning();await tx.insert(sectionEnrollments).values(['withdrawn','enrolled'].map(status=>({institutionId:scope.institutionId,sectionId:scope.sectionId,studentId:person.id,status})));return person});
 const active=await enqueue(scope);if(active.status!=='queued')throw Error('missing');expect((await frozen(active.eventId)).body.payload.enrollments.every((row:{studentStatus:string})=>row.studentStatus==='active')).toBe(true);
 for(const status of ['inactive','withdrawn','graduated']){await db.update(institutionalStudents).set({status}).where(eq(institutionalStudents.id,student.id));const next=await enqueue(scope);if(next.status!=='queued')throw Error('missing');const rows=(await frozen(next.eventId)).body.payload.enrollments;expect(rows).toHaveLength(2);expect(rows.map((r:{status:string})=>r.status).sort()).toEqual(['enrolled','withdrawn']);expect(rows.every((r:{studentStatus:string})=>r.studentStatus===status)).toBe(true)}
 expect((await frozen(active.eventId)).body.payload.enrollments.every((row:{studentStatus:string})=>row.studentStatus==='active')).toBe(true);
});

it('rejects a complete legal-count snapshot above1MiB rather than truncating its payload',async()=>{
 const scope=await fixture();await pool.query("UPDATE academic_terms SET end_date='2036-01-01' WHERE institution_id=$1",[scope.institutionId]);
 await db.transaction(async tx=>{const [campus]=await tx.insert(campuses).values({institutionId:scope.institutionId,code:'SIZE',name:'C'.repeat(160)}).returning();const [room]=await tx.insert(classrooms).values({institutionId:scope.institutionId,campusId:campus.id,code:'SIZE01',building:'B'.repeat(120),capacity:30}).returning();const [pattern]=await tx.insert(schedulePatterns).values({institutionId:scope.institutionId,sectionId:scope.sectionId,roomId:room.id,weekday:6,startMinute:600,endMinute:660}).returning();await tx.execute(sql`INSERT INTO class_occurrences(institution_id,section_id,pattern_id,on_date) SELECT ${scope.institutionId}::uuid,${scope.sectionId}::uuid,${pattern.id}::uuid,'2025-01-01'::date+generate_series(0,2199)`)});
 await expect(enqueue(scope)).rejects.toThrow('ACADEMIC_SNAPSHOT_LIMIT_EXCEEDED');expect((await pool.query('SELECT count(*)::int AS n FROM academic_section_outbox WHERE section_id=$1',[scope.sectionId])).rows[0].n).toBe(0);
});
