import { SESSION_IDLE_MS } from './session-policy';
export const MFA_STEP_UP_MS = 5 * 60000;
type User = { isActive: boolean; authVersion: number };
type Session = { authVersion: number; revokedAt: Date | null; expiresAt: Date; lastSeenAt: Date; mfaVerifiedAt: Date | null; stepUpAt: Date | null };
type Factor = { enabledAt: Date | null; revokedAt: Date | null };
export function sessionIsCurrent(user: User, session: Session, factor: Factor | null, now: Date): boolean {
  if (!Number.isSafeInteger(user.authVersion) || user.authVersion < 0 || !Number.isSafeInteger(session.authVersion)
    || !Number.isFinite(now.getTime()) || !Number.isFinite(session.expiresAt.getTime()) || !Number.isFinite(session.lastSeenAt.getTime())) return false;
  if (!user.isActive || session.authVersion !== user.authVersion || session.revokedAt
    || session.expiresAt <= now || session.lastSeenAt.getTime() <= now.getTime() - SESSION_IDLE_MS) return false;
  if (!factor?.enabledAt || factor.revokedAt) return true;
  return !!session.mfaVerifiedAt && session.mfaVerifiedAt >= factor.enabledAt && session.mfaVerifiedAt <= now;
}
export function hasFreshStepUp(session: Pick<Session, 'stepUpAt'>, now: Date): boolean {
  return !!session.stepUpAt && session.stepUpAt <= now && session.stepUpAt.getTime() > now.getTime() - MFA_STEP_UP_MS;
}
