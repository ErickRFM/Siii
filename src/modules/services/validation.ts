import { z } from 'zod';
const uuid=z.uuid(), text=z.string().trim().min(3).max(160);
export const noticeCreate=z.strictObject({title:text,body:z.string().trim().min(10).max(8000),expiresAt:z.iso.datetime({offset:true}).optional()});
export const noticeStatus=z.strictObject({id:uuid,status:z.enum(['PUBLISHED','ARCHIVED'])});
export const requestCreate=z.strictObject({studentId:uuid,requestType:z.enum(['CERTIFICATE','ENROLLMENT_CHANGE','JUSTIFICATION','OTHER']),summary:z.string().trim().min(10).max(1200)});
export const personalRequestCreate=requestCreate.omit({studentId:true}).extend({operationId:uuid.transform(value=>value.toLowerCase())});
export const requestDecision=z.strictObject({id:uuid,status:z.enum(['IN_REVIEW','APPROVED','REJECTED','CLOSED']),decisionReason:z.string().trim().min(6).max(1000)});
export const tutorCreate=z.strictObject({studentId:uuid,teacherId:uuid,subject:text,privateNotes:z.string().trim().max(3000).optional()});
export const tutorDecision=z.strictObject({id:uuid,status:z.enum(['RESOLVED','CLOSED'])});
export const workshopCreate=z.strictObject({
 title:text,description:z.string().trim().min(10).max(4000),
 teacherId:uuid,startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),
 capacity:z.number().int().min(1).max(1000),
}).refine(x=>Date.parse(x.endsAt)>Date.parse(x.startsAt),{path:['endsAt'],message:'INVALID_TIME_RANGE'});
export const workshopStatus=z.strictObject({id:uuid,status:z.enum(['PUBLISHED','CANCELLED'])});
export const workshopEnroll=z.strictObject({workshopId:uuid,studentId:uuid});
export const workshopWithdraw=z.strictObject({id:uuid,status:z.literal('WITHDRAWN')});
export function nextRequestStatus(current:string,next:string):boolean{
 const transitions:Record<string,readonly string[]>={
  SUBMITTED:['IN_REVIEW','REJECTED'],
  IN_REVIEW:['APPROVED','REJECTED'],
  APPROVED:['CLOSED'],
  REJECTED:['CLOSED'],
  CLOSED:[],
 };
 return transitions[current]?.includes(next)??false;
}
