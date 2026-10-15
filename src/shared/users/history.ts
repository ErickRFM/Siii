import {z} from 'zod';
const snapshot=z.object({status:z.enum(['active','suspended']).optional(),deletedAt:z.iso.datetime().nullable().optional(),displayName:z.string().max(160).nullable().optional(),institutionalCode:z.string().max(80).nullable().optional(),institutionalEmail:z.email().max(254).nullable().optional(),revokedGrants:z.number().int().nonnegative().max(100000).optional()});
/** Shared safe boundary: select only reviewed fields; never forward raw audit details. */
export function projectUserHistory(value:unknown){
 const input=z.object({before:z.unknown().optional(),after:z.unknown().optional()}).safeParse(value);
 if(!input.success)return {};
 const result:Record<string,unknown>={};
 for(const field of ['before','after'] as const){const parsed=snapshot.safeParse(input.data[field]);if(parsed.success)result[field]=parsed.data;}
 return result;
}
