import {SiiPageIntro} from '@/components/ui/sii-kit';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,authorizeInstitution } from '@/shared/auth/session';

import AcademicOperations from '@/components/academic-operations';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function AcademicOperationsPage({params}:Props){
 const identity=await getIdentity();
 if(!identity)redirect('/login');
 if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const authorization=await authorizeInstitution(institutionId,'academic.manage');
 const access=authorization?.access;if(!access)notFound();
 return <>
  <SiiPageIntro eyebrow="CONTROL ESCOLAR" title="Operación académica" description={access.institutionName+' · Oferta, grupos e inscripciones.'} actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}/>
  <AcademicOperations institutionId={institutionId}/>
 </>;
}
