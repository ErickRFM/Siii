import { describe, expect, it } from 'vitest';
import { can, canGrant, type Capability, type Grant, type P1Role, type Resource, type Subject } from '@/shared/auth/capabilities';

const NOW = new Date('2026-10-14T12:00:00Z');
const USER = 'user-a';
const TENANT = 'institution-a';
const CAPABILITIES: Capability[] = [
  'institutions.read', 'institutions.manage', 'users.read', 'users.create', 'users.update',
  'users.suspend', 'users.restore', 'users.reset', 'memberships.manage', 'roles.assign', 'invitations.manage',
  'programs.read', 'programs.manage', 'curricula.read', 'curricula.manage', 'courses.read', 'courses.manage',
  'campuses.read', 'campuses.manage', 'terms.read', 'terms.manage', 'groups.manage', 'enrollments.manage',
  'grades.read', 'grades.manage', 'grades.publish', 'audit.read', 'settings.manage', 'integrations.manage',
];
// Independent acceptance table: every allowed AND denied role/action cell is executed.
const EXPECTED: Record<P1Role, readonly Capability[]> = {
  guest: ['institutions.read'],
  student: ['institutions.read', 'programs.read', 'curricula.read', 'courses.read', 'campuses.read', 'terms.read', 'grades.read'],
  teacher_pending: ['institutions.read'],
  workshop_participant: ['institutions.read'],
  teacher: ['institutions.read', 'programs.read', 'curricula.read', 'courses.read', 'campuses.read', 'terms.read', 'grades.read', 'grades.manage', 'grades.publish'],
  tutor: ['institutions.read', 'programs.read', 'curricula.read', 'courses.read', 'campuses.read', 'terms.read'],
  coordinator: ['institutions.read', 'users.read', 'programs.read', 'programs.manage', 'curricula.read', 'curricula.manage', 'courses.read', 'courses.manage', 'campuses.read', 'campuses.manage', 'terms.read', 'terms.manage', 'groups.manage', 'enrollments.manage', 'grades.read'],
  control_escolar: ['institutions.read', 'users.read', 'programs.read', 'curricula.read', 'courses.read', 'campuses.read', 'terms.read', 'enrollments.manage', 'grades.read'],
  workshop_facilitator: ['institutions.read', 'programs.read', 'curricula.read', 'courses.read', 'campuses.read', 'terms.read', 'groups.manage', 'grades.read', 'grades.manage'],
  admin: ['institutions.read', 'institutions.manage', 'users.read', 'users.create', 'users.update', 'users.suspend', 'users.restore', 'users.reset', 'memberships.manage', 'roles.assign', 'invitations.manage', 'programs.read', 'programs.manage', 'curricula.read', 'curricula.manage', 'courses.read', 'courses.manage', 'campuses.read', 'campuses.manage', 'terms.read', 'terms.manage', 'groups.manage', 'enrollments.manage', 'grades.read', 'grades.manage', 'grades.publish', 'audit.read', 'settings.manage', 'integrations.manage'],
  super_admin: ['institutions.read', 'institutions.manage', 'users.read', 'users.create', 'users.update', 'users.suspend', 'users.restore', 'users.reset', 'memberships.manage', 'roles.assign', 'invitations.manage', 'programs.read', 'programs.manage', 'curricula.read', 'curricula.manage', 'courses.read', 'courses.manage', 'campuses.read', 'campuses.manage', 'terms.read', 'terms.manage', 'groups.manage', 'enrollments.manage', 'grades.read', 'grades.manage', 'grades.publish', 'audit.read', 'settings.manage', 'integrations.manage'],
};

function grant(role: P1Role = 'admin', patch: Partial<Grant> = {}): Grant {
  return { role, institutionId: TENANT, scopeType: 'institution', scopeId: null, validUntil: null, revokedAt: null, ...patch };
}
function actor(role: P1Role = 'admin', patch: Partial<Subject> = {}): Subject {
  return { id: USER, active: true, mustChangePassword: false, grants: [grant(role)], ...patch };
}
const record: Resource = { institutionId: TENANT, status: 'active', ownerUserId: USER, assignedUserIds: [USER] };
const institutional = { institutionId: TENANT, scopeType: 'institution', scopeId: null } as const;

