import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';
import SiiAppShell from '@/components/sii-app-shell';
import {PERSONAL_ENTRY_ROLES} from '@/shared/navigation/dashboard-entry';

export const dynamic='force-dynamic';

/** Shared navigation; individual pages still enforce institutional access. */
export default async function DashboardLayout({children}:{children:React.ReactNode}){
  const user=await getIdentity();
  if(!user)redirect('/login');
  const institutions=await getInstitutionAccess(user.id);
  const defaultInstitutionId=institutions.length===1?institutions[0].institutionId:undefined;
  return <SiiAppShell actorId={user.id} firstName={user.firstName} fullName={`${user.firstName} ${user.lastName}`}
    personalAccount={institutions.some(item=>item.roles.some(role=>role==='student'||role==='teacher'))&&institutions.every(item=>item.roles.every(role=>PERSONAL_ENTRY_ROLES.includes(role)))}
    institutionLabels={Object.fromEntries(institutions.map(item=>[item.institutionId,item.institutionName]))}
    initialSidebarOpen={(await cookies()).get('sidebar_state')?.value!=='false'} defaultInstitutionId={defaultInstitutionId}>{children}</SiiAppShell>;
}
