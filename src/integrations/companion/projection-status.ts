import {createHash,createHmac,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {academicDeliveryTarget,selectedAcademicDeliveryTarget} from './outbox/signed-transport';

const path='/integration/v1/projection-status';
const positive=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const reference=z.strictObject({eventId:z.uuid(),sectionId:z.uuid(),sourceVersion:positive});
const receipt=reference.extend({status:z.enum(['pending','processing','pending_identity','projected','superseded','retryable','unsupported','failed']),attempts:z.number().int().min(0).max(1000),failureCode:z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).nullable().optional().default(null),receivedAtEpochSeconds:positive,completedAtEpochSeconds:positive.nullable().optional().default(null),appliedSourceVersion:positive.nullable().optional().default(null)}).strict();
const result=z.strictObject({contract:z.literal('siii.projection_status.v1'),observedAtEpochSeconds:positive,receipts:z.array(receipt).max(50)});
export type ProjectionReference=z.infer<typeof reference>;
type ObservedReceipt=z.infer<typeof receipt>|ProjectionReference&{status:'unknown'};
export type ProjectionObservation={status:'verified';observedAtEpochSeconds:number;receipts:ObservedReceipt[]}|{status:'unavailable'};

/** Observation only, with the current server-held credential and strict identity/version matching. */
export async function readProjectionStatus(institutionId:string,events:ProjectionReference[],options:{targets?:string;http?:typeof fetch;signal?:AbortSignal}={}):Promise<ProjectionObservation>{
 let target:ReturnType<typeof academicDeliveryTarget>|undefined;
 try{
  const parsed=z.array(reference).min(1).max(50).safeParse(events);
  if(!parsed.success||new Set(events.map(event=>event.eventId)).size!==events.length)return {status:'unavailable'};
  target=options.targets!==undefined
   ?academicDeliveryTarget(institutionId,options.targets)
   :selectedAcademicDeliveryTarget(institutionId,process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON,{
     enabled:process.env.SIII_COMPANION_HMAC_ROLLOVER_ENABLED,
     targets:process.env.SIII_COMPANION_HMAC_ROLLOVER_TARGETS_JSON,
   });
  const body=JSON.stringify({contract:'siii.projection_status_request.v1',eventIds:events.map(event=>event.eventId)});
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(24).toString('base64url');
  const signature='v1='+createHmac('sha256',target.secret).update(['POST',path,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
  const deadline=AbortSignal.timeout(10000),signal=options.signal?AbortSignal.any([deadline,options.signal]):deadline;
  const response=await(options.http??fetch)(new URL(path,target.url),{method:'POST',body,signal,cache:'no-store',redirect:'manual',credentials:'omit',headers:{'Content-Type':'application/json','X-Integration-Key-Id':target.keyId,'X-Integration-Timestamp':timestamp,'X-Integration-Nonce':nonce,'X-Integration-Signature':signature}});
  if(response.status!==200){await response.body?.cancel();return {status:'unavailable'}}
  const reader=response.body?.getReader();if(!reader)return {status:'unavailable'};
  const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>32768){await reader.cancel();return {status:'unavailable'}}chunks.push(part.value)}}finally{reader.releaseLock()}
  const value=result.safeParse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
  if(!value.success||Math.abs(Math.floor(Date.now()/1000)-value.data.observedAtEpochSeconds)>60)return {status:'unavailable'};
  const receipts=value.data.receipts;
  if(new Set(receipts.map(item=>item.eventId)).size!==receipts.length)return {status:'unavailable'};
  for(const item of receipts){const expected=events.find(event=>event.eventId===item.eventId);if(!expected||expected.sectionId!==item.sectionId||expected.sourceVersion!==item.sourceVersion)return {status:'unavailable'}}
  return {status:'verified',observedAtEpochSeconds:value.data.observedAtEpochSeconds,receipts:events.map(event=>receipts.find(item=>item.eventId===event.eventId)??{...event,status:'unknown'})};
 }catch{return {status:'unavailable'}}finally{target?.secret.fill(0)}
}