describe('institutional capability acceptance matrix', () => {
  for (const role of Object.keys(EXPECTED) as P1Role[]) {
    for (const capability of CAPABILITIES) {
      it(`${role} ${EXPECTED[role].includes(capability) ? 'allows' : 'denies'} ${capability}`, () => {
        // Restoration is evaluated against a suspended target, not an active one.
        const resource = capability === 'users.restore' ? { ...record, status: 'suspended' } : record;
        expect(can(actor(role), capability, resource, NOW)).toBe(EXPECTED[role].includes(capability));
      });
    }
  }
});

describe('deny by default and grant validity', () => {
  it.each(['student', 'teacher', 'coordinator', 'admin', 'super_admin'] as const)('denies a different institution even for %s', role => {
    expect(can(actor(role), 'institutions.read', { ...record, institutionId: 'institution-b' }, NOW)).toBe(false);
  });
  it.each([
    { active: false }, { mustChangePassword: true }, { id: '' }, { grants: [] },
  ])('denies invalid subjects %j', patch => {
    expect(can(actor('admin', patch), 'programs.manage', record, NOW)).toBe(false);
  });
  it('rejects unknown roles and capabilities despite a valid institution', () => {
    expect(can(actor('unknown' as P1Role), 'institutions.read', record, NOW)).toBe(false);
    expect(can(actor(), 'unknown.manage' as Capability, record, NOW)).toBe(false);
    expect(can(actor(), '__proto__' as Capability, record, NOW)).toBe(false);
    expect(can(actor('__proto__' as P1Role), 'institutions.read', record, NOW)).toBe(false);
    expect(can(actor({ toString: () => 'admin' } as unknown as P1Role), 'users.create', record, NOW)).toBe(false);
    expect(can(actor(), { toString: () => 'users.create' } as unknown as Capability, record, NOW)).toBe(false);
  });
  it.each([
    { validUntil: new Date('2026-10-14T11:59:59Z') }, { validUntil: NOW },
    { validUntil: new Date('invalid') }, { revokedAt: NOW },
    { revokedAt: new Date('2026-10-15T12:00:00Z') },
    { scopeType: 'program' as const, scopeId: null }, { scopeType: 'institution' as const, scopeId: 'unexpected' },
    { institutionId: '' }, { scopeType: 'unrecognized' as Grant['scopeType'] },
  ])('denies malformed, expired or revoked grants %j', patch => {
    expect(can(actor('admin', { grants: [grant('admin', patch)] }), 'programs.manage', record, NOW)).toBe(false);
  });
  it('honors exact expiry boundaries without requiring a cleanup job', () => {
    const subject = actor('teacher', { grants: [grant('teacher', { validUntil: new Date(NOW.getTime() + 1) })] });
    expect(can(subject, 'grades.publish', record, NOW)).toBe(true);
    expect(can(subject, 'grades.publish', record, new Date(NOW.getTime() + 1))).toBe(false);
  });
  it('can use another valid grant while ignoring a revoked grant', () => {
    const subject = actor('admin', { grants: [grant('admin', { revokedAt: NOW }), grant('teacher')] });
    expect(can(subject, 'grades.publish', record, NOW)).toBe(true);
    expect(can(subject, 'roles.assign', record, NOW)).toBe(false);
  });
  it('rejects an invalid evaluation time', () => {
    expect(can(actor(), 'institutions.read', record, new Date('invalid'))).toBe(false);
  });
});

