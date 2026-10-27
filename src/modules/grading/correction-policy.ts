import {z} from 'zod';
import {can,type P1Role,type Subject} from '@/shared/auth/capabilities';
const roles=z.array(z.enum(['control_escolar','coordinator','admin','super_admin'])).max(10).default([]);
const schema=z.object({reference:z.string().trim().min(6).max(300),approved:z.boolean().default(false),reviewerRoles:roles,approverRoles:roles,executorRoles:roles,closedAuthorityRoles:roles,requireEvidence:z.boolean().default(true),allowExecution:z.boolean().default(false),allowClosedRequests:z.boolean().default(false),allowClosedExecution:z.boolean().default(false)}).strict();
export type CorrectionPolicy=z.infer<typeof schema>;
export function correctionPolicy(institutionId:string,raw=process.env.SIII_GRADE_CORRECTION_POLICIES):CorrectionPolicy|null{try{const parsed=schema.safeParse((JSON.parse(raw??'{}') as Record<string,unknown>)[institutionId]);return parsed.success?parsed.data:null;}catch{return null;}}
export function hasCorrectionRole(subject:Subject,institutionId:string,allowed:readonly P1Role[],now=new Date()){
 return subject.grants.some(grant=>grant.scopeType==='institution'&&allowed.includes(grant.role)&&can({...subject,grants:[grant]},'institutions.read',{institutionId,status:'active'},now));
}
export function correctionStaff(subject:Subject,institutionId:string,policy:CorrectionPolicy|null,now=new Date()){
 return !!policy&&hasCorrectionRole(subject,institutionId,[...policy.reviewerRoles,...policy.approverRoles,...policy.executorRoles],now);
}
