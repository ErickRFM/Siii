import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {audit} from '@/shared/http/request-context';
import {archivalAttendanceSubject,archivalAttendanceAuthority} from './attendance-archive-authority';
import {readCompanionAttendance,institutionalResultsEnabled} from './attendance-history';
import {persistAcceptedAttendance,persistAcceptedClasses} from './attendance-results';
type Job={institution_id:string;subject_id:string;page:number;attempts:number;lease_token:string};
/** Per-subject durable leases. Teacher scans include classes with no mobile student records. */
export async function reconcileAttendanceResults(options:{limit?:number;signal?:AbortSignal;read?:typeof readCompanionAttendance;subjectType?:'student'|'teacher'}={}){
 const totals={disabled:!institutionalResultsEnabled(),accepted:0,classSessions:0,pages:0,retried:0,failed:0};if(totals.disabled)return totals;
 const limit=options.limit??5;if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('ATTENDANCE_BATCH_INVALID');
 const kinds:('student'|'teacher')[]=options.subjectType?[options.subjectType]:['student','teacher'];
 if(kinds.some(kind=>!['student','teacher'].includes(kind)))throw Error('RESULT_SUBJECT_INVALID');
 let configured:string[];try{configured=Object.keys(JSON.parse(process.env.SIII_COMPANION_RESULTS_TARGETS_JSON??'{}')).filter(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))}catch{throw Error('ATTENDANCE_TARGETS_INVALID')}
 if(!configured.length)return totals;
 const allowed=sql.join(configured.map(id=>sql`${id}::uuid`),sql`, `);
 for(const kind of kinds){
  // SQL identifiers are selected from these two fixed internal definitions, never a request value.
  const table=sql.identifier(kind==='student'?'attendance_result_reconciliation':'class_session_reconciliation');
  const subjectColumn=sql.identifier(kind==='student'?'student_id':'teacher_id');
  const candidates=kind==='student'?sql`select distinct s.institution_id,s.id from institutional_students s join institutions i on i.id=s.institution_id and i.status='active' join section_enrollments e on e.student_id=s.id and e.institution_id=s.institution_id join academic_section_versions v on v.section_id=e.section_id and v.institution_id=e.institution_id where s.institution_id in (${allowed})`
   :sql`select distinct t.institution_id,t.id from institutional_teachers t join institutions i on i.id=t.institution_id and i.status='active' join section_teachers a on a.teacher_id=t.id and a.institution_id=t.institution_id join academic_section_versions v on v.section_id=a.section_id and v.institution_id=a.institution_id where t.institution_id in (${allowed})`;
  await db.execute(sql`insert into ${table}(institution_id,${subjectColumn}) ${candidates} on conflict do nothing`);
  await db.transaction(async tx=>{
   const exhausted=await tx.execute<{institution_id:string;subject_id:string}>(sql`update ${table} set state='failed',lease_token=null,lease_until=null where institution_id in (${allowed}) and state='queued' and attempts>=8 and (lease_until is null or lease_until<=clock_timestamp()) returning institution_id,${subjectColumn} as subject_id`);
   for(const row of exhausted.rows)await audit(tx,{institutionId:row.institution_id,requestId:randomUUID(),action:'attendance.results.failed',target:kind+':'+row.subject_id,details:{after:{attempts:8}}});totals.failed+=exhausted.rows.length;
  });
  for(let n=0;n<limit&&!options.signal?.aborted;n++){
   const job=await db.transaction(async tx=>{
    const rows=await tx.execute<Omit<Job,'lease_token'>>(sql`select institution_id,${subjectColumn} as subject_id,page,attempts from ${table} where institution_id in (${allowed}) and state='queued' and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp()) order by next_attempt_at,institution_id,${subjectColumn} limit 1 for update skip locked`);
    const row=rows.rows[0];if(!row)return null;const lease_token=randomUUID();
    await tx.execute(sql`update ${table} set lease_token=${lease_token},lease_until=clock_timestamp()+interval '60 seconds',attempts=least(8,attempts+1) where institution_id=${row.institution_id} and ${subjectColumn}=${row.subject_id}`);
    return {...row,attempts:Math.min(8,row.attempts+1),lease_token};
   });if(!job)break;
   try{
    const before=await db.transaction(tx=>archivalAttendanceSubject(tx,job.institution_id,job.subject_id,kind));if(!before)throw Error('ATTENDANCE_SOURCE_UNAVAILABLE');
    const history=await(options.read??readCompanionAttendance)(job.institution_id,before.externalId,{version:'archive',page:job.page,subjectType:kind,signal:options.signal});
    if(!history||history.contract!=='siii.attendance_archive.v1')throw Error('ATTENDANCE_PROVIDER_UNAVAILABLE');
    const counts=await db.transaction(async tx=>{
     const unit=await tx.execute(sql`select id from institutions where id=${job.institution_id} and status='active' for update`);if(!unit.rows.length)throw Error('ATTENDANCE_SOURCE_CHANGED');
     const after=await archivalAttendanceSubject(tx,job.institution_id,job.subject_id,kind);if(!after||JSON.stringify(after)!==JSON.stringify(before))throw Error('ATTENDANCE_SOURCE_CHANGED');
     const authority=await archivalAttendanceAuthority(tx,job.institution_id,after,history,kind);if(!authority)throw Error('ATTENDANCE_SOURCE_PROOF_UNAVAILABLE');
     const records=kind==='student'?await persistAcceptedAttendance(tx,job.institution_id,job.subject_id,history,null,job.lease_token,authority.records):0;
     const classes=await persistAcceptedClasses(tx,job.institution_id,history,job.lease_token,authority.sessions);
     const completed=await tx.execute(sql`update ${table} set page=${history.nextPage??1},attempts=0,next_attempt_at=clock_timestamp()+${history.nextPage?0:300}*interval '1 second',lease_token=null,lease_until=null,last_success_at=clock_timestamp() where institution_id=${job.institution_id} and ${subjectColumn}=${job.subject_id} and lease_token=${job.lease_token} and lease_until>clock_timestamp() returning ${subjectColumn}`);
     if(!completed.rows.length)throw Error('ATTENDANCE_LEASE_LOST');
     await audit(tx,{institutionId:job.institution_id,requestId:job.lease_token,action:'attendance.results.reconciled',target:kind+':'+job.subject_id,details:{after:{page:job.page,records:history.records.length,accepted:records,classSessions:classes,completeScan:history.nextPage===undefined}}});
     return {records,classes};
    });totals.accepted+=counts.records;totals.classSessions+=counts.classes;totals.pages++;
   }catch{
    const exhausted=job.attempts>=8;
    const updated=await db.transaction(async tx=>{
     const result=await tx.execute(sql`update ${table} set state=${exhausted?'failed':'queued'},next_attempt_at=clock_timestamp()+${Math.min(3600,15*2**job.attempts)}*interval '1 second',lease_token=null,lease_until=null where institution_id=${job.institution_id} and ${subjectColumn}=${job.subject_id} and lease_token=${job.lease_token} and lease_until>clock_timestamp() returning ${subjectColumn}`);
     if(result.rows.length)await audit(tx,{institutionId:job.institution_id,requestId:job.lease_token,action:exhausted?'attendance.results.failed':'attendance.results.retry',target:kind+':'+job.subject_id,details:{after:{attempts:job.attempts,page:job.page}}});return result.rows.length;
    });if(updated){if(exhausted)totals.failed++;else totals.retried++}
   }
  }
 }
 return totals;
}
