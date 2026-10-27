import { z } from 'zod';

export const feeTypeSchema = z.object({
  code: z.string().trim().min(2, 'Código de concepto requerido').max(20),
  name: z.string().trim().min(3, 'Nombre de concepto requerido'),
  defaultAmountCents: z.number().int().min(0, 'Monto mínimo $0.00'),
  currency: z.string().default('MXN'),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const createOrderSchema = z.object({
  operationId:z.uuid().transform(value=>value.toLowerCase()).optional(),
  feeTypeId: z.string().uuid('Identificador de concepto no válido'),
  payerStudentId: z.string().uuid('Identificador de estudiante no válido').optional(),
  payerUserId: z.string().uuid('Identificador de usuario no válido').optional(),
  totalAmountCents: z.number().int().min(1, 'El monto debe ser mayor a 0'),
  dueDate: z.string().datetime().optional(),
});

export const recordPaymentSchema = z.object({
  amountCents: z.number().int().min(1, 'El monto a pagar debe ser mayor a 0'),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'waiver', 'adjustment']),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/** External money already received by authorized Caja staff; no simulated card gateway. */
export const recordExternalPaymentSchema=z.object({
  operationId:z.uuid().transform(value=>value.toLowerCase()),
  amountCents:z.number().int().min(1).max(2147483647),
  paymentMethod:z.enum(['cash','transfer']),
  reference:z.string().trim().max(200).default(''),
  notes:z.string().trim().max(1000).default(''),
}).strict().refine(value=>value.paymentMethod!=='transfer'||value.reference.length>0,{path:['reference'],message:'Se requiere la referencia de transferencia'});

export const applyWaiverSchema = z.object({
  discountAmountCents: z.number().int().min(1, 'El monto de exención debe ser mayor a 0'),
  discountPercentage: z.number().int().min(1).max(100).optional(),
  reason: z.string().trim().min(5, 'Se requiere motivo explicativo de exención/beca'),
});

export type FeeTypeInput = z.infer<typeof feeTypeSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type ApplyWaiverInput = z.infer<typeof applyWaiverSchema>;
