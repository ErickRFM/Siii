import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getIdentity} from '@/shared/auth/session';
import {personalContext} from '@/modules/portal/read-model';
import {attendanceSession} from '@/shared/auth/attendance-session';
import PersonalAttendance from '@/components/personal-attendance';
import {SiiPageIntro} from '@/components/ui/sii-kit';

export const dynamic='force-dynamic';
export default async function AttendancePage({params}:{params:Promise<{institutionId:string}>}){
 const identity=await getIdentity();if(!identity)redirect('/login');if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params,context=await personalContext(institutionId,'student');if(!context)notFound();
 return <div className="sii-workspace space-y-6"><SiiPageIntro eyebrow="PORTAL ESTUDIANTIL" title="Mi historial de asistencia" description={context.access.institutionName}/>
  <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}/student#inscripciones`}>Volver a mi portal</Link>
  <PersonalAttendance key={attendanceSession(context.identity)+':'+institutionId} institutionId={institutionId} session={attendanceSession(context.identity)}/>
 </div>;
}
