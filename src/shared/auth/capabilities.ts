import type { Role } from './roles';
export type P1Role = Role | 'guest' | 'control_escolar' | 'workshop_facilitator';

/** Stable action identifiers, suitable for API capability disclosures. */
export const CAPABILITIES = Object.freeze({
  'admissions.manage': 'admissions.manage',
  'institutions.read': 'institutions.read', 'institutions.manage': 'institutions.manage',
  'users.read': 'users.read', 'users.create': 'users.create', 'users.update': 'users.update',
  'users.suspend': 'users.suspend', 'users.restore': 'users.restore', 'users.reset': 'users.reset',
  'memberships.manage': 'memberships.manage', 'roles.assign': 'roles.assign', 'invitations.manage': 'invitations.manage',
  'programs.read': 'programs.read', 'programs.manage': 'programs.manage',
  'curricula.read': 'curricula.read', 'curricula.manage': 'curricula.manage',
  'courses.read': 'courses.read', 'courses.manage': 'courses.manage',
  'campuses.read': 'campuses.read', 'campuses.manage': 'campuses.manage',
  'terms.read': 'terms.read', 'terms.manage': 'terms.manage',
  'groups.manage': 'groups.manage', 'enrollments.manage': 'enrollments.manage',
  'grades.read': 'grades.read', 'grades.manage': 'grades.manage', 'grades.publish': 'grades.publish',
  'audit.read': 'audit.read', 'settings.manage': 'settings.manage', 'integrations.manage': 'integrations.manage',
} as const);
export type Capability = keyof typeof CAPABILITIES;

const CATALOG_READ: readonly Capability[] = ['programs.read', 'curricula.read', 'courses.read', 'campuses.read', 'terms.read'];
const CATALOG_MANAGE: readonly Capability[] = ['programs.manage', 'curricula.manage', 'courses.manage', 'campuses.manage', 'terms.manage'];
const ALL_CAPABILITIES = Object.freeze(Object.keys(CAPABILITIES) as Capability[]);
const readonlyCapabilities = (...capabilities: Capability[]): readonly Capability[] => Object.freeze(capabilities);

export const ROLE_CAPABILITIES: Readonly<Record<P1Role, readonly Capability[]>> = Object.freeze({
  guest: readonlyCapabilities('institutions.read'),
  student: readonlyCapabilities('institutions.read', ...CATALOG_READ, 'grades.read'),
  workshop_participant: readonlyCapabilities('institutions.read'),
  teacher_pending: readonlyCapabilities('institutions.read'),
  teacher: readonlyCapabilities('institutions.read', ...CATALOG_READ, 'grades.read', 'grades.manage', 'grades.publish'),
  tutor: readonlyCapabilities('institutions.read', ...CATALOG_READ),
  coordinator: readonlyCapabilities('institutions.read', 'users.read', ...CATALOG_READ, ...CATALOG_MANAGE, 'groups.manage', 'enrollments.manage', 'grades.read'),
  control_escolar: readonlyCapabilities('admissions.manage', 'institutions.read', 'users.read', ...CATALOG_READ, 'enrollments.manage', 'grades.read'),
  workshop_facilitator: readonlyCapabilities('institutions.read', ...CATALOG_READ, 'groups.manage', 'grades.read', 'grades.manage'),
  // Administrators must contain every capability they may delegate, including grade publication.
  admin: ALL_CAPABILITIES,
  super_admin: ALL_CAPABILITIES,
});

export type Grant = { role: P1Role; institutionId: string; scopeType: 'institution' | 'program' | 'campus'; scopeId: string | null; validUntil: Date | null; revokedAt: Date | null };
export type Subject = { id: string; active: boolean; mustChangePassword: boolean; grants: readonly Grant[] };
/** Grants and record relations must come from server queries, never request bodies. */
export type Resource = { institutionId: string; programId?: string; campusId?: string; status?: string; ownerUserId?: string; assignedUserIds?: readonly string[] };
export type GrantScope = Pick<Grant, 'institutionId' | 'scopeType' | 'scopeId'>;

