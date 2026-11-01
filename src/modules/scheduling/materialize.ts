import {and,eq,isNull,sql} from 'drizzle-orm';
import {academicSections,academicTerms,classrooms,classOccurrences,schedulePatterns,sectionTeachers,institutionalTeachers} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import {DomainConflict} from '@/modules/consolidation/domain-boundary';
import {occurrenceDates} from './validation';
/** Authorized source recovery only. Missing occurrences are materialized from existing official
 * patterns; cancellations and other persisted decisions are never recreated or overwritten.
 */
export async function materializeSectionOccurrences(tx:Transaction,institutionId:string,sectionId:string){
 const [section]=await tx.select().from(academicSections).where(and(eq(academicSections.id,sectionId),eq(academicSections.institutionId,institutionId),eq(academicSections.status,'open')));
 if(!section)throw new DomainConflict('SECTION_UNAVAILABLE');
 const [term]=await tx.select().from(academicTerms).where(and(eq(academicTerms.id,section.termId),eq(academicTerms.institutionId,institutionId),eq(academicTerms.status,'active')));
 if(!term)throw new DomainConflict('TERM_UNAVAILABLE');
 const teachers=await tx.select({id:sectionTeachers.id}).from(sectionTeachers).innerJoin(institutionalTeachers,and(eq(institutionalTeachers.id,sectionTeachers.teacherId),eq(institutionalTeachers.institutionId,institutionId),eq(institutionalTeachers.status,'active'))).where(and(eq(sectionTeachers.institutionId,institutionId),eq(sectionTeachers.sectionId,sectionId),isNull(sectionTeachers.revokedAt)));
 if(!teachers.length)throw new DomainConflict('TEACHER_REQUIRED');
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext('siii:academic:'||${institutionId}||':'||${term.id}))`);
 const patterns=await tx.select().from(schedulePatterns).where(and(eq(schedulePatterns.institutionId,institutionId),eq(schedulePatterns.sectionId,sectionId),eq(schedulePatterns.isActive,true))).limit(101);
 if(patterns.length>100)throw new DomainConflict('PATTERN_LIMIT_EXCEEDED');
 let inserted=0;
 for(const pattern of patterns){
  const [room]=await tx.select().from(classrooms).where(and(eq(classrooms.id,pattern.roomId),eq(classrooms.institutionId,institutionId),eq(classrooms.isActive,true)));
  if(!room||room.capacity<section.capacity)throw new DomainConflict('ROOM_UNAVAILABLE');
  let dates:string[];try{dates=occurrenceDates(term.startDate,term.endDate,pattern.weekday)}catch{throw new DomainConflict('UNSUPPORTED_TERM_RANGE')}
  if(!dates.length)continue;
  const conflict=await tx.execute(sql`select other.id from schedule_patterns other
   join class_occurrences o on o.pattern_id=other.id and o.institution_id=other.institution_id and o.section_id=other.section_id
   where other.institution_id=${institutionId} and other.id<>${pattern.id} and other.is_active=true and o.state<>'CANCELLED'
    and o.on_date in (${sql.join(dates.map(date=>sql`${date}::date`),sql`, `)}) and other.start_minute<${pattern.endMinute} and other.end_minute>${pattern.startMinute}
    and (other.room_id=${pattern.roomId} or other.section_id=${sectionId}
     or exists(select 1 from section_teachers a join section_teachers b on a.teacher_id=b.teacher_id and a.institution_id=b.institution_id where a.institution_id=${institutionId} and a.section_id=${sectionId} and b.section_id=other.section_id and a.revoked_at is null and b.revoked_at is null)
     or exists(select 1 from section_enrollments a join section_enrollments b on a.student_id=b.student_id and a.institution_id=b.institution_id where a.institution_id=${institutionId} and a.section_id=${sectionId} and b.section_id=other.section_id and a.status='enrolled' and b.status='enrolled')) limit 1`);
  if(conflict.rows.length)throw new DomainConflict('SCHEDULE_CONFLICT');
  const created=await tx.insert(classOccurrences).values(dates.map(onDate=>({institutionId,sectionId,patternId:pattern.id,onDate}))).onConflictDoNothing({target:[classOccurrences.patternId,classOccurrences.onDate]}).returning({id:classOccurrences.id});
  inserted+=created.length;
 }
 return inserted;
}
