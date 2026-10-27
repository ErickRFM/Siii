import { z } from 'zod';

export const applicantRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo electrónico no válido').max(254),
  firstName: z.string().trim().min(2, 'Nombre requerido').max(100),
  lastName: z.string().trim().min(2, 'Apellido requerido').max(100),
  // Accepted for older clients, but never establishes an applicant credential.
  password: z.string().min(12).max(128).optional(),
  phone: z.string().trim().max(40).optional(),
  curp: z.string().trim().toUpperCase().max(40).optional(),
}).strict();

export const applicantLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo electrónico no válido').max(254),
  password: z.string().min(1, 'Contraseña requerida').max(128),
}).strict();

export const applicantResendSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo electrónico no válido').max(254),
  password: z.string().max(128).optional(), // Old clients may send it; mailbox proof is the authority.
}).strict();

export const admissionCycleSchema = z.object({
  code: z.string().trim().min(2, 'Código de convocatoria requerido').max(20),
  name: z.string().trim().min(3, 'Nombre de convocatoria requerido'),
  startDate: z.string().datetime({ message: 'Fecha de inicio no válida' }),
  endDate: z.string().datetime({ message: 'Fecha de fin no válida' }),
  status: z.enum(['draft', 'open', 'closed', 'archived']).default('draft'),
}).strict();

export const admissionApplicationSchema = z.object({
  cycleId: z.string().uuid('Identificador de convocatoria no válido'),
  programId: z.string().uuid('Identificador de programa no válido'),
  campusId: z.string().uuid('Identificador de campus no válido').optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const admissionDecisionSchema = z.object({
  decision: z.enum(['admitted', 'rejected', 'waitlisted']),
  reason: z.string().trim().min(5, 'Se requiere un motivo explicativo de al menos 5 caracteres'),
}).strict();

export type ApplicantRegisterInput = z.infer<typeof applicantRegisterSchema>;
export type ApplicantLoginInput = z.infer<typeof applicantLoginSchema>;
export type AdmissionCycleInput = z.infer<typeof admissionCycleSchema>;
export type AdmissionApplicationInput = z.infer<typeof admissionApplicationSchema>;
export type AdmissionDecisionInput = z.infer<typeof admissionDecisionSchema>;