const TENANT_WIDE = new Set<Capability>([
  'admissions.manage',
  'institutions.manage', 'users.read', 'users.create', 'users.update', 'users.suspend', 'users.restore', 'users.reset',
  'memberships.manage', 'roles.assign', 'invitations.manage', 'audit.read', 'settings.manage', 'integrations.manage',
]);

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}
function validScope(scope: GrantScope): boolean {
  if (!scope || typeof scope.institutionId !== 'string' || !scope.institutionId.length) return false;
  if (scope.scopeType === 'institution') return scope.scopeId === null;
  return (scope.scopeType === 'program' || scope.scopeType === 'campus')
    && typeof scope.scopeId === 'string' && scope.scopeId.length > 0;
}
function validSubject(subject: Subject, now: Date): boolean {
  return !!subject && typeof subject.id === 'string' && subject.id.length > 0
    && subject.active === true && subject.mustChangePassword === false && Array.isArray(subject.grants) && validDate(now);
}
function validGrant(grant: Grant, now: Date): boolean {
  if (!grant || !validScope(grant) || typeof grant.role !== 'string' || !Object.hasOwn(ROLE_CAPABILITIES, grant.role) || grant.revokedAt !== null) return false;
  if ((grant.role === 'admin' || grant.role === 'super_admin') && grant.scopeType !== 'institution') return false;
  return grant.validUntil === null || (validDate(grant.validUntil) && grant.validUntil.getTime() > now.getTime());
}
function scopeMatches(grant: Grant, resource: Resource): boolean {
  if (grant.institutionId !== resource.institutionId) return false;
  if (grant.scopeType === 'institution') return true;
  if (grant.scopeType === 'program') return grant.scopeId === resource.programId;
  return grant.scopeId === resource.campusId;
}
function scopeContains(actorScope: GrantScope, targetScope: GrantScope): boolean {
  return actorScope.institutionId === targetScope.institutionId
    && (actorScope.scopeType === 'institution'
      || (actorScope.scopeType === targetScope.scopeType && actorScope.scopeId === targetScope.scopeId));
}

function stateAllows(capability: Capability, status: string | undefined): boolean {
  // New records have no prior state. Restoration always requires an explicit disabled state.
  if (status === undefined) return capability !== 'users.restore' && capability !== 'grades.manage' && capability !== 'grades.publish';
  if (capability === 'users.restore') return status === 'inactive' || status === 'suspended';
  if (capability === 'memberships.manage') return status === 'active' || status === 'suspended';
  if (capability === 'grades.read') return ['active', 'draft', 'published', 'inactive', 'suspended', 'archived'].includes(status);
  if (capability.endsWith('.read')) return ['active', 'inactive', 'suspended', 'archived'].includes(status);
  // Existing catalogs permit reactivation from inactive; archived is terminal.
  if (CATALOG_MANAGE.includes(capability)) return status === 'active' || status === 'inactive';
  if (capability === 'grades.manage' || capability === 'grades.publish' || capability === 'groups.manage' || capability === 'enrollments.manage') {
    return status === 'active' || status === 'draft';
  }
  return status === 'active';
}
function relationAllows(subject: Subject, grant: Grant, capability: Capability, resource: Resource): boolean {
  if (!capability.startsWith('grades.')) return true;
  if (grant.role === 'admin' || grant.role === 'super_admin') return grant.scopeType === 'institution';
  if (grant.role === 'student') return resource.ownerUserId === subject.id;
  return Array.isArray(resource.assignedUserIds) && resource.assignedUserIds.includes(subject.id);
}

