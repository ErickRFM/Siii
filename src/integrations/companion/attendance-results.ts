import {createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';
import type {Transaction} from '@/shared/http/request-context';
import type {CompanionAttendanceHistory} from './attendance-history';

/** Caller holds source/actor locks and has revalidated the complete signed response.
 * Append only: missing records never delete results; old decisions never replace newer ones.
 */
export async function persistAcceptedAttendance(tx:Transaction,institutionId:string,studentId:string,history:CompanionAttendanceHistory,actorUserId:string|null,correlationId:string,authority:Map<string,string[]>){
 if(history.contract!=='siii.attendance_archive.v1')throw Error('ATTENDANCE_REVISION_REQUIRED');
 let inserted=0;
 // Deterministic locking order also supports future batch reconciliation callers.
 for(const record of [...history.records].sort((a,b)=>a.auditRecordId.localeCompare(b.auditRecordId))){
  const teachers=authority.get(record.auditRecordId)??[];
  if(history.contract==='siii.attendance_archive.v1'&&!teachers.length)throw Error('ATTENDANCE_SOURCE_PROOF_REQUIRED');
  const teacherArray=sql`array[${sql.join(teachers.map(id=>sql`${id}::uuid`),sql`, `)}]::uuid[]`;
  const body=JSON.stringify(record),digest=createHash('sha256').update(body).digest('hex');
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${institutionId+':'+record.auditRecordId},0))`);
  const known=await tx.execute<{student_id:string;section_id:string;occurrence_id:string;session_id:string;source_version:string;body_digest:string;record_revision:string}>(sql`
   select student_id,section_id,occurrence_id,session_id,source_version,body_digest,record_revision
   from institutional_attendance_results where institution_id=${institutionId} and audit_record_id=${record.auditRecordId}
   order by record_revision desc limit 1`);
  const latest=known.rows[0];
  if(latest&&(latest.student_id!==studentId||latest.section_id!==record.sectionId||latest.occurrence_id!==record.occurrenceId||latest.session_id!==record.sessionId||Number(latest.source_version)!==record.sourceVersion))throw Error('ATTENDANCE_IDENTITY_CONFLICT');
  const duplicate=await tx.execute<{body_digest:string}>(sql`select body_digest from institutional_attendance_results where institution_id=${institutionId} and audit_record_id=${record.auditRecordId} and record_revision=${record.recordRevision}`);
  if(duplicate.rows.length){if(duplicate.rows[0].body_digest!==digest)throw Error('ATTENDANCE_REVISION_CONFLICT');continue}
  // Older unseen revisions may be retained as audit evidence; reads select max(record_revision).
  await tx.execute(sql`insert into institutional_attendance_results(institution_id,audit_record_id,record_revision,student_id,section_id,occurrence_id,session_id,source_version,occurrence_date,body,body_digest,accepted_by,request_id,teacher_source_ids)
   values(${institutionId},${record.auditRecordId},${record.recordRevision},${studentId},${record.sectionId},${record.occurrenceId},${record.sessionId},${record.sourceVersion},${record.occurrenceDate},${body}::jsonb,${digest},${actorUserId},${correlationId},${teacherArray})`);
  inserted++;
 }
 return inserted;
}

/** Initial open and first immutable closure have distinct monotonic revisions. */
export async function persistAcceptedClasses(tx:Transaction,institutionId:string,history:CompanionAttendanceHistory,correlationId:string,authority:Map<string,{teacherId:string;studentIds:string[]}>){
 if(history.contract!=='siii.attendance_archive.v1')throw Error('ATTENDANCE_REVISION_REQUIRED');
 let inserted=0;
 for(const session of [...history.classSessions].sort((a,b)=>a.sessionId.localeCompare(b.sessionId))){
  const proof=authority.get(session.sessionId);if(!proof)throw Error('CLASS_SOURCE_PROOF_REQUIRED');
  const teacherId=proof.teacherId;const students=sql`array[${sql.join(proof.studentIds.map(id=>sql`${id}::uuid`),sql`, `)}]::uuid[]`;
  const body=JSON.stringify(session),digest=createHash('sha256').update(body).digest('hex');
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${institutionId+':class:'+session.sessionId},0))`);
  const known=await tx.execute<{teacher_id:string;section_id:string;occurrence_id:string;source_version:string}>(sql`select teacher_id,section_id,occurrence_id,source_version from institutional_class_sessions where institution_id=${institutionId} and session_id=${session.sessionId} order by session_revision desc limit 1`);
  const prior=known.rows[0];if(prior&&(prior.teacher_id!==teacherId||prior.section_id!==session.sectionId||prior.occurrence_id!==session.occurrenceId||Number(prior.source_version)!==session.sourceVersion))throw Error('CLASS_IDENTITY_CONFLICT');
  const duplicate=await tx.execute<{body_digest:string}>(sql`select body_digest from institutional_class_sessions where institution_id=${institutionId} and session_id=${session.sessionId} and session_revision=${session.sessionRevision}`);
  if(duplicate.rows.length){if(duplicate.rows[0].body_digest!==digest)throw Error('CLASS_REVISION_CONFLICT');continue}
  await tx.execute(sql`insert into institutional_class_sessions(institution_id,session_id,session_revision,teacher_id,section_id,occurrence_id,source_version,occurrence_date,body,body_digest,request_id,student_source_ids) values(${institutionId},${session.sessionId},${session.sessionRevision},${teacherId},${session.sectionId},${session.occurrenceId},${session.sourceVersion},${session.occurrenceDate},${body}::jsonb,${digest},${correlationId},${students})`);inserted++;
 }
 return inserted;
}
