import { describe, it, expect } from 'vitest';
import {
  applicantRegisterSchema,
  applicantLoginSchema,
  admissionCycleSchema,
  admissionApplicationSchema,
  admissionDecisionSchema,
} from '@/modules/admissions/validation';

describe('Admissions Module Validations', () => {
  it('validates applicant registration input correctly', () => {
    const valid = applicantRegisterSchema.safeParse({
      email: 'aspirante@example.com',
      firstName: 'María',
      lastName: 'González',
      password: 'SecurePassword123!',
      phone: '5551234567',
      curp: 'GOMA900101HMDFGR01',
    });
    expect(valid.success).toBe(true);

    const invalidEmail = applicantRegisterSchema.safeParse({
      email: 'not-an-email',
      firstName: 'María',
      lastName: 'González',
      password: 'SecurePassword123!',
    });
    expect(invalidEmail.success).toBe(false);

    const shortPassword = applicantRegisterSchema.safeParse({
      email: 'aspirante@example.com',
      firstName: 'María',
      lastName: 'González',
      password: 'short',
    });
    expect(shortPassword.success).toBe(false);
  });

  it('validates applicant login input correctly', () => {
    const valid = applicantLoginSchema.safeParse({
      email: 'aspirante@example.com',
      password: 'Password123',
    });
    expect(valid.success).toBe(true);

    const empty = applicantLoginSchema.safeParse({
      email: '',
      password: '',
    });
    expect(empty.success).toBe(false);
  });

  it('validates admission cycle input correctly', () => {
    const valid = admissionCycleSchema.safeParse({
      code: 'CONV-2026-1',
      name: 'Convocatoria Admisión Primavera 2026',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-03-31T23:59:59.000Z',
      status: 'open',
    });
    expect(valid.success).toBe(true);
  });

  it('validates admission application input correctly', () => {
    const valid = admissionApplicationSchema.safeParse({
      cycleId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      programId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      notes: 'Opción prioritaria',
    });
    expect(valid.success).toBe(true);
  });

  it('validates admission decision input correctly', () => {
    const valid = admissionDecisionSchema.safeParse({
      decision: 'admitted',
      reason: 'Cumple con el perfil de ingreso y promedio mínimo exigido.',
    });
    expect(valid.success).toBe(true);

    const shortReason = admissionDecisionSchema.safeParse({
      decision: 'rejected',
      reason: 'No',
    });
    expect(shortReason.success).toBe(false);
  });
});
