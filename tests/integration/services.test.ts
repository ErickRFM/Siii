import { afterAll,describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db,pool } from '@/infrastructure/database';
import { institutions,academicPrograms,institutionalStudents,studentServiceRequests,institutionalWorkshops } from '../../db/schema';

describe('R5 academic services in PostgreSQL',()=>{
 it('prohibits a student request from referencing another university student',async()=>{
  await expect(db.transaction(async tx=>{
   const suffix=randomUUID().slice(0,12);
   const [a,b]=await tx.insert(institutions).values([{name:'Student services A',code:'rs-a-'+suffix},{name:'Student services B',code:'rs-b-'+suffix}]).returning();
   const [program]=await tx.insert(academicPrograms).values({institutionId:a.id,code:'ING',name:'Ingenieria',level:'ingenieria',modality:'presencial'}).returning();
   const [student]=await tx.insert(institutionalStudents).values({institutionId:a.id,programId:program.id,enrollmentNumber:'A001',firstName:'Ana',lastName:'Perez'}).returning();
   await tx.insert(studentServiceRequests).values({institutionId:b.id,studentId:student.id,requestType:'CERTIFICATE',summary:'Constancia escolar'});
  })).rejects.toThrow();
 });
 it('rejects invalid workshop capacity even if API validation is bypassed',async()=>{
  await expect(db.transaction(async tx=>{
   const suffix=randomUUID().slice(0,12);
   const [unit]=await tx.insert(institutions).values({name:'Workshops A',code:'rs-c-'+suffix}).returning();
   await tx.insert(institutionalWorkshops).values({institutionId:unit.id,title:'Taller',description:'Programación Android',startsAt:new Date('2026-11-10T13:00:00Z'),
    endsAt:new Date('2026-11-10T15:00:00Z'),capacity:0});
  })).rejects.toThrow();
 });
 afterAll(async()=>{await pool.end()});
});
