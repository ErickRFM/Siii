import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,getInstitutionAccess } from '@/shared/auth/session';
import { hasPermission } from '@/shared/auth/roles';
import SiiAppShell from '@/components/sii-app-shell';
import TeacherGradebook from '@/components/teacher-gradebook';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function GradingPage({params}:Props){
 const user=await getIdentity();
 if(!user)redirect('/login');
 if(user.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const access=(await getInstitutionAccess(user.id)).find(x=>x.institutionId===institutionId);
 if(!access||!hasPermission(access.roles,'grades.publish'))notFound();
 return <SiiAppShell active="academic" firstName={user.firstName} fullName={user.firstName+' '+user.lastName} institutionId={institutionId}>
  <div className="sii-page-eyebrow">DOCENCIA · EVALUACIÓN <span className="sii-page-eyebrow-line"/></div>
  <div className="sii-page-heading"><div><h1>Calificaciones<span className="sii-welcome-period">.</span></h1>
   <p>{access.institutionName} · Actas autorizadas exclusivamente para docentes asignados.</p></div>
   <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link></div>
  <TeacherGradebook institutionId={institutionId}/>
 </SiiAppShell>;
}
