import {sql} from 'drizzle-orm';import type {Transaction} from '@/shared/http/request-context';
/** Caller holds the institution lock. Compare actual, non-cancelled occurrences across every term. */
export async function personScheduleConflict(tx:Transaction,institutionId:string,sectionId:string,personId:string,kind:'student'|'teacher'){
 const participating=kind==='student'?sql`SELECT section_id FROM section_enrollments WHERE institution_id=${institutionId} AND student_id=${personId} AND status='enrolled'`:sql`SELECT section_id FROM section_teachers WHERE institution_id=${institutionId} AND teacher_id=${personId} AND revoked_at IS NULL`;
 const result=await tx.execute(sql`SELECT ours.id FROM schedule_patterns ours JOIN schedule_patterns theirs ON theirs.institution_id=ours.institution_id AND theirs.weekday=ours.weekday AND theirs.start_minute<ours.end_minute AND theirs.end_minute>ours.start_minute
 WHERE ours.institution_id=${institutionId} AND ours.section_id=${sectionId} AND ours.is_active AND theirs.is_active AND theirs.section_id<>ours.section_id AND theirs.section_id IN (${participating})
 AND EXISTS(SELECT 1 FROM class_occurrences a JOIN class_occurrences b ON a.on_date=b.on_date AND a.institution_id=b.institution_id WHERE a.pattern_id=ours.id AND b.pattern_id=theirs.id AND a.state<>'CANCELLED' AND b.state<>'CANCELLED') LIMIT 1`);return result.rows.length>0;
}
