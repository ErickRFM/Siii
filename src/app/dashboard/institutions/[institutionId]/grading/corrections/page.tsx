import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {z} from 'zod';
import {institutionContext} from '@/shared/auth/session';
import {can} from '@/shared/auth/capabilities';
import {correctionPolicy,correctionStaff} from '@/modules/grading/correction-policy';
import GradeCorrections from '@/components/grade-corrections';
import {SiiPageIntro} from '@/components/ui/sii-kit';
export const dynamic='force-dynamic';
export default async function CorrectionsPage({params,searchParams}:{params:Promise<{institutionId:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {institutionId}=await params,context=await institutionContext(institutionId);if(!context)redirect('/login');
 if(!can(context.subject,'grades.manage',{institutionId,status:'active',assignedUserIds:[context.identity.id]})&&!correctionStaff(context.subject,institutionId,correctionPolicy(institutionId)))notFound();
 const query=await searchParams,candidate=z.object({sectionId:z.uuid(),studentId:z.uuid(),publicationId:z.uuid()}).safeParse(query);
 return <div className="sii-workspace siii-glass-workspace min-w-0 space-y-6"><SiiPageIntro eyebrow="PROCEDIMIENTO ACADÉMICO" title="Rectificaciones" description={context.access.institutionName} actions={<Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link>}/><GradeCorrections key={`${context.identity.id}:${institutionId}:${candidate.success?candidate.data.studentId+':'+candidate.data.publicationId:''}`} institutionId={institutionId} actorId={context.identity.id} candidate={candidate.success?candidate.data:undefined}/></div>;
}
