import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { SiiPageIntro } from '@/components/ui/sii-kit';

import InstitutionRoles from '@/components/institution-roles';

export const dynamic = 'force-dynamic';
export default async function RolesPage({ params }: { params: Promise<{ institutionId: string }> }) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const { institutionId } = await params;
  const access = (await getInstitutionAccess(user.id)).find(item => item.institutionId === institutionId);
  if (!access) notFound();
  return <>
    <SiiPageIntro
      eyebrow="ACCESO INSTITUCIONAL"
      title="Roles y ámbitos"
      description={`${access.institutionName} · Concesiones por institución, programa o campus.`}
      actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}
    />
    <InstitutionRoles institutionId={institutionId}/>
  </>;
}
