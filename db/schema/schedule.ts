import { pgTable,uuid,text,integer,boolean,date,timestamp,uniqueIndex,foreignKey,check,index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { institutions,campuses } from './core';
import { academicSections } from './registry';

export const classrooms=pgTable('classrooms',{
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 campusId:uuid('campus_id').notNull(),
 code:text('code').notNull(),
 building:text('building').notNull(),
 capacity:integer('capacity').notNull(),
 isActive:boolean('is_active').notNull().default(true),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 campusScope:foreignKey({columns:[t.campusId,t.institutionId],foreignColumns:[campuses.id,campuses.institutionId],name:'classrooms_campus_scope_fk'}),
 uniqueRoom:uniqueIndex('classrooms_unique_code_idx').on(t.campusId,t.code),
 scopedId:uniqueIndex('classrooms_id_institution_idx').on(t.id,t.institutionId),
 capacity:check('classrooms_capacity_range',sql`${t.capacity} BETWEEN 1 AND 5000`),
}));
export const schedulePatterns=pgTable('schedule_patterns',{
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 sectionId:uuid('section_id').notNull(),
 roomId:uuid('room_id').notNull(),
 weekday:integer('weekday').notNull(),
 startMinute:integer('start_minute').notNull(),
 endMinute:integer('end_minute').notNull(),
 isActive:boolean('is_active').notNull().default(true),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 sectionScope:foreignKey({columns:[t.sectionId,t.institutionId],foreignColumns:[academicSections.id,academicSections.institutionId],name:'schedule_section_scope_fk'}),
 roomScope:foreignKey({columns:[t.roomId,t.institutionId],foreignColumns:[classrooms.id,classrooms.institutionId],name:'schedule_room_scope_fk'}),
 scopedPattern:uniqueIndex('schedule_pattern_scope_uidx').on(t.id,t.sectionId,t.institutionId),
 byRoom:index('schedule_room_day_idx').on(t.institutionId,t.roomId,t.weekday),
 weekdayRange:check('schedule_weekday_iso',sql`${t.weekday} BETWEEN 1 AND 7`),
 timeRange:check('schedule_minutes_check',sql`${t.startMinute} >= 0 AND ${t.endMinute} <= 1440 AND ${t.startMinute} < ${t.endMinute}`),
}));
export const classOccurrences=pgTable('class_occurrences',{
 id:uuid('id').primaryKey().defaultRandom(),
 institutionId:uuid('institution_id').notNull().references(()=>institutions.id),
 patternId:uuid('pattern_id').notNull(),
 sectionId:uuid('section_id').notNull(),
 onDate:date('on_date').notNull(),
 state:text('state').notNull().default('SCHEDULED'),
 reason:text('reason'),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>({
 patternScope:foreignKey({columns:[t.patternId,t.sectionId,t.institutionId],foreignColumns:[schedulePatterns.id,schedulePatterns.sectionId,schedulePatterns.institutionId],name:'occurrence_pattern_scope_fk'}),
 occurrenceIdentity:uniqueIndex('occurrence_pattern_date_uidx').on(t.patternId,t.onDate),
 institutionWeek:index('occurrence_institution_date_idx').on(t.institutionId,t.onDate),
 stateRange:check('occurrence_state_check',sql`${t.state} IN ('SCHEDULED','CANCELLED','ONLINE')`),
}));
