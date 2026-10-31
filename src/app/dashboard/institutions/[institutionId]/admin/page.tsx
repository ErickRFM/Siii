import Link from 'next/link';
import {notFound, redirect} from 'next/navigation';
import {getIdentity} from '@/shared/auth/session';
import {uuid} from '@/shared/auth/validation';
import {getInstitutionManagementPageAccess} from '@/shared/institution-admin/access';
import {SiiPageIntro} from '@/components/ui/sii-kit';

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
    <SiiPageIntro
      eyebrow="GESTIÓN AUTORIZADA"
      title="Administración institucional"
      description={`${access.institution.name} · Configuración, estado e historial auditado.`}
      actions={<Link href="/dashboard" className="sii-outline-button">← Mis instituciones</Link>}
    />
    <InstitutionAdministration key={institutionId} initialInstitution={access.institution} actions={access.actions}/>
  </>;
}
