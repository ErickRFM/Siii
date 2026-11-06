import {z} from 'zod';

/**
 * Compañero -> SIII grade proposal: validation ONLY.
 * An accepted payload never authorizes a grade mutation or publication.
 * A future server-to-server ingress must verify tenant-bound HMAC, timestamp,
 * nonce uniqueness, mapping, enrollment, teacher scope and period status.
 */
const nativeId=z.string().trim().min(6).max(96).regex(/^[A-Za-z0-9:_-]+$/);
const externalId=z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/);
const row=z.strictObject({
 nativeStudentId:nativeId,
 studentSourceId:z.uuid(),
 gradeHundredths:z.number().int().min(0).max(1000),
});
export const gradeProposalContract=z.strictObject({
 contract:z.literal('companero.grade_proposal.v1'),
 operationId:z.uuid(),
 sourceVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
 sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),
 institutionId:z.uuid(),
 nativeClassroomId:nativeId,
 sectionId:z.uuid(),
 academicPeriodId:z.uuid(),
 teacherExternalId:externalId,
 gradingPeriod:z.string().trim().min(1).max(48).regex(/^[A-Za-z0-9_-]+$/),
 gradeScale:z.literal('MX_0_TO_10_HUNDREDTHS'),
 rows:z.array(row).min(1).max(500),
}).superRefine((value,ctx)=>{
 for(const [field,key] of [['nativeStudentId','nativeStudentId'],['studentSourceId','studentSourceId']] as const){
  const seen=new Set<string>();
  for(const [index,item] of value.rows.entries()){
   if(seen.has(item[key]))ctx.addIssue({code:'custom',path:['rows',index,field],message:'DUPLICATE_STUDENT_ID'});
   seen.add(item[key]);
  }
 }
});
export type GradeProposalContract=z.infer<typeof gradeProposalContract>;
export const parseGradeProposalContract=(data:unknown)=>gradeProposalContract.safeParse(data);

/**
 * These are proposed workflow statuses, not implicit permissions.
 * Only an institutionally authorized reviewer can drive APPLY after official
 * classroom, student, term and teacher mappings have been revalidated.
 */
export const gradeProposalStates=['RECEIVED','VALIDATED','REQUIRES_REVIEW','REJECTED','APPLIED'] as const;
