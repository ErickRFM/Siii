import {z} from 'zod';
export const loginBody=z.object({username:z.string().trim().min(3).max(120),password:z.string().min(1).max(512)}).strict();
export const passwordBody=z.object({currentPassword:z.string().min(1).max(512),newPassword:z.string().min(12).max(128)}).strict()
 .refine(x=>x.currentPassword!==x.newPassword,{path:['newPassword'],message:'La nueva contraseña debe ser diferente'});
export const uuid=z.uuid();
export const membershipCreateBody=z.object({userId:uuid}).strict();
export const membershipChangeBody=z.object({status:z.enum(['active','suspended']),reason:z.enum(['institutional_change','policy_enforcement','security_review','record_correction','access_restored'])}).strict();
const role=z.enum(['student','workshop_participant','teacher_pending','teacher','tutor','coordinator','admin','super_admin','guest','control_escolar','workshop_facilitator']);
const scopedRole={membershipId:uuid,role,scopeType:z.enum(['institution','program','campus']).default('institution'),scopeId:uuid.nullable().default(null)};
const scopeValid=(body:{scopeType:string;scopeId:string|null})=>(body.scopeType==='institution')===(body.scopeId===null);
export const roleBody=z.object({...scopedRole,expiresAt:z.iso.datetime({offset:true}).nullable().default(null)}).strict().refine(scopeValid,{message:'Invalid scope'});
export const revokeRoleBody=z.union([z.object({grantId:uuid}).strict(),z.object(scopedRole).strict().refine(scopeValid,{message:'Invalid scope'})]);
