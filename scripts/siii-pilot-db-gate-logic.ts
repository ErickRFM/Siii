/**
 * Read-only SIII → Compañero outbox gate.
 * This checks metadata, NOT delivery or Android visibility.
 */
export type OutboxTableMetadata = {
  relation: string;
  owner: string;
  rls_on: boolean;
  rls_forced: boolean;
  api_grants: boolean;
};
const tables = ['academic_section_outbox', 'academic_section_versions'] as const;

export function assessOutboxGate(appliedMigrations: number, existing: OutboxTableMetadata[]) {
  const reasons: string[] = [];
  if (!Number.isSafeInteger(appliedMigrations) || appliedMigrations < 19) {
    reasons.push('DRIZZLE_0018_NOT_APPLIED');
  }
  const byName = new Map(existing.map(row => [row.relation, row]));
  for (const tableName of tables) {
    const row = byName.get(tableName);
    if (!row) {
      reasons.push('MISSING_TABLE:' + tableName);
      continue;
    }
    if (row.owner !== 'siii_migrator') reasons.push('UNEXPECTED_TABLE_OWNER:' + tableName);
    if (!row.rls_on || !row.rls_forced) reasons.push('RLS_NOT_FORCED:' + tableName);
    if (row.api_grants) reasons.push('DIRECT_DATA_API_GRANT:' + tableName);
  }
  return {
    decision: reasons.length ? 'NO_GO' as const : 'SCHEMA_READY' as const,
    reasons,
    nextAction: reasons.length
      ? 'Reconcile migrations and review changes in an isolated restore; do not activate either delivery flag.'
      : 'Confirm backup, live deployment SHA, tenant HMAC credential and signed end-to-end delivery before enabling.',
  };
}
