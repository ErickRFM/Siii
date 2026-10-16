import {z} from 'zod';
import type {institutions} from '../../../db/schema';

export const MAX_ADMIN_VERSION=2147483647;
const reason=z.string().trim().min(3).max(500);
const expectedVersion=z.number().int().min(0).max(MAX_ADMIN_VERSION);
const timezone=z.string().trim().min(1).max(100).refine(value=>{
 if(/^[+-]/.test(value))return false;
 try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return true;}catch{return false;}
},'Invalid IANA timezone');
export const settingsBody=z.object({
 name:z.string().trim().min(1).max(200).optional(),
 shortName:z.string().trim().min(1).max(80).nullable().optional(),
 code:z.string().trim().min(1).max(80).optional(),timezone:timezone.optional(),reason,expectedVersion,
}).strict().refine(body=>['name','shortName','code','timezone'].some(key=>Object.hasOwn(body,key)));
export const statusBody=z.object({status:z.enum(['active','inactive','suspended']),reason,expectedVersion}).strict();
export type InstitutionAdminDTO={id:string;name:string;shortName:string|null;code:string;timezone:string;status:'active'|'inactive'|'suspended'|'archived';version:number;createdAt:string;updatedAt:string};
export function institutionDTO(row:typeof institutions.$inferSelect):InstitutionAdminDTO{
 return {id:row.id,name:row.name,shortName:row.shortName,code:row.code,timezone:row.timezone,status:row.status,version:row.adminVersion,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};
}
export const TARGET_KINDS=['institution','membership','grant','invitation','delivery','programs','curricula','courses','campuses','terms'] as const;
const action=z.string().max(100).regex(/^[a-z][a-z0-9_.-]*$/);
const auditInstant=z.iso.datetime().refine(value=>Number(value.slice(0,4))>=1);
export function auditFilters(params:URLSearchParams){
 for(const key of params.keys())if(!['limit','cursor','action','targetKind','from','to'].includes(key)||params.getAll(key).length!==1)return null;
 const parsed=z.object({action:action.optional(),targetKind:z.enum(TARGET_KINDS).optional(),from:auditInstant.optional(),to:auditInstant.optional()}).safeParse(Object.fromEntries(['action','targetKind','from','to'].flatMap(key=>params.has(key)?[[key,params.get(key)]]:[])));
 if(!parsed.success)return null;
 const filters=parsed.data;
 const from=filters.from?Date.parse(filters.from):null,to=filters.to?Date.parse(filters.to):null;
 if(from!==null&&to!==null&&from>to)return null;
 return {...filters,...(from===null?{}:{from:new Date(from).toISOString()}),...(to===null?{}:{to:new Date(to).toISOString()})};
}
const snapshot=z.object({
 name:z.string().max(200).optional(),shortName:z.string().max(80).nullable().optional(),code:z.string().max(80).optional(),timezone:z.string().max(100).optional(),
 status:z.enum(['active','inactive','suspended','archived']).optional(),version:expectedVersion.optional(),
 state:z.enum(['pending','accepted','rejected','revoked','queued','failed','cancelled']).optional(),
 role:z.enum(['student','workshop_participant','teacher_pending','teacher','tutor','coordinator','admin','super_admin','guest','control_escolar','workshop_facilitator']).optional(),
 scopeType:z.enum(['institution','program','campus']).optional(),scopeId:z.uuid().nullable().optional(),
 revokedGrants:z.number().int().min(0).max(100000).optional(),revokedInvitations:z.number().int().min(0).max(100000).optional(),cancelledDeliveries:z.number().int().min(0).max(100000).optional(),
});
/** Reviewed projection only; raw details and identity/contact/credential data never cross this boundary. */
export function projectAudit(details:unknown,target:unknown){
 const input=z.object({before:z.unknown().optional(),after:z.unknown().optional(),reason:reason.optional()}).safeParse(details);
 const changes:Record<string,unknown>={};
 if(input.success)for(const key of ['before','after'] as const){const parsed=snapshot.safeParse(input.data[key]);if(parsed.success)changes[key]=parsed.data;}
 let projectedTarget:{kind:typeof TARGET_KINDS[number];id:string}|null=null;
 if(typeof target==='string'){
  const [kind,id,...suffix]=target.split(':');
  if(!suffix.length&&TARGET_KINDS.some(value=>value===kind)&&z.uuid().safeParse(id).success)projectedTarget={kind:kind as typeof TARGET_KINDS[number],id};
 }
 return {target:projectedTarget,reason:input.success?input.data.reason??null:null,changes};
}
