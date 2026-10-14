import { z } from 'zod';
const uuid = z.uuid();
const name = z.string().trim().min(2).max(120);
const code = z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).transform(s => s.toUpperCase());
const email = z.union([z.email(),z.literal('')]).optional().transform(value => value || null);
export const registryResource = z.enum(['students','teachers','sections','enrollments','assignments']);
export const registryCreate = {
  students:z.strictObject({enrollmentNumber:code,programId:uuid,firstName:name,lastName:name,institutionalEmail:email}),
  teachers:z.strictObject({employeeNumber:code,firstName:name,lastName:name,institutionalEmail:email}),
  sections:z.strictObject({termId:uuid,courseId:uuid,code,capacity:z.number().int().min(1).max(500)}),
  enrollments:z.strictObject({sectionId:uuid,studentId:uuid}),
  assignments:z.strictObject({sectionId:uuid,teacherId:uuid}),
} as const;
export const registryUpdate = {
  students:z.strictObject({id:uuid,status:z.enum(['active','inactive','withdrawn','graduated'])}),
  teachers:z.strictObject({id:uuid,status:z.enum(['active','inactive'])}),
  sections:z.strictObject({id:uuid,status:z.enum(['open','closed','archived'])}),
  enrollments:z.strictObject({id:uuid,status:z.literal('withdrawn')}),
  assignments:z.strictObject({id:uuid,status:z.literal('withdrawn')}),
} as const;
export function canEnroll(studentStatus:string,sectionStatus:string,count:number,capacity:number) {
  return studentStatus==='active' && sectionStatus==='open' && count<capacity;
}
