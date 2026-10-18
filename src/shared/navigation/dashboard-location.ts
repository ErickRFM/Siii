import type {AcademicModule} from './academic-modules';

export type DashboardActive=AcademicModule|'overview'|'security'|'institution'|'academic'|'roles'|'invitations'|'users'|'administration';
const SECTIONS:readonly DashboardActive[]=['academic','registry','operations','grading','scheduling','services','users','roles','invitations','administration'];

/** Projects navigation from its URL, never from an unfinished permission request. */
export function resolveDashboardLocation(pathname:string,defaultInstitutionId?:string):{active:DashboardActive;institutionId?:string}{
  const segments=pathname.split('/').filter(Boolean);
  if(segments[0]!=='dashboard')return {active:'overview'};
  if(segments[1]==='security')return {active:'security'};
  if(segments[1]==='institutions'&&segments[2]){
    const section=segments[3];
    return {institutionId:segments[2],active:section&&SECTIONS.includes(section as DashboardActive)?section as DashboardActive:'institution'};
  }
  return {active:'overview',institutionId:defaultInstitutionId};
}
