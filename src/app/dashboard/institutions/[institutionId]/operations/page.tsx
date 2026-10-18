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
  <div className="sii-page-eyebrow">GESTIÓN ACADÉMICA <span className="sii-page-eyebrow-line"/></div>
  <div className="sii-page-heading"><div><h1>Operación académica<span className="sii-welcome-period">.</span></h1>
   <p>{access.institutionName} · Secciones, inscripción y carga docente.</p></div>
   <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Volver</Link></div>
  <AcademicOperations institutionId={institutionId}/>
 </>;
}
