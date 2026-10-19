import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { studentClaimRequests, institutionalStudents, studentAccountLinks, institutionMemberships, platformUsers, people } from '../../../../../../../../db/schema';
import { getIdentity } from '@/shared/auth/session';
import { z } from 'zod';

const claimSchema = z.object({
  enrollmentNumber: z.string().trim().min(3, 'Matrícula requerida'),
});

export async function POST(request: Request, { params }: { params: Promise<{ institutionId: string }> }) {
  const { institutionId } = await params;
  try {
    const user = await getIdentity();
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } }, { status: 401 });
    }

    const json = await request.json();
    const parseResult = claimSchema.safeParse(json);
    if (!parseResult.success) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Matrícula no válida' } }, { status: 400 });
    }

    const { enrollmentNumber } = parseResult.data;

    // Find student record in registry
    const [student] = await db.select().from(institutionalStudents)
      .where(and(eq(institutionalStudents.institutionId, institutionId), eq(institutionalStudents.enrollmentNumber, enrollmentNumber)))
      .limit(1);

    if (!student) {
      return NextResponse.json({ error: { code: 'STUDENT_NOT_FOUND', message: 'No se encontró ningún expediente con esa matrícula en esta institución' } }, { status: 404 });
    }

    // Check if student record is already linked
    const [existingLink] = await db.select().from(studentAccountLinks)
      .where(and(eq(studentAccountLinks.studentId, student.id), isNull(studentAccountLinks.revokedAt)))
      .limit(1);

    if (existingLink) {
      return NextResponse.json({ error: { code: 'ALREADY_LINKED', message: 'Este expediente ya está vinculado a otra cuenta' } }, { status: 409 });
    }

    // Auto-approve if email matches, or create pending claim request
    const [membership] = await db.select().from(institutionMemberships)
      .where(and(eq(institutionMemberships.institutionId, institutionId), eq(institutionMemberships.userId, user.id)))
      .limit(1);

    const [userPerson] = await db.select({ email: people.email }).from(platformUsers)
      .innerJoin(people, eq(platformUsers.personId, people.id))
      .where(eq(platformUsers.id, user.id)).limit(1);

    const userEmail = userPerson?.email;

    if (membership && student.institutionalEmail && userEmail && student.institutionalEmail.toLowerCase() === userEmail.toLowerCase()) {
      // Auto-approve
      const [link] = await db.insert(studentAccountLinks).values({
        institutionId,
        membershipId: membership.id,
        studentId: student.id,
        linkedBy: user.id,
      }).returning();

      return NextResponse.json({ data: { link, autoApproved: true, message: 'Expediente vinculado automáticamente' } }, { status: 201 });
    }

    // Create pending claim request for Control Escolar review
    const [claim] = await db.insert(studentClaimRequests).values({
      institutionId,
      applicantUserId: user.id,
      enrollmentNumber,
      verificationStatus: 'pending',
    }).returning();

    return NextResponse.json({ data: { claim, autoApproved: false, message: 'Solicitud de vinculación enviada a Control Escolar' } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: { code: 'CLAIM_FAILED', message: 'No se pudo procesar la solicitud de vinculación' } }, { status: 500 });
  }
}
