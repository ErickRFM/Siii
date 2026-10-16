import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, pgEnum, integer, uniqueIndex, date, check } from 'drizzle-orm/pg-core';

export const entityStatusEnum = pgEnum('entity_status', ['active', 'inactive', 'archived', 'suspended']);
export const userRoleEnum = pgEnum('user_role', [
  'student', 'workshop_participant', 'teacher_pending', 'teacher',
  'tutor', 'coordinator', 'admin', 'super_admin',
  'guest', 'control_escolar', 'workshop_facilitator',
]);
export const institutions = pgTable('institutions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  code: text('code').notNull().unique(),
  timezone: text('timezone').notNull().default('America/Mexico_City'),
  adminVersion: integer('admin_version').notNull().default(0),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({adminVersionValid: check('institutions_admin_version_check', sql`${table.adminVersion} >= 0`)}));
export const campuses = pgTable('campuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  name: text('name').notNull(), code: text('code'),
  isPrimary: boolean('is_primary').notNull().default(false),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  uniqueCode: uniqueIndex('campuses_institution_code_uidx').on(table.institutionId, table.code),
  tenantReference: uniqueIndex('campuses_id_institution_uidx').on(table.id, table.institutionId),
  primaryCampus: uniqueIndex('campuses_one_primary_uidx').on(table.institutionId).where(sql`${table.isPrimary}`),
  statusValid: check('campuses_status_valid',sql`${table.status} IN ('active','inactive','archived')`),
}));
export const academicTerms = pgTable('academic_terms', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  name: text('name').notNull(), code: text('code').notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  legacyStartDate: timestamp('legacy_start_date'),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  legacyEndDate: timestamp('legacy_end_date'),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  uniqueCode: uniqueIndex('academic_terms_institution_code_uidx').on(table.institutionId, table.code),
  tenantReference: uniqueIndex('academic_terms_id_institution_uidx').on(table.id, table.institutionId),
  datesValid: check('academic_terms_dates_valid',sql`${table.endDate} >= ${table.startDate}`),
  statusValid: check('academic_terms_status_valid',sql`${table.status} IN ('active','inactive','archived')`),
}));
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(), firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(), middleName: text('middle_name'),
  email: text('email'), phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const platformUsers = pgTable('platform_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => people.id),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash'), isActive: boolean('is_active').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  authVersion: integer('auth_version').notNull().default(0),
  lockoutLevel: integer('lockout_level').notNull().default(0),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  lockoutLevelValid: check('platform_users_lockout_level_check',sql`${table.lockoutLevel} >= 0`),
  authVersionValid: check('platform_users_auth_version_check',sql`${table.authVersion} >= 0`),
}));
