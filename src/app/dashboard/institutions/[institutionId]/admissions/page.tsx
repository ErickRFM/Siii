
import {SiiPageIntro} from '@/components/ui/sii-kit';
import AdmissionsWorkspace from '@/components/admissions-workspace';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authorizeCapability, getIdentity } from '@/shared/auth/session';
import {institutionVisibility} from '@/shared/auth/read-access';
import { db } from '@/infrastructure/database';
import { academicPrograms, admissionApplications, applicantProfiles } from '../../../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function AdmissionsPage({ params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  const user = await getIdentity();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/dashboard/security');
  const authorization = await authorizeCapability(institutionId,'admissions.manage');
  if(!authorization) redirect('/dashboard');
  const {access}=authorization;

  const applications = await db.select({
    id: admissionApplications.id,
    applicationNumber: admissionApplications.applicationNumber,
    status: admissionApplications.status,
    submittedAt: admissionApplications.submittedAt,
    applicantFirstName: applicantProfiles.firstName,
    applicantLastName: applicantProfiles.lastName,
    applicantEmail: applicantProfiles.email,
    programId: academicPrograms.id,
    programCode: academicPrograms.code,
    programName: academicPrograms.name,
  })
  .from(admissionApplications)
  .innerJoin(applicantProfiles, eq(admissionApplications.applicantId, applicantProfiles.id))
  .innerJoin(academicPrograms, eq(admissionApplications.programId, academicPrograms.id))
  .where(and(eq(admissionApplications.institutionId, institutionId),institutionVisibility(authorization.subject,authorization.access,authorization.identity.sessionId,'admissions.manage')))
  .orderBy(desc(admissionApplications.createdAt));

  return <>
    <SiiPageIntro eyebrow="CONTROL ESCOLAR Y ADMISIONES" title="Gestión de Admisiones"
      description={access.institutionName+' · Consulta y seguimiento de solicitudes de ingreso.'}
      actions={<div className="sii-page-actions"><Link className="sii-outline-button" href={`/dashboard/institutions/${institutionId}`}>← Institución</Link><Link className="sii-outline-button" href={{pathname:`/admissions/${institutionId}`}}>Portal de aspirantes</Link></div>}/>
    <AdmissionsWorkspace key={institutionId} institutionId={institutionId} applications={applications.map(row=>({...row,submittedAt:row.submittedAt?.toISOString()??null}))}/>
  </>;
}
