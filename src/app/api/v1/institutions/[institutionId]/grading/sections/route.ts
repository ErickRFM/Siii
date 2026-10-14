import { NextResponse } from 'next/server';
import { and,eq,isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/infrastructure/database';
import { academicSections,academicCourses,teacherAccountLinks,sectionTeachers,institutionalTeachers } from '../../../../../../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';
import { jsonError } from '@/shared/auth/guards';
export const runtime='nodejs';
type Ctx={params:Promise<{institutionId:string}>};
export async function GET(_req:Request,ctx:Ctx){
 const {institutionId}=await ctx.params;
 if(!z.uuid().safeParse(institutionId).success)return jsonError('NOT_FOUND',404);
 const access=await authorizeInstitution(institutionId,'grades.publish');
 if(!access)return jsonError('FORBIDDEN',403);
 const data=await db.select({id:academicSections.id,code:academicSections.code,status:academicSections.status,
   termId:academicSections.termId,courseName:academicCourses.name})
  .from(teacherAccountLinks)
  .innerJoin(institutionalTeachers,eq(institutionalTeachers.id,teacherAccountLinks.teacherId))
  .innerJoin(sectionTeachers,eq(sectionTeachers.teacherId,teacherAccountLinks.teacherId))
  .innerJoin(academicSections,eq(academicSections.id,sectionTeachers.sectionId))
  .innerJoin(academicCourses,eq(academicCourses.id,academicSections.courseId))
  .where(and(eq(teacherAccountLinks.institutionId,institutionId),eq(teacherAccountLinks.membershipId,access.access.membershipId),
   eq(institutionalTeachers.status,'active'),isNull(teacherAccountLinks.revokedAt),
   eq(sectionTeachers.institutionId,institutionId),isNull(sectionTeachers.revokedAt),
   eq(academicSections.institutionId,institutionId))).limit(200);
 return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
}
