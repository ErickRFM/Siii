import { describe, expect, it } from 'vitest';
import { catalogCreate, catalogResource, catalogUpdate } from '@/modules/academic/catalog-validation';

const uuid = 'a84b0d45-a3a0-4fe3-ab73-71ed9779848d';

describe('F3 academic catalog validation', () => {
  it('accepts valid programs, normalizing institution codes', () => {
    const result = catalogCreate.programs.parse({
      code: 'ing_sis', name: 'Ingeniería en Sistemas', level: 'ingenieria', modality: 'presencial',
    });
    expect(result.code).toBe('ING_SIS');
  });
  it('rejects malformed codes and unsupported program levels', () => {
    expect(catalogCreate.programs.safeParse({
      code: 'a/b', name: 'Sistemas', level: 'other', modality: 'presencial',
    }).success).toBe(false);
  });
  it('rejects inverted period dates', () => {
    const term = catalogCreate.terms.safeParse({
      code: '2026-A', name: 'Periodo 2026-A',
      startDate: '2026-09-01', endDate: '2026-06-01',
    });
    expect(term.success).toBe(false);
  });
  it('accepts credit bounds and rejects negative credits', () => {
    expect(catalogCreate.courses.safeParse({ code:'MAT101',name:'Cálculo',credits:0 }).success).toBe(true);
    expect(catalogCreate.courses.safeParse({ code:'MAT101',name:'Cálculo',credits:-1 }).success).toBe(false);
    expect(catalogCreate.courses.safeParse({ code:'MAT101',name:'Cálculo',credits:31 }).success).toBe(false);
  });
  it('requires a valid program id and plan version', () => {
    expect(catalogCreate.curricula.safeParse({ programId:uuid, version:'2026-A' }).success).toBe(true);
    expect(catalogCreate.curricula.safeParse({ programId:'another-institution', version:'2026-A' }).success).toBe(false);
  });
  it('rejects unauthorized resource paths and invalid update ids', () => {
    expect(catalogResource.safeParse('admin').success).toBe(false);
    expect(catalogUpdate.courses.safeParse({ id:'not-an-id', status:'active' }).success).toBe(false);
  });
});
