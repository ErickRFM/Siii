/** Navigation projection only. Every destination still checks its current server authority. */
export const PERSONAL_ENTRY_ROLES:readonly string[]=['student','teacher','teacher_pending','workshop_participant','guest'];
export type PersonalEntryContext={institutionId:string;roles:readonly string[];grants:readonly {role:string;scopeType:string}[]};
export function personalEntryAvailable(context:PersonalEntryContext,role:'student'|'teacher'){
 return context.grants.some(grant=>grant.role===role&&(role==='teacher'?grant.scopeType==='institution':['institution','program'].includes(grant.scopeType)));
}
export function resolveDashboardEntry(contexts:readonly PersonalEntryContext[],mustChangePassword=false):string|null{
 if(mustChangePassword||contexts.length!==1)return null;
 const context=contexts[0];
 if(!context.roles.length||context.roles.some(role=>!PERSONAL_ENTRY_ROLES.includes(role)))return null;
 const destinations=(['student','teacher'] as const).filter(role=>context.roles.includes(role));
 return destinations.length===1&&personalEntryAvailable(context,destinations[0])?`/dashboard/institutions/${context.institutionId}/${destinations[0]}`:null;
}
