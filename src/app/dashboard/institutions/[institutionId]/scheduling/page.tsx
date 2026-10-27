import {SiiPageIntro} from '@/components/ui/sii-kit';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity,authorizeInstitution } from '@/shared/auth/session';

import SchedulingStudio from '@/components/scheduling-studio';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>};
export default async function SchedulingPage({params}:Props){
 const user=await getIdentity();if(!user)redirect('/login');
 if(user.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const authorization=await authorizeInstitution(institutionId,'academic.manage');
 const access=authorization?.access;if(!access)notFound();
 return <>
  <SiiPageIntro eyebrow="COORDINACIÓN · HORARIOS" title="Planificador institucional" description={access.institutionName+' · Aulas, clases recurrentes y ocurrencias fechadas.'} actions={<Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link>}/>
  <SchedulingStudio institutionId={institutionId}/>
 </>;
}
