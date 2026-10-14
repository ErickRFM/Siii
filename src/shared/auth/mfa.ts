import { createHash } from 'node:crypto';
import { and, eq, isNull, gt, count } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { authSessions, platformUsers, mfaFactors, mfaEnrollments, mfaChallenges, mfaRecoveryCodes } from '../../../db/schema';
import { audit, context, type Transaction } from '@/shared/http/request-context';
import { withErrors } from '@/shared/http/route-errors';
import { assertSameOrigin, jsonError } from './guards';
import { credentials, credentialTransaction } from './credential-flow';
import { clientIp, consumeIp } from './throttle';
import { SESSION_COOKIE, cookieOptions } from './session-policy';
import { createSession, digestToken, generateToken, revokeUserSessions } from './session-write';
import { lockMfaFactor, factorIsActive } from './mfa-session';
import { hasFreshStepUp, MFA_STEP_UP_MS, sessionIsCurrent } from './mfa-session-policy';
import { createMfaSecret, sealMfaSecret, openMfaSecret, verifyTotp, createRecoveryCodes, digestRecoveryCode } from './mfa-primitives';
import {hasPrivilegedMembership} from './institution-policy';

export const MFA_CHALLENGE_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-siii_mfa_challenge' : 'siii_mfa_challenge';
const CHALLENGE_MS = 5 * 60000, ENROLLMENT_MS = 15 * 60000, BLOCK_MS = 15 * 60000;
const MAX_ATTEMPTS = 5;
const tokenFormat = /^[A-Za-z0-9_-]{43}$/;
const factorFields = { code: z.string().regex(/^[0-9]{6}$/).optional(), recoveryCode: z.string().min(32).max(128).optional() };
const factorBody = z.object(factorFields).strict().refine(body => !!body.code !== !!body.recoveryCode);
const stepUpBody = z.object({ currentPassword: z.string().min(1).max(512), ...factorFields }).strict()
  .refine(body => !(body.code && body.recoveryCode));
const enrollBody = z.object({ currentPassword: z.string().min(1).max(512) }).strict();
const verifyBody = z.object({ enrollmentId: z.uuid(), code: z.string().regex(/^[0-9]{6}$/) }).strict();
const emptyBody = z.object({}).strict();
type Factor = NonNullable<Awaited<ReturnType<typeof lockMfaFactor>>>;
const ok = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const challengeHash = (token: string) => createHash('sha256').update('SIII:mfa-challenge\0' + token).digest('hex');

