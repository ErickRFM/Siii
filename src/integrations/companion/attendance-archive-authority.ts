import {createHash} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {academicSectionOutbox,institutionalStudents,institutionalTeachers} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import {openAcademicBody} from './outbox/seal';
import {validateAcademicSnapshot} from './outbox/snapshot';
import type {CompanionAttendanceHistory} from './attendance-history';
export async function archivalAttendanceSubject(tx:Transaction,institutionId:string,subjectId:string,kind:'student'|'teacher'='student'){
 if(kind==='teacher'){
  const [teacher]=await tx.select({id:institutionalTeachers.id,externalId:institutionalTeachers.employeeNumber}).from(institutionalTeachers).where(and(eq(institutionalTeachers.institutionId,institutionId),eq(institutionalTeachers.id,subjectId))).limit(1);return teacher??null;
 }
 const [student]=await tx.select({id:institutionalStudents.id,externalId:institutionalStudents.enrollmentNumber}).from(institutionalStudents).where(and(eq(institutionalStudents.institutionId,institutionId),eq(institutionalStudents.id,subjectId))).limit(1);return student??null;
}
/** Every result and operational class must match its exact immutable source publication. */
export async function archivalAttendanceAuthority(tx:Transaction,institutionId:string,subject:{id:string;externalId:string},history:CompanionAttendanceHistory,kind:'student'|'teacher'='student'){
 if(history.contract!=='siii.attendance_archive.v1'||kind==='teacher'&&history.records.length)return null;
 const records=new Map<string,string[]>(),sessions=new Map<string,{teacherId:string;studentIds:string[]}>(),snapshots=new Map<string,ReturnType<typeof validateAcademicSnapshot>>();
 async function original(sectionId:string,sourceVersion:number){
  const key=sectionId+':'+sourceVersion;const cached=snapshots.get(key);if(cached)return cached;
  const [event]=await tx.select().from(academicSectionOutbox).where(and(eq(academicSectionOutbox.institutionId,institutionId),eq(academicSectionOutbox.sectionId,sectionId),eq(academicSectionOutbox.sourceVersion,sourceVersion))).limit(1);
  if(!event||event.operation!=='upsert')return null;
  const body=openAcademicBody(event.bodyEncrypted,{eventId:event.eventId,institutionId,sectionId});
  if(createHash('sha256').update(body).digest('hex')!==event.bodyDigest)return null;
  const envelope=JSON.parse(body);
  if(envelope.eventId!==event.eventId||envelope.entityType!=='group'||envelope.externalId!==sectionId||envelope.sourceVersion!==sourceVersion||envelope.operation!=='upsert')return null;
  const snapshot=validateAcademicSnapshot(envelope.payload);if(snapshot.sectionId!==sectionId||snapshot.status!=='open')return null;
  snapshots.set(key,snapshot);return snapshot;
 }
 const enrolled=(snapshot:ReturnType<typeof validateAcademicSnapshot>)=>snapshot.enrollments.some(e=>e.studentSourceId===subject.id&&e.studentExternalId===subject.externalId&&e.studentStatus==='active'&&e.status==='enrolled');
 for(const record of history.records){
  const snapshot=await original(record.sectionId,record.sourceVersion);
  if(!snapshot||!enrolled(snapshot)||!snapshot.teachers.length||!snapshot.occurrences.some(o=>o.sourceId===record.occurrenceId&&o.date===record.occurrenceDate&&o.status!=='CANCELLED'))return null;
  records.set(record.auditRecordId,snapshot.teachers.map(t=>t.sourceId).sort());
 }
 for(const session of history.classSessions){
  const snapshot=await original(session.sectionId,session.sourceVersion);if(!snapshot)return null;
  const teacher=snapshot.teachers.find(t=>t.externalId===session.teacherExternalId);
  if(!teacher||kind==='teacher'&&(teacher.sourceId!==subject.id||teacher.externalId!==subject.externalId)||kind==='student'&&!enrolled(snapshot))return null;
  if(!snapshot.occurrences.some(o=>o.sourceId===session.occurrenceId&&o.date===session.occurrenceDate&&o.status!=='CANCELLED'))return null;
  sessions.set(session.sessionId,{teacherId:teacher.sourceId,studentIds:snapshot.enrollments.filter(e=>e.studentStatus==='active'&&e.status==='enrolled').map(e=>e.studentSourceId).sort()});
 }
 return {records,sessions};
}
