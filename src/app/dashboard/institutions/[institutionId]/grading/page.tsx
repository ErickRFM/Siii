import {teachingContext} from '@/modules/grading/teaching-scope';
import Link from 'next/link';
import { notFound,redirect } from 'next/navigation';
import { getIdentity } from '@/shared/auth/session';
import {z} from 'zod';
import {SiiPageIntro} from '@/components/ui/sii-kit';

import TeacherGradebook from '@/components/teacher-gradebook';
export const dynamic='force-dynamic';
type Props={params:Promise<{institutionId:string}>;searchParams:Promise<{sectionId?:string}>};
export default async function GradingPage({params,searchParams}:Props){
 const user=await getIdentity();
 if(!user)redirect('/login');
 if(user.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 const authorization=await teachingContext(institutionId);
 const access=authorization?.access;if(!access)notFound();
 const requested=(await searchParams).sectionId,initialSectionId=z.uuid().safeParse(requested).success?requested:undefined;
 return <>
  <SiiPageIntro
   eyebrow="DOCENCIA · EVALUACIÓN"
   title="Calificaciones"
   description={`${access.institutionName} · Actas autorizadas exclusivamente para docentes asignados.`}
   actions={<Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link>}
  />
  <TeacherGradebook key={`${institutionId}:${initialSectionId??''}`} institutionId={institutionId} initialSectionId={initialSectionId}/>
 </>;
}
