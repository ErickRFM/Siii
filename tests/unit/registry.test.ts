import { describe,it,expect } from 'vitest';
import { registryCreate, registryResource, registryUpdate, canEnroll } from '@/modules/registry/validation';
const id='a84b0d45-a3a0-4fe3-ab73-71ed9779848d';
describe('R1/R2 institutional validation',()=>{
  it('normalizes enrollment numbers and permits a valid student',()=>{
    const v=registryCreate.students.parse({enrollmentNumber:'al-0001',programId:id,firstName:'Ana',lastName:'Rojas',institutionalEmail:'ana@example.edu'});
    expect(v.enrollmentNumber).toBe('AL-0001');
  });
  it('rejects malformed identities and unsupported arbitrary keys',()=>{
    expect(registryCreate.students.safeParse({enrollmentNumber:'a/',programId:id,firstName:'Ana',lastName:'Rojas'}).success).toBe(false);
    expect(registryCreate.teachers.safeParse({employeeNumber:'TEC01',firstName:'Sol',lastName:'Cruz',isSuperAdmin:true}).success).toBe(false);
  });
  it('rejects invalid section capacity and malformed IDs',()=>{
    expect(registryCreate.sections.safeParse({termId:id,courseId:id,code:'9A',capacity:0}).success).toBe(false);
    expect(registryCreate.sections.safeParse({termId:id,courseId:id,code:'9A',capacity:501}).success).toBe(false);
    expect(registryCreate.sections.safeParse({termId:id,courseId:id,code:'9A',capacity:30}).success).toBe(true);
  });
  it('blocks enrollment on full or closed sections and suspended students',()=>{
    expect(canEnroll('active','open',9,10)).toBe(true);
    expect(canEnroll('active','open',10,10)).toBe(false);
    expect(canEnroll('withdrawn','open',0,10)).toBe(false);
    expect(canEnroll('active','closed',0,10)).toBe(false);
  });
  it('permits withdrawal but no arbitrary enrollment status change',()=>{
    expect(registryUpdate.enrollments.safeParse({id,status:'withdrawn'}).success).toBe(true);
    expect(registryUpdate.enrollments.safeParse({id,status:'enrolled'}).success).toBe(false);
    expect(registryResource.safeParse('users').success).toBe(false);
  });
});
