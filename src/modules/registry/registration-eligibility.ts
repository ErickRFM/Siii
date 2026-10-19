import { eq, and, inArray, count } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { paymentOrders, sectionEnrollments, academicSections } from '../../../db/schema';

export type EligibilityResult = {
  eligible: boolean;
  reasons: string[];
};

export async function checkRegistrationEligibility(
  institutionId: string,
  studentId: string
): Promise<EligibilityResult> {
  const reasons: string[] = [];

  // Check if student has unpaid mandatory payment orders
  const unpaidOrders = await db.select().from(paymentOrders)
    .where(and(
      eq(paymentOrders.institutionId, institutionId),
      eq(paymentOrders.payerStudentId, studentId),
      inArray(paymentOrders.status, ['pending', 'partially_paid'])
    ));

  if (unpaidOrders.length > 0) {
    reasons.push(`El estudiante tiene ${unpaidOrders.length} orden(es) de pago pendiente(s).`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

export async function validateSectionCapacityAndCollision(
  institutionId: string,
  sectionId: string,
  studentId: string
): Promise<{ valid: boolean; message?: string }> {
  // Check section capacity
  const [section] = await db.select().from(academicSections)
    .where(and(eq(academicSections.id, sectionId), eq(academicSections.institutionId, institutionId)))
    .limit(1);

  if (!section) {
    return { valid: false, message: 'Sección académica no encontrada.' };
  }

  const [enrollmentCount] = await db.select({ total: count() }).from(sectionEnrollments)
    .where(and(eq(sectionEnrollments.sectionId, sectionId), eq(sectionEnrollments.status, 'enrolled')));

  if ((enrollmentCount?.total ?? 0) >= section.capacity) {
    return { valid: false, message: 'La sección no tiene cupo disponible.' };
  }

  // Check if student is already enrolled in this section
  const [existing] = await db.select().from(sectionEnrollments)
    .where(and(
      eq(sectionEnrollments.sectionId, sectionId),
      eq(sectionEnrollments.studentId, studentId),
      eq(sectionEnrollments.status, 'enrolled')
    ))
    .limit(1);

  if (existing) {
    return { valid: false, message: 'El estudiante ya está inscrito en esta sección.' };
  }

  return { valid: true };
}
