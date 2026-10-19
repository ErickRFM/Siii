/** Client-only signal: prompts permission revalidation after the server rotates a
 * session or changes MFA assurance. Contains no session IDs, tokens or factors.
 * This event never grants a capability; each listener refetches from the API. */
export const ASSURANCE_CHANGED_EVENT = 'siii:assurance-changed';

export function notifyAssuranceChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ASSURANCE_CHANGED_EVENT));
}
