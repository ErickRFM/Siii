import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {cronAuthorized} from '@/infrastructure/email/cron-auth';
import {selectedAcademicDeliveryTarget} from '@/integrations/companion/outbox/signed-transport';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
const institutionId='0690309f-8897-4c45-bf7f-d46c9c3a8ae1';
const successorKeyId='siii-hmac-20261031-f785a0a53db8c5f69e86586e';
const path='/integration/v1/projection-status';

/** Read-only, authenticated production handshake. Never returns secret, signature or response bodies. */
export async function GET(request:Request){
 if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))
  return NextResponse.json({error:'UNAUTHORIZED'},{status:401,headers});
 if(process.env.SIII_COMPANION_HMAC_ROLLOVER_ENABLED!=='true')
  return NextResponse.json({status:'rollover_disabled',passed:false},{status:503,headers});
 let target:ReturnType<typeof selectedAcademicDeliveryTarget>|undefined;
 try{
  target=selectedAcademicDeliveryTarget(institutionId,process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON,{
   enabled:process.env.SIII_COMPANION_HMAC_ROLLOVER_ENABLED,
   targets:process.env.SIII_COMPANION_HMAC_ROLLOVER_TARGETS_JSON,
  });
  if(target.keyId!==successorKeyId || new URL(target.url).origin!=='https://compa-ero-de-esc.onrender.com')
   return NextResponse.json({status:'unexpected_target',passed:false},{status:503,headers});
  const body=JSON.stringify({contract:'siii.projection_status_request.v1',eventIds:[randomUUID()]});
  const timestamp=String(Math.floor(Date.now()/1000));
  const nonce=randomBytes(24).toString('base64url');
  const hash=createHash('sha256').update(body).digest('hex');
  const canonical=['POST',path,timestamp,nonce,hash].join('\n');
  const signature='v1='+createHmac('sha256',target.secret).update(canonical).digest('hex');
  const h={'Content-Type':'application/json','X-Integration-Key-Id':target.keyId,'X-Integration-Timestamp':timestamp,'X-Integration-Nonce':nonce,'X-Integration-Signature':signature};
  const url=new URL(path,target.url);
  const send=async(headersToSend:typeof h)=>{
   const response=await fetch(url,{method:'POST',body,headers:headersToSend,cache:'no-store',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(25000)});
   const status=response.status;
   let contractOk=false;
   if(status===200){
    const text=await response.text();
    if(text.length<=32768){
     try{
      const value=JSON.parse(text) as Record<string,unknown>;
      contractOk=value.contract==='siii.projection_status.v1' && Array.isArray(value.receipts) && value.receipts.length===0 &&
       typeof value.observedAtEpochSeconds==='number' && Math.abs(Date.now()/1000-value.observedAtEpochSeconds)<=60;
     }catch{ /* Fail closed. */ }
    }
   }else await response.body?.cancel();
   return {status,contractOk};
  };
  const valid=await send(h);
  const invalid=await send({...h,'X-Integration-Nonce':randomBytes(24).toString('base64url'),'X-Integration-Signature':'v1='+'0'.repeat(64)});
  const replay=await send(h);
  const passed=valid.status===200&&valid.contractOk&&invalid.status===401&&replay.status===401;
  return NextResponse.json({keyId:successorKeyId,validStatus:valid.status,contractVerified:valid.contractOk,invalidStatus:invalid.status,replayStatus:replay.status,academicWritesPerformed:false,passed},{status:passed?200:503,headers});
 }catch{
  return NextResponse.json({status:'PROBE_UNAVAILABLE',passed:false},{status:503,headers});
 }finally{target?.secret.fill(0)}
}
