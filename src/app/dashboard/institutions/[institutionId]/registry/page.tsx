import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,getInstitutionAccess } from '@/shared/auth/session';
import { hasPermission } from '@/shared/auth/roles';
import SiiAppShell from '@/components/sii-app-shell';
import SchoolRegistry from '@/components/school-registry';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function RegistryPage({params}:Props){
 const identity=await getIdentity();
 if(!identity)redirect('/login');
 if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const access=(await getInstitutionAccess(identity.id)).find(a=>a.institutionId===institutionId);
 if(!access||!hasPermission(access.roles,'academic.manage'))notFound();
 return <SiiAppShell active="academic" firstName={identity.firstName} fullName={identity.firstName+' '+identity.lastName} institutionId={institutionId}>
  <div className="sii-page-eyebrow">CONTROL ESCOLAR <span className="sii-page-eyebrow-line"/></div>
  <div className="sii-page-heading"><div><h1>Personas académicas<span className="sii-welcome-period">.</span></h1>
   <p>{access.institutionName} · Expedientes de alumnos y docentes, con auditoría.</p></div>
   <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Volver</Link></div>
  <SchoolRegistry institutionId={institutionId}/>
 </SiiAppShell>;
}