export function withMfaErrors(handler: (req: NextRequest) => Promise<NextResponse>) {
  return withErrors(async (req: NextRequest) => {
    try { return await handler(req); }
    catch (error) {
      if (error instanceof Error && (error.message === 'MFA_KEY_UNAVAILABLE' || error.message === 'MFA_SECRET_INVALID')) {
        return jsonError(error.message, 503);
      }
      throw error;
    }
  });
}
function setSession(response: NextResponse, session: Awaited<ReturnType<typeof createSession>>) {
  response.cookies.set(SESSION_COOKIE, session.token, cookieOptions(session.expires));
  response.cookies.set(MFA_CHALLENGE_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return response;
}
function sessionToken(req: NextRequest): string | null {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  return raw && tokenFormat.test(raw) ? raw : null;
}
async function lockIdentity(tx: Transaction, raw: string) {
  const [candidate] = await tx.select({ id: authSessions.id, userId: authSessions.userId }).from(authSessions)
    .where(eq(authSessions.tokenHash, digestToken(raw))).limit(1);
  if (!candidate) return null;
  const [user] = await tx.select().from(platformUsers).where(eq(platformUsers.id, candidate.userId)).for('update');
  if (!user) return null;
  const factor = await lockMfaFactor(tx, user.id);
  const [session] = await tx.select().from(authSessions).where(and(eq(authSessions.id, candidate.id), eq(authSessions.userId, user.id))).for('update');
  const now = new Date();
  if (!session || !sessionIsCurrent(user, session, factor, now)) return null;
  await tx.update(authSessions).set({ lastSeenAt: now }).where(eq(authSessions.id, session.id));
  return { user, factor, session, now };
}
async function passwordIdentity(tx: Transaction, req: NextRequest, password: string, requestId: string) {
  const raw = sessionToken(req);
  if (!raw) return { status: 401 as const, code: 'UNAUTHENTICATED' };
  const [candidate] = await tx.select({ username: platformUsers.username, sessionId: authSessions.id }).from(authSessions)
    .innerJoin(platformUsers, eq(authSessions.userId, platformUsers.id)).where(eq(authSessions.tokenHash, digestToken(raw))).limit(1);
  if (!candidate) return { status: 401 as const, code: 'UNAUTHENTICATED' };
  const result = await credentials(tx, { username: candidate.username, password, sessionId: candidate.sessionId, kind: 'password', ip: clientIp(req), requestId }, new Date());
  if (result.status !== 200) return { ...result, code: result.status === 429 ? 'RATE_LIMITED' : 'code' in result ? result.code ?? 'INVALID_CREDENTIALS' : 'INVALID_CREDENTIALS' };
  if (!result.session || !sessionIsCurrent(result.user, result.session, result.factor, new Date())) return { status: 401 as const, code: 'UNAUTHENTICATED' };
  if (result.user.mustChangePassword) return { status: 403 as const, code: 'PASSWORD_CHANGE_REQUIRED' };
  return result;
}
async function mfaIp(tx: Transaction, req: NextRequest, requestId: string): Promise<boolean> {
  if (await consumeIp(tx, clientIp(req), new Date())) return true;
  await audit(tx, { action: 'auth.mfa.throttled', target: 'ip:throttled', requestId });
  return false;
}
async function factorBlocked(tx: Transaction, factor: Factor, now: Date): Promise<boolean> {
  if (factor.blockedUntil && factor.blockedUntil > now) return true;
  if (factor.blockedUntil || factor.failedAttempts >= MAX_ATTEMPTS) {
    await tx.update(mfaFactors).set({ blockedUntil: null, failedAttempts: 0 }).where(eq(mfaFactors.id, factor.id));
    factor.failedAttempts = 0; factor.blockedUntil = null;
  }
  return false;
}
async function recordFactorFailure(tx: Transaction, factor: Factor, now: Date) {
  const attempts = Math.min(MAX_ATTEMPTS, factor.failedAttempts + 1);
  await tx.update(mfaFactors).set({ failedAttempts: attempts, blockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null }).where(eq(mfaFactors.id, factor.id));
  return attempts;
}
/** User and factor locks are held; recovery consumption and TOTP replay state share the transaction. */
async function verifyFactor(tx: Transaction, factor: Factor, input: { code?: string; recoveryCode?: string }, now: Date): Promise<boolean> {
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
async function replaceRecoveryCodes(tx: Transaction, factor: Factor, now: Date) {
  await tx.update(mfaRecoveryCodes).set({ consumedAt: now }).where(and(eq(mfaRecoveryCodes.userId, factor.userId), isNull(mfaRecoveryCodes.consumedAt)));
  const codes = createRecoveryCodes();
  await tx.insert(mfaRecoveryCodes).values(codes.map(code => ({ userId: factor.userId, factorId: factor.id, codeHash: digestRecoveryCode(code, factor.userId)! })));
  return codes;
}
export async function invalidateMfaPending(tx: Transaction, userId: string, now: Date) {
  await tx.update(mfaChallenges).set({ consumedAt: now }).where(and(eq(mfaChallenges.userId, userId), isNull(mfaChallenges.consumedAt)));
  await tx.update(mfaEnrollments).set({ consumedAt: now }).where(and(eq(mfaEnrollments.userId, userId), isNull(mfaEnrollments.consumedAt)));
}

/** Login already holds user→factor locks after password verification. */
export async function issueMfaChallenge(tx: Transaction, user: typeof platformUsers.$inferSelect, factor: Factor, requestId: string) {
  const now = new Date();
  if (await factorBlocked(tx, factor, now)) {
    await audit(tx, { actorUserId: user.id, action: 'auth.mfa.throttled', target: 'user:' + user.id, requestId });
    return { status: 429 as const };
  }
  openMfaSecret(factor.secretEncrypted ?? '', user.id);
  const token = generateToken(), expires = new Date(now.getTime() + CHALLENGE_MS);
  const [challenge] = await tx.insert(mfaChallenges).values({ userId: user.id, factorId: factor.id, authVersion: user.authVersion, tokenHash: challengeHash(token), expiresAt: expires }).returning({ id: mfaChallenges.id });
  await audit(tx, { actorUserId: user.id, action: 'auth.mfa.challenge.created', target: 'challenge:' + challenge.id, requestId });
  return { status: 200 as const, mfaRequired: true as const, token, expires };
}

export const mfaStatus = withMfaErrors(async req => {
  const raw = sessionToken(req); if (!raw) return jsonError('UNAUTHENTICATED', 401);
  return db.transaction(async tx => {
    const identity = await lockIdentity(tx, raw); if (!identity) return jsonError('UNAUTHENTICATED', 401);
    const { user, factor, session, now } = identity;
    const [pending] = await tx.select({ id: mfaEnrollments.id }).from(mfaEnrollments).where(and(eq(mfaEnrollments.userId, user.id), eq(mfaEnrollments.authVersion, user.authVersion), isNull(mfaEnrollments.consumedAt), gt(mfaEnrollments.expiresAt, now))).limit(1);
    const [remaining] = await tx.select({ total: count() }).from(mfaRecoveryCodes).where(and(eq(mfaRecoveryCodes.userId, user.id), isNull(mfaRecoveryCodes.consumedAt)));
    const requiredByRole=await hasPrivilegedMembership(tx,user.id,now);
    return ok({ data: { configured: factorIsActive(factor), requiredByRole, pending: !!pending, recoveryCodesRemaining: factorIsActive(factor) ? remaining.total : 0, stepUpExpiresAt: hasFreshStepUp(session, now) ? new Date(session.stepUpAt!.getTime() + MFA_STEP_UP_MS).toISOString() : null } });
  });
});

export const mfaEnroll = withMfaErrors(async req => {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const body = enrollBody.safeParse(await req.json().catch(() => null)); if (!body.success) return jsonError('INVALID_REQUEST', 422);
  const { requestId } = context(req);
  return credentialTransaction(async tx => {
    const identity = await passwordIdentity(tx, req, body.data.currentPassword, requestId);
    if (identity.status !== 200) return { status: identity.status, response: jsonError(identity.code, identity.status) };
    const { user, factor, session } = identity;
    if (factorIsActive(factor)) return { status: 409, response: jsonError('MFA_ALREADY_CONFIGURED', 409) };
    const now = new Date(), expires = new Date(now.getTime() + ENROLLMENT_MS);
    const generated = createMfaSecret(user.username);
    const encrypted = sealMfaSecret(generated.secret, user.id);
    await tx.update(mfaEnrollments).set({ consumedAt: now }).where(and(eq(mfaEnrollments.userId, user.id), isNull(mfaEnrollments.consumedAt)));
    const [enrollment] = await tx.insert(mfaEnrollments).values({ userId: user.id, sessionId: session!.id, authVersion: user.authVersion, secretEncrypted: encrypted, expiresAt: expires }).returning({ id: mfaEnrollments.id });
    await audit(tx, { actorUserId: user.id, action: 'auth.mfa.enrollment.started', target: 'enrollment:' + enrollment.id, requestId });
    return { status: 201, response: ok({ data: { enrollmentId: enrollment.id, ...generated, expiresAt: expires.toISOString() } }, 201) };
  }).then(result => result.response);
});

export const mfaVerifyEnrollment = withMfaErrors(async req => {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const body = verifyBody.safeParse(await req.json().catch(() => null)); if (!body.success) return jsonError('INVALID_MFA_CODE', 401);
  const raw = sessionToken(req); if (!raw) return jsonError('UNAUTHENTICATED', 401);
  const { requestId } = context(req);
  return db.transaction(async tx => {
    if (!await mfaIp(tx, req, requestId)) return jsonError('RATE_LIMITED', 429);
    const identity = await lockIdentity(tx, raw); if (!identity) return jsonError('UNAUTHENTICATED', 401);
    const { user, factor, session } = identity; const now = new Date();
    if (user.mustChangePassword) return jsonError('PASSWORD_CHANGE_REQUIRED', 403);
    if (factorIsActive(factor)) return jsonError('MFA_ALREADY_CONFIGURED', 409);
    const [pending] = await tx.select().from(mfaEnrollments).where(and(eq(mfaEnrollments.id, body.data.enrollmentId), eq(mfaEnrollments.userId, user.id), eq(mfaEnrollments.sessionId, session.id))).for('update');
    if (pending?.attempts === MAX_ATTEMPTS) return jsonError('RATE_LIMITED', 429);
    if (!pending || pending.consumedAt || pending.expiresAt <= now || pending.authVersion !== user.authVersion) return jsonError('MFA_ENROLLMENT_EXPIRED', 401);
    const result = await verifyTotp(openMfaSecret(pending.secretEncrypted, user.id), body.data.code, null, now);
    if (!result.valid || result.timeStep === undefined) {
      const attempts = pending.attempts + 1;
      await tx.update(mfaEnrollments).set({ attempts, ...(attempts === MAX_ATTEMPTS ? { consumedAt: now } : {}) }).where(eq(mfaEnrollments.id, pending.id));
      await audit(tx, { actorUserId: user.id, action: 'auth.mfa.enrollment.failed', target: 'enrollment:' + pending.id, requestId, details: { after: { attempts } } });
      return jsonError(attempts === MAX_ATTEMPTS ? 'RATE_LIMITED' : 'INVALID_MFA_CODE', attempts === MAX_ATTEMPTS ? 429 : 401);
    }
    const [activeFactor] = await tx.insert(mfaFactors).values({ userId: user.id, secretEncrypted: pending.secretEncrypted, enabledAt: now, lastTimeStep: result.timeStep })
      .onConflictDoUpdate({ target: mfaFactors.userId, set: { secretEncrypted: pending.secretEncrypted, enabledAt: now, revokedAt: null, lastTimeStep: result.timeStep, failedAttempts: 0, blockedUntil: null } }).returning();
    const authVersion = user.authVersion + 1;
    await tx.update(platformUsers).set({ authVersion }).where(eq(platformUsers.id, user.id));
    await invalidateMfaPending(tx, user.id, now);
    const codes = await replaceRecoveryCodes(tx, activeFactor, now);
    const revoked = await revokeUserSessions(tx, user.id, now);
    const replacement = await createSession(tx, user.id, now, { authVersion, mfaVerifiedAt: now });
    await audit(tx, { actorUserId: user.id, action: 'auth.mfa.enabled', target: 'factor:' + activeFactor.id, requestId, details: { before: { configured: false }, after: { configured: true, sessionRevocations: revoked.length, recoveryCount: codes.length } } });
    return setSession(ok({ data: { recoveryCodes: codes } }), replacement);
  });
});

export const mfaChallenge = withMfaErrors(async req => {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const body = factorBody.safeParse(await req.json().catch(() => null)); if (!body.success) return jsonError('INVALID_MFA_CODE', 401);
  const raw = req.cookies.get(MFA_CHALLENGE_COOKIE)?.value;
  if (!raw || !tokenFormat.test(raw)) return jsonError('MFA_CHALLENGE_EXPIRED', 401);
  const { requestId } = context(req);
  return db.transaction(async tx => {
    if (!await mfaIp(tx, req, requestId)) return jsonError('RATE_LIMITED', 429);
    const [candidate] = await tx.select({ userId: mfaChallenges.userId }).from(mfaChallenges).where(eq(mfaChallenges.tokenHash, challengeHash(raw))).limit(1);
    if (!candidate) return jsonError('MFA_CHALLENGE_EXPIRED', 401);
    const [user] = await tx.select().from(platformUsers).where(eq(platformUsers.id, candidate.userId)).for('update');
    if (!user) return jsonError('MFA_CHALLENGE_EXPIRED', 401);
    const factor = await lockMfaFactor(tx, user.id);
    const [challenge] = await tx.select().from(mfaChallenges).where(eq(mfaChallenges.tokenHash, challengeHash(raw))).for('update');
    const now = new Date();
    if (!challenge || challenge.expiresAt <= now || !user.isActive || challenge.authVersion !== user.authVersion || !factorIsActive(factor) || challenge.factorId !== factor?.id) return jsonError('MFA_CHALLENGE_EXPIRED', 401);
    if (challenge.attempts >= MAX_ATTEMPTS || await factorBlocked(tx, factor!, now)) {
      await audit(tx, { actorUserId: user.id, action: 'auth.mfa.throttled', target: 'challenge:' + challenge.id, requestId });
      return jsonError('RATE_LIMITED', 429);
    }
    if (challenge.consumedAt) return jsonError('MFA_CHALLENGE_EXPIRED', 401);
    if (!await verifyFactor(tx, factor!, body.data, now)) {
      const attempts = challenge.attempts + 1;
      await tx.update(mfaChallenges).set({ attempts, ...(attempts === MAX_ATTEMPTS ? { consumedAt: now } : {}) }).where(eq(mfaChallenges.id, challenge.id));
      const factorAttempts = await recordFactorFailure(tx, factor!, now);
      await audit(tx, { actorUserId: user.id, action: 'auth.mfa.challenge.failed', target: 'challenge:' + challenge.id, requestId, details: { after: { attempts } } });
      return jsonError(attempts === MAX_ATTEMPTS || factorAttempts === MAX_ATTEMPTS ? 'RATE_LIMITED' : 'INVALID_MFA_CODE', attempts === MAX_ATTEMPTS || factorAttempts === MAX_ATTEMPTS ? 429 : 401);
    }
    await tx.update(mfaChallenges).set({ consumedAt: now }).where(eq(mfaChallenges.id, challenge.id));
    const session = await createSession(tx, user.id, now, { authVersion: user.authVersion, mfaVerifiedAt: now });
    await audit(tx, { actorUserId: user.id, action: 'auth.login', target: 'user:' + user.id, requestId, details: { after: { mfa: true, recovery: !!body.data.recoveryCode, sessionRevocations: session.revoked } } });
    return setSession(ok({ ok: true, mustChangePassword: user.mustChangePassword }), session);
  });
});

export const mfaStepUp = withMfaErrors(async req => {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const body = stepUpBody.safeParse(await req.json().catch(() => null)); if (!body.success) return jsonError('INVALID_REQUEST', 422);
  const { requestId } = context(req);
  return credentialTransaction(async tx => {
    const identity = await passwordIdentity(tx, req, body.data.currentPassword, requestId);
    if (identity.status !== 200) return { status: identity.status, response: jsonError(identity.code, identity.status) };
    const { user, factor, session } = identity; const now = new Date();
    if (factorIsActive(factor)) {
      if (await factorBlocked(tx, factor!, now)) return { status: 429, response: jsonError('RATE_LIMITED', 429) };
      if (!await verifyFactor(tx, factor!, body.data, now)) {
        const attempts = await recordFactorFailure(tx, factor!, now);
        await audit(tx, { actorUserId: user.id, action: 'auth.mfa.step_up.failed', target: 'session:' + session!.id, requestId });
        return { status: attempts >= MAX_ATTEMPTS ? 429 : 401, response: jsonError(attempts >= MAX_ATTEMPTS ? 'RATE_LIMITED' : 'INVALID_MFA_CODE', attempts >= MAX_ATTEMPTS ? 429 : 401) };
      }
    }
    // Elevating assurance rotates only this device; other sessions retain their previous assurance.
    await tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.id, session!.id));
    const replacement = await createSession(tx, user.id, now, { authVersion: user.authVersion, mfaVerifiedAt: factorIsActive(factor) ? now : null, stepUpAt: now });
    await audit(tx, { actorUserId: user.id, action: 'auth.step_up', target: 'session:' + replacement.id, requestId, details: { before: { sessionId: session!.id }, after: { mfa: factorIsActive(factor), recovery: factorIsActive(factor) && !!body.data.recoveryCode } } });
    return { status: 200, response: setSession(ok({ ok: true, expiresAt: new Date(now.getTime() + MFA_STEP_UP_MS).toISOString() }), replacement) };
  }).then(result => result.response);
});

