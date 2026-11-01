import {sql} from 'drizzle-orm';
import type {Transaction} from '@/shared/http/request-context';
import type {InstitutionalHistoryQuery} from './institutional-history';
/** Caller already holds the current authenticated institutional context. Historical ownership
 * comes from original source student/teacher IDs, not a new teacher assignment or native UUID.
 */
export async function institutionalClasses(tx:Transaction,actor:{kind:'student'|'teacher';access:{institutionId:string;membershipId:string}},query:InstitutionalHistoryQuery){
 const tenant=actor.access.institutionId,member=actor.access.membershipId;
 const receiptOwn=actor.kind==='teacher'
  ?sql`exists(select 1 from teacher_account_links l join institutional_teachers t on t.id=l.teacher_id and t.institution_id=l.institution_id where l.institution_id=c.institution_id and l.membership_id=${member} and l.revoked_at is null and t.status='active' and t.id=c.teacher_id)`
  :sql`exists(select 1 from student_account_links l join institutional_students s on s.id=l.student_id and s.institution_id=l.institution_id where l.institution_id=c.institution_id and l.membership_id=${member} and l.revoked_at is null and s.status='active' and s.id=any(c.student_source_ids))`;
 const assigned=actor.kind==='teacher'
  ?sql`exists(select 1 from teacher_account_links l join institutional_teachers t on t.id=l.teacher_id and t.institution_id=l.institution_id join section_teachers a on a.teacher_id=t.id and a.institution_id=t.institution_id where l.institution_id=o.institution_id and l.membership_id=${member} and l.revoked_at is null and t.status='active' and a.revoked_at is null and a.section_id=o.section_id)`
  :sql`exists(select 1 from student_account_links l join institutional_students s on s.id=l.student_id and s.institution_id=l.institution_id join section_enrollments e on e.student_id=s.id and e.institution_id=s.institution_id where l.institution_id=o.institution_id and l.membership_id=${member} and l.revoked_at is null and s.status='active' and e.status='enrolled' and e.section_id=o.section_id)`;
 const cte=sql`with latest as (
  select distinct on(c.session_id) c.* from institutional_class_sessions c where c.institution_id=${tenant} and ${receiptOwn} order by c.session_id,c.session_revision desc
 ), scoped as (
  select o.id,o.on_date,c.name as subject_name,c.id as subject_id,t.name as term_name,t.id as term_id,s.code as group_name,
   case when o.state='CANCELLED' then 'cancelled' when r.body->>'status'='closed' and r.body->>'closedByTeacher'='true' then 'performed' when r.body->>'status'='open' then 'open' else 'pending' end as operation_state,
   r.body->>'openedAtEpochSeconds' as opened_at,r.body->>'closedAtEpochSeconds' as closed_at,r.source_version,
   coalesce((select string_agg(teacher.first_name||' '||teacher.last_name,', ' order by teacher.id) from institutional_teachers teacher where teacher.institution_id=o.institution_id and (teacher.id=r.teacher_id or r.teacher_id is null and exists(select 1 from section_teachers a where a.institution_id=o.institution_id and a.section_id=o.section_id and a.teacher_id=teacher.id and a.revoked_at is null))),'') as teacher_names
  from class_occurrences o join academic_sections s on s.id=o.section_id and s.institution_id=o.institution_id
  join academic_courses c on c.id=s.course_id and c.institution_id=o.institution_id
  join academic_terms t on t.id=s.term_id and t.institution_id=o.institution_id
  left join latest r on r.occurrence_id=o.id and r.institution_id=o.institution_id
  where o.institution_id=${tenant} and (${assigned} or r.session_id is not null)
   and (${query.subject??null}::uuid is null or c.id=${query.subject??null}::uuid) and (${query.term??null}::uuid is null or t.id=${query.term??null}::uuid)
 )`;
 const totals=await tx.execute<{scheduled:number;performed:number;cancelled:number;pending:number;open:number}>(sql`${cte} select count(*)::int scheduled,count(*) filter(where operation_state='performed')::int performed,count(*) filter(where operation_state='cancelled')::int cancelled,count(*) filter(where operation_state in ('pending','open'))::int pending,count(*) filter(where operation_state='open')::int open from scoped`);
 const rows=await tx.execute<{id:string;on_date:string;subject_name:string;subject_id:string;term_name:string;term_id:string;group_name:string;teacher_names:string;operation_state:'performed'|'cancelled'|'pending'|'open';opened_at:string|null;closed_at:string|null;source_version:string|null}>(sql`${cte} select * from scoped where (${query.classStatus??null}::text is null or operation_state=${query.classStatus??null}) order by on_date desc,id limit 51 offset ${(query.page-1)*50}`);
 const filters=await tx.execute<{subject_id:string;subject_name:string;term_id:string;term_name:string}>(sql`${cte} select distinct subject_id,subject_name,term_id,term_name from scoped order by subject_name,term_name limit 1000`);
 return {metrics:totals.rows[0],hasMore:rows.rows.length>50,filters:filters.rows,records:rows.rows.slice(0,50).map(row=>({id:row.id,occurrenceDate:row.on_date,subjectId:row.subject_id,subjectName:row.subject_name,groupName:row.group_name,termId:row.term_id,termName:row.term_name,teacherNames:row.teacher_names,status:row.operation_state,openedAtEpochSeconds:row.opened_at===null?null:Number(row.opened_at),closedAtEpochSeconds:row.closed_at===null?null:Number(row.closed_at),sourceVersion:row.source_version===null?null:Number(row.source_version)}))};
}
