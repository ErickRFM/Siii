import {describe, expect, it} from 'vitest';
import {assessOutboxGate, type OutboxTableMetadata} from '../../scripts/siii-pilot-db-gate-logic';

const secure = (): OutboxTableMetadata[] => [
  {relation: 'academic_section_outbox', owner: 'siii_migrator', rls_on: true, rls_forced: true, api_grants: false},
  {relation: 'academic_section_versions', owner: 'siii_migrator', rls_on: true, rls_forced: true, api_grants: false},
];

describe('SIII / Compañero outbox preflight: fail-closed', () => {
  it('refuses a valid historical 0017 ledger even when table metadata looks correct', () => {
    const result = assessOutboxGate(18, secure());
    expect(result.decision).toBe('NO_GO');
    expect(result.reasons).toContain('DRIZZLE_0018_NOT_APPLIED');
  });
  it('refuses missing event or version tables at migration 0018', () => {
    const result = assessOutboxGate(19, secure().slice(0, 1));
    expect(result.reasons).toContain('MISSING_TABLE:academic_section_versions');
    expect(result.decision).toBe('NO_GO');
  });
  it('refuses missing FORCE RLS, wrong ownership or Data API grants', () => {
    const rows = secure();
    rows[0].rls_forced = false;
    rows[1].owner = 'postgres';
    rows[1].api_grants = true;
    expect(assessOutboxGate(20, rows).reasons).toEqual([
      'RLS_NOT_FORCED:academic_section_outbox',
      'UNEXPECTED_TABLE_OWNER:academic_section_versions',
      'DIRECT_DATA_API_GRANT:academic_section_versions',
    ]);
  });
  it('passes only the schema gate after 0018 and leaves delivery unverified', () => {
    const result = assessOutboxGate(19, secure());
    expect(result.decision).toBe('SCHEMA_READY');
    expect(result.reasons).toEqual([]);
    expect(result.nextAction).toContain('signed end-to-end delivery');
  });
  it('refuses implausible ledger values', () => {
    expect(assessOutboxGate(-1, secure()).decision).toBe('NO_GO');
    expect(assessOutboxGate(Number.NaN, secure()).decision).toBe('NO_GO');
  });
});
