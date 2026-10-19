import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { studentAccountLinks, institutionalStudents, institutionMemberships } from '../../../../../../../../db/schema';
import { getIdentity } from '@/shared/auth/session';

export async function GET(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const user = await getIdentity();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, { status: 401 });
    }

    // Find user's membership for this institution
    const [membership] = await db.select().from(institutionMemberships)
      .where(and(eq(institutionMemberships.institutionId, institutionId), eq(institutionMemberships.userId, user.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: { code: 'NO_MEMBERSHIP', message: 'No tienes membresía en esta institución' } }, { status: 404 });
    }

    // Find active student link
    const [link] = await db.select({
      linkId: studentAccountLinks.id,
      studentId: institutionalStudents.id,
      enrollmentNumber: institutionalStudents.enrollmentNumber,
      firstName: institutionalStudents.firstName,
      lastName: institutionalStudents.lastName,
      institutionalEmail: institutionalStudents.institutionalEmail,
      status: institutionalStudents.status,
    })
    .from(studentAccountLinks)
    .innerJoin(institutionalStudents, eq(studentAccountLinks.studentId, institutionalStudents.id))
    .where(and(
      eq(studentAccountLinks.membershipId, membership.id),
      eq(studentAccountLinks.institutionId, institutionId),
      isNull(studentAccountLinks.revokedAt)
    ))
    .limit(1);

    return NextResponse.json({
      data: {
        membershipId: membership.id,
        studentRecord: link ?? null,
      },
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: { code: 'FETCH_FAILED', message: 'No se pudo consultar la vinculación de estudiante' } }, { status: 500 });
  }
}
