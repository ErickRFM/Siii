import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/infrastructure/database';
import { institutions,academicTerms,academicCourses,academicSections } from '../../db/schema';

describe('R2 PostgreSQL section integrity',()=>{
 it('does not permit a section to use another university\'s course',async()=>{
  const s=randomUUID().slice(0,12);
  await expect(db.transaction(async tx=>{
   const units=await tx.insert(institutions).values([
    {code:'sec-a-'+s,name:'Section Alpha'}, {code:'sec-b-'+s,name:'Section Beta'},
   ]).returning();
   const [course]=await tx.insert(academicCourses).values({institutionId:units[0].id,code:'PRG',name:'Programación',credits:6}).returning();
   const [term]=await tx.insert(academicTerms).values({
    institutionId:units[1].id,code:'2026-A',name:'Septiembre-Diciembre',
    startDate:new Date('2026-09-01T12:00:00Z'),endDate:new Date('2026-12-10T12:00:00Z')
   }).returning();
   await tx.insert(academicSections).values({institutionId:units[1].id,termId:term.id,courseId:course.id,code:'9A',capacity:30});
  })).rejects.toThrow();
 });
 it('rejects zero capacity even when SQL bypasses HTTP validation',async()=>{
  const s=randomUUID().slice(0,12);
  await expect(db.transaction(async tx=>{
   const [unit]=await tx.insert(institutions).values({code:'sec-c-'+s,name:'Section Gamma'}).returning();
   const [course]=await tx.insert(academicCourses).values({institutionId:unit.id,code:'PRG',name:'Programación',credits:6}).returning();
   const [term]=await tx.insert(academicTerms).values({
    institutionId:unit.id,code:'2026-A',name:'Septiembre-Diciembre',
    startDate:new Date('2026-09-01T12:00:00Z'),endDate:new Date('2026-12-10T12:00:00Z')
   }).returning();
   await tx.insert(academicSections).values({institutionId:unit.id,termId:term.id,courseId:course.id,code:'9A',capacity:0});
  })).rejects.toThrow();
 });
});
