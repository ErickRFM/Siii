import {createHash,randomUUID} from 'node:crypto';
import {and,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {academicSections,academicSectionVersions,academicSectionOutbox} from '../../../../db/schema';
import {audit,type Transaction} from '@/shared/http/request-context';
import {academicSectionSnapshot} from './snapshot';
import {sealAcademicBody} from './seal';
import {academicOutboxEnabled} from './policy';
export type AcademicEnqueueScope={institutionId:string;sectionId:string;requestId:string;actorUserId?:string;operation?:'upsert'|'delete'};
/** Call only inside the authorized academic mutation/audit transaction; this function grants no authority. */
export async function enqueueAcademicSection(tx:Transaction,scope:AcademicEnqueueScope):Promise<{status:'disabled'}|{status:'queued';eventId:string;sourceVersion:number}>{
 if(!academicOutboxEnabled())return {status:'disabled'};
 if(!z.object({institutionId:z.uuid(),sectionId:z.uuid(),requestId:z.uuid(),actorUserId:z.uuid().optional(),operation:z.enum(['upsert','delete']).optional()}).strict().safeParse(scope).success)throw Error('ACADEMIC_OUTBOX_SCOPE_INVALID');
 const [section]=await tx.select({id:academicSections.id}).from(academicSections).where(and(eq(academicSections.id,scope.sectionId),eq(academicSections.institutionId,scope.institutionId))).for('update');
 if(!section)throw Error('ACADEMIC_SECTION_NOT_FOUND');
 const [counter]=await tx.insert(academicSectionVersions).values({institutionId:scope.institutionId,sectionId:scope.sectionId,sourceVersion:1}).onConflictDoUpdate({target:[academicSectionVersions.institutionId,academicSectionVersions.sectionId],set:{sourceVersion:sql`${academicSectionVersions.sourceVersion}+1`}}).returning();
 const eventId=randomUUID(),occurredAt=new Date(),operation=scope.operation??'upsert',payload=operation==='delete'?{}:await academicSectionSnapshot(tx,scope.institutionId,scope.sectionId);
 const body=JSON.stringify({schemaVersion:1,eventId,entityType:'group',externalId:scope.sectionId,sourceVersion:counter.sourceVersion,occurredAtEpochSeconds:Math.floor(occurredAt.getTime()/1000),operation,payload});
 if(Buffer.byteLength(body,'utf8')>1048576)throw Error('ACADEMIC_SNAPSHOT_LIMIT_EXCEEDED');
 await tx.insert(academicSectionOutbox).values({eventId,institutionId:scope.institutionId,sectionId:scope.sectionId,sourceVersion:counter.sourceVersion,occurredAt,operation,bodyEncrypted:sealAcademicBody(body,{eventId,...scope}),bodyDigest:createHash('sha256').update(body).digest('hex')});
 await audit(tx,{institutionId:scope.institutionId,requestId:scope.requestId,actorUserId:scope.actorUserId,action:'academic.snapshot.queued',target:'section:'+scope.sectionId,details:{after:{eventId,sourceVersion:counter.sourceVersion,operation}}});
 return {status:'queued',eventId,sourceVersion:counter.sourceVersion};
}
