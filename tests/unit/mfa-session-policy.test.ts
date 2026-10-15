import { describe, expect, it } from 'vitest';
import { sessionIsCurrent, hasFreshStepUp } from '@/shared/auth/mfa-session-policy';
const now = new Date('2026-10-14T12:00:00Z');
const user = { isActive: true, authVersion: 2 };
const session = {
  authVersion: 2, revokedAt: null, expiresAt: new Date('2026-10-15T12:00:00Z'),
  lastSeenAt: now, mfaVerifiedAt: now, stepUpAt: now,
};
const factor = { enabledAt: new Date('2026-10-14T11:00:00Z'), revokedAt: null };
describe('session assurance and version revalidation', () => {
  it('preserves password-only sessions when no factor is active', () => {
    expect(sessionIsCurrent(user, { ...session, mfaVerifiedAt: null }, null, now)).toBe(true);
    expect(sessionIsCurrent(user, { ...session, mfaVerifiedAt: null }, { ...factor, enabledAt: null }, now)).toBe(true);
  });
  it('requires MFA assurance when an active factor exists', () => {
    expect(sessionIsCurrent(user, session, factor, now)).toBe(true);
    expect(sessionIsCurrent(user, { ...session, mfaVerifiedAt: null }, factor, now)).toBe(false);
    expect(sessionIsCurrent(user, { ...session, mfaVerifiedAt: new Date('2026-10-14T10:59:59Z') }, factor, now)).toBe(false);
    expect(sessionIsCurrent(user, { ...session, mfaVerifiedAt: new Date(now.getTime() + 1) }, factor, now)).toBe(false);
  });
  it('denies password and factor changes even when the old row was not yet physically revoked', () => {
    expect(sessionIsCurrent({ ...user, authVersion: 3 }, session, factor, now)).toBe(false);
    expect(sessionIsCurrent({ ...user, isActive: false }, session, factor, now)).toBe(false);
  });
  it('denies absolute, idle and revoked sessions at their exact boundary', () => {
    expect(sessionIsCurrent(user, { ...session, expiresAt: now }, factor, now)).toBe(false);
    expect(sessionIsCurrent(user, { ...session, lastSeenAt: new Date(now.getTime() - 30 * 60000) }, factor, now)).toBe(false);
    expect(sessionIsCurrent(user, { ...session, revokedAt: now }, factor, now)).toBe(false);
  });
  it('fails closed for malformed timestamps and authentication versions', () => {
    expect(sessionIsCurrent(user, { ...session, expiresAt: new Date('invalid') }, null, now)).toBe(false);
    expect(sessionIsCurrent(user, { ...session, lastSeenAt: new Date('invalid') }, null, now)).toBe(false);
    expect(sessionIsCurrent({ ...user, authVersion: -1 }, { ...session, authVersion: -1 }, null, now)).toBe(false);
  });
  it('requires recent step-up in addition to an otherwise current session', () => {
    expect(hasFreshStepUp(session, now)).toBe(true);
    expect(hasFreshStepUp({ ...session, stepUpAt: null }, now)).toBe(false);
    expect(hasFreshStepUp({ ...session, stepUpAt: new Date(now.getTime() - 5 * 60000) }, now)).toBe(false);
    expect(hasFreshStepUp({ ...session, stepUpAt: new Date(now.getTime() + 1) }, now)).toBe(false);
  });
});
