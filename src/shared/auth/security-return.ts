/** Presentation-only return target. The destination still authorizes the current session. */
export function safeSecurityReturn(returnTo: unknown): string | null {
  if (typeof returnTo !== 'string') return null;
  const destination = /^\/dashboard\/institutions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/(?:academic|roles|invitations|users|admin|registry|operations|grading|scheduling|services))?$/;
  return destination.test(returnTo) ? returnTo : null;
}
