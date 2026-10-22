import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authorizeCapability, getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import SiiAppShell from '@/components/sii-app-shell';
import AdmissionsPortal from '@/components/admissions-portal';
import { db } from '@/infrastructure/database';
import { academicPrograms, admissionCycles, admissionApplications, applicantProfiles } from '../../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function AdmissionsPage({ params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  const user = await getIdentity();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/dashboard/security');

  const accessList = await getInstitutionAccess(user.id);
  const access = accessList.find(a => a.institutionId === institutionId);
  if (!access) redirect('/dashboard');
  if (!await authorizeCapability(institutionId, 'institutions.manage')) redirect('/dashboard');

  const programs = await db.select({
    id: academicPrograms.id,
    name: academicPrograms.name,
    code: academicPrograms.code,
  }).from(academicPrograms).where(eq(academicPrograms.institutionId, institutionId));

  const cycles = await db.select({
    id: admissionCycles.id,
    name: admissionCycles.name,
    code: admissionCycles.code,
    status: admissionCycles.status,
  }).from(admissionCycles).where(eq(admissionCycles.institutionId, institutionId)).orderBy(desc(admissionCycles.startDate));

  const applications = await db.select({
    id: admissionApplications.id,
    applicationNumber: admissionApplications.applicationNumber,
    status: admissionApplications.status,
    submittedAt: admissionApplications.submittedAt,
    applicantFirstName: applicantProfiles.firstName,
    applicantLastName: applicantProfiles.lastName,
    applicantEmail: applicantProfiles.email,
    programName: academicPrograms.name,
  })
  .from(admissionApplications)
  .innerJoin(applicantProfiles, eq(admissionApplications.applicantId, applicantProfiles.id))
  .innerJoin(academicPrograms, eq(admissionApplications.programId, academicPrograms.id))
  .where(eq(admissionApplications.institutionId, institutionId))
  .orderBy(desc(admissionApplications.createdAt));

  return (
    <SiiAppShell firstName={user.firstName} fullName={`${user.firstName} ${user.lastName}`} defaultInstitutionId={institutionId}>
      <div className="sii-page-eyebrow">CONTROL ESCOLAR Y ADMISIONES <span className="sii-page-eyebrow-line" /></div>
      <div className="sii-page-heading">
        <div>
          <h1>Gestión de Admisiones<span className="sii-welcome-period">.</span></h1>
          <p>{access.institutionName} · Registro público, convocatorias y revisión de solicitudes de ingreso.</p>
        </div>
        <Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Volver</Link>
      </div>

      <div className="sii-content-grid" style={{ marginBottom: '2rem' }}>
        <section className="sii-panel">
          <h3>Solicitudes Recibidas ({applications.length})</h3>
          {applications.length === 0 ? (
            <p className="sii-empty">No hay solicitudes de admisión registradas.</p>
          ) : (
            <div className="sii-table-container">
              <table className="sii-table">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Aspirante</th>
                    <th>Programa</th>
                    <th>Estatus</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map(app => (
                    <tr key={app.id}>
                      <td><strong>{app.applicationNumber}</strong></td>
                      <td>{app.applicantFirstName} {app.applicantLastName}<br/><small>{app.applicantEmail}</small></td>
                      <td>{app.programName}</td>
                      <td><span className={`sii-badge ${app.status === 'admitted' ? 'sii-badge--live' : app.status === 'rejected' ? 'sii-badge--error' : 'sii-badge--muted'}`}>{app.status.toUpperCase()}</span></td>
                      <td>{app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('es-MX') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <AdmissionsPortal
        institutionId={institutionId}
        institutionName={access.institutionName}
        programs={programs}
        cycles={cycles}
      />
    </SiiAppShell>
  );
}
