import {afterAll,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {db,pool} from '@/infrastructure/database';
import {institutions,academicTerms,academicCourses,academicSections,institutionalTeachers,sectionTeachers,campuses,classrooms,schedulePatterns,classOccurrences} from '../../db/schema';
import {previewOccurrenceRecovery} from '@/modules/scheduling/recovery-preview';
import {materializeSectionOccurrences} from '@/modules/scheduling/materialize';
import {occurrenceDates} from '@/modules/scheduling/validation';
vi.mock('server-only',()=>({}));

async function fixture(){
 return db.transaction(async tx=>{
  const [inst]=await tx.insert(institutions).values({code:'REC-'+randomUUID(),name:'Synthetic university'}).returning();
  const [term]=await tx.insert(academicTerms).values({institutionId:inst.id,code:'2026-QA',name:'QA term',startDate:'2026-08-01',endDate:'2026-12-31'}).returning();
  const [course]=await tx.insert(academicCourses).values({institutionId:inst.id,code:'QA',name:'Mathematics',credits:1}).returning();
  const [section]=await tx.insert(academicSections).values({institutionId:inst.id,termId:term.id,courseId:course.id,code:'QA1',capacity:20}).returning();
  const [teacher]=await tx.insert(institutionalTeachers).values({institutionId:inst.id,employeeNumber:'EMP001',firstName:'Synthetic',lastName:'Teacher'}).returning();
  await tx.insert(sectionTeachers).values({institutionId:inst.id,sectionId:section.id,teacherId:teacher.id});
  const [campus]=await tx.insert(campuses).values({institutionId:inst.id,code:'MAIN',name:'Central'}).returning();
  const [room]=await tx.insert(classrooms).values({institutionId:inst.id,campusId:campus.id,code:'A101',building:'Main building',capacity:30}).returning();
  const patterns=await tx.insert(schedulePatterns).values([1,3,5].map(weekday=>({institutionId:inst.id,sectionId:section.id,roomId:room.id,weekday,startMinute:540,endMinute:660}))).returning();
  return {inst,term,section,teacher,room,patterns};
 });
}
describe('QA-style timetable recovery (disposable PostgreSQL)',()=>{
 it('reports 3 patterns without mutating DB and restores only absent dates',async()=>{
  const f=await fixture();
  const [cancelled]=await db.insert(classOccurrences).values({institutionId:f.inst.id,sectionId:f.section.id,patternId:f.patterns[0].id,onDate:'2026-10-05',state:'CANCELLED',reason:'Synthetic cancellation'}).returning();
  const before=await db.transaction(tx=>previewOccurrenceRecovery(tx,f.inst.id,f.section.id));
  const expected=f.patterns.reduce((sum,p)=>sum+occurrenceDates(f.term.startDate,f.term.endDate,p.weekday).length,0);
  expect(before).toMatchObject({ready:true,estimateOnly:true,activePatterns:3,existingOccurrences:1,expectedOccurrences:expected,missingOccurrences:expected-1,expectedSourceVersion:0,blockers:[]});
  expect((await pool.query('select count(*)::int n from class_occurrences where section_id=$1',[f.section.id])).rows[0].n).toBe(1);
  expect(await db.transaction(tx=>materializeSectionOccurrences(tx,f.inst.id,f.section.id))).toBe(expected-1);
  expect(await db.transaction(tx=>materializeSectionOccurrences(tx,f.inst.id,f.section.id))).toBe(0);
  const after=await db.transaction(tx=>previewOccurrenceRecovery(tx,f.inst.id,f.section.id));
  expect(after).toMatchObject({ready:true,missingOccurrences:0,existingOccurrences:expected});
  expect((await pool.query('select state,reason from class_occurrences where id=$1',[cancelled.id])).rows[0]).toEqual({state:'CANCELLED',reason:'Synthetic cancellation'});
 });
 it('cannot inspect or materialize a section belonging to another institution',async()=>{
  const a=await fixture(),b=await fixture();
  expect(await db.transaction(tx=>previewOccurrenceRecovery(tx,b.inst.id,a.section.id))).toBeNull();
  await expect(db.transaction(tx=>materializeSectionOccurrences(tx,b.inst.id,a.section.id))).rejects.toThrow('SECTION_UNAVAILABLE');
  expect((await pool.query('select count(*)::int n from class_occurrences where section_id=$1',[a.section.id])).rows[0].n).toBe(0);
 });
 it('preflight detects an inactive teacher and insufficient classroom capacity',async()=>{
  const f=await fixture();
  await pool.query("update institutional_teachers set status='inactive' where id=$1",[f.teacher.id]);
  let preview=await db.transaction(tx=>previewOccurrenceRecovery(tx,f.inst.id,f.section.id));
  expect(preview.ready).toBe(false);expect(preview.blockers).toContain('TEACHER_REQUIRED');
  await expect(db.transaction(tx=>materializeSectionOccurrences(tx,f.inst.id,f.section.id))).rejects.toThrow('TEACHER_REQUIRED');
  await pool.query("update institutional_teachers set status='active' where id=$1",[f.teacher.id]);
  await pool.query('update classrooms set capacity=10 where id=$1',[f.room.id]);
  preview=await db.transaction(tx=>previewOccurrenceRecovery(tx,f.inst.id,f.section.id));
  expect(preview.ready).toBe(false);expect(preview.blockers).toContain('ROOM_UNAVAILABLE');
  await expect(db.transaction(tx=>materializeSectionOccurrences(tx,f.inst.id,f.section.id))).rejects.toThrow('ROOM_UNAVAILABLE');
 });
 it('overlapping timetable rejects a recovery and rolls back its partial insertions',async()=>{
  const f=await fixture();
  const [collision]=await db.insert(schedulePatterns).values({institutionId:f.inst.id,sectionId:f.section.id,roomId:f.room.id,weekday:1,startMinute:550,endMinute:660}).returning();
  await db.insert(classOccurrences).values({institutionId:f.inst.id,sectionId:f.section.id,patternId:collision.id,onDate:'2026-10-05'});
  await expect(db.transaction(tx=>materializeSectionOccurrences(tx,f.inst.id,f.section.id))).rejects.toThrow('SCHEDULE_CONFLICT');
  expect((await pool.query('select count(*)::int n from class_occurrences where section_id=$1',[f.section.id])).rows[0].n).toBe(1);
 });
});
afterAll(async()=>{await pool.end()});
