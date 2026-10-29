import 'server-only';
import {and,eq,isNull,sql} from 'drizzle-orm';
import {institutionalStudents,studentAccountLinks} from '../../../db/schema';
import {db} from '@/infrastructure/database';
import {lockInstitutionContext} from '@/shared/auth/write-access';
import {can} from '@/shared/auth/capabilities';
import type {InstitutionAccess} from '@/shared/auth/institution-policy';
import {audit,type Transaction} from '@/shared/http/request-context';
import {DomainAccessDenied} from '@/modules/consolidation/domain-boundary';
import {attendanceSubject,attendanceRecordsMatch} from './attendance-subject';
import type {CompanionAttendanceHistory} from './attendance-history';

type Actor={identity:{id:string;sessionId:string};access:InstitutionAccess};

async function resolve(tx:Transaction,actor:Actor){
 const current=await lockInstitutionContext(tx,actor.identity,actor.access);
 if(!current)throw new DomainAccessDenied();
 const [link]=await tx.select({linkId:studentAccountLinks.id,studentId:institutionalStudents.id,programId:institutionalStudents.programId})
  .from(studentAccountLinks).innerJoin(institutionalStudents,and(eq(institutionalStudents.id,studentAccountLinks.studentId),eq(institutionalStudents.institutionId,studentAccountLinks.institutionId)))
  .where(and(eq(studentAccountLinks.institutionId,current.access.institutionId),eq(studentAccountLinks.membershipId,current.access.membershipId),isNull(studentAccountLinks.revokedAt),eq(institutionalStudents.status,'active'))).limit(1).for('share',{of:studentAccountLinks});
 if(!link)return null;
 const clock=await tx.execute<{now:Date}>(sql`select clock_timestamp() as now`);
 if(!can(current.subject,'student.self.read',{institutionId:current.access.institutionId,status:'active',programId:link.programId,ownerUserId:current.subject.id},new Date(clock.rows[0].now)))throw new DomainAccessDenied();
 const subject=await attendanceSubject(tx,current.access.institutionId,link.studentId);
 return subject?{linkId:link.linkId,...subject}:null;
}

export function personalAttendanceSubject(actor:Actor){return db.transaction(tx=>resolve(tx,actor));}

export async function finishPersonalAttendance(actor:Actor,before:NonNullable<Awaited<ReturnType<typeof personalAttendanceSubject>>>,history:CompanionAttendanceHistory,correlationId:string){
 return db.transaction(async tx=>{
  const after=await resolve(tx,actor);
  if(!after||JSON.stringify(before)!==JSON.stringify(after)||!await attendanceRecordsMatch(tx,actor.access.institutionId,after,history))return false;
  await audit(tx,{institutionId:actor.access.institutionId,actorUserId:actor.identity.id,requestId:correlationId,action:'companion.attendance.self.read',target:'student:'+after.id,details:{after:{records:history.records.length,observedAtEpochSeconds:history.observedAtEpochSeconds}}});
  // Recheck expiry and session after waiting on audit/database work.
  const final=await resolve(tx,actor);
  if(!final||JSON.stringify(after)!==JSON.stringify(final))throw new DomainAccessDenied();
  return true;
 });
}
