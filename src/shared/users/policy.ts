import {z} from 'zod';
import {ROLE_CAPABILITIES} from '@/shared/auth/capabilities';
export const reason=z.string().trim().min(3).max(500);
const optionalText=(max:number)=>z.string().trim().min(1).max(max).nullable();
export const profileBody=z.object({displayName:optionalText(160).optional(),institutionalCode:optionalText(80).transform(value=>value?.toUpperCase()??null).optional(),institutionalEmail:z.string().trim().toLowerCase().pipe(z.email().max(254)).nullable().optional(),reason}).strict().refine(value=>Object.keys(value).some(key=>key!=='reason'));
export const lifecycleBody=z.object({operation:z.enum(['suspend','activate','delete','rehabilitate']),reason}).strict();
export function lifecycleTransition(before:{status:string;deletedAt:Date|null},operation:string,now:Date){
 if(operation==='delete'&&!before.deletedAt)return {status:'suspended' as const,deletedAt:now,dropGrants:true};
 if(operation==='rehabilitate'&&before.deletedAt)return {status:'active' as const,deletedAt:null,dropGrants:false};
 if(before.deletedAt)return null;
 if(operation==='suspend'&&before.status==='active')return {status:'suspended' as const,deletedAt:null,dropGrants:false};
 if(operation==='activate'&&before.status==='suspended')return {status:'active' as const,deletedAt:null,dropGrants:false};
 return null;
}
export function membershipFilters(params:URLSearchParams){
 for(const key of params.keys())if(!['limit','cursor','q','status','role'].includes(key)||params.getAll(key).length!==1)return null;
 const q=(params.get('q')??'').trim().toLowerCase(),status=params.get('status')??'all',role=params.get('role')??'';
 if(q.length>120||!['all','active','suspended','deleted'].includes(status)||(role&&!Object.hasOwn(ROLE_CAPABILITIES,role)))return null;
 return {q,status,role};
}
export const escapeLike=(value:string)=>value.replace(/[\\%_]/g,character=>'\\'+character);
