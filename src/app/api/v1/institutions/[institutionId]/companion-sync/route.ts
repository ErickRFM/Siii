import {materializeSectionOccurrences} from '@/modules/scheduling/materialize';
import {lockWriteAccess} from '@/shared/auth/write-access';
import {DomainAccessDenied} from '@/modules/consolidation/domain-boundary';
import {NextRequest,NextResponse} from 'next/server';
import {and,eq,inArray,sql} from 'drizzle-orm';
import {z} from 'zod';
import {academicSections,academicSectionVersions,academicSectionOutbox} from '../../../../../../../db/schema';
import {authorizeInstitution} from '@/shared/auth/session';
import {assertSameOrigin,jsonError} from '@/shared/auth/guards';
import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {audit,requestId} from '@/shared/http/request-context';
import {academicOutboxEnabled} from '@/integrations/companion/outbox/policy';
import {enqueueAcademicSection} from '@/integrations/companion/outbox/enqueue';
import {readProjectionStatus} from '@/integrations/companion/projection-status';

export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Context={params:Promise<{institutionId:string}>};
const recovery=z.strictObject({materializeOccurrences:z.boolean().optional(),sectionId:z.uuid(),expectedSourceVersion:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),reason:z.string().trim().min(12).max(240).refine(value=>!/[\u0000-\u001f\u007f]/.test(value))});
async function institution(context:Context){const {institutionId}=await context.params;return z.uuid().safeParse(institutionId).success?institutionId:null}

/** Metadata only: accepted is a durable receipt acknowledgement, not applied projection. */
export const GET=withDomainErrors(async(req:NextRequest,context:Context)=>{
 const id=await institution(context);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const actor=await authorizeInstitution(id,'integrations.manage');if(!actor)return jsonError('FORBIDDEN',403);
 if(!academicOutboxEnabled())return NextResponse.json({data:{enabled:false,projectionStatus:'unverified'}},{headers});
 const data=await domainTransaction(actor,{permission:'integrations.manage'},async tx=>{
  const summary=await tx.execute(sql`SELECT
   count(*) FILTER(WHERE state='queued')::int AS pending,
   count(*) FILTER(WHERE state='accepted')::int AS accepted,
   count(*) FILTER(WHERE state='failed')::int AS failed,
   count(*) FILTER(WHERE state='queued' AND attempts>0)::int AS retrying,
   count(*) FILTER(WHERE state='queued' AND lease_until>clock_timestamp())::int AS "activeLeases",
   min(created_at) FILTER(WHERE state='queued') AS "oldestPendingAt",
   max(accepted_at) AS "lastAcceptedAt"
   FROM academic_section_outbox WHERE institution_id=${id}::uuid`);
  const events=await tx.select({eventId:academicSectionOutbox.eventId,sectionId:academicSectionOutbox.sectionId,sourceVersion:academicSectionOutbox.sourceVersion,state:academicSectionOutbox.state,attempts:academicSectionOutbox.attempts,failureCode:academicSectionOutbox.failureCode,nextAttemptAt:academicSectionOutbox.nextAttemptAt,createdAt:academicSectionOutbox.createdAt,updatedAt:academicSectionOutbox.updatedAt}).from(academicSectionOutbox).where(eq(academicSectionOutbox.institutionId,id)).orderBy(sql`${academicSectionOutbox.updatedAt} DESC`,sql`${academicSectionOutbox.eventId} DESC`).limit(101);
  const missing=await tx.execute(sql`SELECT count(*)::int AS count FROM academic_sections s LEFT JOIN academic_section_versions v ON v.institution_id=s.institution_id AND v.section_id=s.id WHERE s.institution_id=${id}::uuid AND s.status<>'archived' AND v.section_id IS NULL`);
  const sectionIds=[...new Set(events.slice(0,100).map(event=>event.sectionId))];
  const sourceVersions=sectionIds.length?await tx.select({sectionId:academicSectionVersions.sectionId,sourceVersion:academicSectionVersions.sourceVersion}).from(academicSectionVersions).where(and(eq(academicSectionVersions.institutionId,id),inArray(academicSectionVersions.sectionId,sectionIds))):[];
  await audit(tx,{institutionId:id,actorUserId:actor.identity.id,requestId:requestId(req.headers),action:'academic.delivery.observed',target:'companion-sync',details:{after:{projectionStatus:'unverified'}}});
  return {enabled:true,deliveryEnabled:process.env.SIII_COMPANION_DELIVERY_ENABLED==='true',projectionStatus:'unverified',summary:summary.rows[0],sectionsWithoutSnapshot:missing.rows[0]?.count,sourceVersions,events:events.slice(0,100),truncated:events.length>100,observedAt:new Date().toISOString()};
 });
 const candidates=data.events.slice(0,50).map(({eventId,sectionId,sourceVersion})=>({eventId,sectionId,sourceVersion}));
 const projection=data.deliveryEnabled&&candidates.length?await readProjectionStatus(id,candidates,{signal:req.signal}):{status:'unavailable' as const};
 // Never return operator data to an actor revoked while a remote observation was in flight.
 await domainTransaction(actor,{permission:'integrations.manage'},async()=>null);
 const versionComparison=data.sourceVersions.map(source=>{
  const heads=projection.status==='verified'?[...new Set(projection.receipts.filter(item=>item.sectionId===source.sectionId&&'appliedSourceVersion'in item&&item.appliedSourceVersion!==null).map(item=>'appliedSourceVersion'in item?item.appliedSourceVersion:null))]:[];
  const appliedSourceVersion=heads.length===1?heads[0]??null:null;
  return {...source,appliedSourceVersion,difference:appliedSourceVersion===null?null:source.sourceVersion-appliedSourceVersion};
 });
 return NextResponse.json({data:{...data,projectionStatus:projection.status==='verified'?'observed':'unverified',projection,versionComparison}},{headers});
});

