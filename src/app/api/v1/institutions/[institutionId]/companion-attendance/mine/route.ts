import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {personalContext} from '@/modules/portal/read-model';
import {personalAttendanceSubject,finishPersonalAttendance} from '@/integrations/companion/personal-attendance';
import {readCompanionAttendance} from '@/integrations/companion/attendance-history';
import {attendanceSession} from '@/shared/auth/attendance-session';
import {requestId} from '@/shared/http/request-context';

export const runtime='nodejs';
type Context={params:Promise<{institutionId:string}>};
export const GET=withDomainErrors(async(req:NextRequest,context:Context)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await context.params;
 if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);
 if(req.nextUrl.search)return jsonError('INVALID_QUERY',422);
 const actor=await personalContext(institutionId,'student');if(!actor)return jsonError('FORBIDDEN',403);
 const before=await personalAttendanceSubject(actor);if(!before)return jsonError('ATTENDANCE_SUBJECT_UNAVAILABLE',404);
 const history=await readCompanionAttendance(institutionId,before.externalId,{signal:req.signal});
 if(!history)return jsonError('COMPANION_ATTENDANCE_UNAVAILABLE',503);
 const permitted=await finishPersonalAttendance(actor,before,history,requestId(req.headers));
 return permitted?NextResponse.json({data:history},{headers:{'Cache-Control':'no-store','X-SIII-Attendance-Session':attendanceSession(actor.identity)}}):jsonError('ATTENDANCE_SOURCE_CHANGED',503);
});
