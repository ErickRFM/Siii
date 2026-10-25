import {and,asc,eq,isNull} from 'drizzle-orm';
import {sectionEnrollments,sectionTeachers} from '../../../../db/schema';
import type {Transaction} from '@/shared/http/request-context';
import {enqueueAcademicSection} from './enqueue';
import {academicOutboxEnabled} from './policy';

/** The caller owns registry authorization, source-row lock, mutation and audit.
 * Historical student enrollments carry profile/status too; revoked teacher
 * assignments do not appear in snapshots. Stable section order avoids taking
 * overlapping version locks in opposite orders. All enqueues share the write TX.
 */
export async function queueRegistrySectionSnapshots(
 tx:Transaction,
 scope:{institutionId:string;resource:'students'|'teachers';sourceId:string;actorUserId:string;requestId:string},
):Promise<void>{
 if(!academicOutboxEnabled())return;
 const sections=scope.resource==='students'
  ?await tx.selectDistinct({id:sectionEnrollments.sectionId}).from(sectionEnrollments)
   .where(and(eq(sectionEnrollments.institutionId,scope.institutionId),eq(sectionEnrollments.studentId,scope.sourceId))).orderBy(asc(sectionEnrollments.sectionId))
  :await tx.selectDistinct({id:sectionTeachers.sectionId}).from(sectionTeachers)
   .where(and(eq(sectionTeachers.institutionId,scope.institutionId),eq(sectionTeachers.teacherId,scope.sourceId),isNull(sectionTeachers.revokedAt))).orderBy(asc(sectionTeachers.sectionId));
 for(const section of sections)await enqueueAcademicSection(tx,{institutionId:scope.institutionId,sectionId:section.id,actorUserId:scope.actorUserId,requestId:scope.requestId});
}