/** Recovery creates a new current snapshot; it never rewrites a receipt, failed body or attempts. */
export const POST=withDomainErrors(async(req:NextRequest,context:Context)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await institution(context);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const actor=await authorizeInstitution(id,'integrations.manage');if(!actor)return jsonError('FORBIDDEN',403);
 const parsed=recovery.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 if(!academicOutboxEnabled())return jsonError('ACADEMIC_OUTBOX_DISABLED',503);
 const data=await domainTransaction(actor,{permission:'integrations.manage'},async tx=>{
  const input=parsed.data;
  const [section]=await tx.select({id:academicSections.id}).from(academicSections).where(and(eq(academicSections.id,input.sectionId),eq(academicSections.institutionId,id))).for('update');
  if(!section)return {error:'SECTION_NOT_FOUND',status:404} as const;
  const [version]=await tx.select({sourceVersion:academicSectionVersions.sourceVersion}).from(academicSectionVersions).where(and(eq(academicSectionVersions.institutionId,id),eq(academicSectionVersions.sectionId,section.id)));
  if((version?.sourceVersion??0)!==input.expectedSourceVersion)return {error:'SOURCE_VERSION_CHANGED',status:409} as const;
  const correlation=requestId(req.headers);
  let materialized:number|undefined;
  if(input.materializeOccurrences){
   if(!await lockWriteAccess(tx,actor.identity,actor.access,'academic.manage'))throw new DomainAccessDenied();
   materialized=await materializeSectionOccurrences(tx,id,section.id);
   await audit(tx,{institutionId:id,actorUserId:actor.identity.id,requestId:correlation,action:'schedule.occurrences.materialized',target:'section:'+section.id,details:{after:{inserted:materialized,reason:input.reason}}});
  }
  const result=await enqueueAcademicSection(tx,{institutionId:id,sectionId:section.id,actorUserId:actor.identity.id,requestId:correlation});
  if(result.status!=='queued')throw Error('ACADEMIC_OUTBOX_DISABLED');
  await audit(tx,{institutionId:id,actorUserId:actor.identity.id,requestId:correlation,action:'academic.snapshot.reconciled',target:'section:'+section.id,details:{before:{sourceVersion:input.expectedSourceVersion},after:{sourceVersion:result.sourceVersion,eventId:result.eventId,reason:input.reason}}});
  return {data:{...result,...(materialized===undefined?{}:{materializedOccurrences:materialized})},status:201} as const;
 });
 return 'error'in data&&typeof data.error==='string'?jsonError(data.error,data.status):NextResponse.json({data:data.data},{status:201,headers});
});
