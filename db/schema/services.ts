import { pgTable,uuid,text,integer,timestamp,uniqueIndex,foreignKey,check,index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions,platformUsers } from './core';
import { institutionalStudents,institutionalTeachers } from './registry';

export const institutionalAnnouncements=pgTable('institutional_announcements',{
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 title:text('title').notNull(),body:text('body').notNull(),
 status:text('status').notNull().default('DRAFT'),
 authorUserId:uuid('author_user_id').notNull().references(()=>platformUsers.id),
 publishedAt:timestamp('published_at',{withTimezone:true}),
 expiresAt:timestamp('expires_at',{withTimezone:true}),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 statusCheck:check('announcements_status_check',sql`${t.status} IN ('DRAFT','PUBLISHED','ARCHIVED')`),
 listing:index('announcements_institution_status_idx').on(t.institutionId,t.status),
}));

export const studentServiceRequests=pgTable('student_service_requests',{
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 studentId:uuid('student_id').notNull(),
 requestType:text('request_type').notNull(),
 summary:text('summary').notNull(),
 status:text('status').notNull().default('SUBMITTED'),
 decisionReason:text('decision_reason'),
 decidedBy:uuid('decided_by').references(()=>platformUsers.id),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 studentScope:foreignKey({columns:[t.studentId,t.institutionId],foreignColumns:[institutionalStudents.id,institutionalStudents.institutionId],name:'service_request_student_scope_fk'}),
 validType:check('service_request_type_check',sql`${t.requestType} IN ('CERTIFICATE','ENROLLMENT_CHANGE','JUSTIFICATION','OTHER')`),
 validStatus:check('service_request_status_check',sql`${t.status} IN ('SUBMITTED','IN_REVIEW','APPROVED','REJECTED','CLOSED')`),
 byStudent:index('service_request_student_idx').on(t.institutionId,t.studentId),
}));

export const tutoringCases=pgTable('tutoring_cases',{
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 studentId:uuid('student_id').notNull(),
 teacherId:uuid('teacher_id').notNull(),
 subject:text('subject').notNull(),
 privateNotes:text('private_notes'),
 status:text('status').notNull().default('OPEN'),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 studentScope:foreignKey({columns:[t.studentId,t.institutionId],foreignColumns:[institutionalStudents.id,institutionalStudents.institutionId],name:'tutoring_student_scope_fk'}),
 teacherScope:foreignKey({columns:[t.teacherId,t.institutionId],foreignColumns:[institutionalTeachers.id,institutionalTeachers.institutionId],name:'tutoring_teacher_scope_fk'}),
 validStatus:check('tutoring_status_check',sql`${t.status} IN ('OPEN','RESOLVED','CLOSED')`),
 byStudent:index('tutoring_institution_student_idx').on(t.institutionId,t.studentId),
}));

export const institutionalWorkshops=pgTable('institutional_workshops',{
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 title:text('title').notNull(),description:text('description').notNull(),
 teacherId:uuid('teacher_id'),
 startsAt:timestamp('starts_at',{withTimezone:true}).notNull(),
 endsAt:timestamp('ends_at',{withTimezone:true}).notNull(),
 capacity:integer('capacity').notNull(),status:text('status').notNull().default('DRAFT'),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 teacherScope:foreignKey({columns:[t.teacherId,t.institutionId],foreignColumns:[institutionalTeachers.id,institutionalTeachers.institutionId],name:'workshop_teacher_scope_fk'}),
 timeRange:check('workshop_time_check',sql`${t.startsAt}<${t.endsAt}`),
 capacityRange:check('workshop_capacity_check',sql`${t.capacity} BETWEEN 1 AND 1000`),
 validStatus:check('workshop_status_check',sql`${t.status} IN ('DRAFT','PUBLISHED','CANCELLED')`),
 byInstitution:index('workshops_institution_status_idx').on(t.institutionId,t.status),
 scopedId:uniqueIndex('institutional_workshops_scope_uidx').on(t.id,t.institutionId),
}));

export const workshopEnrollments=pgTable('workshop_enrollments',{
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 workshopId:uuid('workshop_id').notNull(),
 studentId:uuid('student_id').notNull(),
 status:text('status').notNull().default('ENROLLED'),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 workshopScope:foreignKey({columns:[t.workshopId,t.institutionId],foreignColumns:[institutionalWorkshops.id,institutionalWorkshops.institutionId],name:'workshop_enrollment_workshop_fk'}),
 studentScope:foreignKey({columns:[t.studentId,t.institutionId],foreignColumns:[institutionalStudents.id,institutionalStudents.institutionId],name:'workshop_enrollment_student_fk'}),
 uniqueActive:uniqueIndex('workshop_student_enrolled_uidx').on(t.workshopId,t.studentId).where(sql`${t.status}='ENROLLED'`),
 validStatus:check('workshop_enrollment_status_check',sql`${t.status} IN ('ENROLLED','WITHDRAWN')`),
}));
