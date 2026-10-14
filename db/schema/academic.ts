import { pgTable, uuid, text, integer, timestamp, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entityStatusEnum, institutions } from './core';

export const academicPrograms = pgTable('academic_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  level: text('level').notNull(),
  modality: text('modality').notNull(),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  uniqueCode: uniqueIndex('academic_programs_institution_code_uidx').on(table.institutionId, table.code),
}));

export const academicCourses = pgTable('academic_courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  credits: integer('credits').notNull(),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  uniqueCode: uniqueIndex('academic_courses_institution_code_uidx').on(table.institutionId, table.code),
  creditsRange: check('academic_courses_credits_range', sql`${table.credits} >= 0 AND ${table.credits} <= 30`),
}));

export const curriculumVersions = pgTable('curriculum_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  programId: uuid('program_id').notNull().references(() => academicPrograms.id, { onDelete: 'restrict' }),
  version: text('version').notNull(),
  status: entityStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  uniqueVersion: uniqueIndex('curriculum_versions_program_version_uidx').on(table.programId, table.version),
}));
