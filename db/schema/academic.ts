import { pgTable, uuid, text, integer, timestamp, uniqueIndex, check, foreignKey } from 'drizzle-orm/pg-core';
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
  institutionReference: uniqueIndex('academic_programs_id_institution_uidx').on(table.id, table.institutionId),
  levelValid: check('academic_programs_level_valid',sql`${table.level} IN ('tecnico_superior','licenciatura','ingenieria','maestria','doctorado','otro')`),
  modalityValid: check('academic_programs_modality_valid',sql`${table.modality} IN ('presencial','mixta','en_linea')`),
  statusValid: check('academic_programs_status_valid',sql`${table.status} IN ('active','inactive','archived')`),
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
  institutionReference: uniqueIndex('academic_courses_id_institution_uidx').on(table.id, table.institutionId),
  statusValid: check('academic_courses_status_valid',sql`${table.status} IN ('active','inactive','archived')`),
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
  statusValid: check('curriculum_versions_status_valid',sql`${table.status} IN ('active','inactive','archived')`),
  scopedProgram: foreignKey({ columns: [table.programId, table.institutionId], foreignColumns: [academicPrograms.id, academicPrograms.institutionId], name: 'curriculum_program_tenant_fk' }),
}));
