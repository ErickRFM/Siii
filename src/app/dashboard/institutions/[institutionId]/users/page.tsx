import {SiiPageIntro} from '@/components/ui/sii-kit';
import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';

import InstitutionUsers from '@/components/institution-users';
export const dynamic='force-dynamic';
export default async function UsersPage({params}:{params:Promise<{institutionId:string}>}){
 const user=await getIdentity();if(!user)redirect('/login');
 const {institutionId}=await params,access=(await getInstitutionAccess(user.id)).find(item=>item.institutionId===institutionId);if(!access)notFound();
 return <><SiiPageIntro eyebrow="ADMINISTRACIÓN INSTITUCIONAL" title="Usuarios" description={access.institutionName+' · Perfiles, membresías y cambios auditados.'} actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}/>
  <InstitutionUsers institutionId={institutionId}/></>;
}