/** Pure policy: callers re-load trusted grants/relations and revalidate writes inside their transaction. */
export function can(subject: Subject, capability: Capability, resource: Resource, now = new Date()): boolean {
  if (!validSubject(subject, now) || !resource || typeof resource.institutionId !== 'string' || !resource.institutionId.length
    || typeof capability !== 'string' || !Object.hasOwn(CAPABILITIES, capability) || !stateAllows(capability, resource.status)) return false;
  return subject.grants.some(grant => validGrant(grant, now) && scopeMatches(grant, resource)
    && (grant.scopeType === 'institution' || !TENANT_WIDE.has(capability))
    && ROLE_CAPABILITIES[grant.role].includes(capability) && relationAllows(subject, grant, capability, resource));
}

export function canGrant(subject: Subject, targetRole: P1Role, targetScope: GrantScope, now = new Date(), expiresAt: Date | null = null): boolean {
  if (!validSubject(subject, now) || !validScope(targetScope) || typeof targetRole !== 'string' || !Object.hasOwn(ROLE_CAPABILITIES, targetRole)
    || targetRole === 'super_admin' || (targetRole === 'admin' && targetScope.scopeType !== 'institution')
    || (expiresAt !== null && (!validDate(expiresAt) || expiresAt <= now))) return false;
  if (!can(subject, 'roles.assign', { institutionId: targetScope.institutionId, status: 'active' }, now)) return false;
  const delegated = ROLE_CAPABILITIES[targetRole].filter(capability => targetScope.scopeType === 'institution' || !TENANT_WIDE.has(capability));
  return subject.grants.some(grant => validGrant(grant, now) && scopeContains(grant, targetScope)
    && (grant.validUntil === null || (expiresAt !== null && expiresAt <= grant.validUntil))
    && (targetRole !== 'admin' || grant.role === 'super_admin')
    && ROLE_CAPABILITIES[grant.role].includes('roles.assign')
    && delegated.every(capability => ROLE_CAPABILITIES[grant.role].includes(capability)));
}

export function canManageTarget(subject:Subject,targetGrants:readonly Grant[],institutionId:string,now=new Date()){
 if(!can(subject,'memberships.manage',{institutionId,status:'active'},now))return false;
 const live=targetGrants.filter(grant=>grant.institutionId===institutionId&&validGrant(grant,now));
 if(live.some(grant=>grant.role==='super_admin'))return false;
 return !live.some(grant=>grant.role==='admin')||subject.grants.some(grant=>validGrant(grant,now)&&grant.institutionId===institutionId&&grant.scopeType==='institution'&&grant.role==='super_admin');
}

export function canRevoke(subject:Subject,role:P1Role,scope:GrantScope,now=new Date()){
 return subject.grants.some(grant=>canGrant({...subject,grants:[grant]},role,scope,now,grant.validUntil));
}

export function administratorState(grants:readonly Grant[],now=new Date()){
 const administrators=grants.filter(grant=>validGrant(grant,now)&&grant.scopeType==='institution'&&(grant.role==='admin'||grant.role==='super_admin'));
 return {any:administrators.length>0,permanent:administrators.some(grant=>grant.validUntil===null)};
}

export function delegationDisclosure(subject:Subject,scope:GrantScope,now=new Date()){
 const grantableRoles:P1Role[]=[],grantExpiryLimits:Partial<Record<P1Role,string|null>>={};
 for(const role of Object.keys(ROLE_CAPABILITIES) as P1Role[]){
  if(canGrant(subject,role,scope,now,null)){grantableRoles.push(role);grantExpiryLimits[role]=null;continue;}
  // A complete authorizing grant must independently cover this lifetime; never union authority.
  const expiries=subject.grants.flatMap(grant=>grant.validUntil&&canGrant({...subject,grants:[grant]},role,scope,now,grant.validUntil)?[grant.validUntil]:[]);
  if(expiries.length){grantableRoles.push(role);grantExpiryLimits[role]=new Date(Math.max(...expiries.map(expiry=>expiry.getTime()))).toISOString();}
 }
 return {grantableRoles,grantExpiryLimits};
}
