import 'server-only';
import { and,eq,isNull,sql } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { institutionalStudents,academicPrograms,sectionEnrollments,academicSections,academicCourses,academicTerms,
 institutionalTeachers,sectionTeachers,schedulePatterns,classrooms,campuses } from '../../../db/schema';

const dayName=['','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO'];
const time=(minute:number)=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
export async function externalStudent(institutionId:string,externalId:string){
 const rows=await db.select({student:institutionalStudents,programCode:academicPrograms.code})
  .from(institutionalStudents)
  .innerJoin(academicPrograms,eq(institutionalStudents.programId,academicPrograms.id))
  .where(and(eq(institutionalStudents.institutionId,institutionId),eq(institutionalStudents.enrollmentNumber,externalId),eq(institutionalStudents.status,'active'))).limit(1);
 const item=rows[0];if(!item)return null;
 return {
  externalId:item.student.enrollmentNumber,
  fullName:[item.student.firstName,item.student.lastName].filter(Boolean).join(' '),
  institutionalEmail:item.student.institutionalEmail??null,
  programCode:item.programCode,enrollmentYear:null,
 };
}
export async function externalAcademicLoad(institutionId:string,externalId:string){
 const student=await externalStudent(institutionId,externalId);
 if(!student)return {error:'STUDENT_NOT_FOUND',status:404} as const;
 const [person]=await db.select({id:institutionalStudents.id}).from(institutionalStudents)
  .where(and(eq(institutionalStudents.institutionId,institutionId),eq(institutionalStudents.enrollmentNumber,externalId))).limit(1);
 if(!person)return {error:'STUDENT_NOT_FOUND',status:404} as const;
 const rows=await db.select({
  sectionId:academicSections.id,groupName:academicSections.code,
  courseId:academicCourses.id,subjectCode:academicCourses.code,subjectName:academicCourses.name,credits:academicCourses.credits,
  term:academicTerms.code,enrolledAt:sectionEnrollments.createdAt,
 }).from(sectionEnrollments)
 .innerJoin(academicSections,eq(sectionEnrollments.sectionId,academicSections.id))
 .innerJoin(academicCourses,eq(academicSections.courseId,academicCourses.id))
 .innerJoin(academicTerms,eq(academicSections.termId,academicTerms.id))
 .where(and(eq(sectionEnrollments.studentId,person.id),eq(sectionEnrollments.institutionId,institutionId),eq(sectionEnrollments.status,'enrolled'))).limit(101);
 if(rows.length>100)return {error:'ACADEMIC_LOAD_LIMIT_EXCEEDED',status:409} as const;
 const enrollments:{
  course:{externalId:string;subject:{externalCode:string;name:string;credits:number};teacher:{externalId:string;fullName:string;institutionalEmail:string|null;departmentCode:null};term:string;groupName:string};
  enrolledAtIso:string;
 }[]=[];
 const schedule:{courseId:string;groupName:string;weekdayName:string;startTime:string;endTime:string;buildingCode:string;classroomCode:string;campusName:string}[]=[];
 for(const r of rows){
  const [teacher]=await db.select({id:institutionalTeachers.employeeNumber,
    firstName:institutionalTeachers.firstName,lastName:institutionalTeachers.lastName,
    email:institutionalTeachers.institutionalEmail})
    .from(sectionTeachers).innerJoin(institutionalTeachers,eq(sectionTeachers.teacherId,institutionalTeachers.id))
    .where(and(eq(sectionTeachers.sectionId,r.sectionId),eq(sectionTeachers.institutionId,institutionId),
      isNull(sectionTeachers.revokedAt),eq(institutionalTeachers.status,'active'))).limit(1);
  if(!teacher)return {error:'MISSING_TEACHER_ASSIGNMENT',status:409} as const;
  enrollments.push({course:{
   externalId:r.sectionId,subject:{externalCode:r.subjectCode,name:r.subjectName,credits:r.credits},
   teacher:{externalId:teacher.id,fullName:[teacher.firstName,teacher.lastName].join(' '),
     institutionalEmail:teacher.email??null,departmentCode:null},
   term:r.term,groupName:r.groupName,
  },enrolledAtIso:r.enrolledAt.toISOString()});
  const slots=await db.select({weekday:schedulePatterns.weekday,startMinute:schedulePatterns.startMinute,endMinute:schedulePatterns.endMinute,
    building:classrooms.building,room:classrooms.code,campus:campuses.name})
   .from(schedulePatterns).innerJoin(classrooms,eq(schedulePatterns.roomId,classrooms.id))
   .innerJoin(campuses,eq(classrooms.campusId,campuses.id))
   .where(and(eq(schedulePatterns.institutionId,institutionId),eq(schedulePatterns.sectionId,r.sectionId),eq(schedulePatterns.isActive,true)));
  for(const slot of slots)schedule.push({
   courseId:r.sectionId,groupName:r.groupName,weekdayName:dayName[slot.weekday],
   startTime:time(slot.startMinute),endTime:time(slot.endMinute),
   buildingCode:slot.building,classroomCode:slot.room,campusName:slot.campus,
  });
 }
 return {data:{student,enrollments,schedule},status:200} as const;
}

export async function externalTeachers(institutionId:string){
 const rows=await db.select().from(institutionalTeachers)
  .where(and(eq(institutionalTeachers.institutionId,institutionId),eq(institutionalTeachers.status,'active'))).limit(201);
 if(rows.length>200)return {error:'DIRECTORY_LIMIT_EXCEEDED',status:409} as const;
 return {data:rows.map(x=>({
  externalId:x.employeeNumber,fullName:[x.firstName,x.lastName].join(' '),
  institutionalEmail:x.institutionalEmail??null,departmentCode:null,
 })),status:200} as const;
}
export async function externalCourses(institutionId:string){
 const offered=await db.select({sectionId:academicSections.id,sectionCode:academicSections.code,
  courseCode:academicCourses.code,courseName:academicCourses.name,credits:academicCourses.credits,term:academicTerms.code})
 .from(academicSections)
 .innerJoin(academicCourses,eq(academicSections.courseId,academicCourses.id))
 .innerJoin(academicTerms,eq(academicSections.termId,academicTerms.id))
 .where(and(eq(academicSections.institutionId,institutionId),sql`${academicSections.status}<>'archived'`)).limit(201);
 if(offered.length>200)return {error:'CATALOG_LIMIT_EXCEEDED',status:409} as const;
 const data=[];
 for(const section of offered){
  const [teacher]=await db.select().from(sectionTeachers)
   .innerJoin(institutionalTeachers,eq(sectionTeachers.teacherId,institutionalTeachers.id))
   .where(and(eq(sectionTeachers.sectionId,section.sectionId),eq(sectionTeachers.institutionId,institutionId),
     isNull(sectionTeachers.revokedAt),eq(institutionalTeachers.status,'active'))).limit(1);
  if(!teacher)return {error:'MISSING_TEACHER_ASSIGNMENT',status:409} as const;
  const person=teacher.institutional_teachers;
  data.push({
   externalId:section.sectionId,
   subject:{externalCode:section.courseCode,name:section.courseName,credits:section.credits},
   teacher:{externalId:person.employeeNumber,fullName:[person.firstName,person.lastName].join(' '),
    institutionalEmail:person.institutionalEmail??null,departmentCode:null},
   term:section.term,groupName:section.sectionCode,
  });
 }
 return {data,status:200} as const;
}
