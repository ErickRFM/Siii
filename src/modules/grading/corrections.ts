import 'server-only';
import {createHash} from 'node:crypto';
import {and,eq,sql,desc} from 'drizzle-orm';
import {gradeCorrectionRequests as requests,gradeCorrectionEvidence as evidence,gradeCorrectionEvents as events,academicSections,academicTerms,academicCourses,institutionalStudents,gradePublications,finalGrades,securityAuditLog} from '../../../db/schema';
import {domainTransaction} from '@/modules/consolidation/domain-boundary';
import {institutionContext} from '@/shared/auth/session';
import {can,type Subject} from '@/shared/auth/capabilities';
import {privilegedAssuranceAllows} from '@/shared/auth/privileged-policy';
import {lockInstitutionContext} from '@/shared/auth/write-access';
import {correctionPolicy,correctionStaff,hasCorrectionRole,type CorrectionPolicy} from './correction-policy';
import type {CorrectionCommand} from './correction-validation';
import type {Transaction} from '@/shared/http/request-context';
import {cursorPredicate,cursorTimestamp,pageEnvelope,type PageInput} from '@/shared/http/pagination';

type Context=NonNullable<Awaited<ReturnType<typeof institutionContext>>>;
type Row=typeof requests.$inferSelect;
export class CorrectionError extends Error{constructor(message:string,readonly status=409){super(message);}}
const reject=(message:string,status=409):never=>{throw new CorrectionError(message,status);};
export const correctionsEnabled=()=>process.env.SIII_GRADE_CORRECTIONS_ENABLED==='true';
const hashPolicy=(policy:CorrectionPolicy|null)=>createHash('sha256').update(JSON.stringify(policy)).digest('hex');
const policySummary=(policy:CorrectionPolicy|null)=>({configured:!!policy,approved:policy?.approved??false,requireEvidence:policy?.requireEvidence??true,executionEnabled:!!policy?.approved&&!!policy.allowExecution,closedRequestsEnabled:policy?.allowClosedRequests??false});

