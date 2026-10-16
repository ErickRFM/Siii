import {sealDelivery,openDelivery} from '@/shared/email/delivery-seal';
import type {TransactionalEmail} from '@/infrastructure/email/transactional';
const config=()=>({purpose:'invitation' as const,keys:process.env.SIII_INVITATION_KEYS,activeKeyId:process.env.SIII_INVITATION_ACTIVE_KEY_ID});
function mapped<T>(operation:()=>T):T{try{return operation();}catch(error){throw Error(error instanceof Error&&error.message==='DELIVERY_KEY_UNAVAILABLE'?'INVITATION_KEY_UNAVAILABLE':'INVITATION_DELIVERY_INVALID');}}
export const sealInvitationDelivery=(message:TransactionalEmail,eventId:string,contextId:string)=>mapped(()=>sealDelivery(message,eventId,contextId,config()));
export const openInvitationDelivery=(value:string,eventId:string,contextId:string)=>mapped(()=>openDelivery(value,eventId,contextId,config()));
