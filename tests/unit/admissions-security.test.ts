import {describe,it,expect} from 'vitest';
import {admissionApplicationSchema,applicantRegisterSchema} from '@/modules/admissions/validation';
import {randomUUID} from 'node:crypto';
describe('admissions input authority',()=>{
 it('rejects applicant ownership in a submitted application',()=>{
  expect(admissionApplicationSchema.safeParse({cycleId:randomUUID(),programId:randomUUID(),applicantId:randomUUID()}).success).toBe(false);
 });
 it('canonicalizes email before identity lookup',()=>{
  expect(applicantRegisterSchema.parse({email:' Person@Example.test ',firstName:'Test',lastName:'User',password:'Synthetic-long-password!'}).email).toBe('person@example.test');
 });
});