function teacherRelation(context:{subject:Subject;access:{membershipId:string;institutionId:string}},sectionId:unknown,publicationId:unknown){
 const tenant=context.access.institutionId;
 return sql<boolean>`exists(select 1 from teacher_account_links link inner join institutional_teachers teacher on teacher.id=link.teacher_id and teacher.institution_id=link.institution_id where link.institution_id=${tenant} and link.membership_id=${context.access.membershipId} and link.revoked_at is null and teacher.status='active' and (exists(select 1 from section_teachers assignment where assignment.institution_id=${tenant} and assignment.section_id=${sectionId} and assignment.teacher_id=teacher.id and assignment.revoked_at is null) or exists(select 1 from grade_publications publication where publication.id=${publicationId} and publication.institution_id=${tenant} and publication.section_id=${sectionId} and publication.published_by=${context.subject.id})))`;
}
async function owns(tx:Transaction,context:{subject:Subject;access:{membershipId:string;institutionId:string}},row:{sectionId:string;sourcePublicationId:string}){
 if(!can(context.subject,'grades.manage',{institutionId:context.access.institutionId,status:'active',assignedUserIds:[context.subject.id]}))return false;
 const value=await tx.execute(sql`select ${teacherRelation(context,row.sectionId,row.sourcePublicationId)} allowed`);return value.rows[0]?.allowed===true;
}
async function source(tx:Transaction,institutionId:string,sectionId:string,studentId:string){
 const [section]=await tx.select({id:academicSections.id,status:academicSections.status,termId:academicSections.termId}).from(academicSections).where(and(eq(academicSections.id,sectionId),eq(academicSections.institutionId,institutionId))).for('update');if(!section)return reject('CORRECTION_SOURCE_NOT_FOUND',404);
 const [term]=await tx.select({status:academicTerms.status}).from(academicTerms).where(and(eq(academicTerms.id,section.termId),eq(academicTerms.institutionId,institutionId))).for('share');
 const [latest]=await tx.select({version:gradePublications.version}).from(gradePublications).where(and(eq(gradePublications.institutionId,institutionId),eq(gradePublications.sectionId,sectionId))).orderBy(desc(gradePublications.version)).limit(1);
 const [original]=await tx.select({publicationId:gradePublications.id,scoreHundredths:finalGrades.scoreHundredths}).from(finalGrades).innerJoin(gradePublications,and(eq(gradePublications.id,finalGrades.publicationId),eq(gradePublications.institutionId,institutionId))).where(and(eq(finalGrades.institutionId,institutionId),eq(finalGrades.studentId,studentId),eq(gradePublications.sectionId,sectionId))).orderBy(desc(gradePublications.version)).limit(1);
 if(!original||!latest||!term)return reject('CORRECTION_SOURCE_NOT_FOUND',404);
 return {...original,baseVersion:latest.version,closed:section.status!=='open'||term.status!=='active'};
}
function matches(row:Row,current:Awaited<ReturnType<typeof source>>){return row.sourcePublicationId===current.publicationId&&row.baseVersion===current.baseVersion&&row.originalScoreHundredths===current.scoreHundredths;}
async function record(tx:Transaction,context:Context,row:Row,action:string,note:string|null,requestId:string,before?:Row){
 const details={before:before?{status:before.status,revision:before.revision,requestedScoreHundredths:before.requestedScoreHundredths}:null,after:{status:row.status,revision:row.revision,requestedScoreHundredths:row.requestedScoreHundredths,appliedPublicationId:row.appliedPublicationId}};
 await tx.insert(events).values({institutionId:row.institutionId,requestId:row.id,actorId:context.identity.id,action,status:row.status,note,details});
 await tx.insert(securityAuditLog).values({institutionId:row.institutionId,actorUserId:context.identity.id,action:'grade.correction.'+action,target:'correction:'+row.id,requestId,details});
}
async function currentContext(tx:Transaction,context:Context,critical=false){const current=await lockInstitutionContext(tx,context.identity,context.access);if(!current)return reject('FORBIDDEN',403);if(critical&&!privilegedAssuranceAllows(current.access.grants,current.assurance,current.now,true))return reject('STEP_UP_REQUIRED',403);return current;}
function requireRole(subject:Subject,institutionId:string,policy:CorrectionPolicy|null,key:'reviewerRoles'|'approverRoles'|'executorRoles'|'closedAuthorityRoles'){
 if(!policy||!hasCorrectionRole(subject,institutionId,policy[key]))reject('CORRECTION_AUTHORITY_NOT_CONFIGURED',403);
}
async function hasEvidence(tx:Transaction,row:Row){return (await tx.select({id:evidence.id}).from(evidence).where(and(eq(evidence.institutionId,row.institutionId),eq(evidence.requestId,row.id))).limit(1)).length>0;}

