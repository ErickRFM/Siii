import {cronAuthorized} from '@/infrastructure/email/cron-auth';
import {NextResponse} from 'next/server';
import {assertApplicationRole} from '@/infrastructure/database';
import {deliverInvitations} from '@/shared/invitations/outbox-worker';
import {deliverPasswordResets} from '@/shared/password-reset/outbox-worker';
import {logger} from '@/shared/logging';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

export async function GET(request:Request){
 if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))return NextResponse.json({error:'UNAUTHORIZED'},{status:401,headers:{'Cache-Control':'no-store'}});
 try{
  await assertApplicationRole();
  // Bounded batches and durable row leases make concurrent fast-path sends safe.
  const invitations=await deliverInvitations({limit:5});
  const passwordResets=await deliverPasswordResets({limit:5});
  return NextResponse.json({status:'processed',invitations,passwordResets},{headers:{'Cache-Control':'no-store'}});
 }catch{
  logger.error({code:'SIII_EMAIL_CRON_FAILED'},'Transactional email queue processing failed');
  return NextResponse.json({error:'DELIVERY_RETRY_REQUIRED'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
