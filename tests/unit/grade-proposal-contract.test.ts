import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {parseGradeProposalContract,gradeProposalStates} from '@/integrations/companion/grade-proposal-contract';
function sample(){
 return {
  contract:'companero.grade_proposal.v1',operationId:randomUUID(),sourceVersion:1,
  sourceDigest:'a'.repeat(64),institutionId:randomUUID(),nativeClassroomId:'native-class-001',
  sectionId:randomUUID(),academicPeriodId:randomUUID(),teacherExternalId:'EMP-001',
  gradingPeriod:'C1',gradeScale:'MX_0_TO_10_HUNDREDTHS',
  rows:[{nativeStudentId:'native-student-001',studentSourceId:randomUUID(),gradeHundredths:875}],
 };
}
describe('grade proposal wire contract — NOT publication authority',()=>{
 it('accepts exact 0..10 fixed-point values and retains tenant and source version',()=>{
  const item=sample();expect(parseGradeProposalContract(item).success).toBe(true);
  expect(parseGradeProposalContract({...item,rows:[{...item.rows[0],gradeHundredths:0}]}).success).toBe(true);
  expect(parseGradeProposalContract({...item,rows:[{...item.rows[0],gradeHundredths:1000}]}).success).toBe(true);
 });
 it.each([-1,1001,4.75,Number.NaN,Number.POSITIVE_INFINITY])('rejects invalid hundredths %s',value=>{
  const item=sample();expect(parseGradeProposalContract({...item,rows:[{...item.rows[0],gradeHundredths:value}]}).success).toBe(false);
 });
 it('rejects duplicate official IDs and duplicate native IDs',()=>{
  const item=sample(),other={...item.rows[0],nativeStudentId:'native-student-002',studentSourceId:randomUUID()};
  expect(parseGradeProposalContract({...item,rows:[item.rows[0],{...other,studentSourceId:item.rows[0].studentSourceId}]}).success).toBe(false);
  expect(parseGradeProposalContract({...item,rows:[item.rows[0],{...other,nativeStudentId:item.rows[0].nativeStudentId}]}).success).toBe(false);
 });
 it('rejects unknown fields, forged empty identity, wrong contract and missing digest',()=>{
  const item=sample();
  for(const bad of [{...item,role:'superadmin'},{...item,sourceVersion:0},{...item,contract:'siii.snapshot.v1'},{...item,sourceDigest:'x'},{...item,rows:[]},{...item,institutionId:'other'}]){
   expect(parseGradeProposalContract(bad).success).toBe(false);
  }
 });
 it('bounds batch size and does not infer official publication from receipt',()=>{
  const item=sample();
  expect(parseGradeProposalContract({...item,rows:Array.from({length:501},(_,i)=>({nativeStudentId:'native-student-'+String(i).padStart(4,'0'),studentSourceId:randomUUID(),gradeHundredths:700}))}).success).toBe(false);
  expect(gradeProposalStates).toEqual(['RECEIVED','VALIDATED','REQUIRES_REVIEW','REJECTED','APPLIED']);
 });
});