export async function correctionWrite(context:Context,command:CorrectionCommand,requestId:string){
 if(!correctionsEnabled())return reject('CORRECTIONS_DISABLED',409);
 const institutionId=context.access.institutionId,policy=correctionPolicy(institutionId);
 return domainTransaction(context,{capability:'institutions.read'},async tx=>{
  const current=await currentContext(tx,context,command.kind==='decide'||command.kind==='apply'||command.kind==='return');
  if(command.kind==='draft'){
   if(!await owns(tx,current,{sectionId:command.sectionId,sourcePublicationId:command.publicationId}))return reject('FORBIDDEN',403);
   const [replay]=await tx.select().from(requests).where(and(eq(requests.institutionId,institutionId),eq(requests.operationId,command.operationId)));
   if(replay){if(replay.requestedBy!==context.identity.id||replay.sectionId!==command.sectionId||replay.studentId!==command.studentId||replay.sourcePublicationId!==command.publicationId||replay.requestedScoreHundredths!==command.requestedScoreHundredths||replay.reason!==command.reason)return reject('CORRECTION_OPERATION_REUSED');return replay;}
   const original=await source(tx,institutionId,command.sectionId,command.studentId);
   if(original.publicationId!==command.publicationId)return reject('CORRECTION_SOURCE_CHANGED');
   if(original.closed&&!policy?.allowClosedRequests)return reject('CORRECTION_CLOSED_REQUEST_DISABLED');
   if(original.scoreHundredths===command.requestedScoreHundredths)return reject('CORRECTION_NO_CHANGE',422);
   const [row]=await tx.insert(requests).values({institutionId,sectionId:command.sectionId,studentId:command.studentId,sourcePublicationId:original.publicationId,baseVersion:original.baseVersion,originalScoreHundredths:original.scoreHundredths,requestedScoreHundredths:command.requestedScoreHundredths,reason:command.reason,operationId:command.operationId,requestedBy:context.identity.id}).returning();await record(tx,context,row,'draft',command.reason,requestId);return row;
  }
  const [before]=await tx.select().from(requests).where(and(eq(requests.id,command.id),eq(requests.institutionId,institutionId))).for('update');if(!before)return reject('NOT_FOUND',404);
  const mine=before.requestedBy===context.identity.id&&await owns(tx,current,before);
  const staff=correctionStaff(current.subject,institutionId,policy,current.now);
  if(!mine&&!staff)return reject('FORBIDDEN',403);
  if(command.kind==='apply'&&before.status==='APPLIED'){requireRole(current.subject,institutionId,policy,'executorRoles');return before;}
  if(before.revision!==command.expectedRevision)return reject('CORRECTION_REVISION_CONFLICT');
  let patch:Partial<typeof requests.$inferInsert>={},note:string|null=null;
  if(['edit','rebase','submit'].includes(command.kind)){
   if(!mine)return reject('FORBIDDEN',403);if(before.status!=='DRAFT')return reject('CORRECTION_INVALID_STATE');
   if(command.kind==='edit'){patch={requestedScoreHundredths:command.requestedScoreHundredths,reason:command.reason};note=command.reason;}
   else{
    const original=await source(tx,institutionId,before.sectionId,before.studentId);
    if(original.closed&&!policy?.allowClosedRequests)return reject('CORRECTION_CLOSED_REQUEST_DISABLED');
    if(command.kind==='rebase')patch={sourcePublicationId:original.publicationId,baseVersion:original.baseVersion,originalScoreHundredths:original.scoreHundredths};
    else{if(!matches(before,original))return reject('CORRECTION_SOURCE_CHANGED');if(before.requestedScoreHundredths===original.scoreHundredths)return reject('CORRECTION_NO_CHANGE',422);if((policy?.requireEvidence??true)&&!await hasEvidence(tx,before))return reject('CORRECTION_EVIDENCE_REQUIRED',422);patch={status:'SUBMITTED'};}
   }
  }else if(command.kind==='review'){
   requireRole(current.subject,institutionId,policy,'reviewerRoles');if(before.requestedBy===context.identity.id)return reject('CORRECTION_SELF_REVIEW',403);if(before.status!=='SUBMITTED')return reject('CORRECTION_INVALID_STATE');patch={status:'IN_REVIEW',reviewedBy:context.identity.id};note=command.note;
  }else if(command.kind==='return'){
   if(!policy||!hasCorrectionRole(current.subject,institutionId,[...policy.reviewerRoles,...policy.approverRoles]))return reject('CORRECTION_AUTHORITY_NOT_CONFIGURED',403);
   if(before.requestedBy===context.identity.id)return reject('CORRECTION_SELF_REVIEW',403);
   if(!['SUBMITTED','IN_REVIEW','APPROVED'].includes(before.status))return reject('CORRECTION_INVALID_STATE');
   // Invalidate all previous authority. Only a new submission, review and
   // approval may authorize execution after a source/policy/period change.
   patch={status:'DRAFT',reviewedBy:null,approvedBy:null,executedBy:null,resolutionReason:null,policyHash:null,closedAuthorized:false,appliedPublicationId:null};note=command.note;
  }else if(command.kind==='decide'){
   requireRole(current.subject,institutionId,policy,'approverRoles');if(!policy?.approved)return reject('CORRECTION_POLICY_NOT_APPROVED',403);if(before.requestedBy===context.identity.id)return reject('CORRECTION_SELF_APPROVAL',403);if(before.status!=='IN_REVIEW'||!before.reviewedBy)return reject('CORRECTION_INVALID_STATE');
   note=command.reason;
   if(command.decision==='reject')patch={status:'REJECTED',resolutionReason:command.reason,policyHash:hashPolicy(policy)};
   else{
    const original=await source(tx,institutionId,before.sectionId,before.studentId);if(!matches(before,original))return reject('CORRECTION_SOURCE_CHANGED');if(policy.requireEvidence&&!await hasEvidence(tx,before))return reject('CORRECTION_EVIDENCE_REQUIRED',422);
    if(original.closed){if(!policy.allowClosedExecution||!command.closedAuthorization)return reject('CORRECTION_CLOSED_AUTHORIZATION_REQUIRED',403);requireRole(current.subject,institutionId,policy,'closedAuthorityRoles');}
    patch={status:'APPROVED',approvedBy:context.identity.id,resolutionReason:command.reason,policyHash:hashPolicy(policy),closedAuthorized:original.closed&&command.closedAuthorization};
   }
  }else if(command.kind==='apply'){
   requireRole(current.subject,institutionId,policy,'executorRoles');if(!policy?.approved||!policy.allowExecution)return reject('CORRECTION_EXECUTION_DISABLED',403);if(before.requestedBy===context.identity.id)return reject('CORRECTION_SELF_EXECUTION',403);if(before.status!=='APPROVED'||!before.approvedBy)return reject('CORRECTION_INVALID_STATE');if(before.policyHash!==hashPolicy(policy))return reject('CORRECTION_POLICY_CHANGED');
   const original=await source(tx,institutionId,before.sectionId,before.studentId);if(!matches(before,original))return reject('CORRECTION_SOURCE_CHANGED');if(policy.requireEvidence&&!await hasEvidence(tx,before))return reject('CORRECTION_EVIDENCE_REQUIRED',422);
   if(original.closed){if(!policy.allowClosedExecution||!before.closedAuthorized)return reject('CORRECTION_CLOSED_AUTHORIZATION_REQUIRED',403);requireRole(current.subject,institutionId,policy,'closedAuthorityRoles');}
   const [publication]=await tx.insert(gradePublications).values({institutionId,sectionId:before.sectionId,operationId:before.id,publishedBy:context.identity.id,version:original.baseVersion+1}).returning();
   // Copy the effective historical result for every student; never mutate a prior publication.
   const effective=await tx.execute(sql`select distinct on (grade.student_id) grade.student_id,grade.score_hundredths from final_grades grade inner join grade_publications publication on publication.id=grade.publication_id and publication.institution_id=${institutionId} where grade.institution_id=${institutionId} and publication.section_id=${before.sectionId} order by grade.student_id,publication.version desc`);
   await tx.insert(finalGrades).values(effective.rows.map(row=>({institutionId,publicationId:publication.id,studentId:String(row.student_id),scoreHundredths:row.student_id===before.studentId?before.requestedScoreHundredths:Number(row.score_hundredths)})));
   patch={status:'APPLIED',executedBy:context.identity.id,appliedPublicationId:publication.id};
  }
  const [row]=await tx.update(requests).set({...patch,revision:sql`${requests.revision}+1`,updatedAt:sql`clock_timestamp()`}).where(and(eq(requests.id,before.id),eq(requests.institutionId,institutionId),eq(requests.revision,command.expectedRevision))).returning();if(!row)return reject('CORRECTION_REVISION_CONFLICT');await record(tx,context,row,command.kind,note,requestId,before);return row;
 });
}

