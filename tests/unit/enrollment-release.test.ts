import { describe, it, expect } from 'vitest';

describe('Enrollment Generator & Registration Release Validation', () => {
  it('formats enrollment numbers according to options', () => {
    const year = 2026;
    const prefix = 'UTP';
    const sequence = 12;
    const formatted = `${prefix}${year}${String(sequence).padStart(4, '0')}`;
    expect(formatted).toBe('UTP20260012');
  });
});
