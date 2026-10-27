import {z} from 'zod';
const id=z.uuid(),score=z.number().int().min(0).max(1000),reason=z.string().trim().min(10).max(4000),version={id,expectedRevision:z.number().int().positive()};
export const correctionCommand=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('draft'),sectionId:id,studentId:id,publicationId:id,requestedScoreHundredths:score,reason,operationId:id}).strict(),
 z.object({kind:z.literal('edit'),...version,requestedScoreHundredths:score,reason}).strict(),
 z.object({kind:z.literal('rebase'),...version}).strict(),
 z.object({kind:z.literal('submit'),...version}).strict(),
 z.object({kind:z.literal('review'),...version,note:reason}).strict(),
 z.object({kind:z.literal('decide'),...version,decision:z.enum(['approve','reject']),reason,closedAuthorization:z.boolean().default(false)}).strict(),
 z.object({kind:z.literal('apply'),...version}).strict(),
 z.object({kind:z.literal('return'),...version,note:reason}).strict(),
]);
export type CorrectionCommand=z.infer<typeof correctionCommand>;
export const correctionStatus:Record<string,string>={DRAFT:'Borrador',SUBMITTED:'Solicitada',IN_REVIEW:'En revisión',APPROVED:'Aprobada, pendiente de aplicación',REJECTED:'Rechazada',APPLIED:'Aplicada'};
export const MAX_CORRECTION_EVIDENCE=2*1024*1024;
export function evidenceType(bytes:Uint8Array,claimed:string){
 if(claimed==='application/pdf'&&Buffer.from(bytes.subarray(0,5)).toString('ascii')==='%PDF-')return claimed;
 if(claimed==='image/png'&&Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))return claimed;
 if(claimed==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return claimed;
 return null;
}
