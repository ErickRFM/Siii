import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import SiiAppShell from '@/components/sii-app-shell';
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
    <SiiAppShell firstName={user.firstName} fullName={`${user.firstName} ${user.lastName}`} active="academic" institutionId={institutionId}>
      <div className="sii-page-eyebrow">GESTIÓN ACADÉMICA <span className="sii-page-eyebrow-line"/></div>
      <div className="sii-page-heading">
        <div><h1>Catálogo académico<span className="sii-welcome-period">.</span></h1>
          <p>{access.institutionName} · Administra programas, materias, campus, periodos y versiones de planes.</p></div>
        <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link>
      </div>
      <AcademicCatalog institutionId={institutionId} />
    </SiiAppShell>
  );
}
