import {queueCompanionSectionSnapshot} from '@/integrations/companion/outbox/write-hook';
import {domainTransaction,withDomainErrors} from '@/modules/consolidation/domain-boundary';
import {requestId} from '@/shared/http/request-context';
import { NextRequest,NextResponse } from 'next/server';
import { and,eq,desc,sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { academicSections,academicTerms,classrooms,schedulePatterns,classOccurrences,sectionTeachers,securityAuditLog } from '../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { assertSameOrigin,jsonError } from '@/shared/auth/guards';
import { patternCreate,occurrenceDates } from '@/modules/scheduling/validation';

export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
const headers={'Cache-Control':'no-store'};
async function institution(c:Ctx){const v=await c.params;return z.uuid().safeParse(v.institutionId).success?v.institutionId:null;}
function error(e:unknown){const x=e as {code?:string;cause?:{code?:string}};const c=x.code??x.cause?.code;
 if(c==='23505')return jsonError('DUPLICATE_PATTERN',409);
 if(c==='23503'||c==='23514')return jsonError('SCHEDULE_CONSTRAINT',422);
 throw e;
}
export const GET=withDomainErrors(async (_req:NextRequest,c:Ctx)=>{
 const id=await institution(c);if(!id)return jsonError('INVALID_INSTITUTION',404);
 if(!await authorizeInstitution(id,'academic.manage'))return jsonError('FORBIDDEN',403);
 const rows=await db.select().from(schedulePatterns).where(eq(schedulePatterns.institutionId,id)).orderBy(desc(schedulePatterns.createdAt)).limit(200);
 return NextResponse.json({data:rows,truncated:rows.length===200},{headers});
});
export const POST=withDomainErrors(async (req:NextRequest,c:Ctx)=>{
 if(!assertSameOrigin(req))return jsonError('INVALID_ORIGIN',403);
 const id=await institution(c);if(!id)return jsonError('INVALID_INSTITUTION',404);
 const auth=await authorizeInstitution(id,'academic.manage');if(!auth)return jsonError('FORBIDDEN',403);
 const parsed=patternCreate.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('VALIDATION_ERROR',422);
 const p=parsed.data;
 try{
  const outcome=await domainTransaction(auth,{permission:'academic.manage'},async tx=>{
   const [section]=await tx.select().from(academicSections).where(and(eq(academicSections.id,p.sectionId),eq(academicSections.institutionId,id),eq(academicSections.status,'open'))).limit(1);
   const [room]=await tx.select().from(classrooms).where(and(eq(classrooms.id,p.roomId),eq(classrooms.institutionId,id),eq(classrooms.isActive,true))).limit(1);
   if(!section||!room)return {error:'SECTION_OR_ROOM_UNAVAILABLE',status:422} as const;
   if(room.capacity<section.capacity)return {error:'ROOM_CAPACITY_TOO_LOW',status:422} as const;
   const [term]=await tx.select().from(academicTerms).where(and(eq(academicTerms.id,section.termId),eq(academicTerms.institutionId,id),eq(academicTerms.status,'active'))).limit(1);
   if(!term)return {error:'TERM_UNAVAILABLE',status:422} as const;
   const [teacher]=await tx.select({id:sectionTeachers.id}).from(sectionTeachers).where(and(eq(sectionTeachers.sectionId,section.id),eq(sectionTeachers.institutionId,id),sql`${sectionTeachers.revokedAt} IS NULL`)).limit(1);
   if(!teacher)return {error:'TEACHER_REQUIRED',status:422} as const;

   // Stable order for all timetable writers in the institution/term avoids overlapping concurrent writes.
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('siii:academic:'||${id}||':'||${term.id}))`);
   const collision=await tx.execute(sql`
    SELECT sp.id FROM schedule_patterns sp
    JOIN academic_sections other_section ON other_section.id=sp.section_id
    WHERE sp.institution_id=${id}
      AND EXISTS(SELECT 1 FROM class_occurrences oc WHERE oc.pattern_id=sp.id AND oc.state<>'CANCELLED' AND oc.on_date>=${term.startDate}::date AND oc.on_date<=${term.endDate}::date)
      AND sp.is_active=true AND sp.weekday=${p.weekday}
      AND sp.start_minute<${p.endMinute} AND sp.end_minute>${p.startMinute}
      AND (
        sp.room_id=${p.roomId} OR sp.section_id=${p.sectionId}
        OR EXISTS(
          SELECT 1 FROM section_teachers ours
          JOIN section_teachers theirs ON ours.teacher_id=theirs.teacher_id
          WHERE ours.section_id=${p.sectionId} AND theirs.section_id=sp.section_id
            AND ours.revoked_at IS NULL AND theirs.revoked_at IS NULL
        )
        OR EXISTS(
          SELECT 1 FROM section_enrollments ours
          JOIN section_enrollments theirs ON ours.student_id=theirs.student_id
          WHERE ours.section_id=${p.sectionId} AND theirs.section_id=sp.section_id
            AND ours.status='enrolled' AND theirs.status='enrolled'
        )
      ) LIMIT 1
   `);
   if(collision.rows.length)return {error:'SCHEDULE_CONFLICT',status:409} as const;
   let dates:string[]=[];
   try{dates=occurrenceDates(term.startDate,term.endDate,p.weekday)}
   catch{return {error:'UNSUPPORTED_TERM_RANGE',status:422} as const}
   if(!dates.length)return {error:'NO_OCCURRENCES_IN_TERM',status:422} as const;
   const [pattern]=await tx.insert(schedulePatterns).values({...p,institutionId:id}).returning();
   await tx.insert(classOccurrences).values(dates.map(onDate=>({institutionId:id,sectionId:p.sectionId,patternId:pattern.id,onDate})));
   await tx.insert(securityAuditLog).values({requestId:requestId(req.headers),institutionId:id,actorUserId:auth.identity.id,action:'schedule.pattern.create',target:'pattern:'+pattern.id});
   await queueCompanionSectionSnapshot(tx,{institutionId:id,sectionId:p.sectionId,actorUserId:auth.identity.id});
   return {data:{pattern,occurrenceCount:dates.length},status:201} as const;
  });
  return 'error' in outcome && typeof outcome.error==='string'
   ?jsonError(outcome.error,outcome.status)
   :NextResponse.json({data:('data' in outcome?outcome.data:null)},{status:201,headers});
 }catch(e){return error(e)}
});
