import { eq } from 'drizzle-orm';
import { mfaFactors } from '../../../db/schema';
import type { Transaction } from '@/shared/http/request-context';

/** The caller must hold the user lock first; factor always precedes session locks. */
export async function lockMfaFactor(tx: Transaction, userId: string, mode: 'share' | 'update' = 'update'): Promise<typeof mfaFactors.$inferSelect | null> {
  const [factor] = await tx.select().from(mfaFactors).where(eq(mfaFactors.userId, userId)).limit(1).for(mode);
  return factor ?? null;
}
export function factorIsActive(factor: Awaited<ReturnType<typeof lockMfaFactor>>): boolean {
  return !!factor?.enabledAt && !factor.revokedAt;
}
