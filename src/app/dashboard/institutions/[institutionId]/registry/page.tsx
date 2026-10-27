import {SiiPageIntro} from '@/components/ui/sii-kit';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,authorizeInstitution } from '@/shared/auth/session';

import SchoolRegistry from '@/components/school-registry';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function RegistryPage({params}:Props){
 const identity=await getIdentity();
 if(!identity)redirect('/login');
 if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const authorization=await authorizeInstitution(institutionId,'academic.manage');
 const access=authorization?.access;if(!access)notFound();
 return <>
  <SiiPageIntro eyebrow="CONTROL ESCOLAR" title="Personas académicas" description={access.institutionName+' · Expedientes de estudiantes y docentes.'} actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}/>
  <SchoolRegistry key={institutionId} institutionId={institutionId}/>
 </>;
}
