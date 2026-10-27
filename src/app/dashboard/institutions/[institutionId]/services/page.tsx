import {SiiPageIntro} from '@/components/ui/sii-kit';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,authorizeInstitution } from '@/shared/auth/session';

import UniversityServices from '@/components/university-services';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function UniversityServicesPage({params}:Props){
 const user=await getIdentity();if(!user)redirect('/login');
 if(user.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const authorization=await authorizeInstitution(institutionId,'academic.manage');
 const access=authorization?.access;if(!access)notFound();
 return <>
  <SiiPageIntro eyebrow="SERVICIOS UNIVERSITARIOS" title="Atención institucional" description={access.institutionName+' · Avisos, trámites y talleres.'} actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}/>
  <UniversityServices institutionId={institutionId}/>
 </>;
}
