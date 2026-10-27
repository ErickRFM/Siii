import 'server-only';
import {and,eq,isNull,or,exists,inArray,ne,sql,type SQL} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {db} from '@/infrastructure/database';
import {teacherAccountLinks,sectionTeachers,institutionalTeachers,academicSections,roleAssignments} from '../../../db/schema';
import {institutionContext} from '@/shared/auth/session';
import {can,type Capability,type Subject} from '@/shared/auth/capabilities';
import {privilegedAssuranceAllows,type Assurance} from '@/shared/auth/privileged-policy';
import type {InstitutionAccess} from '@/shared/auth/institution-policy';
import type {Transaction} from '@/shared/http/request-context';
import {readVisibility} from '@/shared/auth/read-access';
type Context={subject:Subject;access:InstitutionAccess;assurance:Assurance};
export function mayListGradebooks(context:Context){return privilegedAssuranceAllows(context.access.grants,context.assurance)&&can(context.subject,'grades.manage',{institutionId:context.access.institutionId,status:'active',assignedUserIds:[context.subject.id]})}
export async function gradeScopeAllows(executor:typeof db|Transaction,context:Context,sectionId:string,capability:Capability){
 const institutionId=context.access.institutionId;
 const [section]=await executor.select({id:academicSections.id,status:academicSections.status}).from(academicSections).where(and(eq(academicSections.id,sectionId),eq(academicSections.institutionId,institutionId))).limit(1);
 if(!section||section.status==='archived')return false;
 const links=await executor.select({teacherId:teacherAccountLinks.teacherId}).from(teacherAccountLinks)
  .innerJoin(institutionalTeachers,and(eq(teacherAccountLinks.teacherId,institutionalTeachers.id),eq(institutionalTeachers.institutionId,institutionId)))
  .innerJoin(sectionTeachers,and(eq(sectionTeachers.teacherId,teacherAccountLinks.teacherId),eq(sectionTeachers.institutionId,institutionId)))
  .where(and(eq(teacherAccountLinks.institutionId,institutionId),eq(teacherAccountLinks.membershipId,context.access.membershipId),isNull(teacherAccountLinks.revokedAt),eq(institutionalTeachers.status,'active'),eq(sectionTeachers.sectionId,sectionId),isNull(sectionTeachers.revokedAt))).limit(1);
 const now=new Date();return privilegedAssuranceAllows(context.access.grants,context.assurance,now,capability==='grades.publish')&&can(context.subject,capability,{institutionId,status:'active',assignedUserIds:links.length?[context.subject.id]:[]},now);
}
export async function teachingContext(institutionId:string){const auth=await institutionContext(institutionId);if(!auth)return null;return mayListGradebooks({...auth,assurance:auth.identity})?auth:null}
export async function teachingScope(institutionId:string,sectionId:string,capability:Capability='grades.manage'){
 const auth=await institutionContext(institutionId);if(!auth)return null;
 return await gradeScopeAllows(db,{...auth,assurance:auth.identity},sectionId,capability)?auth:null;
}

/** Recheck live authority and the teaching relation in the same statement as private gradebook rows. */
export function teachingReadVisibility(context:{subject:Subject;access:InstitutionAccess;identity:{sessionId:string}},sectionId:SQL){
 const {subject,access,identity}=context,institutionId=access.institutionId;
 const eligible=access.grants.filter(grant=>can({...subject,grants:[grant]},'grades.manage',{institutionId,status:'active',assignedUserIds:[subject.id]}));
 const wide=eligible.filter(grant=>can({...subject,grants:[grant]},'grades.manage',{institutionId,status:'active',assignedUserIds:[]})).map(grant=>grant.id);
 const assigned=exists(db.select({one:sql`1`}).from(teacherAccountLinks)
  .innerJoin(institutionalTeachers,and(eq(institutionalTeachers.id,teacherAccountLinks.teacherId),eq(institutionalTeachers.institutionId,institutionId)))
  .innerJoin(sectionTeachers,and(eq(sectionTeachers.teacherId,teacherAccountLinks.teacherId),eq(sectionTeachers.institutionId,institutionId)))
  .where(and(eq(teacherAccountLinks.institutionId,institutionId),eq(teacherAccountLinks.membershipId,access.membershipId),isNull(teacherAccountLinks.revokedAt),eq(institutionalTeachers.status,'active'),isNull(sectionTeachers.revokedAt),sql`${sectionTeachers.sectionId}=${sectionId}`)));
 const current=alias(academicSections,'read_teaching_section');
 return and(exists(db.select({one:sql`1`}).from(current).where(and(sql`${current.id}=${sectionId}`,eq(current.institutionId,institutionId),ne(current.status,'archived')))),
  readVisibility(subject,access,identity.sessionId,eligible,or(wide.length?inArray(roleAssignments.id,wide):undefined,assigned)))!;
}
