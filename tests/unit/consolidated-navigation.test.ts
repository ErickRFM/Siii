import {describe,it,expect} from 'vitest';import {academicModuleLinks} from '@/shared/navigation/academic-modules';
import {ACADEMIC_MANAGE_CAPABILITIES} from '@/shared/auth/capabilities';import {legacyCapabilities} from '@/shared/auth/institution-policy';
const manage=['programs','curricula','courses','campuses','terms'].map(x=>x+'.manage');
describe('consolidated permission navigation',()=>{
 it('shows every integrated administration module',()=>{expect(academicModuleLinks([...manage,'grades.manage']).map(x=>x.id)).toEqual(['registry','operations','grading','scheduling','services'])});
 it('shows teachers only their actual gradebook',()=>{expect(academicModuleLinks(['grades.manage']).map(x=>x.id)).toEqual(['grading'])});
 it('does not flatten scoped or read-only access into management',()=>{expect(academicModuleLinks(['programs.manage','programs.read','grades.read'])).toEqual([])});
 it('projects exactly the capabilities the academic.manage pages authorize with',()=>{
  expect([...ACADEMIC_MANAGE_CAPABILITIES].sort()).toEqual([...legacyCapabilities('academic.manage')].sort());
  for(const missing of manage)expect(academicModuleLinks(manage.filter(x=>x!==missing)).map(x=>x.id)).toEqual([]);
 });
 it('lists treasury and careers as institutional modules, each with the capability its page requires',()=>{
  expect(academicModuleLinks(['institutions.manage']).map(x=>x.id)).toEqual(['financials']);
  expect(academicModuleLinks(['groups.manage']).map(x=>x.id)).toEqual(['careers']);
  expect(academicModuleLinks(manage).map(x=>x.id)).not.toContain('financials');
 });
 it('connects the existing admissions screen only with its own capability',()=>{
  expect(academicModuleLinks(['admissions.manage']).map(x=>x.id)).toEqual(['admissions']);
  expect(academicModuleLinks(manage).map(x=>x.id)).not.toContain('admissions');
 });
});
