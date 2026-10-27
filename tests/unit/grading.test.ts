import { describe,expect,it } from 'vitest';
import { calculateWeightedGrade,gradeCommand,gradeLinkCreate } from '@/modules/grading/validation';
const id='a84b0d45-a3a0-4fe3-ab73-71ed9779848d';
describe('R3 grading policy',()=>{
 it('calculates deterministic 0–10 weighted score in integer hundredths',()=>{
  expect(calculateWeightedGrade([{scoreHundredths:975,weight:40},{scoreHundredths:850,weight:60}])).toBe(900);
  expect(calculateWeightedGrade([{scoreHundredths:0,weight:30},{scoreHundredths:1000,weight:70}])).toBe(700);
 });
 it('refuses incomplete or invalid weighting',()=>{
  expect(()=>calculateWeightedGrade([{scoreHundredths:950,weight:80}])).toThrow('WEIGHTS_MUST_EQUAL_100');
  expect(()=>calculateWeightedGrade([{scoreHundredths:1001,weight:100}])).toThrow('INVALID_COMPONENT');
 });
 it('accepts only valid grade commands, scale and idempotency keys',()=>{
  expect(gradeCommand.safeParse({kind:'component',sectionId:id,code:'parcial-1',title:'Parcial 1',weight:30}).success).toBe(true);
  expect(gradeCommand.safeParse({kind:'component',sectionId:id,code:'A',title:'P',weight:100}).success).toBe(false);
  expect(gradeCommand.safeParse({kind:'score',studentId:id,componentId:id,scoreHundredths:1050,expectedUpdatedAt:null}).success).toBe(false);
  expect(gradeCommand.safeParse({kind:'score',studentId:id,componentId:id,scoreHundredths:850,expectedUpdatedAt:null}).success).toBe(true);
  expect(gradeCommand.safeParse({kind:'publish',sectionId:id,operationId:'duplicate'}).success).toBe(false);
  expect(gradeCommand.safeParse({kind:'publish',sectionId:id,operationId:id}).success).toBe(true);
 });
 it('refuses arbitrary administrative powers in teacher linkage requests',()=>{
  expect(gradeLinkCreate.safeParse({teacherId:id,membershipId:id,role:'super_admin'}).success).toBe(false);
 });
});
