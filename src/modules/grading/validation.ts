import { z } from 'zod';

export const gradeLinkCreate = z.strictObject({ teacherId: z.uuid(), membershipId: z.uuid() });
export const gradeLinkRevoke = z.strictObject({ id:z.uuid() });
export const componentCreate = z.strictObject({
 kind:z.literal('component'), sectionId:z.uuid(), code:z.string().trim().min(2).max(30)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).transform(s=>s.toUpperCase()),
 title:z.string().trim().min(3).max(160), weight:z.number().int().min(1).max(100),
});
export const scorePut = z.strictObject({kind:z.literal('score'),componentId:z.uuid(),studentId:z.uuid(),scoreHundredths:z.number().int().min(0).max(1000),expectedUpdatedAt:z.iso.datetime().refine(value=>Number(value.slice(0,4))>=1).nullable()});
export const publishGrades = z.strictObject({kind:z.literal('publish'),sectionId:z.uuid(),operationId:z.uuid()});
export const gradeCommand = z.discriminatedUnion('kind',[componentCreate,scorePut,publishGrades]);

export function calculateWeightedGrade(parts:readonly {scoreHundredths:number,weight:number}[]):number {
 const weight=parts.reduce((n,p)=>n+p.weight,0);
 if(weight!==100)throw Error('WEIGHTS_MUST_EQUAL_100');
 if(parts.some(p=>!Number.isInteger(p.scoreHundredths)||p.scoreHundredths<0||p.scoreHundredths>1000
 ||!Number.isInteger(p.weight)||p.weight<1||p.weight>100))throw Error('INVALID_COMPONENT');
 return Math.round(parts.reduce((n,p)=>n+p.scoreHundredths*p.weight,0)/100);
}
