import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { authorizeCapability, getIdentity } from '@/shared/auth/session';
import { uuid } from '@/shared/auth/validation';
import { SiiPageIntro } from '@/components/ui/sii-kit';
import CareerAdministration from '@/components/career-administration';

export const dynamic = 'force-dynamic';

export default async function CareerAdministrationPage({
  params,
}: { params: Promise<{ institutionId: string; programId: string }> }) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/dashboard/security');
  const { institutionId, programId } = await params;
  if (!uuid.safeParse(institutionId).success || !uuid.safeParse(programId).success) notFound();
  const actor = await authorizeCapability(institutionId, 'groups.manage', {
    institutionId, programId, status: 'active',
  });
  if (!actor) notFound();

  return <>
    <SiiPageIntro
      eyebrow="ADMINISTRACIÓN ACOTADA"
      title="Administración de carrera"
      description={`${actor.access.institutionName} · Estudiantes, docentes y grupos vinculados a esta carrera.`}
      actions={<Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}/careers`}>← Carreras</Link>}
    />
    <CareerAdministration institutionId={institutionId} programId={programId} />
  </>;
}
