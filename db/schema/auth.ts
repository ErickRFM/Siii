import { pgEnum, pgTable, uuid, text, timestamp, integer, index, uniqueIndex, jsonb, check } from 'drizzle-orm/pg-core';
import { institutions, platformUsers, userRoleEnum } from './core';
import { sql } from 'drizzle-orm';

export const membershipStatusEnum = pgEnum('membership_status', ['active', 'suspended']);

export const institutionMemberships = pgTable('institution_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => platformUsers.id, { onDelete: 'restrict' }),
  status: membershipStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  uniqueMember: uniqueIndex('institution_member_unique').on(table.institutionId, table.userId),
  byUser: index('institution_member_user_idx').on(table.userId),
}));

export const roleAssignments = pgTable('role_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  membershipId: uuid('membership_id').notNull().references(() => institutionMemberships.id, { onDelete: 'restrict' }),
  role: userRoleEnum('role').notNull(),
  grantedBy: uuid('granted_by').references(() => platformUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => ({
  activeRole: uniqueIndex('role_assignment_unique_active').on(table.membershipId, table.role).where(sql`${table.revokedAt} IS NULL`),
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
  scopeValid:check('auth_throttle_scope_check',sql`${table.scope} IN ('login_account','login_ip','password_account','password_ip')`),
  failuresValid:check('auth_throttle_failures_check',sql`${table.failures} >= 0`),
  byExpiry:index('auth_throttle_expires_idx').on(table.expiresAt),
}));