export async function correctionList(context:Context,page:PageInput,scope:string,id?:string,candidate?:{sectionId:string;studentId:string;publicationId:string}){
 const institutionId=context.access.institutionId,policy=correctionPolicy(institutionId);
 if(!correctionsEnabled())return {available:false,data:[],page:{nextCursor:null},policy:policySummary(null)};
 return domainTransaction(context,{capability:'institutions.read'},async tx=>{
  const current=await currentContext(tx,context),staff=correctionStaff(current.subject,institutionId,policy,current.now);
  const canOwn=can(current.subject,'grades.manage',{institutionId,status:'active',assignedUserIds:[current.subject.id]},current.now);
  if(!staff&&!canOwn)return reject('FORBIDDEN',403);
  const rows=await tx.select({request:requests,sectionCode:academicSections.code,sectionStatus:academicSections.status,termStatus:academicTerms.status,courseName:academicCourses.name,termName:academicTerms.name,enrollmentNumber:institutionalStudents.enrollmentNumber,firstName:institutionalStudents.firstName,lastName:institutionalStudents.lastName,cursorAt:cursorTimestamp(requests.createdAt)}).from(requests)
   .innerJoin(academicSections,and(eq(academicSections.id,requests.sectionId),eq(academicSections.institutionId,institutionId)))
   .innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId)))
   .innerJoin(academicTerms,and(eq(academicTerms.id,academicSections.termId),eq(academicTerms.institutionId,institutionId)))
   .innerJoin(institutionalStudents,and(eq(institutionalStudents.id,requests.studentId),eq(institutionalStudents.institutionId,institutionId)))
   .where(and(eq(requests.institutionId,institutionId),id?eq(requests.id,id):undefined,staff?undefined:and(eq(requests.requestedBy,context.identity.id),teacherRelation(current,requests.sectionId,requests.sourcePublicationId)),id?undefined:cursorPredicate(page,requests.createdAt,requests.id))).orderBy(desc(requests.createdAt),desc(requests.id)).limit(id?1:page.limit+1);
  if(id&&!rows.length)return reject('NOT_FOUND',404);
  let candidateSource=null;
  if(candidate){
   if(!await owns(tx,current,{sectionId:candidate.sectionId,sourcePublicationId:candidate.publicationId}))return reject('FORBIDDEN',403);
   const original=await source(tx,institutionId,candidate.sectionId,candidate.studentId);if(original.publicationId!==candidate.publicationId)return reject('CORRECTION_SOURCE_CHANGED');
   const [info]=await tx.select({firstName:institutionalStudents.firstName,lastName:institutionalStudents.lastName,enrollmentNumber:institutionalStudents.enrollmentNumber}).from(institutionalStudents).where(and(eq(institutionalStudents.id,candidate.studentId),eq(institutionalStudents.institutionId,institutionId)));
   const [academic]=await tx.select({sectionCode:academicSections.code,courseName:academicCourses.name,termName:academicTerms.name}).from(academicSections).innerJoin(academicCourses,and(eq(academicCourses.id,academicSections.courseId),eq(academicCourses.institutionId,institutionId))).innerJoin(academicTerms,and(eq(academicTerms.id,academicSections.termId),eq(academicTerms.institutionId,institutionId))).where(and(eq(academicSections.id,candidate.sectionId),eq(academicSections.institutionId,institutionId)));
   candidateSource={...candidate,...info,...academic,originalScoreHundredths:original.scoreHundredths,closed:original.closed};
  }
  const packed=pageEnvelope(rows.map(row=>({...row,id:row.request.id})),page,scope),data=[];
  for(const row of packed.visible){
   const {policyHash,...record}=row.request;void policyHash;const mine=record.requestedBy===context.identity.id&&await owns(tx,current,row.request),other=record.requestedBy!==context.identity.id;
   const attachments=id?await tx.select({id:evidence.id,fileName:evidence.fileName,mediaType:evidence.mediaType,size:evidence.size,createdAt:evidence.createdAt}).from(evidence).where(and(eq(evidence.institutionId,institutionId),eq(evidence.requestId,record.id))):[];
   const history=id?await tx.select({id:events.id,actorId:events.actorId,action:events.action,status:events.status,note:events.note,createdAt:events.createdAt}).from(events).where(and(eq(events.institutionId,institutionId),eq(events.requestId,record.id))).orderBy(events.createdAt,events.id):[];
   data.push({...record,sectionCode:row.sectionCode,courseName:row.courseName,termName:row.termName,periodClosed:row.sectionStatus!=='open'||row.termStatus!=='active',enrollmentNumber:row.enrollmentNumber,firstName:row.firstName,lastName:row.lastName,evidence:attachments,history,actions:{return:other&&['SUBMITTED','IN_REVIEW','APPROVED'].includes(record.status)&&!!policy&&hasCorrectionRole(current.subject,institutionId,[...policy.reviewerRoles,...policy.approverRoles]),edit:mine&&record.status==='DRAFT',review:other&&record.status==='SUBMITTED'&&!!policy&&hasCorrectionRole(current.subject,institutionId,policy.reviewerRoles),decide:other&&record.status==='IN_REVIEW'&&!!policy?.approved&&hasCorrectionRole(current.subject,institutionId,policy.approverRoles),apply:other&&record.status==='APPROVED'&&!!policy?.approved&&policy.allowExecution&&hasCorrectionRole(current.subject,institutionId,policy.executorRoles)}});
  }
  return {available:true,data,page:packed.page,policy:policySummary(policy),source:candidateSource};
 });
}

