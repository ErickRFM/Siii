import 'server-only';
import {and,eq,isNull,or,exists,notExists,sql,desc,type SQL} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {db} from '@/infrastructure/database';
import {academicSections,academicCourses,academicTerms,academicPrograms,institutionalStudents,institutionalTeachers,studentAccountLinks,teacherAccountLinks,sectionEnrollments,sectionTeachers,classOccurrences,schedulePatterns,classrooms,campuses,finalGrades,gradePublications,assessmentComponents,assessmentScores,paymentOrders,paymentTransactions,financialFeeTypes,roleAssignments,institutionalAnnouncements,accountEmailVerifications,institutions} from '../../../db/schema';
import {institutionContext} from '@/shared/auth/session';
import {can} from '@/shared/auth/capabilities';
import {privilegedAssuranceAllows} from '@/shared/auth/privileged-policy';
import {readVisibility} from '@/shared/auth/read-access';
import {cursorPredicate,cursorTimestamp,pageEnvelope,type PageInput} from '@/shared/http/pagination';

export type PortalKind='student'|'teacher';
export async function personalContext(institutionId:string,kind:PortalKind){
 const context=await institutionContext(institutionId);if(!context)return null;
 const capability=kind==='student'?'student.self.read':'teacher.self.read';
 const eligible=context.access.grants.filter(grant=>(kind==='student'?grant.scopeType!=='campus':grant.scopeType==='institution')&&can({...context.subject,grants:[grant]},capability,{institutionId,status:'active',ownerUserId:context.identity.id,...(grant.scopeType==='program'?{programId:grant.scopeId!}:{})}));
 return eligible.length&&privilegedAssuranceAllows(context.access.grants,context.identity)?{...context,eligible,kind}:null;
}
type Context=NonNullable<Awaited<ReturnType<typeof personalContext>>>&{recordId?:string};

/** A relation is rechecked inside every data query, never accepted as a student/teacher ID from the client. */
function studentAccess(context:Context):SQL{
 const {access,identity,subject,eligible}=context;
 return exists(db.select({one:sql`1`}).from(studentAccountLinks)
  .innerJoin(institutionalStudents,and(eq(institutionalStudents.id,studentAccountLinks.studentId),eq(institutionalStudents.institutionId,studentAccountLinks.institutionId)))
  .where(and(eq(studentAccountLinks.institutionId,access.institutionId),eq(studentAccountLinks.membershipId,access.membershipId),isNull(studentAccountLinks.revokedAt),
   context.recordId?eq(studentAccountLinks.studentId,context.recordId):undefined,
   readVisibility(subject,access,identity.sessionId,eligible,or(eq(roleAssignments.scopeType,'institution'),and(eq(roleAssignments.scopeType,'program'),eq(roleAssignments.programId,institutionalStudents.programId)))))));
}
function ownStudent(context:Context,column:SQL):SQL{
 return exists(db.select({one:sql`1`}).from(studentAccountLinks).where(and(eq(studentAccountLinks.institutionId,context.access.institutionId),eq(studentAccountLinks.membershipId,context.access.membershipId),isNull(studentAccountLinks.revokedAt),context.recordId?eq(studentAccountLinks.studentId,context.recordId):undefined,sql`${studentAccountLinks.studentId}=${column}`)));
}
function ownEnrollment(context:Context,section:SQL):SQL{
 return exists(db.select({one:sql`1`}).from(sectionEnrollments).where(and(eq(sectionEnrollments.institutionId,context.access.institutionId),eq(sectionEnrollments.status,'enrolled'),sql`${sectionEnrollments.sectionId}=${section}`,ownStudent(context,sql`${sectionEnrollments.studentId}`))));
}
function ownTeaching(context:Context,section:SQL):SQL{
 return exists(db.select({one:sql`1`}).from(teacherAccountLinks)
  .innerJoin(institutionalTeachers,and(eq(institutionalTeachers.id,teacherAccountLinks.teacherId),eq(institutionalTeachers.institutionId,teacherAccountLinks.institutionId)))
  .innerJoin(sectionTeachers,and(eq(sectionTeachers.teacherId,teacherAccountLinks.teacherId),eq(sectionTeachers.institutionId,teacherAccountLinks.institutionId)))
  .where(and(eq(teacherAccountLinks.institutionId,context.access.institutionId),eq(teacherAccountLinks.membershipId,context.access.membershipId),isNull(teacherAccountLinks.revokedAt),context.recordId?eq(teacherAccountLinks.teacherId,context.recordId):undefined,eq(institutionalTeachers.status,'active'),isNull(sectionTeachers.revokedAt),sql`${sectionTeachers.sectionId}=${section}`)));
}
function teacherAccess(context:Context){return readVisibility(context.subject,context.access,context.identity.sessionId,context.eligible)}
function ownOrder(context:Context){return and(eq(paymentOrders.institutionId,context.access.institutionId),studentAccess(context),or(ownStudent(context,sql`${paymentOrders.payerStudentId}`),and(isNull(paymentOrders.payerStudentId),eq(paymentOrders.payerUserId,context.identity.id))))}
export const studentResources=['profile','courses','teachers','schedule','grades','orders','payments','announcements'] as const;
export const teacherResources=['profile','groups','schedule'] as const;

