import {after} from 'next/server';
import {logger} from '@/shared/logging';

/** Best-effort fast path after the HTTP response. Durable, leased outboxes own
 * authorization, retries and recovery; never send mail before transaction commit. */
export function scheduleEmailDelivery(purpose:'invitation'|'password-reset'):void {
 // Direct route-handler integration tests have no Next.js after() request context.
 if(process.env.NODE_ENV==='test')return;
 after(async()=>{
  try{
   if(purpose==='invitation'){
    const {deliverInvitations}=await import('@/shared/invitations/outbox-worker');
    await deliverInvitations({limit:5});
   }else{
    const {deliverPasswordResets}=await import('@/shared/password-reset/outbox-worker');
    await deliverPasswordResets({limit:5});
   }
  }catch{
   // Do not log recipient, bearer links, provider responses or decrypted payload.
   logger.error({code:'SIII_EMAIL_BACKGROUND_RETRY_REQUIRED',purpose},'Deferred email delivery will require a retry');
  }
 });
}