export async function correctionAttachment(context:Context,id:string,upload:{bytes:Buffer;mediaType:string;fileName:string;expectedRevision:number}|null,requestId:string){
 if(!correctionsEnabled())return reject('CORRECTIONS_DISABLED');
 const institutionId=context.access.institutionId,policy=correctionPolicy(institutionId);
 return domainTransaction(context,{capability:'institutions.read'},async tx=>{
  const current=await currentContext(tx,context),[row]=await tx.select().from(requests).where(and(eq(requests.id,id),eq(requests.institutionId,institutionId))).for('update');if(!row)return reject('NOT_FOUND',404);
  const mine=row.requestedBy===context.identity.id&&await owns(tx,current,row);if(!mine&&!correctionStaff(current.subject,institutionId,policy,current.now))return reject('FORBIDDEN',403);
  if(!upload){const [file]=await tx.select().from(evidence).where(and(eq(evidence.institutionId,institutionId),eq(evidence.requestId,id)));if(!file)return reject('NOT_FOUND',404);await tx.insert(securityAuditLog).values({institutionId,actorUserId:context.identity.id,action:'grade.correction.evidence.read',target:'correction:'+id,requestId});return file;}
  if(!mine)return reject('FORBIDDEN',403);if(row.status!=='DRAFT')return reject('CORRECTION_INVALID_STATE');if(row.revision!==upload.expectedRevision)return reject('CORRECTION_REVISION_CONFLICT');
  const [file]=await tx.insert(evidence).values({institutionId,requestId:id,content:upload.bytes,mediaType:upload.mediaType,fileName:upload.fileName,size:upload.bytes.length,sha256:createHash('sha256').update(upload.bytes).digest('hex'),uploadedBy:context.identity.id}).returning();
  const [changed]=await tx.update(requests).set({revision:sql`${requests.revision}+1`,updatedAt:sql`clock_timestamp()`}).where(eq(requests.id,row.id)).returning();await record(tx,context,changed,'evidence','Evidencia justificativa adjunta',requestId,row);return file;
 });
}
