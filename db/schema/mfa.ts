import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, bigint, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { platformUsers } from './core';
import { authSessions } from './auth';

export const mfaFactors = pgTable('auth_mfa_factors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => platformUsers.id, { onDelete: 'cascade' }),
  secretEncrypted: text('secret_encrypted'),
  enabledAt: timestamp('enabled_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastTimeStep: bigint('last_time_step', { mode: 'number' }),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  onePerUser: uniqueIndex('auth_mfa_factor_user_uidx').on(table.userId),
  attemptsValid: check('auth_mfa_factor_attempts_check', sql`${table.failedAttempts} >= 0 AND ${table.failedAttempts} <= 5`),
  secretRequired: check('auth_mfa_factor_secret_check', sql`${table.enabledAt} IS NULL OR ${table.secretEncrypted} IS NOT NULL`),
  timeStepValid: check('auth_mfa_factor_step_check', sql`${table.lastTimeStep} IS NULL OR ${table.lastTimeStep} >= 0`),
}));
export const mfaEnrollments = pgTable('auth_mfa_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => platformUsers.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => authSessions.id, { onDelete: 'cascade' }),
  authVersion: integer('auth_version').notNull(),
  secretEncrypted: text('secret_encrypted').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  byUser: index('auth_mfa_enrollment_user_idx').on(table.userId),
  byExpiry: index('auth_mfa_enrollment_expiry_idx').on(table.expiresAt),
  attemptsValid: check('auth_mfa_enrollment_attempts_check', sql`${table.attempts} >= 0 AND ${table.attempts} <= 5`),
  versionValid: check('auth_mfa_enrollment_version_check', sql`${table.authVersion} >= 0`),
}));
export const mfaChallenges = pgTable('auth_mfa_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => platformUsers.id, { onDelete: 'cascade' }),
  factorId: uuid('factor_id').notNull().references(() => mfaFactors.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  authVersion: integer('auth_version').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  byUser: index('auth_mfa_challenge_user_idx').on(table.userId),
  byExpiry: index('auth_mfa_challenge_expiry_idx').on(table.expiresAt),
  attemptsValid: check('auth_mfa_challenge_attempts_check', sql`${table.attempts} >= 0 AND ${table.attempts} <= 5`),
  versionValid: check('auth_mfa_challenge_version_check', sql`${table.authVersion} >= 0`),
}));
export const mfaRecoveryCodes = pgTable('auth_mfa_recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => platformUsers.id, { onDelete: 'cascade' }),
  factorId: uuid('factor_id').notNull().references(() => mfaFactors.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  codeUnique: uniqueIndex('auth_mfa_recovery_code_uidx').on(table.userId, table.codeHash),
  byFactor: index('auth_mfa_recovery_factor_idx').on(table.factorId),
}));
