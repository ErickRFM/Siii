import { z } from 'zod';

export const catalogResource = z.enum(['campuses', 'terms', 'programs', 'courses', 'curricula']);
export type CatalogResource = z.infer<typeof catalogResource>;
const code = z.string().trim().min(2).max(25).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, 'Solo letras, números, guiones y guion bajo')
  .transform(value => value.toUpperCase());
const name = z.string().trim().min(3).max(160);
const date = z.iso.date();
const states = z.enum(['active', 'inactive', 'archived', 'suspended']);
const uuid = z.uuid();

export const catalogCreate = {
  campuses: z.object({ code, name }),
  terms: z.object({ code, name, startDate: date, endDate: date })
    .refine(value => value.endDate >= value.startDate, { message: 'La fecha de cierre no puede ser anterior al inicio', path: ['endDate'] }),
  programs: z.object({
    code, name,
    level: z.enum(['tecnico_superior', 'licenciatura', 'ingenieria', 'maestria', 'doctorado', 'otro']),
    modality: z.enum(['presencial', 'mixta', 'en_linea']),
  }),
  courses: z.object({ code, name, credits: z.number().int().min(0).max(30) }),
  curricula: z.object({ programId: uuid, version: code }),
} as const;

export const catalogUpdate = {
  campuses: z.object({ id: uuid, name: name.optional(), status: states.optional() }),
  terms: z.object({ id: uuid, name: name.optional(), status: states.optional() }),
  programs: z.object({ id: uuid, name: name.optional(), status: states.optional() }),
  courses: z.object({ id: uuid, name: name.optional(), status: states.optional() }),
  curricula: z.object({ id: uuid, status: states.optional() }),
} as const;

export function parseCatalogCreate(resource: CatalogResource, payload: unknown) {
  return catalogCreate[resource].safeParse(payload);
}
export function parseCatalogUpdate(resource: CatalogResource, payload: unknown) {
  return catalogUpdate[resource].safeParse(payload);
}
