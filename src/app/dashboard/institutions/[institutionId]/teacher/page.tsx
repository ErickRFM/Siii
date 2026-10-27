import {notFound,redirect} from 'next/navigation';
import {getIdentity} from '@/shared/auth/session';
import {personalContext} from '@/modules/portal/read-model';
import PersonalPortal from '@/components/personal-portal';
export const dynamic='force-dynamic';
export default async function TeacherPage({params}:{params:Promise<{institutionId:string}>}){
 const user=await getIdentity();if(!user)redirect('/login');if(user.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params,context=await personalContext(institutionId,'teacher');if(!context)notFound();
 return <PersonalPortal key={institutionId} institutionId={institutionId} institutionName={context.access.institutionName} kind="teacher"/>;
}
