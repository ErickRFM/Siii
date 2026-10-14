import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { ROLE_LABELS, hasPermission } from '@/shared/auth/roles';
import SiiAppShell from '@/components/sii-app-shell';

export const dynamic = 'force-dynamic';
type PageProps = { params: Promise<{ institutionId: string }> };

export default async function InstitutionPage({ params }: PageProps) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  const { institutionId } = await params;
  const access = (await getInstitutionAccess(user.id)).find(inst => inst.institutionId === institutionId);
  if (!access) notFound();

  return (
    <SiiAppShell firstName={user.firstName} fullName={`${user.firstName} ${user.lastName}`} active="institution" institutionId={institutionId}>
      <div className="sii-page-eyebrow">CONTEXTO INSTITUCIONAL <span className="sii-page-eyebrow-line"/></div>
      <div className="sii-page-heading"><div><h1>{access.institutionName}<span className="sii-welcome-period">.</span></h1><p>Tu perfil y permisos vigentes en esta institución.</p></div>
        <Link href="/dashboard" className="sii-outline-button sii-back-link">← Mis instituciones</Link>
      </div>
      <div className="sii-security-layout">
        <section className="sii-panel sii-security-card">
          <span className="sii-section-kicker">INSTITUCIÓN AUTORIZADA</span>
          <h2>{access.institutionName}</h2><p>Clave institucional: {access.institutionCode}</p>
          <div className="sii-role-list">{access.roles.map(role => <span className="sii-role-pill" key={role}>{ROLE_LABELS[role]}</span>)}</div>
          {hasPermission(access.roles, 'academic.read') && <Link href={`/dashboard/institutions/${institutionId}/academic`} className="sii-outline-button">Abrir catálogo académico →</Link>}
          {hasPermission(access.roles, 'grades.publish') && <Link href={`/dashboard/institutions/${institutionId}/grading`} className="sii-outline-button">Abrir libro de calificaciones →</Link>}
          {hasPermission(access.roles, 'academic.manage') && <Link href={`/dashboard/institutions/${institutionId}/scheduling`} className="sii-outline-button">Abrir planificador de horarios →</Link>}
          {hasPermission(access.roles, 'academic.manage') && <Link href={`/dashboard/institutions/${institutionId}/services`} className="sii-outline-button">Abrir servicios universitarios →</Link>}
          <div className="sii-info-banner">Ya puedes administrar programas, materias, campus, periodos y versiones de planes según tus permisos. Matrículas, grupos y calificaciones siguen en desarrollo.</div>
        </section>
        <aside className="sii-panel sii-security-aside"><span className="sii-security-shield" aria-hidden="true">▥</span>
          <h2>Acceso por institución</h2>
          <p>SII restringe cada operación a los permisos y membresías asociados a este contexto.</p>
          <Link href="/dashboard/security" className="sii-outline-button">Ver seguridad de cuenta →</Link>
        </aside>
      </div>
    </SiiAppShell>
  );
}
