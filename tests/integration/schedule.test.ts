import { afterAll,describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db,pool } from '@/infrastructure/database';
import { institutions,campuses,classrooms,academicPrograms,academicCourses,academicTerms,
 academicSections,schedulePatterns,classOccurrences } from '../../db/schema';

describe('R4 PostgreSQL timetable integrity',()=>{
 it('blocks rooms assigned to campuses from another university',async()=>{
  await expect(db.transaction(async tx=>{
   const token=randomUUID().slice(0,10);
   const [a,b]=await tx.insert(institutions).values([{code:'room-a-'+token,name:'A'},{code:'room-b-'+token,name:'B'}]).returning();
   const [campus]=await tx.insert(campuses).values({institutionId:a.id,code:'MAIN',name:'Central'}).returning();
   await tx.insert(classrooms).values({institutionId:b.id,campusId:campus.id,code:'A101',building:'Edificio A',capacity:40});
  })).rejects.toThrow();
 });
 it('enforces one stable occurrence per pattern per date',async()=>{
  await expect(db.transaction(async tx=>{
   const token=randomUUID().slice(0,10);
   const [unit]=await tx.insert(institutions).values({code:'room-c-'+token,name:'C'}).returning();
   const [campus]=await tx.insert(campuses).values({institutionId:unit.id,code:'MAIN',name:'Central'}).returning();
   const [room]=await tx.insert(classrooms).values({institutionId:unit.id,campusId:campus.id,code:'A101',building:'Edificio A',capacity:30}).returning();
   const [course]=await tx.insert(academicCourses).values({institutionId:unit.id,code:'PRG',name:'Programación',credits:6}).returning();
   const [term]=await tx.insert(academicTerms).values({institutionId:unit.id,code:'2026-A',name:'Cuatrimestre',startDate:new Date('2026-09-01T12:00:00Z'),endDate:new Date('2026-12-15T12:00:00Z')}).returning();
   const [section]=await tx.insert(academicSections).values({institutionId:unit.id,termId:term.id,courseId:course.id,code:'9A',capacity:30}).returning();
   const [pattern]=await tx.insert(schedulePatterns).values({institutionId:unit.id,sectionId:section.id,roomId:room.id,weekday:6,startMinute:420,endMinute:540}).returning();
   const occ={institutionId:unit.id,sectionId:section.id,patternId:pattern.id,onDate:'2026-10-17'};
   await tx.insert(classOccurrences).values(occ);
   await tx.insert(classOccurrences).values(occ);
  })).rejects.toThrow();
 });
 afterAll(async()=>{await pool.end()});
});