describe('scope and backend resource relations', () => {
  it.each(['program', 'campus'] as const)('requires an explicit matching %s relation', scopeType => {
    const subject = actor('coordinator', { grants: [grant('coordinator', { scopeType, scopeId: 'scope-a' })] });
    const matching = { ...record, [scopeType === 'program' ? 'programId' : 'campusId']: 'scope-a' };
    expect(can(subject, 'courses.manage', matching, NOW)).toBe(true);
    expect(can(subject, 'courses.manage', record, NOW)).toBe(false);
    expect(can(subject, 'courses.manage', { ...matching, [scopeType === 'program' ? 'programId' : 'campusId']: 'scope-b' }, NOW)).toBe(false);
    expect(can(subject, 'courses.manage', { ...matching, institutionId: 'institution-b' }, NOW)).toBe(false);
  });
  it('does not infer a course relation from the identifier of another resource', () => {
    const subject = actor('coordinator', { grants: [grant('coordinator', { scopeType: 'program', scopeId: 'scope-a' })] });
    expect(can(subject, 'courses.manage', { institutionId: TENANT, campusId: 'scope-a' }, NOW)).toBe(false);
  });
  it.each(['institutions.manage', 'users.read', 'users.create', 'users.update', 'users.suspend', 'users.restore', 'users.reset', 'memberships.manage', 'roles.assign', 'invitations.manage', 'audit.read', 'settings.manage', 'integrations.manage'] as const)
    ('never permits tenantwide %s through a scoped grant', capability => {
      const subject = actor('admin', { grants: [grant('admin', { scopeType: 'program', scopeId: 'scope-a' })] });
      expect(can(subject, capability, { ...record, programId: 'scope-a', status: capability === 'users.restore' ? 'suspended' : 'active' }, NOW)).toBe(false);
    });
  it('also denies users.read through a valid scoped coordinator role', () => {
    const subject = actor('coordinator', { grants: [grant('coordinator', { scopeType: 'program', scopeId: 'scope-a' })] });
    expect(can(subject, 'users.read', { ...record, programId: 'scope-a' }, NOW)).toBe(false);
  });
  it('a student reads only their own grade resource', () => {
    expect(can(actor('student'), 'grades.read', { ...record, assignedUserIds: [] }, NOW)).toBe(true);
    expect(can(actor('student'), 'grades.read', { ...record, ownerUserId: 'other-user' }, NOW)).toBe(false);
    expect(can(actor('student'), 'grades.read', { institutionId: TENANT }, NOW)).toBe(false);
    expect(can(actor('student'), 'grades.publish', record, NOW)).toBe(false);
  });
  it.each(['teacher', 'coordinator', 'control_escolar', 'workshop_facilitator'] as const)('%s needs a server supplied assignment for grades', role => {
    expect(can(actor(role), 'grades.read', { ...record, ownerUserId: 'other-user' }, NOW)).toBe(true);
    expect(can(actor(role), 'grades.read', { ...record, assignedUserIds: [] }, NOW)).toBe(false);
    expect(can(actor(role), 'grades.read', { institutionId: TENANT, ownerUserId: USER }, NOW)).toBe(false);
  });
  it('a grade assignment cannot cross a program scope', () => {
    const subject = actor('teacher', { grants: [grant('teacher', { scopeType: 'program', scopeId: 'program-a' })] });
    expect(can(subject, 'grades.publish', { ...record, programId: 'program-a' }, NOW)).toBe(true);
    expect(can(subject, 'grades.publish', { ...record, programId: 'program-b' }, NOW)).toBe(false);
  });
  it('admin and super_admin may read grades broadly within their institution', () => {
    for (const role of ['admin', 'super_admin'] as const) {
      expect(can(actor(role), 'grades.read', { institutionId: TENANT, status: 'published' }, NOW)).toBe(true);
      expect(can(actor(role), 'grades.read', { institutionId: 'other', status: 'published' }, NOW)).toBe(false);
    }
  });
});

describe('resource state policy', () => {
  it.each(['active', 'inactive', 'archived'])('allows catalog reads in %s state', status => {
    expect(can(actor('student'), 'courses.read', { ...record, status }, NOW)).toBe(true);
  });
  it('allows reactivation of inactive catalogs but never mutation of archived resources', () => {
    expect(can(actor('coordinator'), 'courses.manage', { ...record, status: 'inactive' }, NOW)).toBe(true);
    for (const capability of ['courses.manage', 'users.update', 'roles.assign', 'grades.manage', 'grades.publish'] as const) {
      expect(can(actor(), capability, { ...record, status: 'archived' }, NOW)).toBe(false);
    }
  });
  it('allows reading published grades without silently editing or publishing them again', () => {
    expect(can(actor('teacher'), 'grades.read', { ...record, status: 'published' }, NOW)).toBe(true);
    expect(can(actor('teacher'), 'grades.manage', { ...record, status: 'published' }, NOW)).toBe(false);
    expect(can(actor('teacher'), 'grades.publish', { ...record, status: 'published' }, NOW)).toBe(false);
  });
  it('permits editing draft grades for an assigned teacher', () => {
    expect(can(actor('teacher'), 'grades.manage', { ...record, status: 'draft' }, NOW)).toBe(true);
    expect(can(actor('teacher'), 'grades.publish', { ...record, status: 'draft' }, NOW)).toBe(true);
  });
  it('requires explicit state before editing or publishing a grade resource', () => {
    const resource = { institutionId: TENANT, assignedUserIds: [USER] };
    expect(can(actor('teacher'), 'grades.read', resource, NOW)).toBe(true);
    expect(can(actor('teacher'), 'grades.manage', resource, NOW)).toBe(false);
    expect(can(actor('teacher'), 'grades.publish', resource, NOW)).toBe(false);
  });
  it('separates suspended-user restoration from suspension, update, reset and role assignment', () => {
    expect(can(actor(), 'users.restore', { ...record, status: 'suspended' }, NOW)).toBe(true);
    expect(can(actor(), 'users.restore', record, NOW)).toBe(false);
    for (const capability of ['users.suspend', 'users.update', 'users.reset', 'roles.assign', 'grades.manage', 'grades.publish'] as const) {
      expect(can(actor(), capability, { ...record, status: 'suspended' }, NOW)).toBe(false);
    }
  });
  it('permits restoring a suspended membership through its dedicated management action', () => {
    expect(can(actor(), 'memberships.manage', { ...record, status: 'suspended' }, NOW)).toBe(true);
  });
  it.each(['unknown', '', 'deleted'])('denies unknown resource state %j', status => {
    expect(can(actor(), 'courses.read', { ...record, status }, NOW)).toBe(false);
    expect(can(actor(), 'courses.manage', { ...record, status }, NOW)).toBe(false);
  });
});

