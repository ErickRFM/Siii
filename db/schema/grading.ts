import { pgTable, uuid, text, integer, timestamp, uniqueIndex, foreignKey, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions } from './core';
import { institutionMemberships } from './auth';
import { academicSections, institutionalStudents, institutionalTeachers } from './registry';

export const teacherAccountLinks = pgTable('teacher_account_links', {
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 teacherId:uuid('teacher_id').notNull(),
 membershipId:uuid('membership_id').notNull(),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
 revokedAt:timestamp('revoked_at',{withTimezone:true}),
},t=>({
 teacherScope:foreignKey({columns:[t.teacherId,t.institutionId],foreignColumns:[institutionalTeachers.id,institutionalTeachers.institutionId],name:'teacher_links_teacher_scope_fk'}),
 memberScope:foreignKey({columns:[t.membershipId,t.institutionId],foreignColumns:[institutionMemberships.id,institutionMemberships.institutionId],name:'teacher_links_member_scope_fk'}),
 uniqueTeacher:uniqueIndex('teacher_account_links_active_teacher_uidx').on(t.teacherId).where(sql`${t.revokedAt} IS NULL`),
 uniqueMember:uniqueIndex('teacher_account_links_active_member_uidx').on(t.membershipId).where(sql`${t.revokedAt} IS NULL`),
}));
export const assessmentComponents = pgTable('assessment_components', {
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 sectionId:uuid('section_id').notNull(),
 code:text('code').notNull(),
 title:text('title').notNull(),
 weight:integer('weight').notNull(),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 sectionScope:foreignKey({columns:[t.sectionId,t.institutionId],foreignColumns:[academicSections.id,academicSections.institutionId],name:'assessment_component_section_fk'}),
 uniqueCode:uniqueIndex('assessment_component_section_code_uidx').on(t.sectionId,t.code),
 scopedId:uniqueIndex('assessment_component_id_institution_uidx').on(t.id,t.institutionId),
 weightCheck:check('assessment_component_weight_check',sql`${t.weight} BETWEEN 1 AND 100`),
}));
export const assessmentScores = pgTable('assessment_scores', {
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 componentId:uuid('component_id').notNull(),
 studentId:uuid('student_id').notNull(),
 scoreHundredths:integer('score_hundredths').notNull(),
 updatedBy:uuid('updated_by').notNull(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 componentScope:foreignKey({columns:[t.componentId,t.institutionId],foreignColumns:[assessmentComponents.id,assessmentComponents.institutionId],name:'assessment_scores_component_fk'}),
 studentScope:foreignKey({columns:[t.studentId,t.institutionId],foreignColumns:[institutionalStudents.id,institutionalStudents.institutionId],name:'assessment_scores_student_fk'}),
 uniqueScore:uniqueIndex('assessment_scores_component_student_uidx').on(t.componentId,t.studentId),
 scoreRange:check('assessment_scores_range_check',sql`${t.scoreHundredths} BETWEEN 0 AND 1000`),
}));
export const gradePublications = pgTable('grade_publications', {
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 sectionId:uuid('section_id').notNull(),
 operationId:uuid('operation_id').notNull(),
 publishedBy:uuid('published_by').notNull(),
 version:integer('version').notNull().default(1),
 publishedAt:timestamp('published_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 sectionScope:foreignKey({columns:[t.sectionId,t.institutionId],foreignColumns:[academicSections.id,academicSections.institutionId],name:'grade_publication_section_fk'}),
 uniqueOperation:uniqueIndex('grade_publication_operation_uidx').on(t.institutionId,t.operationId),
 uniqueVersion:uniqueIndex('grade_publication_section_version_uidx').on(t.sectionId,t.version),
 scopedId:uniqueIndex('grade_publication_id_institution_uidx').on(t.id,t.institutionId),
 versionRange:check('grade_publication_version_positive',sql`${t.version}>0`),
 bySection:index('grade_publication_section_idx').on(t.sectionId,t.publishedAt),
}));
export const finalGrades = pgTable('final_grades', {
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 publicationId:uuid('publication_id').notNull(),
 studentId:uuid('student_id').notNull(),
 scoreHundredths:integer('score_hundredths').notNull(),
},t=>({
 publicationScope:foreignKey({columns:[t.publicationId,t.institutionId],foreignColumns:[gradePublications.id,gradePublications.institutionId],name:'final_grade_publication_fk'}),
 studentScope:foreignKey({columns:[t.studentId,t.institutionId],foreignColumns:[institutionalStudents.id,institutionalStudents.institutionId],name:'final_grade_student_fk'}),
 uniqueEntry:uniqueIndex('final_grade_per_publication_uidx').on(t.publicationId,t.studentId),
 scoreRange:check('final_grade_range_check',sql`${t.scoreHundredths} BETWEEN 0 AND 1000`),
}));
