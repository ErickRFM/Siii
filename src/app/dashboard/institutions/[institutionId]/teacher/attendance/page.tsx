import Link from 'next/link';
import {institutionalResultsEnabled} from '@/integrations/companion/attendance-history';
import {notFound,redirect} from 'next/navigation';
import {getIdentity} from '@/shared/auth/session';
import {personalContext} from '@/modules/portal/read-model';
import {attendanceSession} from '@/shared/auth/attendance-session';
import InstitutionalAttendance from '@/components/institutional-attendance';
import {SiiPageIntro} from '@/components/ui/sii-kit';
export const dynamic='force-dynamic';
export default async function AttendancePage({params}:{params:Promise<{institutionId:string}>}){
 const identity=await getIdentity();if(!identity)redirect('/login');if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params,context=await personalContext(institutionId,'teacher');if(!context||!institutionalResultsEnabled(institutionId))notFound();
 return <div className="sii-workspace space-y-6"><SiiPageIntro eyebrow="PORTAL DOCENTE" title="Asistencia de mis grupos" description={context.access.institutionName} actions={<Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}/teacher`}>Volver a mi portal</Link>}/><InstitutionalAttendance key={attendanceSession(context.identity)+':'+institutionId} institutionId={institutionId} session={attendanceSession(context.identity)} kind="teacher"/></div>;
}
