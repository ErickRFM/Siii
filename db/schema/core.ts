import { pgTable, uuid, text, timestamp, boolean, pgEnum, integer } from 'drizzle-orm/pg-core';

export const entityStatusEnum = pgEnum('entity_status', ['active', 'inactive', 'archived', 'suspended']);
export const userRoleEnum = pgEnum('user_role', [
  'student', 'workshop_participant', 'teacher_pending', 'teacher',
  'tutor', 'coordinator', 'admin', 'super_admin',
]);
export const institutions = pgTable('institutions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  code: text('code').notNull().unique(),
  timezone: text('timezone').notNull().default('America/Mexico_City'),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const campuses = pgTable('campuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  name: text('name').notNull(), code: text('code'),
  isPrimary: boolean('is_primary').notNull().default(false),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const academicTerms = pgTable('academic_terms', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  name: text('name').notNull(), code: text('code').notNull(),
  startDate: timestamp('start_date', { withTimezone: false }).notNull(),
  endDate: timestamp('end_date', { withTimezone: false }).notNull(),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
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
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
