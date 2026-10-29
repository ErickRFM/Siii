import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorizeInstitution} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {audit,requestId} from '@/shared/http/request-context';
import {attendanceSubject,attendanceRecordsMatch} from '@/integrations/companion/attendance-subject';
import {readCompanionAttendance} from '@/integrations/companion/attendance-history';

export const runtime='nodejs';
type Context={params:Promise<{institutionId:string;studentId:string}>};
const headers={'Cache-Control':'no-store'};

/** Institutional registry readers only; this proxy never accepts a student, tenant or origin override. */
export const GET=withDomainErrors(async(req:NextRequest,context:Context)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId,studentId}=await context.params;
 if(!z.uuid().safeParse(institutionId).success||!z.uuid().safeParse(studentId).success)return jsonError('NOT_FOUND',404);
 const actor=await authorizeInstitution(institutionId,'academic.manage');if(!actor)return jsonError('FORBIDDEN',403);
 if(req.nextUrl.search)return jsonError('INVALID_QUERY',422);
 const before=await domainTransaction(actor,{permission:'academic.manage'},tx=>attendanceSubject(tx,institutionId,studentId));
 if(!before)return jsonError('ATTENDANCE_SUBJECT_UNAVAILABLE',404);
 const history=await readCompanionAttendance(institutionId,before.externalId,{signal:req.signal});
 if(!history)return jsonError('COMPANION_ATTENDANCE_UNAVAILABLE',503);
 // Source membership, enrollment, versions and occurrence relations are rechecked after remote I/O.
 const permitted=await domainTransaction(actor,{permission:'academic.manage'},async tx=>{
  const after=await attendanceSubject(tx,institutionId,studentId);
  if(!after||JSON.stringify(before)!==JSON.stringify(after)||!await attendanceRecordsMatch(tx,institutionId,after,history))return false;
  await audit(tx,{institutionId,actorUserId:actor.identity.id,requestId:requestId(req.headers),action:'companion.attendance.read',target:'student:'+studentId,
   details:{after:{records:history.records.length,observedAtEpochSeconds:history.observedAtEpochSeconds}}});
  return true;
 });
 return permitted?NextResponse.json({data:history},{headers}):jsonError('ATTENDANCE_SOURCE_CHANGED',503);
});
