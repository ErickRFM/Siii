import {SiiPageIntro} from '@/components/ui/sii-kit';
import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';

import InstitutionInvitations from '@/components/institution-invitations';
export const dynamic='force-dynamic';
export default async function InvitationsPage({params}:{params:Promise<{institutionId:string}>}){
 const user=await getIdentity();if(!user)redirect('/login');
 const {institutionId}=await params,access=(await getInstitutionAccess(user.id)).find(item=>item.institutionId===institutionId);if(!access)notFound();
 return <><SiiPageIntro eyebrow="ADMINISTRACIÓN INSTITUCIONAL" title="Invitaciones" description={access.institutionName+' · Accesos por invitación y seguimiento de entrega.'} actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}/>
  <InstitutionInvitations institutionId={institutionId}/></>;
}
