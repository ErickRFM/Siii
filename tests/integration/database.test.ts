import { afterAll,describe,it,expect } from 'vitest';
import { sql, and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { institutions, people, platformUsers, institutionMemberships, academicPrograms, academicCourses, curriculumVersions } from '../../db/schema';
import { db,pool } from '@/infrastructure/database';
describe('Postgres foundation',()=>{
 it('runs real SQL',async()=>{const result=await db.execute(sql`SELECT 1 AS ok`);expect(result.rows[0]).toHaveProperty('ok',1)});
 it('has institutional membership schema',async()=>{
  const res=await db.execute(sql`SELECT to_regclass('public.institution_memberships') AS table_name`);
  expect(res.rows[0]?.table_name).toBe('institution_memberships');
 });
 it('does not mutate another institution membership through tenant-scoped predicates',async()=>{
   const suffix=randomUUID().slice(0,12);
   await expect(db.transaction(async(tx)=>{
     const units=await tx.insert(institutions).values([
       {name:'QA tenant A',code:`qa-a-${suffix}`},
       {name:'QA tenant B',code:`qa-b-${suffix}`},
     ]).returning({id:institutions.id});
     const [person]=await tx.insert(people).values({firstName:'QA',lastName:'Test'}).returning({id:people.id});
     const [user]=await tx.insert(platformUsers).values({personId:person.id,username:`qa-${suffix}`}).returning({id:platformUsers.id});
     const [member]=await tx.insert(institutionMemberships).values({institutionId:units[0].id,userId:user.id}).returning({id:institutionMemberships.id});
     const unauthorized=await tx.update(institutionMemberships).set({status:'suspended'})
       .where(and(eq(institutionMemberships.id,member.id),eq(institutionMemberships.institutionId,units[1].id)))
       .returning({id:institutionMemberships.id});
     expect(unauthorized).toHaveLength(0);
     const authorized=await tx.update(institutionMemberships).set({status:'suspended'})
       .where(and(eq(institutionMemberships.id,member.id),eq(institutionMemberships.institutionId,units[0].id)))
       .returning({id:institutionMemberships.id});
     expect(authorized).toHaveLength(1);
     // Roll back all synthetic fixtures: staging and CI remain isolated.
     throw new Error('fixture rollback');
   })).rejects.toThrow('fixture rollback');
 });
 it('enforces unique academic catalog codes per institution but allows the same code across institutions', async () => {
  const suffix=randomUUID().slice(0,12);
  await expect(db.transaction(async tx => {
    const units=await tx.insert(institutions).values([
      {name:'F3 Test Alpha',code:`qa-f3-a-${suffix}`},
      {name:'F3 Test Beta',code:`qa-f3-b-${suffix}`},
    ]).returning({id:institutions.id});
    const values=units.map(unit=>({institutionId:unit.id,code:'ING-SIS',name:'Ingeniería en Sistemas',level:'ingenieria',modality:'presencial'}));
    await tx.insert(academicPrograms).values(values);
    const onlyAlpha=await tx.select().from(academicPrograms).where(eq(academicPrograms.institutionId,units[0].id));
    expect(onlyAlpha).toHaveLength(1);
    const onlyBeta=await tx.select().from(academicPrograms).where(eq(academicPrograms.institutionId,units[1].id));
    expect(onlyBeta).toHaveLength(1);
    const [course]=await tx.insert(academicCourses).values({institutionId:units[0].id,code:'MAT101',name:'Cálculo',credits:6}).returning();
    const cannotTouch=await tx.update(academicCourses).set({status:'archived'}).where(and(eq(academicCourses.id,course.id),eq(academicCourses.institutionId,units[1].id))).returning();
    expect(cannotTouch).toHaveLength(0);
    throw new Error('fixture rollback');
  })).rejects.toThrow('fixture rollback');
 });
 it('rejects repeated program codes within the same institution', async () => {
   const suffix=randomUUID().slice(0,12);
   await expect(db.transaction(async tx => {
     const [unit]=await tx.insert(institutions).values({name:'Duplicate Validation',code:`qa-duplicate-${suffix}`}).returning();
     const program={institutionId:unit.id,code:'SYS101',name:'Programa A',level:'ingenieria',modality:'presencial'};
     await tx.insert(academicPrograms).values(program);
     await tx.insert(academicPrograms).values({...program,name:'Programa B'});
   })).rejects.toThrow();
 });
 it('rejects credits outside their database range', async () => {
   const suffix=randomUUID().slice(0,12);
   await expect(db.transaction(async tx => {
     const [unit]=await tx.insert(institutions).values({name:'Credit Validation',code:`qa-credits-${suffix}`}).returning();
     await tx.insert(academicCourses).values({institutionId:unit.id,code:'BAD101',name:'Bad credit fixture',credits:31});
   })).rejects.toThrow();
 });
 it('rejects plans referencing a program in a different institution', async () => {
   const suffix=randomUUID().slice(0,12);
   await expect(db.transaction(async tx => {
     const units=await tx.insert(institutions).values([
       {name:'F3 FK Alpha',code:`qa-fk-a-${suffix}`},
       {name:'F3 FK Beta',code:`qa-fk-b-${suffix}`},
     ]).returning({id:institutions.id});
     const [program]=await tx.insert(academicPrograms).values({
       institutionId:units[0].id,code:'ING-SIS',name:'Sistemas',level:'ingenieria',modality:'presencial',
     }).returning();
     // Must fail even if a future API forgets its application-level scope guard.
     await tx.insert(curriculumVersions).values({institutionId:units[1].id,programId:program.id,version:'2026-A'});
   })).rejects.toThrow();
 });
 afterAll(async()=>{await pool.end()});
});
