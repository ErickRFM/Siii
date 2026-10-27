import 'server-only';
import {and,eq,isNull,sql} from 'drizzle-orm';
import type {z} from 'zod';
import {db} from '@/infrastructure/database';
import {institutionalStudents,studentAccountLinks,studentServiceRequests,securityAuditLog} from '../../../db/schema';
import {lockInstitutionContext} from '@/shared/auth/write-access';
import {can} from '@/shared/auth/capabilities';
import type {InstitutionAccess} from '@/shared/auth/institution-policy';
import {DomainAccessDenied,DomainConflict} from '@/modules/consolidation/domain-boundary';
import {personalRequestCreate} from './validation';

export const personalRequestFields={id:studentServiceRequests.id,requestType:studentServiceRequests.requestType,summary:studentServiceRequests.summary,status:studentServiceRequests.status,decisionReason:studentServiceRequests.decisionReason,createdAt:studentServiceRequests.createdAt,updatedAt:studentServiceRequests.updatedAt};
export const requestEventStatus:Record<string,string>={'service.request.submit':'SUBMITTED','service.request.in_review':'IN_REVIEW','service.request.approved':'APPROVED','service.request.rejected':'REJECTED','service.request.closed':'CLOSED'};
type Actor={identity:{id:string;sessionId:string};access:InstitutionAccess};

/** A request records a student's intent. It never emits a document, changes an
 * enrollment, or accepts a student/actor identifier chosen by the client. */
export async function createPersonalRequest(actor:Actor,input:z.infer<typeof personalRequestCreate>,correlationId:string){
 try{return await db.transaction(async tx=>{
  async function check(expectedRecordId?:string){
   const current=await lockInstitutionContext(tx,actor.identity,actor.access);if(!current)throw new DomainAccessDenied();
   const [record]=await tx.select({id:institutionalStudents.id,programId:institutionalStudents.programId,status:institutionalStudents.status}).from(studentAccountLinks)
    .innerJoin(institutionalStudents,and(eq(institutionalStudents.id,studentAccountLinks.studentId),eq(institutionalStudents.institutionId,studentAccountLinks.institutionId)))
    .where(and(eq(studentAccountLinks.institutionId,current.access.institutionId),eq(studentAccountLinks.membershipId,current.access.membershipId),isNull(studentAccountLinks.revokedAt),eq(institutionalStudents.status,'active'))).limit(1).for('share',{of:studentAccountLinks});
   // Evaluate expiry at the database clock after waiting on record/audit locks.
   const clock=await tx.execute<{now:Date}>(sql`select clock_timestamp() as now`),now=clock.rows[0].now;
   if(!record||(expectedRecordId&&record.id!==expectedRecordId)||!can(current.subject,'student.requests.create',{institutionId:current.access.institutionId,status:record.status,programId:record.programId,ownerUserId:current.subject.id},new Date(now)))throw new DomainAccessDenied();
   return record;
  }
  const record=await check();
  const [existing]=await tx.select().from(studentServiceRequests).where(and(eq(studentServiceRequests.id,input.operationId),eq(studentServiceRequests.institutionId,actor.access.institutionId),eq(studentServiceRequests.studentId,record.id))).limit(1).for('update');
  if(existing){
   if(existing.requestType!==input.requestType||existing.summary!==input.summary)throw new DomainConflict('REQUEST_OPERATION_CONFLICT');
   await check(record.id);
   const [row]=await tx.select(personalRequestFields).from(studentServiceRequests).where(and(eq(studentServiceRequests.id,existing.id),eq(studentServiceRequests.institutionId,actor.access.institutionId),eq(studentServiceRequests.studentId,record.id)));
   return {row,replayed:true};
  }
  const [row]=await tx.insert(studentServiceRequests).values({id:input.operationId,institutionId:actor.access.institutionId,studentId:record.id,requestType:input.requestType,summary:input.summary}).returning(personalRequestFields);
  await tx.insert(securityAuditLog).values({institutionId:actor.access.institutionId,actorUserId:actor.identity.id,requestId:correlationId,action:'service.request.submit',target:'request:'+row.id,details:{after:{status:row.status,requestType:row.requestType}}});
  await check(record.id);
  return {row,replayed:false};
 })}catch(cause){
  const error=cause as {code?:string;cause?:{code?:string}};
  if((error.code??error.cause?.code)==='23505')throw new DomainConflict('REQUEST_OPERATION_CONFLICT');
  throw cause;
 }
}
