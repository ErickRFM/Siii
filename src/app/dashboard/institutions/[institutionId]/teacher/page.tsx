import {institutionalResultsEnabled} from '@/integrations/companion/attendance-history';
import {notFound,redirect} from 'next/navigation';
import {getIdentity} from '@/shared/auth/session';
import {personalContext} from '@/modules/portal/read-model';
import TeacherPortal from '@/components/teacher-portal';
export const dynamic='force-dynamic';
export default async function TeacherPage({params}:{params:Promise<{institutionId:string}>}){
 const user=await getIdentity();if(!user)redirect('/login');if(user.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params,context=await personalContext(institutionId,'teacher');if(!context)notFound();
 return <TeacherPortal key={`${user.id}:${institutionId}`} actorId={user.id} institutionId={institutionId} institutionalResults={institutionalResultsEnabled()} institutionName={context.access.institutionName}/>;
}
