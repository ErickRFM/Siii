import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {SiiPageIntro} from '@/components/ui/sii-kit';
import {getIdentity,authorizeInstitution} from '@/shared/auth/session';
import {CompanionSyncConsole} from '@/components/companion/companion-sync-console';
export const dynamic='force-dynamic';

export default async function CompanionSyncPage({params}:{params:Promise<{institutionId:string}>}){
 const identity=await getIdentity();
 if(!identity)redirect('/login');
 if(identity.mustChangePassword)redirect('/dashboard/security');
 const {institutionId}=await params;
 // Same permission the companion-sync API requires; the API re-checks it on every request.
 const authorization=await authorizeInstitution(institutionId,'integrations.manage');
 if(!authorization)notFound();
 return <>
  <SiiPageIntro eyebrow="INTEGRACIONES" title="Compañero" description={authorization.access.institutionName+' · Estado de la entrega académica y recuperación de secciones.'}
   actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}/>
  <CompanionSyncConsole key={institutionId} institutionId={institutionId}/>
 </>;
}
