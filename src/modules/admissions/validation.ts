import { z } from 'zod';

export const applicantRegisterSchema = z.object({
  email: z.string().trim().email('Correo electrónico no válido'),
  firstName: z.string().trim().min(2, 'Nombre requerido'),
  lastName: z.string().trim().min(2, 'Apellido requerido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  phone: z.string().trim().optional(),
  curp: z.string().trim().toUpperCase().optional(),
});

export const applicantLoginSchema = z.object({
  email: z.string().trim().email('Correo electrónico no válido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

export const admissionCycleSchema = z.object({
  code: z.string().trim().min(2, 'Código de convocatoria requerido').max(20),
  name: z.string().trim().min(3, 'Nombre de convocatoria requerido'),
  startDate: z.string().datetime({ message: 'Fecha de inicio no válida' }),
  endDate: z.string().datetime({ message: 'Fecha de fin no válida' }),
  status: z.enum(['draft', 'open', 'closed', 'archived']).default('draft'),
});

export const admissionApplicationSchema = z.object({
  cycleId: z.string().uuid('Identificador de convocatoria no válido'),
  programId: z.string().uuid('Identificador de programa no válido'),
  campusId: z.string().uuid('Identificador de campus no válido').optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const admissionDecisionSchema = z.object({
  decision: z.enum(['admitted', 'rejected', 'waitlisted']),
  reason: z.string().trim().min(5, 'Se requiere un motivo explicativo de al menos 5 caracteres'),
});

export type ApplicantRegisterInput = z.infer<typeof applicantRegisterSchema>;
export type ApplicantLoginInput = z.infer<typeof applicantLoginSchema>;
export type AdmissionCycleInput = z.infer<typeof admissionCycleSchema>;
export type AdmissionApplicationInput = z.infer<typeof admissionApplicationSchema>;
export type AdmissionDecisionInput = z.infer<typeof admissionDecisionSchema>;
