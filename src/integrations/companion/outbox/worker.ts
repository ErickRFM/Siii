import {createHash,randomUUID} from 'node:crypto';
import {and,asc,eq,gt,lte,isNull,or} from 'drizzle-orm';
import {db} from '@/infrastructure/database';
import {academicSectionOutbox} from '../../../../db/schema';
import {audit,type Transaction} from '@/shared/http/request-context';
import {academicOutboxEnabled,nextAcademicAttempt} from './policy';
import {openAcademicBody} from './seal';
import {runAcademicTransport,type AcademicDeliveryResult,type AcademicTransport} from './transport';
type Row=typeof academicSectionOutbox.$inferSelect;
export type AcademicLease=Row&{leaseToken:string};
const available=(now:Date)=>or(isNull(academicSectionOutbox.leaseUntil),lte(academicSectionOutbox.leaseUntil,now));
/** Claim commits before any transport. A reclaimed lease gets a new unpredictable token. */
export async function claimAcademicEvent(tx:Transaction,eventId:string,now:Date):Promise<AcademicLease|null>{
 if(!academicOutboxEnabled())return null;
 const [row]=await tx.select().from(academicSectionOutbox).where(and(eq(academicSectionOutbox.eventId,eventId),eq(academicSectionOutbox.state,'queued'),lte(academicSectionOutbox.nextAttemptAt,now),available(now))).for('update',{skipLocked:true});
 if(!row)return null;
 if(row.attempts>=8){await tx.update(academicSectionOutbox).set({state:'failed',failureCode:'RETRY_EXHAUSTED',leaseToken:null,leaseUntil:null,updatedAt:now}).where(eq(academicSectionOutbox.eventId,eventId));await audit(tx,{institutionId:row.institutionId,action:'academic.snapshot.failed',target:'event:'+row.eventId,requestId:randomUUID(),details:{after:{state:'failed',sourceVersion:row.sourceVersion,attempts:row.attempts}}});return null}
 const leaseToken=randomUUID();const [leased]=await tx.update(academicSectionOutbox).set({leaseToken,leaseUntil:new Date(now.getTime()+60000),attempts:row.attempts+1,updatedAt:now}).where(eq(academicSectionOutbox.eventId,eventId)).returning();return {...leased,leaseToken};
}
/** Fences every completion by event/state/token and unexpired lease; never overwrites frozen columns. */
export async function completeAcademicEvent(tx:Transaction,event:AcademicLease,result:AcademicDeliveryResult,now:Date):Promise<'queued'|'accepted'|'failed'|null>{
 if(!academicOutboxEnabled())return null;
 const next=nextAcademicAttempt(event.attempts,now);
 const update=result.status==='accepted'?{state:'accepted' as const,acceptedAt:now,failureCode:null}:
 result.status==='retryable'&&next?{state:'queued' as const,nextAttemptAt:next,failureCode:'TRANSPORT_RETRY'}:
 {state:'failed' as const,failureCode:result.status==='invalid'?result.code:result.status==='rejected'?'TRANSPORT_REJECTED':'RETRY_EXHAUSTED'};
 const [row]=await tx.update(academicSectionOutbox).set({...update,leaseToken:null,leaseUntil:null,updatedAt:now}).where(and(eq(academicSectionOutbox.eventId,event.eventId),eq(academicSectionOutbox.state,'queued'),eq(academicSectionOutbox.leaseToken,event.leaseToken),gt(academicSectionOutbox.leaseUntil,now))).returning({state:academicSectionOutbox.state});
 if(row)await audit(tx,{institutionId:event.institutionId,action:'academic.snapshot.'+row.state,target:'event:'+event.eventId,requestId:randomUUID(),details:{after:{sourceVersion:event.sourceVersion,state:row.state,attempts:event.attempts}}});
 return row?.state??null;
}
export type AcademicDeliveryStore={
 listDue:(now:Date,limit:number)=>Promise<{eventId:string}[]>;
 claim:(eventId:string,now:Date)=>Promise<AcademicLease|null>;
 complete:(event:AcademicLease,result:AcademicDeliveryResult,now:Date)=>Promise<'queued'|'accepted'|'failed'|null>;
};
const databaseStore:AcademicDeliveryStore={
 listDue:(now,limit)=>db.select({eventId:academicSectionOutbox.eventId}).from(academicSectionOutbox).where(and(eq(academicSectionOutbox.state,'queued'),lte(academicSectionOutbox.nextAttemptAt,now),available(now))).orderBy(asc(academicSectionOutbox.nextAttemptAt),asc(academicSectionOutbox.eventId)).limit(limit),
 claim:(eventId,now)=>db.transaction(tx=>claimAcademicEvent(tx,eventId,now)),
 complete:(event,result,now)=>db.transaction(tx=>completeAcademicEvent(tx,event,result,now)),
};
/** Accepted is authenticated receipt only, never APPLIED. The monotonic budget
 * includes database work, reserves a complete transport window before claiming,
 * and leaves margin below the endpoint's 120s execution limit for completion.
 */
export async function deliverAcademicEvents(options:{transport:AcademicTransport;limit?:number;budgetMs?:number;clock?:()=>number;signal?:AbortSignal},store:AcademicDeliveryStore=databaseStore){
 const totals={disabled:!academicOutboxEnabled(),claimed:0,accepted:0,retried:0,failed:0,budgetExhausted:false,cancelled:false};if(totals.disabled)return totals;
 const limit=options.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('ACADEMIC_OUTBOX_LIMIT_INVALID');
 const budgetMs=options.budgetMs??90000;if(!Number.isFinite(budgetMs)||budgetMs<0||budgetMs>90000)throw Error('ACADEMIC_OUTBOX_BUDGET_INVALID');
 const clock=options.clock??(()=>performance.now()),deadline=clock()+budgetMs,remaining=()=>Math.max(0,deadline-clock());
 const stopped=()=>{totals.cancelled=options.signal?.aborted??false;totals.budgetExhausted=remaining()<30000;return totals.cancelled||totals.budgetExhausted;};
 if(stopped())return totals;
 const candidates=await store.listDue(new Date(),limit);
 for(const candidate of candidates){
  if(stopped())break;
  const event=await store.claim(candidate.eventId,new Date());if(!event)continue;totals.claimed++;
  let result:AcademicDeliveryResult;
  try{const body=openAcademicBody(event.bodyEncrypted,event);if(createHash('sha256').update(body).digest('hex')!==event.bodyDigest)throw Error('ACADEMIC_OUTBOX_BODY_INVALID');
   const timeoutMs=Math.max(0,Math.floor(Math.min(30000,remaining(),(event.leaseUntil?.getTime()??0)-Date.now()-1000)));
   result=await runAcademicTransport(options.transport,{eventId:event.eventId,institutionId:event.institutionId,sectionId:event.sectionId,sourceVersion:event.sourceVersion,body},{timeoutMs,signal:options.signal});
  }catch(error){result=error instanceof Error&&error.message==='ACADEMIC_OUTBOX_KEY_UNAVAILABLE'?{status:'invalid',code:'KEY_UNAVAILABLE'}:error instanceof Error&&error.message==='ACADEMIC_OUTBOX_BODY_INVALID'?{status:'invalid',code:'BODY_INVALID'}:{status:'retryable'}}
  const state=await store.complete(event,result,new Date());if(state==='accepted')totals.accepted++;else if(state==='queued')totals.retried++;else if(state==='failed')totals.failed++;
 }
 stopped();
 return totals;
}
