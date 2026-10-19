import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const claimSchema = z.object({
  enrollmentNumber: z.string().trim().min(3, 'Matrícula requerida'),
});

describe('Student Account Links Validation', () => {
  it('validates claim input correctly', () => {
    const valid = claimSchema.safeParse({ enrollmentNumber: '202600123' });
    expect(valid.success).toBe(true);

    const empty = claimSchema.safeParse({ enrollmentNumber: '  ' });
    expect(empty.success).toBe(false);
  });
});
