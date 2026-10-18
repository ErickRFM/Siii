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
  <div className="sii-page-eyebrow">CONTROL ESCOLAR <span className="sii-page-eyebrow-line"/></div>
  <div className="sii-page-heading"><div><h1>Personas académicas<span className="sii-welcome-period">.</span></h1>
   <p>{access.institutionName} · Expedientes de alumnos y docentes, con auditoría.</p></div>
   <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Volver</Link></div>
  <SchoolRegistry key={institutionId} institutionId={institutionId}/>
 </>;
}
