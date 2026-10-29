import 'server-only';
import {and,eq,asc,inArray,ne} from 'drizzle-orm';
import {academicPrograms,academicSections,academicTerms,academicCourses,academicSectionVersions,institutionalStudents,sectionEnrollments,classOccurrences} from '../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import type {CompanionAttendanceHistory} from './attendance-history';

/** Captures official identifiers and scope; no name, email or native identity crosses services. */
export async function attendanceSubject(tx:Transaction,institutionId:string,studentId:string){
 const [student]=await tx.select({id:institutionalStudents.id,externalId:institutionalStudents.enrollmentNumber,programId:institutionalStudents.programId})
  .from(institutionalStudents).innerJoin(academicPrograms,and(eq(academicPrograms.id,institutionalStudents.programId),eq(academicPrograms.institutionId,institutionId),eq(academicPrograms.status,'active')))
  .where(and(eq(institutionalStudents.id,studentId),eq(institutionalStudents.institutionId,institutionId),eq(institutionalStudents.status,'active'))).limit(1);
 if(!student)return null;
 const sections=await tx.select({sectionId:academicSections.id,sourceVersion:academicSectionVersions.sourceVersion}).from(sectionEnrollments)
  .innerJoin(academicSections,and(eq(academicSections.id,sectionEnrollments.sectionId),eq(academicSections.institutionId,institutionId),eq(academicSections.status,'open')))
  .innerJoin(academicTerms,and(eq(academicTerms.id,academicSections.termId),eq(academicTerms.institutionId,institutionId),eq(academicTerms.status,'active')))
  .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId),eq(academicCourses.status,'active')))
  .innerJoin(academicSectionVersions,and(eq(academicSectionVersions.sectionId,academicSections.id),eq(academicSectionVersions.institutionId,institutionId)))
  .where(and(eq(sectionEnrollments.institutionId,institutionId),eq(sectionEnrollments.studentId,student.id),eq(sectionEnrollments.status,'enrolled')))
  .orderBy(asc(academicSections.id)).limit(1001);
 if(!sections.length||sections.length>1000)return null;
 return {...student,sections};
}

export async function attendanceRecordsMatch(tx:Transaction,institutionId:string,subject:NonNullable<Awaited<ReturnType<typeof attendanceSubject>>>,history:CompanionAttendanceHistory){
 if(history.records.some(record=>!subject.sections.some(section=>section.sectionId===record.sectionId&&section.sourceVersion===record.sourceVersion)))return false;
 if(!history.records.length)return true;
 const occurrences=await tx.select({id:classOccurrences.id,sectionId:classOccurrences.sectionId,date:classOccurrences.onDate}).from(classOccurrences)
  .where(and(eq(classOccurrences.institutionId,institutionId),inArray(classOccurrences.id,history.records.map(record=>record.occurrenceId)),ne(classOccurrences.state,'CANCELLED')));
 return history.records.every(record=>occurrences.some(occurrence=>occurrence.id===record.occurrenceId&&occurrence.sectionId===record.sectionId&&occurrence.date===record.occurrenceDate));
}
