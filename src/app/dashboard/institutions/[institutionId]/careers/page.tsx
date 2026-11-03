import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { academicPrograms } from '../../../../../../db/schema';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { can } from '@/shared/auth/capabilities';
import { privilegedAssuranceAllows, careerAdministrationAssuranceAllows } from '@/shared/auth/privileged-policy';
import { uuid } from '@/shared/auth/validation';
import { SiiPageIntro } from '@/components/ui/sii-kit';

export const dynamic = 'force-dynamic';

export default async function CareersPage({ params }: { params: Promise<{ institutionId: string }> }) {
  const user = await getIdentity();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/dashboard/security');
  const { institutionId } = await params;
  if (!uuid.safeParse(institutionId).success) notFound();
  const access = (await getInstitutionAccess(user.id)).find(value => value.institutionId === institutionId);
  if (!access) notFound();
  if (!privilegedAssuranceAllows(access.grants, user) || !careerAdministrationAssuranceAllows(user)) {
    redirect('/dashboard/security');
  }
  const subject = { id: user.id, active: user.isActive, mustChangePassword: user.mustChangePassword, grants: access.grants };
  const institutional = access.grants.some(grant =>
    grant.scopeType === 'institution' && (grant.role === 'admin' || grant.role === 'super_admin')) &&
    can(subject, 'groups.manage', { institutionId, status: 'active' });
  const scoped = access.grants.filter(grant =>
    grant.role === 'coordinator' && grant.scopeType === 'program' && grant.scopeId &&
    can(subject, 'groups.manage', { institutionId, programId: grant.scopeId, status: 'active' }),
  ).map(grant => grant.scopeId!);
  if (!institutional && !scoped.length) notFound();
  const programs = await db.select({
    id: academicPrograms.id, code: academicPrograms.code,
    name: academicPrograms.name, level: academicPrograms.level,
  }).from(academicPrograms).where(and(
    eq(academicPrograms.institutionId, institutionId),
    eq(academicPrograms.status, 'active'),
    institutional ? undefined : inArray(academicPrograms.id, scoped),
  )).orderBy(asc(academicPrograms.name)).limit(101);
  return <>
    <SiiPageIntro
      eyebrow="GESTIÓN POR CARRERA"
      title="Carreras asignadas"
      description={`${access.institutionName} · Solo puedes administrar los programas autorizados por la institución.`}
      actions={<Link href={`/dashboard/institutions/${institutionId}`} className="sii-outline-button">← Institución</Link>}
    />
    <section className="sii-panel space-y-4">
      <span className="sii-section-kicker">ÁMBITOS VIGENTES</span>
      {programs.length === 0 && <p>Aún no hay carreras activas dentro de tus permisos.</p>}
      {programs.map(program => <div key={program.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-current/10 py-3">
        <div><h2 className="font-semibold">{program.name}</h2><p className="text-sm opacity-70">{program.code} · {program.level.replaceAll('_', ' ')}</p></div>
        <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}/careers/${program.id}`}>
          Administrar carrera →
        </Link>
      </div>)}
      {programs.length > 100 && <p className="text-sm opacity-70">La lista está limitada a 100 carreras. Utiliza la consulta institucional paginada para acceder al resto.</p>}
    </section>
  </>;
}
