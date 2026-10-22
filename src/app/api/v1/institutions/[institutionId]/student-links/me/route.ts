import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { studentAccountLinks, institutionalStudents, institutionMemberships } from '../../../../../../../../db/schema';
import { authorizeCapability, getIdentity } from '@/shared/auth/session';
import { institutionVisibility } from '@/shared/auth/read-access';

const privateHeaders = { 'Cache-Control': 'no-store' };

export async function GET(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const user = await getIdentity();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, { status: 401, headers: privateHeaders });
    }

    // Preserve the authenticated nonmember contract without looking up any student.
    const [membership] = await db.select({ id: institutionMemberships.id }).from(institutionMemberships)
      .where(and(eq(institutionMemberships.institutionId, institutionId), eq(institutionMemberships.userId, user.id)))
      .limit(1);
    if (!membership) {
      return NextResponse.json({ error: { code: 'NO_MEMBERSHIP', message: 'No tienes membresía en esta institución' } }, { status: 404, headers: privateHeaders });
    }
    const authorization = await authorizeCapability(institutionId, 'institutions.read');
    if (!authorization) {
      return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403, headers: privateHeaders });
    }

    // Start from the authorized membership so an empty link remains distinct from denial.
    // Authority and link revocation are checked in the same SQL statement as private data.
    const [row] = await db.select({
      membershipId: institutionMemberships.id,
      linkId: studentAccountLinks.id,
      studentId: institutionalStudents.id,
      enrollmentNumber: institutionalStudents.enrollmentNumber,
      firstName: institutionalStudents.firstName,
      lastName: institutionalStudents.lastName,
      institutionalEmail: institutionalStudents.institutionalEmail,
      status: institutionalStudents.status,
    }).from(institutionMemberships)
      .leftJoin(studentAccountLinks, and(
        eq(studentAccountLinks.membershipId, institutionMemberships.id),
        eq(studentAccountLinks.institutionId, institutionMemberships.institutionId),
        isNull(studentAccountLinks.revokedAt),
      ))
      .leftJoin(institutionalStudents, and(
        eq(institutionalStudents.id, studentAccountLinks.studentId),
        eq(institutionalStudents.institutionId, institutionMemberships.institutionId),
      ))
      .where(and(
        eq(institutionMemberships.id, authorization.access.membershipId),
        eq(institutionMemberships.userId, user.id),
        eq(institutionMemberships.institutionId, institutionId),
        isNull(institutionMemberships.deletedAt),
        institutionVisibility(authorization.subject, authorization.access, authorization.identity.sessionId, 'institutions.read'),
      )).limit(1);
    if (!row) {
      return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403, headers: privateHeaders });
    }
    const { membershipId, ...record } = row;
    return NextResponse.json({ data: { membershipId, studentRecord: record.studentId ? record : null } }, { status: 200, headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: 'No se pudo consultar la vinculación de estudiante' } }, { status: 500, headers: privateHeaders });
  }
}
