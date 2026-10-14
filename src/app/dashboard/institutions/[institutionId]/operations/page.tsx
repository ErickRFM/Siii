import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,getInstitutionAccess } from '@/shared/auth/session';
import { hasPermission } from '@/shared/auth/roles';
import SiiAppShell from '@/components/sii-app-shell';
import AcademicOperations from '@/components/academic-operations';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function AcademicOperationsPage({params}:Props){
 const identity=await getIdentity();
 if(!identity)redirect('/login');
 if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const access=(await getInstitutionAccess(identity.id)).find(a=>a.institutionId===institutionId);
 if(!access||!hasPermission(access.roles,'academic.manage'))notFound();
 return <SiiAppShell active="academic" firstName={identity.firstName} fullName={identity.firstName+' '+identity.lastName} institutionId={institutionId}>
  <div className="sii-page-eyebrow">GESTIÓN ACADÉMICA <span className="sii-page-eyebrow-line"/></div>
  <div className="sii-page-heading"><div><h1>Operación académica<span className="sii-welcome-period">.</span></h1>
   <p>{access.institutionName} · Secciones, inscripción y carga docente.</p></div>
   <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Volver</Link></div>
  <AcademicOperations institutionId={institutionId}/>
 </SiiAppShell>;
}
