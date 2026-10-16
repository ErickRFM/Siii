import {and,eq,isNull} from 'drizzle-orm';
import {mfaFactors,mfaRecoveryCodes} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import type {lockMfaFactor} from './mfa-session';
import {openMfaSecret,verifyTotp,digestRecoveryCode} from './mfa-primitives';
type Factor=NonNullable<Awaited<ReturnType<typeof lockMfaFactor>>>;
const MAX_ATTEMPTS=5,BLOCK_MS=15*60000;
export async function factorBlocked(tx: Transaction, factor: Factor, now: Date): Promise<boolean> {
  if (factor.blockedUntil && factor.blockedUntil > now) return true;
  if (factor.blockedUntil || factor.failedAttempts >= MAX_ATTEMPTS) {
    await tx.update(mfaFactors).set({ blockedUntil: null, failedAttempts: 0 }).where(eq(mfaFactors.id, factor.id));
    factor.failedAttempts = 0; factor.blockedUntil = null;
  }
  return false;
}
export async function recordFactorFailure(tx: Transaction, factor: Factor, now: Date) {
  const attempts = Math.min(MAX_ATTEMPTS, factor.failedAttempts + 1);
  await tx.update(mfaFactors).set({ failedAttempts: attempts, blockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null }).where(eq(mfaFactors.id, factor.id));
  return attempts;
}
/** User and factor locks are held; recovery consumption and TOTP replay state share the transaction. */
export async function verifyFactor(tx: Transaction, factor: Factor, input: { code?: string; recoveryCode?: string }, now: Date): Promise<boolean> {
  // Always validate encryption configuration, including the recovery path.
  const secret = openMfaSecret(factor.secretEncrypted ?? '', factor.userId);
  if (input.code && !input.recoveryCode) {
    const result = await verifyTotp(secret, input.code, factor.lastTimeStep, now);
    if (!result.valid || result.timeStep === undefined) return false;
    await tx.update(mfaFactors).set({ lastTimeStep: result.timeStep, failedAttempts: 0, blockedUntil: null }).where(eq(mfaFactors.id, factor.id));
    return true;
  }
  if (!input.recoveryCode || input.code) return false;
  const hash = digestRecoveryCode(input.recoveryCode, factor.userId);
  if (!hash) return false;
  const [recovery] = await tx.select().from(mfaRecoveryCodes).where(and(eq(mfaRecoveryCodes.factorId, factor.id), eq(mfaRecoveryCodes.userId, factor.userId), eq(mfaRecoveryCodes.codeHash, hash), isNull(mfaRecoveryCodes.consumedAt))).for('update');
  if (!recovery) return false;
  const used = await tx.update(mfaRecoveryCodes).set({ consumedAt: now }).where(and(eq(mfaRecoveryCodes.id, recovery.id), isNull(mfaRecoveryCodes.consumedAt))).returning({ id: mfaRecoveryCodes.id });
  if (!used.length) return false;
  await tx.update(mfaFactors).set({ failedAttempts: 0, blockedUntil: null }).where(eq(mfaFactors.id, factor.id));
  return true;
}
