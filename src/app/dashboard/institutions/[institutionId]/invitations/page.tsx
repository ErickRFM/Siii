import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getIdentity,getInstitutionAccess} from '@/shared/auth/session';

import InstitutionInvitations from '@/components/institution-invitations';
export const dynamic='force-dynamic';
export default async function InvitationsPage({params}:{params:Promise<{institutionId:string}>}){
 const user=await getIdentity();if(!user)redirect('/login');
 const {institutionId}=await params,access=(await getInstitutionAccess(user.id)).find(item=>item.institutionId===institutionId);if(!access)notFound();
 return <><div className="sii-page-eyebrow">ACCESO INSTITUCIONAL <span className="sii-page-eyebrow-line"/></div><div className="sii-page-heading"><div><h1>Invitaciones<span className="sii-welcome-period">.</span></h1><p>{access.institutionName} · Acceso por consentimiento, ámbito y vigencia.</p></div><Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link></div><InstitutionInvitations institutionId={institutionId}/></>;
}
