import { describe, expect, it } from 'vitest';
import { can, canGrant, canManageTarget, type Grant, type Subject } from '@/shared/auth/capabilities';
import { requiresPrivilegedMfa, careerAdministrationAssuranceAllows } from '@/shared/auth/privileged-policy';

const now = new Date('2026-11-03T12:00:00.000Z');
const institutionId = 'university-a';
const programId = 'technology';
const grant = (role: Grant['role'], scope: Partial<Grant> = {}): Grant => ({
  role, institutionId, scopeType: 'institution', scopeId: null,
  validUntil: null, revokedAt: null, ...scope,
});
const actor = (...grants: Grant[]): Subject => ({
  id: 'operator', active: true, mustChangePassword: false, grants,
});
const career = { institutionId, scopeType: 'program' as const, scopeId: programId };

describe('administración por carrera', () => {
  it('only a live institutional super-admin can designate the program coordinator', () => {
    expect(canGrant(actor(grant('super_admin')), 'coordinator', career, now)).toBe(true);
    expect(canGrant(actor(grant('admin')), 'coordinator', career, now)).toBe(false);
    expect(canGrant(actor(grant('coordinator', { scopeType: 'program', scopeId: programId })), 'coordinator', career, now)).toBe(false);
    expect(canGrant(actor(grant('super_admin', { institutionId: 'other-university' })), 'coordinator', career, now)).toBe(false);
  });

  it('does not grant the coordinator control of another career or institutional users', () => {
    const scoped = actor(grant('coordinator', { scopeType: 'program', scopeId: programId }));
    expect(can(scoped, 'groups.manage', { institutionId, programId, status: 'active' }, now)).toBe(true);
    expect(can(scoped, 'groups.manage', { institutionId, programId: 'medicine', status: 'active' }, now)).toBe(false);
    expect(can(scoped, 'groups.manage', { institutionId: 'other-university', programId, status: 'active' }, now)).toBe(false);
    expect(can(scoped, 'users.update', { institutionId, programId, status: 'active' }, now)).toBe(false);
    expect(can(scoped, 'roles.assign', { institutionId, programId, status: 'active' }, now)).toBe(false);
  });

  it('protects career administrators from ordinary administrator lifecycle changes', () => {
    const target = [grant('coordinator', { scopeType: 'program', scopeId: programId })];
    expect(canManageTarget(actor(grant('admin')), target, institutionId, now)).toBe(false);
    expect(canManageTarget(actor(grant('super_admin')), target, institutionId, now)).toBe(true);
  });

  it('requires MFA in the career-admin workspace without changing academic coordinator behavior', () => {
    const scoped = grant('coordinator', { scopeType: 'program', scopeId: programId });
    expect(requiresPrivilegedMfa([scoped], now)).toBe(false);
    expect(careerAdministrationAssuranceAllows({mfaConfigured:true,mfaVerified:true,stepUpAt:null})).toBe(true);
    expect(careerAdministrationAssuranceAllows({mfaConfigured:false,mfaVerified:false,stepUpAt:null})).toBe(false);
    expect(requiresPrivilegedMfa([grant('coordinator')], now)).toBe(false);
    expect(requiresPrivilegedMfa([{ ...scoped, revokedAt: now }], now)).toBe(false);
    expect(requiresPrivilegedMfa([{ ...scoped, validUntil: now }], now)).toBe(false);
  });

  it('supports independent assignments to multiple careers without crossing scopes', () => {
    const scoped = actor(
      grant('coordinator', { scopeType: 'program', scopeId: programId }),
      grant('coordinator', { scopeType: 'program', scopeId: 'business' }),
    );
    for (const id of ['technology', 'business']) {
      expect(can(scoped, 'groups.manage', { institutionId, programId: id, status: 'active' }, now)).toBe(true);
    }
    expect(can(scoped, 'groups.manage', { institutionId, programId: 'medicine', status: 'active' }, now)).toBe(false);
  });
});
