import {notFound,redirect} from 'next/navigation';
import {getIdentity,authorizeCapability} from '@/shared/auth/session';
import FinancialWorkspace from '@/components/financial-workspace';
export const dynamic='force-dynamic';
export default async function FinancialPage({params}:{params:Promise<{institutionId:string}>}){
 const user=await getIdentity();if(!user)redirect('/login');if(user.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params,context=await authorizeCapability(institutionId,'institutions.manage');if(!context)notFound();
 return <FinancialWorkspace key={institutionId} institutionId={institutionId} institutionName={context.access.institutionName}/>;
}