async function manageFactor(req: NextRequest, operation: 'regenerate' | 'revoke') {
  if (!assertSameOrigin(req)) return jsonError('INVALID_ORIGIN', 403);
  const body = emptyBody.safeParse(await req.json().catch(() => null)); if (!body.success) return jsonError('INVALID_REQUEST', 422);
  const raw = sessionToken(req); if (!raw) return jsonError('UNAUTHENTICATED', 401);
  const { requestId } = context(req);
  return db.transaction(async tx => {
    if (!await mfaIp(tx, req, requestId)) return jsonError('RATE_LIMITED', 429);
    const identity = await lockIdentity(tx, raw); if (!identity) return jsonError('UNAUTHENTICATED', 401);
    const { user, factor, session } = identity; const now = new Date();
    if (user.mustChangePassword) return jsonError('PASSWORD_CHANGE_REQUIRED', 403);
    if (!hasFreshStepUp(session, now)) return jsonError('STEP_UP_REQUIRED', 403);
    if (!factorIsActive(factor)) return jsonError('MFA_NOT_CONFIGURED', 409);
    if(operation==='revoke'&&await hasPrivilegedMembership(tx,user.id,now))return jsonError('MFA_REQUIRED_BY_ROLE',403);
    openMfaSecret(factor!.secretEncrypted ?? '', user.id);
    if (operation === 'regenerate') {
      const codes = await replaceRecoveryCodes(tx, factor!, now);
      await audit(tx, { actorUserId: user.id, action: 'auth.mfa.recovery.regenerated', target: 'factor:' + factor!.id, requestId, details: { after: { recoveryCount: codes.length } } });
      return ok({ data: { recoveryCodes: codes } });
    }
    await tx.update(mfaFactors).set({ secretEncrypted: null, enabledAt: null, revokedAt: now, lastTimeStep: null, failedAttempts: 0, blockedUntil: null }).where(eq(mfaFactors.id, factor!.id));
    await tx.update(mfaRecoveryCodes).set({ consumedAt: now }).where(and(eq(mfaRecoveryCodes.userId, user.id), isNull(mfaRecoveryCodes.consumedAt)));
    const authVersion = user.authVersion + 1;
    await tx.update(platformUsers).set({ authVersion }).where(eq(platformUsers.id, user.id));
    await invalidateMfaPending(tx, user.id, now);
    const revoked = await revokeUserSessions(tx, user.id, now);
    const replacement = await createSession(tx, user.id, now, { authVersion });
    await audit(tx, { actorUserId: user.id, action: 'auth.mfa.revoked', target: 'factor:' + factor!.id, requestId, details: { before: { configured: true }, after: { configured: false, sessionRevocations: revoked.length } } });
    return setSession(ok({ ok: true }), replacement);
  });
}
export const mfaRegenerateRecovery = withMfaErrors(req => manageFactor(req, 'regenerate'));
export const mfaRevoke = withMfaErrors(req => manageFactor(req, 'revoke'));

export async function cancelMfaChallenge(tx: Transaction, raw: string, requestId: string) {
  if (!tokenFormat.test(raw)) return;
  const [candidate] = await tx.select({ userId: mfaChallenges.userId }).from(mfaChallenges).where(eq(mfaChallenges.tokenHash, challengeHash(raw))).limit(1);
  if (!candidate) return;
  await tx.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, candidate.userId)).for('update');
  await lockMfaFactor(tx, candidate.userId);
  const consumed = await tx.update(mfaChallenges).set({ consumedAt: new Date() }).where(and(eq(mfaChallenges.tokenHash, challengeHash(raw)), isNull(mfaChallenges.consumedAt))).returning({ id: mfaChallenges.id });
  if (consumed.length) await audit(tx, { actorUserId: candidate.userId, action: 'auth.mfa.challenge.cancelled', target: 'challenge:' + consumed[0].id, requestId });
}
