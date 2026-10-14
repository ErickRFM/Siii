import 'server-only';
import { and,eq,isNull } from 'drizzle-orm';
import { db } from '@/infrastructure/database';
import { teacherAccountLinks,sectionTeachers,institutionalTeachers,academicSections } from '../../../db/schema';
import { authorizeInstitution } from '@/shared/auth/session';

/** No generic teacher role is sufficient for grading: actor must be linked and assigned. */
export async function teachingScope(institutionId:string,sectionId:string){
 const auth=await authorizeInstitution(institutionId,'grades.publish');
 if(!auth)return null;
 const [section]=await db.select({id:academicSections.id,status:academicSections.status})
  .from(academicSections).where(and(eq(academicSections.id,sectionId),eq(academicSections.institutionId,institutionId))).limit(1);
 if(!section||section.status==='archived')return null;
 const links=await db.select({teacherId:teacherAccountLinks.teacherId})
  .from(teacherAccountLinks)
  .innerJoin(institutionalTeachers,eq(teacherAccountLinks.teacherId,institutionalTeachers.id))
  .innerJoin(sectionTeachers,eq(sectionTeachers.teacherId,teacherAccountLinks.teacherId))
  .where(and(eq(teacherAccountLinks.institutionId,institutionId),
   eq(teacherAccountLinks.membershipId,auth.access.membershipId),
   isNull(teacherAccountLinks.revokedAt),
   eq(institutionalTeachers.status,'active'),
   eq(sectionTeachers.sectionId,sectionId),
   eq(sectionTeachers.institutionId,institutionId),
   isNull(sectionTeachers.revokedAt))).limit(1);
 return links.length?auth:null;
}
