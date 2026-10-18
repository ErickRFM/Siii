import Link from 'next/link';
import {notFound, redirect} from 'next/navigation';
import {getIdentity} from '@/shared/auth/session';
import {uuid} from '@/shared/auth/validation';
import {getInstitutionManagementPageAccess} from '@/shared/institution-admin/access';

import InstitutionAdministration from '@/components/institution-admin';

export const dynamic = 'force-dynamic';

export default async function InstitutionAdministrationPage({params}: {params: Promise<{institutionId: string}>}) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const {institutionId} = await params;
  if (!uuid.safeParse(institutionId).success) notFound();
  const access = await getInstitutionManagementPageAccess(institutionId);
  if (!access) notFound();
  return <>
    <div className="sii-page-eyebrow">GESTIÓN AUTORIZADA <span className="sii-page-eyebrow-line"/></div>
    <div className="sii-page-heading"><div><h1>Administración institucional<span className="sii-welcome-period">.</span></h1><p>{access.institution.name} · Configuración, estado e historial auditado.</p></div><Link href="/dashboard" className="sii-outline-button">← Mis instituciones</Link></div>
    <InstitutionAdministration key={institutionId} initialInstitution={access.institution} actions={access.actions}/>
  </>;
}