describe('role delegation without escalation', () => {
  it.each(['guest', 'student', 'teacher', 'teacher_pending', 'workshop_participant', 'workshop_facilitator', 'tutor', 'coordinator', 'control_escolar'] as const)
    ('allows admin to grant contained capabilities for %s', role => {
      expect(canGrant(actor(), role, institutional, NOW)).toBe(true);
    });
  it('allows super_admin to grant admin but never ordinary super_admin provisioning', () => {
    expect(canGrant(actor('super_admin'), 'admin', institutional, NOW)).toBe(true);
    expect(canGrant(actor('admin'), 'admin', institutional, NOW)).toBe(false);
    expect(canGrant(actor('super_admin'), 'super_admin', institutional, NOW)).toBe(false);
  });
  it.each(['guest', 'student', 'teacher', 'teacher_pending', 'workshop_participant', 'workshop_facilitator', 'tutor', 'coordinator', 'control_escolar'] as const)
    ('does not allow %s to mint grants without roles.assign', role => {
      expect(canGrant(actor(role), 'student', institutional, NOW)).toBe(false);
    });
  it.each(['program', 'campus'] as const)('allows institutional admin to grant lower roles within a contained %s scope', scopeType => {
    expect(canGrant(actor(), 'teacher', { institutionId: TENANT, scopeType, scopeId: 'scope-a' }, NOW)).toBe(true);
    expect(canGrant(actor('super_admin'), 'admin', { institutionId: TENANT, scopeType, scopeId: 'scope-a' }, NOW)).toBe(false);
    expect(canGrant(actor(), 'coordinator', { institutionId: TENANT, scopeType, scopeId: 'scope-a' }, NOW)).toBe(true);
  });
  it('never delegates to another tenant or widens a scoped actor grant', () => {
    expect(canGrant(actor(), 'teacher', { ...institutional, institutionId: 'other-tenant' }, NOW)).toBe(false);
    const subject = actor('admin', { grants: [grant('admin', { scopeType: 'program', scopeId: 'scope-a' })] });
    expect(canGrant(subject, 'teacher', institutional, NOW)).toBe(false);
    expect(canGrant(subject, 'teacher', { institutionId: TENANT, scopeType: 'program', scopeId: 'scope-b' }, NOW)).toBe(false);
  });
  it.each([
    { active: false }, { mustChangePassword: true },
    { grants: [grant('admin', { validUntil: NOW })] }, { grants: [grant('admin', { revokedAt: NOW })] },
  ])('denies delegation by an ineligible actor %j', patch => {
    expect(canGrant(actor('admin', patch), 'student', institutional, NOW)).toBe(false);
  });
  it('does not combine an expired administrator with a valid teacher into grant authority', () => {
    const subject = actor('teacher', { grants: [grant('admin', { validUntil: NOW }), grant('teacher')] });
    expect(canGrant(subject, 'teacher', institutional, NOW)).toBe(false);
  });
  it('denies unknown roles and malformed target scopes', () => {
    expect(canGrant(actor(), 'unknown' as P1Role, institutional, NOW)).toBe(false);
    expect(canGrant(actor(), { toString: () => 'teacher' } as unknown as P1Role, institutional, NOW)).toBe(false);
    expect(canGrant(actor(), 'student', { ...institutional, scopeType: 'program', scopeId: null }, NOW)).toBe(false);
    expect(canGrant(actor(), 'student', { ...institutional, scopeId: 'unexpected' }, NOW)).toBe(false);
    expect(canGrant(actor(), 'student', { ...institutional, institutionId: '' }, NOW)).toBe(false);
  });
});
