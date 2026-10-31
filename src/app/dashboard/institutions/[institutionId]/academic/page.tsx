import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { SiiPageIntro } from '@/components/ui/sii-kit';

import AcademicCatalog from '@/components/academic-catalog';

export const dynamic = 'force-dynamic';
type PageProps = { params: Promise<{ institutionId: string }> };

export default async function AcademicCatalogPage({ params }: PageProps) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/dashboard/security');
  const { institutionId } = await params;
  const access = (await getInstitutionAccess(user.id)).find(item => item.institutionId === institutionId);
  if (!access) notFound();
  return (
    <>
      <SiiPageIntro
        eyebrow="CATÁLOGO INSTITUCIONAL"
        title="Catálogo académico"
        description={`${access.institutionName} · Consulta los programas, materias, campus, periodos y planes disponibles dentro de tu ámbito.`}
        actions={<Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link>}
      />
      <AcademicCatalog institutionId={institutionId} />
    </>
  );
}
