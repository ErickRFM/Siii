import {createHash,createHmac,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import {academicDeliveryTarget} from './outbox/signed-transport';

const path='/integration/v1/attendance-history';
const integer=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const opaque=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const record=z.strictObject({
 auditRecordId:z.string().regex(/^[0-9a-f]{64}$/),sessionId:opaque,sectionId:z.uuid(),occurrenceId:z.uuid(),sourceVersion:integer.min(1),occurrenceDate:z.iso.date(),
 status:z.enum(['verified','likely','review_required','rejected']),
 disposition:z.enum(['present','late','absent']).nullable().optional().default(null),
 reasonCode:z.enum(['identity_session_time','duplicate','offline_late_sync','offline_network_qr_review','not_enrolled','outside_allowed_window','teacher_review','session_closed','wrong_session','qr_valid','qr_expired','qr_invalid','class_call_confirmed']),
 receivedAtEpochSeconds:integer,reviewedAtEpochSeconds:integer.nullable().optional().default(null),
});
const result=z.strictObject({contract:z.literal('siii.attendance_history.v1'),observedAtEpochSeconds:integer.min(1),sampleLimit:z.literal(100),records:z.array(record).max(100)});
const resultV2=result.extend({contract:z.literal('siii.attendance_history.v2'),page:integer.min(1).max(10000),nextPage:integer.min(2).max(10000).optional(),records:z.array(record.extend({recordRevision:integer.min(1)})).max(100)});
const classSession=z.strictObject({sessionId:opaque,sectionId:z.uuid(),occurrenceId:z.uuid(),sourceVersion:integer.min(1),occurrenceDate:z.iso.date(),teacherExternalId:z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/),sessionRevision:z.number().int().min(1).max(2),status:z.enum(['open','closed']),openedAtEpochSeconds:integer,closedAtEpochSeconds:integer.nullable().optional().default(null),closedByTeacher:z.boolean()}).refine(value=>value.sessionRevision===(value.status==='open'?1:2)&&(!value.closedByTeacher||(value.status==='closed'&&value.closedAtEpochSeconds!==null&&value.closedAtEpochSeconds>=value.openedAtEpochSeconds)));
const archiveResult=resultV2.extend({contract:z.literal('siii.attendance_archive.v1'),classSessions:z.array(classSession).max(100).optional().default([])});
export type InstitutionalClassSession=z.infer<typeof classSession>;
export type CompanionAttendanceHistory=z.infer<typeof result>|z.infer<typeof resultV2>|z.infer<typeof archiveResult>;
export function institutionalResultsEnabled(){return process.env.SIII_COMPANION_RESULTS_ENABLED==='true'}

/** Separate read credential only. Unavailable never means an empty authorized history. */
export async function readCompanionAttendance(
 institutionId:string,studentExternalId:string,
 options:{targets?:string;http?:typeof fetch;signal?:AbortSignal;version?:2|'archive';page?:number;subjectType?:'student'|'teacher'}={},
):Promise<CompanionAttendanceHistory|null>{
 let target:ReturnType<typeof academicDeliveryTarget>|undefined;
 try{
  if(!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(studentExternalId))return null;
  target=academicDeliveryTarget(institutionId,options.targets??(options.version==='archive'?process.env.SIII_COMPANION_RESULTS_TARGETS_JSON:process.env.SIII_COMPANION_ATTENDANCE_TARGETS_JSON));
  const hostname=new URL(target.url).hostname.toLowerCase();
  if(isIP(hostname)||hostname==='localhost'||hostname.endsWith('.localhost')||hostname.endsWith('.internal')||hostname.endsWith('.local'))return null;
  const body=JSON.stringify({contract:options.version==='archive'?'siii.attendance_archive_request.v1':options.version===2?'siii.attendance_history_request.v2':'siii.attendance_history_request.v1',...(options.version==='archive'&&options.subjectType==='teacher'?{teacherExternalId:studentExternalId}:{studentExternalId}),...(options.version!==undefined?{page:options.page??1}:{})});
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(24).toString('base64url');
  const canonical=['POST',path,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
  const signature='v1='+createHmac('sha256',target.secret).update(canonical).digest('hex');
  const deadline=AbortSignal.timeout(10000),signal=options.signal?AbortSignal.any([deadline,options.signal]):deadline;
  const response=await(options.http??fetch)(new URL(path,target.url),{
   method:'POST',body,signal,cache:'no-store',redirect:'manual',credentials:'omit',
   headers:{'Content-Type':'application/json','X-Integration-Key-Id':target.keyId,'X-Integration-Timestamp':timestamp,'X-Integration-Nonce':nonce,'X-Integration-Signature':signature},
  });
  if(response.status!==200){await response.body?.cancel();return null;}
  const reader=response.body?.getReader();if(!reader)return null;
  const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>131072){await reader.cancel();return null;}chunks.push(part.value);}}finally{reader.releaseLock();}
  const parsed=(options.version==='archive'?archiveResult:options.version===2?resultV2:result).safeParse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
  if(!parsed.success||(parsed.data.contract!=='siii.attendance_history.v1'&&(parsed.data.page!==(options.page??1)||(parsed.data.nextPage!==undefined&&parsed.data.nextPage!==parsed.data.page+1)))||Math.abs(Math.floor(Date.now()/1000)-parsed.data.observedAtEpochSeconds)>60)return null;
  if(new Set(parsed.data.records.map(row=>row.auditRecordId)).size!==parsed.data.records.length||new Set(parsed.data.records.map(row=>row.sessionId)).size!==parsed.data.records.length)return null;
  if(parsed.data.contract==='siii.attendance_archive.v1'&&(new Set(parsed.data.classSessions.map(session=>session.sessionId)).size!==parsed.data.classSessions.length||(options.subjectType==='teacher'&&parsed.data.records.length>0)))return null;
  return parsed.data;
 }catch{return null;}finally{target?.secret.fill(0);}
}
