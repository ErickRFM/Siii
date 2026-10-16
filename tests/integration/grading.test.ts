import { afterAll,describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db,pool } from '@/infrastructure/database';
import { institutions,academicPrograms,academicCourses,academicTerms,
 institutionalStudents,academicSections,assessmentComponents,assessmentScores,
 gradePublications } from '../../db/schema';

async function setup(tx:Parameters<Parameters<typeof db.transaction>[0]>[0]){
 const s=randomUUID().slice(0,12);
 const units=await tx.insert(institutions).values([{code:'grade-a-'+s,name:'Grade alpha'},{code:'grade-b-'+s,name:'Grade beta'}]).returning();
 const [program]=await tx.insert(academicPrograms).values({institutionId:units[0].id,code:'ING',name:'Ingenieria',level:'ingenieria',modality:'presencial'}).returning();
 const [course]=await tx.insert(academicCourses).values({institutionId:units[0].id,code:'MAT',name:'Matematicas',credits:6}).returning();
 const [term]=await tx.insert(academicTerms).values({institutionId:units[0].id,code:'2026-A',name:'Ciclo',startDate:'2026-09-01',endDate:'2026-12-10'}).returning();
 const [student]=await tx.insert(institutionalStudents).values({institutionId:units[0].id,programId:program.id,enrollmentNumber:'S001',firstName:'Sara',lastName:'Perez'}).returning();
 const [section]=await tx.insert(academicSections).values({institutionId:units[0].id,termId:term.id,courseId:course.id,code:'9A',capacity:30}).returning();
 const [component]=await tx.insert(assessmentComponents).values({institutionId:units[0].id,sectionId:section.id,code:'P1',title:'Parcial uno',weight:100}).returning();
 return {units,student,section,component};
}
describe('R3 gradebook database constraints',()=>{
 it('rejects a score that links to a student from another institution',async()=>{
  await expect(db.transaction(async tx=>{
   const {units,component}=await setup(tx);
   const [program]=await tx.insert(academicPrograms).values({institutionId:units[1].id,code:'ING',name:'Ingenieria',level:'ingenieria',modality:'presencial'}).returning();
   const [student]=await tx.insert(institutionalStudents).values({institutionId:units[1].id,programId:program.id,enrollmentNumber:'S002',firstName:'Rosa',lastName:'Luna'}).returning();
   await tx.insert(assessmentScores).values({institutionId:units[0].id,componentId:component.id,studentId:student.id,scoreHundredths:900,updatedBy:randomUUID()});
  })).rejects.toThrow();
 });
 it('rejects a grade above 10.00 at database level',async()=>{
  await expect(db.transaction(async tx=>{
   const {units,student,component}=await setup(tx);
   await tx.insert(assessmentScores).values({institutionId:units[0].id,componentId:component.id,studentId:student.id,scoreHundredths:1001,updatedBy:randomUUID()});
  })).rejects.toThrow();
 });
 it('rejects duplicate publication operation ids within one institution',async()=>{
  await expect(db.transaction(async tx=>{
   const {units,section}=await setup(tx);
   const operationId=randomUUID(),publishedBy=randomUUID();
   await tx.insert(gradePublications).values({institutionId:units[0].id,sectionId:section.id,operationId,publishedBy,version:1});
   await tx.insert(gradePublications).values({institutionId:units[0].id,sectionId:section.id,operationId,publishedBy,version:2});
  })).rejects.toThrow();
 });
 afterAll(async()=>{await pool.end()});
});
