import { NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { admissionApplications, applicantProfiles, academicPrograms } from '../../../../../../../../db/schema';
import { authorizeCapability } from '@/shared/auth/session';
import {institutionVisibility} from '@/shared/auth/read-access';

export async function GET(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const authorization=await authorizeCapability(institutionId, 'admissions.manage');
    if (!authorization) return NextResponse.json({error:{code:'FORBIDDEN'}},{status:403,headers:{'Cache-Control':'no-store'}});

    const applications = await db.select({
      id: admissionApplications.id,
      institutionId: admissionApplications.institutionId,
      cycleId: admissionApplications.cycleId,
      applicantId: admissionApplications.applicantId,
      programId: admissionApplications.programId,
      campusId: admissionApplications.campusId,
      applicationNumber: admissionApplications.applicationNumber,
      status: admissionApplications.status,
      submittedAt: admissionApplications.submittedAt,
      notes: admissionApplications.notes,
      createdAt: admissionApplications.createdAt,
      applicantFirstName: applicantProfiles.firstName,
      applicantLastName: applicantProfiles.lastName,
      applicantEmail: applicantProfiles.email,
      programName: academicPrograms.name,
    })
    .from(admissionApplications)
    .innerJoin(applicantProfiles, eq(admissionApplications.applicantId, applicantProfiles.id))
    .innerJoin(academicPrograms, eq(admissionApplications.programId, academicPrograms.id))
    .where(and(eq(admissionApplications.institutionId, institutionId),institutionVisibility(authorization.subject,authorization.access,authorization.identity.sessionId,'admissions.manage')))
    .orderBy(desc(admissionApplications.createdAt));

    return NextResponse.json({ data: applications }, { status: 200,headers:{'Cache-Control':'no-store'} });
  } catch {
    return NextResponse.json({ error: { code: 'APPLICATIONS_FETCH_FAILED', message: 'No se pudieron consultar las solicitudes de admisión' } }, { status: 500 });
  }
}

export {submitApplication as POST} from '@/modules/admissions/applications';
