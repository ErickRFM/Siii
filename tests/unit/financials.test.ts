import { describe, it, expect } from 'vitest';
import {
  feeTypeSchema,
  createOrderSchema,
  recordPaymentSchema,
  applyWaiverSchema,
} from '@/modules/financials/validation';

describe('Financials & Treasury Validations', () => {
  it('validates fee type input correctly', () => {
    const valid = feeTypeSchema.safeParse({
      code: 'INSCRIPCION',
      name: 'Inscripción Semestral',
      defaultAmountCents: 250000, // $2,500.00 MXN
    });
    expect(valid.success).toBe(true);

    const negativeAmount = feeTypeSchema.safeParse({
      code: 'INVALID',
      name: 'Monto negativo',
      defaultAmountCents: -500,
    });
    expect(negativeAmount.success).toBe(false);
  });

  it('validates payment order creation input correctly', () => {
    const valid = createOrderSchema.safeParse({
      feeTypeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      totalAmountCents: 250000,
    });
    expect(valid.success).toBe(true);
  });

  it('validates payment recording input correctly', () => {
    const valid = recordPaymentSchema.safeParse({
      amountCents: 250000,
      paymentMethod: 'cash',
      reference: 'REC-12345',
    });
    expect(valid.success).toBe(true);
  });

  it('validates waiver application input correctly', () => {
    const valid = applyWaiverSchema.safeParse({
      discountAmountCents: 125000,
      discountPercentage: 50,
      reason: 'Beca de excelencia académica del 50%',
    });
    expect(valid.success).toBe(true);
  });
});
