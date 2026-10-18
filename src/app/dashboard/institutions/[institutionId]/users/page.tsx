import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';

import InstitutionUsers from '@/components/institution-users';
export const dynamic='force-dynamic';
export default async function UsersPage({params}:{params:Promise<{institutionId:string}>}){
 const user=await getIdentity();if(!user)redirect('/login');
 const {institutionId}=await params,access=(await getInstitutionAccess(user.id)).find(item=>item.institutionId===institutionId);if(!access)notFound();
 return <><div className="sii-page-eyebrow">ADMINISTRACIÓN INSTITUCIONAL <span className="sii-page-eyebrow-line"/></div><div className="sii-page-heading"><div><h1>Usuarios<span className="sii-welcome-period">.</span></h1><p>{access.institutionName} · Perfiles, membresías y cambios auditados.</p></div><Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link></div><InstitutionUsers institutionId={institutionId}/></>;
}
