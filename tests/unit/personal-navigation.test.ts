import {describe,it,expect} from 'vitest';
import {hasOnlyPersonalRoles,personalModuleLinks} from '@/shared/navigation/personal-modules';
import {can,ROLE_CAPABILITIES,type Subject,type P1Role} from '@/shared/auth/capabilities';
describe('personal capabilities and multirole navigation',()=>{
 it('retains institutional work for a student who also has Control Escolar, coordinator or administrator authority',()=>{
  for(const role of ['control_escolar','coordinator','admin','super_admin','tutor'])expect(hasOnlyPersonalRoles(['student',role])).toBe(false);
  expect(hasOnlyPersonalRoles(['student','teacher'])).toBe(true);
 });
 it('offers a scoped personal link without granting financial or institutional administration',()=>{
  expect(personalModuleLinks([],['student'],[{capabilities:['student.self.read']}]).map(item=>item.id)).toEqual(['student']);
  expect(personalModuleLinks(['student.self.read','teacher.self.read'],['student','teacher']).map(item=>item.id)).toEqual(['student','teacher']);
  expect(personalModuleLinks(['student.self.read','teacher.self.read','institutions.manage'],['admin']).map(item=>item.id)).toEqual(['financials']);
 });
 it('allows personal capabilities only with an owning relation, a live grant and a supported role',()=>{
  for(const role of Object.keys(ROLE_CAPABILITIES) as P1Role[]){
   const subject:Subject={id:'actor',active:true,mustChangePassword:false,grants:[{role,institutionId:'tenant',scopeType:'institution',scopeId:null,validUntil:null,revokedAt:null}]};
   for(const capability of ['student.self.read','teacher.self.read','student.requests.create'] as const){
    expect(can(subject,capability,{institutionId:'tenant',status:'active',ownerUserId:'other'})).toBe(false);
    expect(can(subject,capability,{institutionId:'other',status:'active',ownerUserId:'actor'})).toBe(false);
    const expected=capability==='teacher.self.read'?['teacher','admin','super_admin']:['student','admin','super_admin'];
    expect(can(subject,capability,{institutionId:'tenant',status:'active',ownerUserId:'actor'})).toBe(expected.includes(role));
   }
  }
 });
});
