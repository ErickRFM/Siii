import {redirect} from 'next/navigation';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';
import SiiAppShell from '@/components/sii-app-shell';

export const dynamic='force-dynamic';

/** Shared navigation; individual pages still enforce institutional access. */
export default async function DashboardLayout({children}:{children:React.ReactNode}){
  const user=await getIdentity();
  if(!user)redirect('/login');
  const institutions=await getInstitutionAccess(user.id);
  const defaultInstitutionId=institutions.length===1?institutions[0].institutionId:undefined;
  return <SiiAppShell actorId={user.id} firstName={user.firstName} fullName={`${user.firstName} ${user.lastName}`}
    defaultInstitutionId={defaultInstitutionId}>{children}</SiiAppShell>;
}