export async function personalProfile(context:Context){
 const metadata={verifiedEmail:sql<string|null>`(select ${accountEmailVerifications.verifiedEmail} from ${accountEmailVerifications} where ${accountEmailVerifications.userId}=${context.identity.id})`,timeZone:sql<string>`(select ${institutions.timezone} from ${institutions} where ${institutions.id}=${context.access.institutionId})`};
 if(context.kind==='student'){
  const [data]=await db.select({...metadata,id:institutionalStudents.id,enrollmentNumber:institutionalStudents.enrollmentNumber,firstName:institutionalStudents.firstName,lastName:institutionalStudents.lastName,institutionalEmail:institutionalStudents.institutionalEmail,status:institutionalStudents.status,programId:academicPrograms.id,programName:academicPrograms.name,programCode:academicPrograms.code}).from(institutionalStudents)
   .innerJoin(academicPrograms,and(eq(academicPrograms.id,institutionalStudents.programId),eq(academicPrograms.institutionId,institutionalStudents.institutionId)))
   .where(and(eq(institutionalStudents.institutionId,context.access.institutionId),studentAccess(context),ownStudent(context,sql`${institutionalStudents.id}`))).limit(1);
  return data??null;
 }
 const [data]=await db.select({...metadata,id:institutionalTeachers.id,employeeNumber:institutionalTeachers.employeeNumber,firstName:institutionalTeachers.firstName,lastName:institutionalTeachers.lastName,institutionalEmail:institutionalTeachers.institutionalEmail,status:institutionalTeachers.status}).from(institutionalTeachers)
  .innerJoin(teacherAccountLinks,and(eq(teacherAccountLinks.teacherId,institutionalTeachers.id),eq(teacherAccountLinks.institutionId,institutionalTeachers.institutionId)))
  .where(and(eq(institutionalTeachers.institutionId,context.access.institutionId),eq(teacherAccountLinks.membershipId,context.access.membershipId),isNull(teacherAccountLinks.revokedAt),teacherAccess(context))).limit(1);
 return data??null;
}
const sectionDetails={sectionId:academicSections.id,sectionCode:academicSections.code,sectionStatus:academicSections.status,courseCode:academicCourses.code,courseName:academicCourses.name,credits:academicCourses.credits,termId:academicTerms.id,termName:academicTerms.name,termStart:academicTerms.startDate,termEnd:academicTerms.endDate};
export async function personalCollection(context:Context,resource:string,page:PageInput,scope:string){
 const institutionId=context.access.institutionId;
 const rows=await (async()=>{
  if(resource==='announcements')return db.select({id:institutionalAnnouncements.id,cursorAt:cursorTimestamp(institutionalAnnouncements.createdAt),title:institutionalAnnouncements.title,body:institutionalAnnouncements.body,publishedAt:institutionalAnnouncements.publishedAt}).from(institutionalAnnouncements)
   .where(and(eq(institutionalAnnouncements.institutionId,institutionId),eq(institutionalAnnouncements.status,'PUBLISHED'),or(isNull(institutionalAnnouncements.expiresAt),sql`${institutionalAnnouncements.expiresAt}>clock_timestamp()`),studentAccess(context),cursorPredicate(page,institutionalAnnouncements.createdAt,institutionalAnnouncements.id)))
   .orderBy(desc(institutionalAnnouncements.createdAt),desc(institutionalAnnouncements.id)).limit(page.limit+1);
  if(resource==='courses')return db.select({id:sectionEnrollments.id,cursorAt:cursorTimestamp(sectionEnrollments.createdAt),...sectionDetails,enrollmentStatus:sectionEnrollments.status}).from(sectionEnrollments)
   .innerJoin(academicSections,and(eq(academicSections.id,sectionEnrollments.sectionId),eq(academicSections.institutionId,sectionEnrollments.institutionId)))
   .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId)))
   .innerJoin(academicTerms,and(eq(academicTerms.id,academicSections.termId),eq(academicTerms.institutionId,institutionId)))
   .where(and(eq(sectionEnrollments.institutionId,institutionId),studentAccess(context),ownStudent(context,sql`${sectionEnrollments.studentId}`),cursorPredicate(page,sectionEnrollments.createdAt,sectionEnrollments.id)))
   .orderBy(desc(sectionEnrollments.createdAt),desc(sectionEnrollments.id)).limit(page.limit+1);
  if(resource==='teachers')return db.select({id:sectionTeachers.id,cursorAt:cursorTimestamp(sectionTeachers.createdAt),sectionId:academicSections.id,sectionCode:academicSections.code,courseName:academicCourses.name,firstName:institutionalTeachers.firstName,lastName:institutionalTeachers.lastName,termName:academicTerms.name}).from(sectionTeachers)
   .innerJoin(institutionalTeachers,and(eq(institutionalTeachers.id,sectionTeachers.teacherId),eq(institutionalTeachers.institutionId,institutionId)))
   .innerJoin(academicSections,and(eq(academicSections.id,sectionTeachers.sectionId),eq(academicSections.institutionId,institutionId)))
   .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId)))
   .innerJoin(academicTerms,and(eq(academicTerms.id,academicSections.termId),eq(academicTerms.institutionId,institutionId)))
   .where(and(eq(sectionTeachers.institutionId,institutionId),isNull(sectionTeachers.revokedAt),eq(institutionalTeachers.status,'active'),studentAccess(context),ownEnrollment(context,sql`${sectionTeachers.sectionId}`),cursorPredicate(page,sectionTeachers.createdAt,sectionTeachers.id)))
   .orderBy(desc(sectionTeachers.createdAt),desc(sectionTeachers.id)).limit(page.limit+1);
  if(resource==='schedule')return db.select({id:classOccurrences.id,cursorAt:cursorTimestamp(classOccurrences.updatedAt),date:classOccurrences.onDate,state:classOccurrences.state,reason:classOccurrences.reason,...sectionDetails,startMinute:schedulePatterns.startMinute,endMinute:schedulePatterns.endMinute,roomCode:classrooms.code,roomBuilding:classrooms.building,campusName:campuses.name}).from(classOccurrences)
   .innerJoin(schedulePatterns,and(eq(schedulePatterns.id,classOccurrences.patternId),eq(schedulePatterns.sectionId,classOccurrences.sectionId),eq(schedulePatterns.institutionId,institutionId)))
   .innerJoin(academicSections,and(eq(academicSections.id,classOccurrences.sectionId),eq(academicSections.institutionId,institutionId)))
   .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId)))
   .innerJoin(academicTerms,and(eq(academicTerms.id,academicSections.termId),eq(academicTerms.institutionId,institutionId)))
   .innerJoin(classrooms,and(eq(classrooms.id,schedulePatterns.roomId),eq(classrooms.institutionId,institutionId)))
   .innerJoin(campuses,and(eq(campuses.id,classrooms.campusId),eq(campuses.institutionId,institutionId)))
   .where(and(eq(classOccurrences.institutionId,institutionId),context.kind==='student'?and(studentAccess(context),ownEnrollment(context,sql`${classOccurrences.sectionId}`)):and(teacherAccess(context),ownTeaching(context,sql`${classOccurrences.sectionId}`)),cursorPredicate(page,classOccurrences.updatedAt,classOccurrences.id)))
   .orderBy(desc(classOccurrences.updatedAt),desc(classOccurrences.id)).limit(page.limit+1);
  if(resource==='grades'){
   const newer=alias(gradePublications,'newer_publication'),newerGrade=alias(finalGrades,'newer_student_grade');
   return db.select({id:finalGrades.id,cursorAt:cursorTimestamp(gradePublications.publishedAt),...sectionDetails,scoreHundredths:finalGrades.scoreHundredths,version:gradePublications.version,publishedAt:gradePublications.publishedAt}).from(finalGrades)
    .innerJoin(gradePublications,and(eq(gradePublications.id,finalGrades.publicationId),eq(gradePublications.institutionId,institutionId)))
    .innerJoin(academicSections,and(eq(academicSections.id,gradePublications.sectionId),eq(academicSections.institutionId,institutionId)))
    .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId)))
    .innerJoin(academicTerms,and(eq(academicTerms.id,academicSections.termId),eq(academicTerms.institutionId,institutionId)))
    .where(and(eq(finalGrades.institutionId,institutionId),studentAccess(context),ownStudent(context,sql`${finalGrades.studentId}`),notExists(db.select({one:sql`1`}).from(newer).innerJoin(newerGrade,and(eq(newerGrade.publicationId,newer.id),eq(newerGrade.institutionId,institutionId),eq(newerGrade.studentId,finalGrades.studentId))).where(and(eq(newer.institutionId,institutionId),eq(newer.sectionId,gradePublications.sectionId),sql`${newer.version}>${gradePublications.version}`))),cursorPredicate(page,gradePublications.publishedAt,finalGrades.id)))
    .orderBy(desc(gradePublications.publishedAt),desc(finalGrades.id)).limit(page.limit+1);
  }
  if(resource==='orders')return db.select({id:paymentOrders.id,cursorAt:cursorTimestamp(paymentOrders.createdAt),orderNumber:paymentOrders.orderNumber,feeTypeName:financialFeeTypes.name,totalAmountCents:paymentOrders.totalAmountCents,paidAmountCents:paymentOrders.paidAmountCents,currency:paymentOrders.currency,status:paymentOrders.status,dueDate:paymentOrders.dueDate}).from(paymentOrders)
   .innerJoin(financialFeeTypes,and(eq(financialFeeTypes.id,paymentOrders.feeTypeId),eq(financialFeeTypes.institutionId,institutionId)))
   .where(and(ownOrder(context),cursorPredicate(page,paymentOrders.createdAt,paymentOrders.id))).orderBy(desc(paymentOrders.createdAt),desc(paymentOrders.id)).limit(page.limit+1);
  if(resource==='payments')return db.select({id:paymentTransactions.id,cursorAt:cursorTimestamp(paymentTransactions.createdAt),transactionNumber:paymentTransactions.transactionNumber,orderNumber:paymentOrders.orderNumber,amountCents:paymentTransactions.amountCents,paymentMethod:paymentTransactions.paymentMethod,reference:paymentTransactions.reference,currency:paymentOrders.currency,createdAt:paymentTransactions.createdAt}).from(paymentTransactions)
   .innerJoin(paymentOrders,and(eq(paymentOrders.id,paymentTransactions.orderId),eq(paymentOrders.institutionId,institutionId)))
   .where(and(eq(paymentTransactions.institutionId,institutionId),ownOrder(context),cursorPredicate(page,paymentTransactions.createdAt,paymentTransactions.id))).orderBy(desc(paymentTransactions.createdAt),desc(paymentTransactions.id)).limit(page.limit+1);
  if(resource==='groups')return db.select({id:academicSections.id,termStatus:academicTerms.status,
   componentCount:sql<number>`(select count(*)::int from ${assessmentComponents} where ${assessmentComponents.sectionId}=${academicSections.id} and ${assessmentComponents.institutionId}=${institutionId})`,
   weightTotal:sql<number>`(select coalesce(sum(${assessmentComponents.weight}),0)::int from ${assessmentComponents} where ${assessmentComponents.sectionId}=${academicSections.id} and ${assessmentComponents.institutionId}=${institutionId})`,
   savedScoreCount:sql<number>`(select count(*)::int from ${assessmentScores} inner join ${assessmentComponents} on ${assessmentComponents.id}=${assessmentScores.componentId} and ${assessmentComponents.institutionId}=${institutionId} where ${assessmentScores.institutionId}=${institutionId} and ${assessmentComponents.sectionId}=${academicSections.id} and exists(select 1 from ${sectionEnrollments} where ${sectionEnrollments.institutionId}=${institutionId} and ${sectionEnrollments.sectionId}=${academicSections.id} and ${sectionEnrollments.studentId}=${assessmentScores.studentId} and ${sectionEnrollments.status}='enrolled'))`,cursorAt:cursorTimestamp(academicSections.createdAt),...sectionDetails,enrolledCount:sql<number>`(select count(*)::int from section_enrollments portal_roster where portal_roster.section_id=${academicSections.id} and portal_roster.institution_id=${institutionId} and portal_roster.status='enrolled')`,published:exists(db.select({one:sql`1`}).from(gradePublications).where(and(eq(gradePublications.institutionId,institutionId),eq(gradePublications.sectionId,academicSections.id))))}).from(academicSections)
   .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId)))
   .innerJoin(academicTerms,and(eq(academicTerms.id,academicSections.termId),eq(academicTerms.institutionId,institutionId)))
   .where(and(eq(academicSections.institutionId,institutionId),teacherAccess(context),ownTeaching(context,sql`${academicSections.id}`),cursorPredicate(page,academicSections.createdAt,academicSections.id)))
   .orderBy(desc(academicSections.createdAt),desc(academicSections.id)).limit(page.limit+1);
  throw new Error('UNKNOWN_PORTAL_RESOURCE');
 })();
 const result=pageEnvelope<(typeof rows)[number]>(rows,page,scope);
 return {data:result.visible.map(({cursorAt,...row})=>{void cursorAt;return row}),page:result.page};
}
