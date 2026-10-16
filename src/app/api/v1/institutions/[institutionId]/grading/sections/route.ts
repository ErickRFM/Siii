import {NextRequest,NextResponse} from 'next/server';
import {and,eq,isNull,or,exists,sql} from 'drizzle-orm';import {z} from 'zod';import {db} from '@/infrastructure/database';
import {academicSections,academicCourses,teacherAccountLinks,sectionTeachers,institutionalTeachers} from '../../../../../../../../db/schema';
import {teachingContext} from '@/modules/grading/teaching-scope';import {can} from '@/shared/auth/capabilities';import {jsonError} from '@/shared/auth/guards';import {withDomainErrors} from '@/modules/consolidation/domain-boundary';
export const runtime='nodejs';type Ctx={params:Promise<{institutionId:string}>};
export const GET=withDomainErrors(async(_req:NextRequest,ctx:Ctx)=>{
 const {institutionId}=await ctx.params;if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);
 const access=await teachingContext(institutionId);if(!access)return jsonError('FORBIDDEN',403);
 const wide=can(access.subject,'grades.manage',{institutionId,status:'active',assignedUserIds:[]});
 const assigned=exists(db.select({one:sql`1`}).from(teacherAccountLinks)
  .innerJoin(institutionalTeachers,and(eq(institutionalTeachers.id,teacherAccountLinks.teacherId),eq(institutionalTeachers.institutionId,institutionId)))
  .innerJoin(sectionTeachers,and(eq(sectionTeachers.teacherId,teacherAccountLinks.teacherId),eq(sectionTeachers.institutionId,institutionId)))
  .where(and(eq(teacherAccountLinks.institutionId,institutionId),eq(teacherAccountLinks.membershipId,access.access.membershipId),eq(institutionalTeachers.status,'active'),isNull(teacherAccountLinks.revokedAt),isNull(sectionTeachers.revokedAt),eq(sectionTeachers.sectionId,academicSections.id))));
 const data=await db.select({id:academicSections.id,code:academicSections.code,status:academicSections.status,termId:academicSections.termId,courseName:academicCourses.name}).from(academicSections)
 .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId)))
 .where(and(eq(academicSections.institutionId,institutionId),or(wide?sql`true`:sql`false`,assigned))).orderBy(academicSections.id).limit(200);
 return NextResponse.json({data,truncated:data.length===200},{headers:{'Cache-Control':'no-store'}});
});
