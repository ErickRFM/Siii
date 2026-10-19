import { eq, count } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { institutionalStudents } from '../../../db/schema';

export type EnrollmentGeneratorOptions = {
  prefix?: string;
  year?: number;
  sequenceDigits?: number;
};

export async function generateInstitutionalEnrollmentNumber(
  institutionId: string,
  options: EnrollmentGeneratorOptions = {}
): Promise<string> {
  const year = options.year ?? new Date().getFullYear();
  const prefix = options.prefix ?? '';
  const digits = options.sequenceDigits ?? 4;

  const [result] = await db.select({ total: count() }).from(institutionalStudents)
    .where(eq(institutionalStudents.institutionId, institutionId));

  const sequence = (result?.total ?? 0) + 1;
  const paddedSequence = String(sequence).padStart(digits, '0');

  return `${prefix}${year}${paddedSequence}`;
}
