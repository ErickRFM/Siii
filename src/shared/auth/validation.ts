import {z} from 'zod';
export const loginBody=z.object({username:z.string().trim().min(3).max(120),password:z.string().min(1).max(512)}).strict();
export const passwordBody=z.object({currentPassword:z.string().min(1).max(512),newPassword:z.string().min(12).max(128)}).strict()
 .refine(x=>x.currentPassword!==x.newPassword,{path:['newPassword'],message:'La nueva contraseña debe ser diferente'});
export const uuid=z.uuid();
export const membershipCreateBody=z.object({userId:uuid}).strict();
export const membershipChangeBody=z.object({status:z.enum(['active','suspended']),reason:z.enum(['institutional_change','policy_enforcement','security_review','record_correction','access_restored'])}).strict();
export const roleBody=z.object({membershipId:uuid,role:z.enum(['student','workshop_participant','teacher_pending','teacher','tutor','coordinator','admin','super_admin'])}).strict();
