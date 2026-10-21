import {NextResponse} from 'next/server';
import {cronAuthorized} from '@/infrastructure/email/cron-auth';
import {assertApplicationRole} from '@/infrastructure/database';
import {academicOutboxEnabled} from '@/integrations/companion/outbox/policy';
import {deliverAcademicEvents} from '@/integrations/companion/outbox/worker';
import {signedAcademicTransport} from '@/integrations/companion/outbox/signed-transport';
import {logger} from '@/shared/logging';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const headers={'Cache-Control':'no-store'};

export async function GET(request:Request){
 if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET)){
  return NextResponse.json({error:'UNAUTHORIZED'},{status:401,headers});
 }
 if(!academicOutboxEnabled()||process.env.SIII_COMPANION_DELIVERY_ENABLED!=='true'){
  return NextResponse.json({status:'disabled'},{headers});
 }
 if(!process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON){
  return NextResponse.json({error:'DELIVERY_NOT_CONFIGURED'},{status:503,headers});
 }
 try{
  await assertApplicationRole();
  const outcome=await deliverAcademicEvents({transport:signedAcademicTransport(),limit:10});
  return NextResponse.json({status:'processed',...outcome},{headers});
 }catch{
  logger.error({code:'SIII_COMPANION_DELIVERY_FAILED'},'Academic snapshot delivery failed');
  return NextResponse.json({error:'DELIVERY_RETRY_REQUIRED'},{status:503,headers});
 }
}
