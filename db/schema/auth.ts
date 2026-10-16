import { pgEnum, pgTable, uuid, text, timestamp, integer, index, uniqueIndex, jsonb, check, foreignKey } from 'drizzle-orm/pg-core';
import { institutions, platformUsers, userRoleEnum, campuses } from './core';
import { academicPrograms } from './academic';
import { sql } from 'drizzle-orm';

export const membershipStatusEnum = pgEnum('membership_status', ['active', 'suspended']);

export const institutionMemberships = pgTable('institution_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => platformUsers.id, { onDelete: 'restrict' }),
  status: membershipStatusEnum('status').notNull().default('active'),
  displayName:text('display_name'),institutionalCode:text('institutional_code'),institutionalEmail:text('institutional_email'),deletedAt:timestamp('deleted_at',{withTimezone:true}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  deletedSuspended:check('membership_deleted_suspended_check',sql`deleted_at IS NULL OR status='suspended'`),
  profileLengths:check('membership_profile_lengths_check',sql`(display_name IS NULL OR length(display_name) BETWEEN 1 AND 160) AND (institutional_code IS NULL OR length(institutional_code) BETWEEN 1 AND 80) AND (institutional_email IS NULL OR length(institutional_email) BETWEEN 3 AND 254)`),
  institutionalCodeUnique:uniqueIndex('membership_institutional_code_uidx').on(table.institutionId,table.institutionalCode).where(sql`institutional_code IS NOT NULL`),
  lifecycle:index('membership_lifecycle_created_idx').on(table.institutionId,table.status,table.deletedAt,table.createdAt,table.id),
  uniqueMember: uniqueIndex('institution_member_unique').on(table.institutionId, table.userId),
  scopedIdentity: uniqueIndex('institution_member_id_scope_uidx').on(table.id,table.institutionId),
  byUser: index('institution_member_user_idx').on(table.userId),
  tenantReference: uniqueIndex('institution_membership_id_institution_uidx').on(table.id,table.institutionId),
}));

export const roleAssignments = pgTable('role_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  membershipId: uuid('membership_id').notNull().references(() => institutionMemberships.id, { onDelete: 'restrict' }),
  role: userRoleEnum('role').notNull(),
  grantedBy: uuid('granted_by').references(() => platformUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  // Legacy institution grants may omit institutionId; scoped grants must supply it.
  institutionId: uuid('institution_id'),
  scopeType: text('scope_type').$type<'institution'|'program'|'campus'>().notNull().default('institution'),
  programId: uuid('scope_program_id'),
  campusId: uuid('scope_campus_id'),
  expiresAt: timestamp('expires_at',{withTimezone:true}),
}, table => ({
  idMember:uniqueIndex('role_assignment_id_member_uidx').on(table.id,table.membershipId),
  activeRole: uniqueIndex('role_assignment_unique_active').on(table.membershipId, table.role).where(sql`${table.revokedAt} IS NULL AND ${table.scopeType} = 'institution'`),
  activeProgramRole: uniqueIndex('role_assignment_unique_program').on(table.membershipId,table.role,table.programId).where(sql`${table.revokedAt} IS NULL AND ${table.scopeType} = 'program'`),
  activeCampusRole: uniqueIndex('role_assignment_unique_campus').on(table.membershipId,table.role,table.campusId).where(sql`${table.revokedAt} IS NULL AND ${table.scopeType} = 'campus'`),
  scopeValid:check('role_assignment_scope_check',sql`(${table.scopeType} = 'institution' AND ${table.programId} IS NULL AND ${table.campusId} IS NULL) OR (${table.scopeType} = 'program' AND ${table.institutionId} IS NOT NULL AND ${table.programId} IS NOT NULL AND ${table.campusId} IS NULL) OR (${table.scopeType} = 'campus' AND ${table.institutionId} IS NOT NULL AND ${table.campusId} IS NOT NULL AND ${table.programId} IS NULL)`),
  adminScope:check('role_assignment_admin_scope_check',sql`${table.role}::text NOT IN ('admin','super_admin') OR ${table.scopeType} = 'institution'`),
  membershipTenant:foreignKey({columns:[table.membershipId,table.institutionId],foreignColumns:[institutionMemberships.id,institutionMemberships.institutionId],name:'role_assignment_membership_tenant_fk'}),
  programTenant:foreignKey({columns:[table.programId,table.institutionId],foreignColumns:[academicPrograms.id,academicPrograms.institutionId],name:'role_assignment_program_tenant_fk'}),
  campusTenant:foreignKey({columns:[table.campusId,table.institutionId],foreignColumns:[campuses.id,campuses.institutionId],name:'role_assignment_campus_tenant_fk'}),
}));

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => platformUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  authVersion: integer('auth_version').notNull().default(0),
  mfaVerifiedAt: timestamp('mfa_verified_at', { withTimezone: true }),
  stepUpAt: timestamp('step_up_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => ({ byUser: index('auth_sessions_user_idx').on(table.userId), byLastSeen: index('auth_sessions_last_seen_idx').on(table.lastSeenAt), authVersionValid: check('auth_sessions_auth_version_check',sql`${table.authVersion} >= 0`) }));

export const securityAuditLog = pgTable('security_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => platformUsers.id),
  institutionId: uuid('institution_id').references(() => institutions.id),
  action: text('action').notNull(),
  target: text('target').notNull(),
  requestId: text('request_id'),
  details: jsonb('details').$type<{before?:unknown;after?:unknown;reason?:string}>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({ byInstitution: index('audit_institution_created_idx').on(table.institutionId, table.createdAt) }));

export const authThrottle = pgTable('auth_throttle', {
  key: text('key').primaryKey(),
  scope: text('scope').notNull(),
  failures: integer('failures').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', {withTimezone:true}).notNull().defaultNow(),
  blockedUntil: timestamp('blocked_until', {withTimezone:true}),
  expiresAt: timestamp('expires_at', {withTimezone:true}).notNull(),
},table=>({
  scopeValid:check('auth_throttle_scope_check',sql`${table.scope} IN ('login_account','login_ip','password_account','password_ip','invitation_sender','invitation_accept_ip','password_reset_account','password_reset_ip')`),
  failuresValid:check('auth_throttle_failures_check',sql`${table.failures} >= 0`),
  byExpiry:index('auth_throttle_expires_idx').on(table.expiresAt),
}));
