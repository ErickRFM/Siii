import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,authorizeInstitution } from '@/shared/auth/session';
import SiiAppShell from '@/components/sii-app-shell';
import UniversityServices from '@/components/university-services';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function UniversityServicesPage({params}:Props){
 const user=await getIdentity();if(!user)redirect('/login');
 if(user.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const authorization=await authorizeInstitution(institutionId,'academic.manage');
 const access=authorization?.access;if(!access)notFound();
 return <SiiAppShell active="services" firstName={user.firstName} fullName={user.firstName+' '+user.lastName} institutionId={institutionId}>
  <div className="sii-page-eyebrow">SERVICIOS UNIVERSITARIOS <span className="sii-page-eyebrow-line"/></div>
  <div className="sii-page-heading"><div><h1>Atención institucional<span className="sii-welcome-period">.</span></h1>
   <p>{access.institutionName} · Avisos, solicitudes y talleres autorizados.</p></div>
   <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link></div>
  <UniversityServices institutionId={institutionId}/>
 </SiiAppShell>;
}
