import { pgTable, uuid, text, integer, timestamp, uniqueIndex, foreignKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions, academicTerms, platformUsers } from './core';
import { academicPrograms, academicCourses } from './academic';
import { institutionMemberships } from './auth';

const auditDates = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const institutionalStudents = pgTable('institutional_students', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  programId: uuid('program_id').notNull(),
  enrollmentNumber: text('enrollment_number').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  institutionalEmail: text('institutional_email'),
  status: text('status').notNull().default('active'),
  ...auditDates,
}, table => ({
  uniqueEnrollment: uniqueIndex('institutional_students_enrollment_uidx').on(table.institutionId, table.enrollmentNumber),
  tenantKey: uniqueIndex('institutional_students_id_institution_uidx').on(table.id, table.institutionId),
  scopedProgram: foreignKey({ columns: [table.programId, table.institutionId], foreignColumns: [academicPrograms.id, academicPrograms.institutionId], name: 'students_program_tenant_fk' }),
  validStatus: check('students_status_check', sql`${table.status} IN ('active','inactive','withdrawn','graduated')`),
}));

export const institutionalTeachers = pgTable('institutional_teachers', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  employeeNumber: text('employee_number').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  institutionalEmail: text('institutional_email'),
  status: text('status').notNull().default('active'),
  ...auditDates,
}, table => ({
  uniqueEmployee: uniqueIndex('institutional_teachers_employee_uidx').on(table.institutionId, table.employeeNumber),
  tenantKey: uniqueIndex('institutional_teachers_id_institution_uidx').on(table.id, table.institutionId),
  validStatus: check('teachers_status_check', sql`${table.status} IN ('active','inactive')`),
}));

export const studentAccountLinks = pgTable('student_account_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  membershipId: uuid('membership_id').notNull().references(() => institutionMemberships.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => institutionalStudents.id, { onDelete: 'restrict' }),
  linkedBy: uuid('linked_by').references(() => platformUsers.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...auditDates,
}, table => ({
  uniqueActiveStudent: uniqueIndex('student_account_links_active_student_uidx').on(table.studentId).where(sql`${table.revokedAt} IS NULL`),
  uniqueActiveMember: uniqueIndex('student_account_links_active_member_uidx').on(table.membershipId).where(sql`${table.revokedAt} IS NULL`),
  scopedMembership: foreignKey({ columns: [table.membershipId, table.institutionId], foreignColumns: [institutionMemberships.id, institutionMemberships.institutionId], name: 'student_links_membership_tenant_fk' }),
  scopedStudent: foreignKey({ columns: [table.studentId, table.institutionId], foreignColumns: [institutionalStudents.id, institutionalStudents.institutionId], name: 'student_links_student_tenant_fk' }),
}));

export const studentClaimRequests = pgTable('student_claim_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  applicantUserId: uuid('applicant_user_id').notNull().references(() => platformUsers.id, { onDelete: 'restrict' }),
  enrollmentNumber: text('enrollment_number').notNull(),
  verificationStatus: text('verification_status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => platformUsers.id, { onDelete: 'set null' }),
  rejectionReason: text('rejection_reason'),
  ...auditDates,
}, table => ({
  validStatus: check('student_claim_requests_status_check', sql`${table.verificationStatus} IN ('pending','approved','rejected')`),
}));

export const academicSections = pgTable('academic_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  termId: uuid('term_id').notNull(),
  courseId: uuid('course_id').notNull(),
  code: text('code').notNull(),
  capacity: integer('capacity').notNull(),
  status: text('status').notNull().default('open'),
  ...auditDates,
}, table => ({
  uniqueSection: uniqueIndex('academic_sections_term_code_uidx').on(table.institutionId, table.termId, table.code),
  tenantKey: uniqueIndex('academic_sections_id_institution_uidx').on(table.id, table.institutionId),
  scopedTerm: foreignKey({ columns: [table.termId, table.institutionId], foreignColumns: [academicTerms.id, academicTerms.institutionId], name: 'sections_term_tenant_fk' }),
  scopedCourse: foreignKey({ columns: [table.courseId, table.institutionId], foreignColumns: [academicCourses.id, academicCourses.institutionId], name: 'sections_course_tenant_fk' }),
  validCapacity: check('sections_capacity_check', sql`${table.capacity} > 0 AND ${table.capacity} <= 500`),
  validStatus: check('sections_status_check', sql`${table.status} IN ('open','closed','archived')`),
}));

export const sectionEnrollments = pgTable('section_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  sectionId: uuid('section_id').notNull(),
  studentId: uuid('student_id').notNull(),
  status: text('status').notNull().default('enrolled'),
  ...auditDates,
}, table => ({
  uniqueEnrollment: uniqueIndex('section_student_unique').on(table.sectionId, table.studentId).where(sql`${table.status} = 'enrolled'`),
  scopedSection: foreignKey({ columns: [table.sectionId, table.institutionId], foreignColumns: [academicSections.id, academicSections.institutionId], name: 'enrollments_section_tenant_fk' }),
  scopedStudent: foreignKey({ columns: [table.studentId, table.institutionId], foreignColumns: [institutionalStudents.id, institutionalStudents.institutionId], name: 'enrollments_student_tenant_fk' }),
  validStatus: check('enrollments_status_check', sql`${table.status} IN ('enrolled','withdrawn')`),
}));

export const sectionTeachers = pgTable('section_teachers', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  sectionId: uuid('section_id').notNull(),
  teacherId: uuid('teacher_id').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...auditDates,
}, table => ({
  uniqueTeacherAssignment: uniqueIndex('section_teacher_unique').on(table.sectionId, table.teacherId).where(sql`${table.revokedAt} IS NULL`),
  scopedSection: foreignKey({ columns: [table.sectionId, table.institutionId], foreignColumns: [academicSections.id, academicSections.institutionId], name: 'section_teachers_section_tenant_fk' }),
  scopedTeacher: foreignKey({ columns: [table.teacherId, table.institutionId], foreignColumns: [institutionalTeachers.id, institutionalTeachers.institutionId], name: 'section_teachers_teacher_tenant_fk' }),
}));
