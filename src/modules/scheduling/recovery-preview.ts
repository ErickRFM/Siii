import {and,eq,inArray,isNull} from 'drizzle-orm';
import {academicSections,academicTerms,classrooms,classOccurrences,schedulePatterns,sectionTeachers,institutionalTeachers,academicSectionVersions} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import {occurrenceDates} from './validation';

/** Bounded read-only estimate; POST revalidates everything under locks. */
export async function previewOccurrenceRecovery(tx:Transaction,tenant:string,sectionId:string){
 const [section]=await tx.select().from(academicSections).where(and(eq(academicSections.institutionId,tenant),eq(academicSections.id,sectionId))).limit(1);
 if(!section)return null;
 const [term]=await tx.select().from(academicTerms).where(and(eq(academicTerms.institutionId,tenant),eq(academicTerms.id,section.termId))).limit(1);
 const [counter]=await tx.select({sourceVersion:academicSectionVersions.sourceVersion}).from(academicSectionVersions).where(and(eq(academicSectionVersions.institutionId,tenant),eq(academicSectionVersions.sectionId,sectionId))).limit(1);
 const patterns=await tx.select().from(schedulePatterns).where(and(eq(schedulePatterns.institutionId,tenant),eq(schedulePatterns.sectionId,sectionId))).limit(101);
 const active=patterns.filter(pattern=>pattern.isActive);
 const blockers:string[]=[];
 if(section.status!=='open')blockers.push('SECTION_UNAVAILABLE');
 if(!term||term.status!=='active')blockers.push('TERM_UNAVAILABLE');
 if(patterns.length>100)blockers.push('PATTERN_LIMIT_EXCEEDED');
 const teachers=await tx.select({id:sectionTeachers.id}).from(sectionTeachers).innerJoin(institutionalTeachers,and(eq(institutionalTeachers.id,sectionTeachers.teacherId),eq(institutionalTeachers.institutionId,tenant),eq(institutionalTeachers.status,'active'))).where(and(eq(sectionTeachers.institutionId,tenant),eq(sectionTeachers.sectionId,sectionId),isNull(sectionTeachers.revokedAt))).limit(1);
 if(!teachers.length)blockers.push('TEACHER_REQUIRED');
 const roomIds=[...new Set(active.map(pattern=>pattern.roomId))];
 const rooms=roomIds.length?await tx.select({id:classrooms.id,isActive:classrooms.isActive,capacity:classrooms.capacity}).from(classrooms).where(and(eq(classrooms.institutionId,tenant),inArray(classrooms.id,roomIds))):[];
 const byRoom=new Map(rooms.map(room=>[room.id,room]));
 if(active.some(pattern=>{const room=byRoom.get(pattern.roomId);return !room||!room.isActive||room.capacity<section.capacity}))blockers.push('ROOM_UNAVAILABLE');
 const persisted=await tx.select({patternId:classOccurrences.patternId,onDate:classOccurrences.onDate}).from(classOccurrences).where(and(eq(classOccurrences.institutionId,tenant),eq(classOccurrences.sectionId,sectionId))).limit(3001);
 if(persisted.length>3000)blockers.push('SNAPSHOT_LIMIT_EXCEEDED');
 const existing=new Set(persisted.map(row=>row.patternId+':'+row.onDate));
 let missingOccurrences=0,expectedOccurrences=0;
 const patternsPreview=active.slice(0,100).map(pattern=>{
  let dates:string[]=[];
  if(term&&term.status==='active'){try{dates=occurrenceDates(term.startDate,term.endDate,pattern.weekday)}catch{if(!blockers.includes('UNSUPPORTED_TERM_RANGE'))blockers.push('UNSUPPORTED_TERM_RANGE')}}
  const missing=dates.filter(date=>!existing.has(pattern.id+':'+date)).length;
  missingOccurrences+=missing;expectedOccurrences+=dates.length;
  return {patternId:pattern.id,weekday:pattern.weekday,expectedOccurrences:dates.length,missingOccurrences:missing};
 });
 if(expectedOccurrences>3000)blockers.push('SNAPSHOT_LIMIT_EXCEEDED');
 return {sectionId,expectedSourceVersion:counter?.sourceVersion??0,termId:term?.id??null,
  activePatterns:active.length,inactivePatterns:patterns.length-active.length,
  existingOccurrences:persisted.length,expectedOccurrences,missingOccurrences,patterns:patternsPreview,
  blockers:[...new Set(blockers)],ready:active.length>0&&blockers.length===0,estimateOnly:true as const};
}
