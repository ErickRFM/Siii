import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { admissionApplications, applicantProfiles, academicPrograms } from '../../../../../../../../db/schema';
import { getIdentity, getInstitutionAccess } from '@/shared/auth/session';
import { can } from '@/shared/auth/capabilities';
import { admissionApplicationSchema } from '@/modules/admissions/validation';

export async function GET(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const user = await getIdentity();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, { status: 401 });
    }

    const accessList = await getInstitutionAccess(user.id);
    const access = accessList.find(a => a.institutionId === institutionId);
    if (!access) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'No tienes acceso a esta institución' } }, { status: 403 });
    }

    const subject = { id: user.id, active: true, mustChangePassword: user.mustChangePassword, grants: access.grants };
    if (!can(subject, 'institutions.read', { institutionId })) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Permiso insuficiente' } }, { status: 403 });
    }

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
    .where(eq(admissionApplications.institutionId, institutionId))
    .orderBy(desc(admissionApplications.createdAt));

    return NextResponse.json({ data: applications }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'APPLICATIONS_FETCH_FAILED', message: 'No se pudieron consultar las solicitudes de admisión' } }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const json = await request.json();
    const { applicantId, ...applicationInput } = json;

    if (!applicantId) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Identificador de aspirante requerido' } }, { status: 400 });
    }

    const parseResult = admissionApplicationSchema.safeParse(applicationInput);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Datos de solicitud de admisión no válidos', details: parseResult.error.flatten() } }, { status: 400 });
    }

    const { cycleId, programId, campusId, notes } = parseResult.data;

    const applicationNumber = `ADM-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    const [application] = await db.insert(admissionApplications).values({
      institutionId,
      cycleId,
      applicantId,
      programId,
      campusId: campusId ?? null,
      applicationNumber,
      status: 'submitted',
      submittedAt: new Date(),
      notes: notes ?? null,
    }).returning();

    return NextResponse.json({ data: application }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'APPLICATION_CREATE_FAILED', message: 'No se pudo crear la solicitud de admisión' } }, { status: 500 });
  }
}
