import {institutionalClasses} from './institutional-classes';
import 'server-only';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/infrastructure/database';
import {lockInstitutionContext} from '@/shared/auth/write-access';
import {can} from '@/shared/auth/capabilities';
import {audit} from '@/shared/http/request-context';
import {DomainAccessDenied} from '@/modules/consolidation/domain-boundary';
import type {personalContext} from '@/modules/portal/read-model';
import type {CompanionAttendanceHistory} from './attendance-history';

export const institutionalHistoryQuery=z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1),subject:z.uuid().optional(),term:z.uuid().optional(),status:z.enum(['present','late','absent','pending','cancelled']).optional(),classStatus:z.enum(['performed','pending','cancelled','open']).optional()});
export type InstitutionalHistoryQuery=z.infer<typeof institutionalHistoryQuery>;
type Actor=NonNullable<Awaited<ReturnType<typeof personalContext>>>;
/** Historical read authority is independent of current schedule version or open term.
 * A revoked identity/link still loses access. Nothing is fetched from mobile devices.
 */
export async function institutionalHistory(actor:Actor,query:InstitutionalHistoryQuery,correlationId:string){
 return db.transaction(async tx=>{
  async function check(){
   const current=await lockInstitutionContext(tx,actor.identity,actor.access);
   if(!current)throw new DomainAccessDenied();
   const capability=actor.kind==='student'?'student.self.read':'teacher.self.read';
   if(actor.kind==='teacher'&&!can(current.subject,capability,{institutionId:actor.access.institutionId,status:'active',ownerUserId:actor.identity.id},new Date()))throw new DomainAccessDenied();
   if(actor.kind==='student'){
    const links=await tx.execute<{program_id:string}>(sql`select s.program_id from student_account_links l join institutional_students s on s.id=l.student_id and s.institution_id=l.institution_id where l.institution_id=${actor.access.institutionId} and l.membership_id=${actor.access.membershipId} and l.revoked_at is null and s.status='active'`);
    if(links.rows.length!==1||!can(current.subject,capability,{institutionId:actor.access.institutionId,status:'active',ownerUserId:actor.identity.id,programId:links.rows[0].program_id},new Date()))throw new DomainAccessDenied();
   }
  }
  await check();
  const tenant=actor.access.institutionId,member=actor.access.membershipId;
  const ownership=actor.kind==='student'
   ?sql`exists(select 1 from student_account_links l join institutional_students s on s.id=l.student_id and s.institution_id=l.institution_id where l.institution_id=r.institution_id and l.membership_id=${member} and l.student_id=r.student_id and l.revoked_at is null and s.status='active')`
   :sql`exists(select 1 from teacher_account_links l join institutional_teachers t on t.id=l.teacher_id and t.institution_id=l.institution_id where l.institution_id=r.institution_id and l.membership_id=${member} and l.revoked_at is null and t.status='active' and t.id=any(r.teacher_source_ids))`;
  const statement=sql`with latest as (
   select distinct on (r.audit_record_id) r.* from institutional_attendance_results r
   where r.institution_id=${tenant} and ${ownership} order by r.audit_record_id,r.record_revision desc
  ), scoped as (
   select r.*,s.code as group_name,c.name as subject_name,c.id as subject_id,t.id as term_id,t.name as term_name,o.state as occurrence_state,student.first_name||' '||student.last_name as student_name,
    case when o.state='CANCELLED' then 'cancelled' else coalesce(r.body->>'disposition','pending') end as outcome
   from latest r join institutional_students student on student.id=r.student_id and student.institution_id=r.institution_id join academic_sections s on s.id=r.section_id and s.institution_id=r.institution_id
   join academic_courses c on c.id=s.course_id and c.institution_id=r.institution_id
   join academic_terms t on t.id=s.term_id and t.institution_id=r.institution_id
   join class_occurrences o on o.id=r.occurrence_id and o.section_id=r.section_id and o.institution_id=r.institution_id
   where (${query.subject??null}::uuid is null or c.id=${query.subject??null}::uuid)
    and (${query.term??null}::uuid is null or t.id=${query.term??null}::uuid)
  )`;
  const filters=await tx.execute<{subject_id:string;subject_name:string;term_id:string;term_name:string}>(sql`${statement} select distinct subject_id,subject_name,term_id,term_name from scoped order by subject_name,term_name limit 1000`);
  const totals=await tx.execute<{total:number;present:number;late:number;absent:number;pending:number;cancelled:number;classes_with_results:number}>(sql`${statement}
   select count(*)::int as total,count(*) filter(where outcome='present')::int as present,count(*) filter(where outcome='late')::int as late,count(*) filter(where outcome='absent')::int as absent,count(*) filter(where outcome='pending')::int as pending,count(*) filter(where outcome='cancelled')::int as cancelled,count(distinct session_id)::int as classes_with_results from scoped`);
  const rows=await tx.execute<{audit_record_id:string;body:CompanionAttendanceHistory['records'][number];group_name:string;subject_name:string;subject_id:string;term_name:string;term_id:string;occurrence_state:string;accepted_at:string;student_name:string}>(sql`${statement}
   select audit_record_id,body,group_name,subject_name,subject_id,term_name,term_id,occurrence_state,accepted_at,student_name from scoped where (${query.status??null}::text is null or outcome=${query.status??null})
   order by occurrence_date desc,audit_record_id limit 51 offset ${(query.page-1)*50}`);
  const classes=await institutionalClasses(tx,actor,query);
  await audit(tx,{institutionId:tenant,actorUserId:actor.identity.id,requestId:correlationId,action:'attendance.institutional.'+actor.kind+'.read',target:'membership:'+member,details:{after:{page:query.page,records:Math.min(rows.rows.length,50)}}});
  await check();
  const metrics=totals.rows[0],decided=metrics.present+metrics.late+metrics.absent;
  return {contract:'siii.institutional_attendance.v1' as const,classes,filters:[...filters.rows,...classes.filters],page:query.page,pageSize:50,hasMore:rows.rows.length>50,metrics:{...metrics,attendancePercentage:decided?Math.round((metrics.present+metrics.late)*10000/decided)/100:null},records:rows.rows.slice(0,50).map(row=>({...row.body,id:row.audit_record_id,subjectName:row.subject_name,subjectId:row.subject_id,groupName:row.group_name,termName:row.term_name,termId:row.term_id,occurrenceState:row.occurrence_state,acceptedAt:row.accepted_at,...(actor.kind==='teacher'?{studentName:row.student_name}:{})}))};
 });
}
export type InstitutionalHistory=Awaited<ReturnType<typeof institutionalHistory>>;
