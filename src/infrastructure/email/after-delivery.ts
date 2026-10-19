import {after} from 'next/server';
import {logger} from '@/shared/logging';

/** Best-effort fast path after the HTTP response. Durable, leased outboxes own
 * authorization, retries and recovery; never send mail before transaction commit. */
export function scheduleEmailDelivery(purpose:'invitation'|'password-reset'):void {
 // Run only in the Vercel production request runtime, never Preview or Vitest's synthetic
 // route handlers or CI. This also prevents cross-test background queue claims.
 if(process.env.VERCEL!=='1'||process.env.VERCEL_ENV!=='production'||process.env.VITEST==='true'||process.env.NODE_ENV==='test')return;
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
