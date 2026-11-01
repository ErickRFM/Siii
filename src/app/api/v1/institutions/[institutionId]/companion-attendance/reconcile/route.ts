import {NextRequest,NextResponse} from 'next/server';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import {authorizeInstitution} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {audit,requestId} from '@/shared/http/request-context';
import {institutionalResultsEnabled} from '@/integrations/companion/attendance-history';
export const runtime='nodejs';
const recovery=z.strictObject({studentId:z.uuid().optional(),teacherId:z.uuid().optional(),reason:z.string().trim().min(12).max(240).refine(s=>!/[\u0000-\u001f\u007f]/.test(s))}).refine(value=>Boolean(value.studentId)!==Boolean(value.teacherId));
export const POST=withDomainErrors(async(req:NextRequest,context:{params:Promise<{institutionId:string}>})=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const {institutionId}=await context.params;if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);
 const actor=await authorizeInstitution(institutionId,'integrations.manage');if(!actor)return jsonError('FORBIDDEN',403);
 if(!institutionalResultsEnabled(institutionId))return jsonError('INSTITUTIONAL_ATTENDANCE_PENDING',503);
 const input=recovery.safeParse(await req.json().catch(()=>null));if(!input.success)return jsonError('VALIDATION_ERROR',422);
 const subjectId=input.data.studentId??input.data.teacherId!;
 const kind=input.data.teacherId?'teacher':'student';
 const table=sql.identifier(kind==='teacher'?'class_session_reconciliation':'attendance_result_reconciliation');
 const column=sql.identifier(kind==='teacher'?'teacher_id':'student_id');
 const recovered=await domainTransaction(actor,{permission:'integrations.manage'},async tx=>{
  const rows=await tx.execute(sql`update ${table} set page=1,attempts=0,state='queued',next_attempt_at=clock_timestamp(),lease_token=null,lease_until=null where institution_id=${institutionId} and ${column}=${subjectId} and state='failed' returning ${column}`);
  if(!rows.rows.length)return false;
  await audit(tx,{institutionId,actorUserId:actor.identity.id,requestId:requestId(req.headers),action:'attendance.results.recovery',target:kind+':'+subjectId,details:{after:{reason:input.data.reason}}});
  return true;
 });
 return recovered?NextResponse.json({data:{queued:true}},{headers:{'Cache-Control':'no-store'}}):jsonError('FAILED_RECONCILIATION_NOT_FOUND',404);
});
