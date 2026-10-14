import { afterAll,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db,pool } from '@/infrastructure/database';
import { institutions,academicPrograms,institutionalStudents } from '../../db/schema';

describe('R1 PostgreSQL institution-scoped registry',()=>{
 it('rejects linking students to another institution programme',async()=>{
  const s=randomUUID().slice(0,12);
  await expect(db.transaction(async tx=>{
   const units=await tx.insert(institutions).values([
    {code:'reg-a-'+s,name:'Registry Alpha'},
    {code:'reg-b-'+s,name:'Registry Beta'},
   ]).returning();
   const [program]=await tx.insert(academicPrograms).values({
    institutionId:units[0].id,code:'SYS',name:'Sistemas',level:'ingenieria',modality:'presencial'
   }).returning();
   await tx.insert(institutionalStudents).values({
    institutionId:units[1].id,programId:program.id,enrollmentNumber:'A00001',
    firstName:'Ana',lastName:'Rojas'
   });
  })).rejects.toThrow();
 });
 it('rejects repeated registration within the same institution',async()=>{
  const s=randomUUID().slice(0,12);
  await expect(db.transaction(async tx=>{
   const [unit]=await tx.insert(institutions).values({code:'reg-c-'+s,name:'Registry Gamma'}).returning();
   const [program]=await tx.insert(academicPrograms).values({
    institutionId:unit.id,code:'SYS',name:'Sistemas',level:'ingenieria',modality:'presencial'
   }).returning();
   const record={institutionId:unit.id,programId:program.id,enrollmentNumber:'DUP00001',
     firstName:'Sara',lastName:'Reyes'};
   await tx.insert(institutionalStudents).values(record);
   await tx.insert(institutionalStudents).values(record);
  })).rejects.toThrow();
 });
 afterAll(async()=>{await pool.end()});
});
