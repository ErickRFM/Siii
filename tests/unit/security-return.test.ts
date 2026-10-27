import { describe, expect, it } from 'vitest';
import { safeSecurityReturn } from '@/shared/auth/security-return';
const institution = '/dashboard/institutions/168c8230-94ea-4bae-bd10-8cf698882f52';

describe('security returns to an existing institutional operation', () => {
  it.each(['', '/academic', '/roles', '/invitations', '/users', '/admin', '/registry', '/operations', '/grading', '/scheduling', '/services'])('preserves the safe destination %s', suffix => {
    expect(safeSecurityReturn(institution + suffix)).toBe(institution + suffix);
  });
  it.each([undefined, null, [], ['grading'], 'https://example.com', '//example.com', institution + '/grading?next=//example.com', institution + '/grading#publish', institution + '/unknown', institution + '/../../login', institution + '/grading/extra', '/dashboard/institutions/------------------------------------', institution + '\\grading'])('rejects an unsafe or nonexistent destination %s', destination => {
    expect(safeSecurityReturn(destination)).toBeNull();
  });
});
