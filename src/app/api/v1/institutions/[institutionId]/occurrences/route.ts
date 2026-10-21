import {queueCompanionSectionSnapshot} from '@/integrations/companion/outbox/write-hook';
import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest,NextResponse } from 'next/server';
import { and,eq,gte,lte,asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { classOccurrences,schedulePatterns,academicSections,classrooms,academicCourses,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { occurrenceUpdate } from '@/modules/scheduling/validation';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
type Ctx={params:Promise<{institutionId:string}>};
async function institution(c:Ctx){const v=await c.params;return z.uuid().safeParse(v.institutionId).success?v.institutionId:null;}
export const GET=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 const id=await institution(c);if(!id)return jsonError('INVALID_INSTITUTION',404);
 if(!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const weekOf=req.nextUrl.searchParams.get('weekOf')??'';
 const sectionId=req.nextUrl.searchParams.get('sectionId');
 if(!z.iso.date().safeParse(weekOf).success||(sectionId&&!z.uuid().safeParse(sectionId).success))return jsonError('INVALID_WEEK',422);
 const start=new Date(weekOf+'T12:00:00Z');
 const end=new Date(start.getTime()+6*86400000).toISOString().slice(0,10);
 const rows=await db.select({
  id:classOccurrences.id,sectionId:classOccurrences.sectionId,patternId:classOccurrences.patternId,
  date:classOccurrences.onDate,state:classOccurrences.state,reason:classOccurrences.reason,
  weekday:schedulePatterns.weekday,startMinute:schedulePatterns.startMinute,endMinute:schedulePatterns.endMinute,
  roomCode:classrooms.code,roomBuilding:classrooms.building,sectionCode:academicSections.code,courseName:academicCourses.name,
 }).from(classOccurrences)
 .innerJoin(schedulePatterns,eq(classOccurrences.patternId,schedulePatterns.id))
 .innerJoin(academicSections,eq(classOccurrences.sectionId,academicSections.id))
 .innerJoin(academicCourses,eq(academicSections.courseId,academicCourses.id))
 .innerJoin(classrooms,eq(schedulePatterns.roomId,classrooms.id))
 .where(and(eq(classOccurrences.institutionId,id),gte(classOccurrences.onDate,weekOf),lte(classOccurrences.onDate,end),
 ...(sectionId?[eq(classOccurrences.sectionId,sectionId)]:[]))).orderBy(asc(classOccurrences.onDate),asc(schedulePatterns.startMinute)).limit(500);
 return NextResponse.json({data:rows,truncated:rows.length===500,weekOf},{headers});
});
export const PATCH=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await institution(c);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const access=await authorizeInstitution(id,'academic.manage');if(!access)return jsonError('FORBIDDEN',403);
 const parsed=occurrenceUpdate.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const data=await domainTransaction(access,{permission:'academic.manage'},async tx=>{
  const [current]=await tx.select().from(classOccurrences).where(and(eq(classOccurrences.id,parsed.data.id),eq(classOccurrences.institutionId,id))).limit(1);
  if(!current)return {error:'OCCURRENCE_NOT_FOUND',status:404} as const;
  if(current.state==='CANCELLED')return {error:'CANCELLED_OCCURRENCE_IMMUTABLE',status:409} as const;
  const [changed]=await tx.update(classOccurrences).set({
   state:parsed.data.state,reason:parsed.data.reason,updatedAt:new Date(),
  }).where(and(eq(classOccurrences.id,parsed.data.id),eq(classOccurrences.institutionId,id))).returning();
  await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:access.identity.id,action:'schedule.occurrence.'+parsed.data.state.toLowerCase(),target:'occurrence:'+changed.id});
  await queueCompanionSectionSnapshot(tx,{institutionId:id,sectionId:changed.sectionId,actorUserId:access.identity.id});
  return {data:changed,status:200} as const;
 });
 return 'error'in data && typeof data.error==='string'?jsonError(data.error,data.status):
  NextResponse.json({data:'data'in data?data.data:null},{headers});
});
