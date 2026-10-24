import {describe,it,expect} from 'vitest';import {academicModuleLinks} from '@/shared/navigation/academic-modules';
const manage=['programs','curricula','courses','campuses','terms'].map(x=>x+'.manage');
describe('consolidated permission navigation',()=>{
 it('shows every integrated administration module',()=>{expect(academicModuleLinks([...manage,'grades.manage']).map(x=>x.id)).toEqual(['registry','operations','grading','scheduling','services'])});
 it('shows teachers only their actual gradebook',()=>{expect(academicModuleLinks(['grades.manage']).map(x=>x.id)).toEqual(['grading'])});
 it('does not flatten scoped or read-only access into management',()=>{expect(academicModuleLinks(['programs.manage','programs.read','grades.read'])).toEqual([])});
 it('connects the existing admissions screen only with its own capability',()=>{
  expect(academicModuleLinks(['admissions.manage']).map(x=>x.id)).toEqual(['admissions']);
  expect(academicModuleLinks(manage).map(x=>x.id)).not.toContain('admissions');
 });
});
