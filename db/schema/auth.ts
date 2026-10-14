import { pgEnum, pgTable, uuid, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
  scopedIdentity: uniqueIndex('institution_member_id_scope_uidx').on(table.id,table.institutionId),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => ({ byUser: index('auth_sessions_user_idx').on(table.userId) }));

export const securityAuditLog = pgTable('security_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => platformUsers.id),
  institutionId: uuid('institution_id').references(() => institutions.id),
  action: text('action').notNull(),
  target: text('target').notNull(),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({ byInstitution: index('audit_institution_created_idx').on(table.institutionId, table.createdAt) }));
