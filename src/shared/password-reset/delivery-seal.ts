import {sealDelivery,openDelivery} from '@/shared/email/delivery-seal';
import type {TransactionalEmail} from '@/infrastructure/email/transactional';
const config=()=>({purpose:'password-reset' as const,keys:process.env.SIII_PASSWORD_RESET_KEYS,activeKeyId:process.env.SIII_PASSWORD_RESET_ACTIVE_KEY_ID});
function mapped<T>(operation:()=>T):T{try{return operation();}catch(error){throw Error(error instanceof Error&&error.message==='DELIVERY_KEY_UNAVAILABLE'?'PASSWORD_RESET_KEY_UNAVAILABLE':'PASSWORD_RESET_DELIVERY_INVALID');}}
export const sealResetDelivery=(message:TransactionalEmail,eventId:string,contextId:string)=>mapped(()=>sealDelivery(message,eventId,contextId,config()));
export const openResetDelivery=(value:string,eventId:string,contextId:string)=>mapped(()=>openDelivery(value,eventId,contextId,config()));
