import type {AcademicModule} from './academic-modules';

export type DashboardActive=AcademicModule|'overview'|'security'|'institution'|'academic'|'roles'|'invitations'|'users'|'administration'|'student'|'teacher'|'financials';
const SECTIONS:readonly DashboardActive[]=['academic','registry','operations','grading','scheduling','services','admissions','users','roles','invitations','administration','student','teacher','financials'];

/** Projects navigation from its URL, never from an unfinished permission request. */
export function resolveDashboardLocation(pathname:string,defaultInstitutionId?:string):{active:DashboardActive;institutionId?:string}{
  const segments=pathname.split('/').filter(Boolean);
  if(segments[0]!=='dashboard')return {active:'overview'};
  if(segments[1]==='security')return {active:'security',institutionId:defaultInstitutionId};
  if(segments[1]==='institutions'&&segments[2]){
    const section=segments[3];
    return {institutionId:segments[2],active:section==='admin'?'administration':section&&SECTIONS.includes(section as DashboardActive)?section as DashboardActive:'institution'};
  }
  return {active:'overview',institutionId:defaultInstitutionId};
}
