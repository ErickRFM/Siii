import { z } from 'zod';
import {renderSiiiEmailHtml} from './templates';

export type TransactionalEmail={to:string;subject:string;text:string;eventId:string};
export type EmailConfiguration={apiKey?:string;from?:string;replyTo?:string};
export type EmailResult=
 | {status:'accepted';messageId:string}
 | {status:'unconfigured';code:'EMAIL_NOT_CONFIGURED'}
 | {status:'retryable';code:'EMAIL_PROVIDER_RETRY'}
 | {status:'failed';code:'EMAIL_PROVIDER_REJECTED'|'EMAIL_MESSAGE_INVALID'};
const address=z.email().max(254).refine(value=>!/[\r\n]/.test(value));
export const transactionalEmailSchema=z.object({to:address,subject:z.string().min(1).max(200).refine(value=>!/[\r\n]/.test(value)),text:z.string().min(1).max(100000),eventId:z.uuid()}).strict();
const configSchema=z.object({apiKey:z.string().min(4).max(256).regex(/^re_[A-Za-z0-9_-]+$/),from:address,replyTo:address}).strict();

/** Explicit server configuration only; the connector's OAuth credential is not an application API key. */
export function emailConfiguration():EmailConfiguration {
 return {apiKey:process.env.RESEND_API_KEY,from:process.env.SIII_EMAIL_FROM,replyTo:process.env.SIII_EMAIL_REPLY_TO};
}
/**
 * Provider acceptance is not delivery. The persistent outbox owns retries (same eventId, bounded below 24h).
 * Never return provider error bodies, request data, or thrown driver messages.
 */
export async function sendTransactionalEmail(input:TransactionalEmail,configuration:EmailConfiguration=emailConfiguration(),purpose:'invitation'|'password-reset'|'admissions'='invitation'):Promise<EmailResult>{
 const message=transactionalEmailSchema.safeParse(input);
 if(!message.success) return {status:'failed',code:'EMAIL_MESSAGE_INVALID'};
 const config=configSchema.safeParse(configuration);
 if(!config.success) return {status:'unconfigured',code:'EMAIL_NOT_CONFIGURED'};
 try {
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{Authorization:'Bearer '+config.data.apiKey,'Content-Type':'application/json','Idempotency-Key':'siii-'+purpose+'-'+message.data.eventId},
   body:JSON.stringify({from:'Siii - Sistema Institucional Integral <'+config.data.from+'>',to:[message.data.to],reply_to:config.data.replyTo,subject:message.data.subject,text:message.data.text,html:renderSiiiEmailHtml(message.data,purpose)}),
  });
  if(response.status===429 || response.status>=500) return {status:'retryable',code:'EMAIL_PROVIDER_RETRY'};
  if(response.status===409){
   const detail:unknown=await response.json().catch(()=>null);
   const transient=z.object({name:z.enum(['concurrent_idempotent_requests','resource_locked'])}).safeParse(detail);
   return transient.success?{status:'retryable',code:'EMAIL_PROVIDER_RETRY'}:{status:'failed',code:'EMAIL_PROVIDER_REJECTED'};
  }
  if(!response.ok) return {status:'failed',code:'EMAIL_PROVIDER_REJECTED'};
  const accepted=z.object({id:z.uuid()}).safeParse(await response.json());
  return accepted.success?{status:'accepted',messageId:accepted.data.id}:{status:'retryable',code:'EMAIL_PROVIDER_RETRY'};
 } catch {
  return {status:'retryable',code:'EMAIL_PROVIDER_RETRY'};
 }
}

export type FrozenEmailSender={from:string;replyTo:string};
const senderSchema=z.object({from:address,replyTo:address}).strict();
/** Persist this pair before first submission; it must remain immutable for this event's retries. */
export function emailSenderSnapshot(configuration:EmailConfiguration=emailConfiguration()):FrozenEmailSender|null {
 const config=configSchema.safeParse(configuration);
 return config.success?{from:config.data.from,replyTo:config.data.replyTo}:null;
}
/** Rotate the API credential independently; never alter a previously claimed event's provider payload. */
export async function sendFrozenTransactionalEmail(input:TransactionalEmail,sender:FrozenEmailSender,configuration:EmailConfiguration=emailConfiguration(),purpose:'invitation'|'password-reset'|'admissions'='invitation'):Promise<EmailResult>{
 const frozen=senderSchema.safeParse(sender);
 if(!frozen.success)return {status:'failed',code:'EMAIL_MESSAGE_INVALID'};
 return sendTransactionalEmail(input,{apiKey:configuration.apiKey,from:frozen.data.from,replyTo:frozen.data.replyTo},purpose);
}