import {createHash,createHmac,randomBytes} from 'node:crypto';
import type {AcademicTransport,AcademicDeliveryResult} from './transport';

type Target={origin:string;keyId:string;secretBase64:string};
type Targets=Record<string,Target>;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{1,64}$/;
const path='/integration/v1/events';
const noStore={cache:'no-store' as const,redirect:'manual' as const,credentials:'omit' as const};

export function academicDeliveryTarget(institutionId:string,encoded:string|undefined):{url:string;keyId:string;secret:Buffer}{
 if(!UUID.test(institutionId)||!encoded||encoded.length>32000)throw Error('COMPANION_TARGET_UNAVAILABLE');
 let targets:Targets;
 try{targets=JSON.parse(encoded) as Targets}catch{throw Error('COMPANION_TARGET_UNAVAILABLE')}
 if(!targets||typeof targets!=='object'||Array.isArray(targets))throw Error('COMPANION_TARGET_UNAVAILABLE');
 const target=targets[institutionId];
 if(!target||typeof target.origin!=='string'||typeof target.keyId!=='string'||typeof target.secretBase64!=='string'||!KEY.test(target.keyId))throw Error('COMPANION_TARGET_UNAVAILABLE');
 let url:URL;
 try{url=new URL(target.origin)}catch{throw Error('COMPANION_TARGET_UNAVAILABLE')}
 if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password||url.port||!url.hostname.includes('.')||url.hostname.endsWith('.local'))throw Error('COMPANION_TARGET_UNAVAILABLE');
 const secret=Buffer.from(target.secretBase64,'base64');
 if(secret.length<32||secret.length>128||secret.toString('base64')!==target.secretBase64)throw Error('COMPANION_TARGET_UNAVAILABLE');
 return {url:url.origin+path,keyId:target.keyId,secret};
}

/**
 * Explicit per-institution HMAC rollover. The original secret is never changed;
 * a verified successor can be selected with two server-only environment values.
 * Invalid rollover configuration fails closed rather than signing with a stale key.
 * Do not use this selector for independently scoped attendance:read targets.
 */
export function selectedAcademicDeliveryTarget(
 institutionId:string,
 current:string|undefined,
 rollover:{enabled?:string;targets?:string}={},
):ReturnType<typeof academicDeliveryTarget>{
 const mode=rollover.enabled??'false';
 if(mode!=='true'&&mode!=='false')throw Error('COMPANION_ROTATION_INVALID');
 if(mode==='true'){
  const rotated=rollover.targets;
  if(!rotated||rotated.length>32000)throw Error('COMPANION_ROTATION_INVALID');
  let mappings:unknown;
  try{mappings=JSON.parse(rotated)}catch{throw Error('COMPANION_ROTATION_INVALID')}
  if(!mappings||typeof mappings!=='object'||Array.isArray(mappings))throw Error('COMPANION_ROTATION_INVALID');
  if(Object.prototype.hasOwnProperty.call(mappings,institutionId)){
   return academicDeliveryTarget(institutionId,rotated);
  }
 }
 return academicDeliveryTarget(institutionId,current);
}

/** Only server credentials bind a Siii institution to one verified Companion tenant. */
export function signedAcademicTransport(
 encodedTargets:string|undefined=process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON,
 http:typeof fetch=fetch,
):AcademicTransport {
 return async ({eventId,institutionId,body,signal}):Promise<AcademicDeliveryResult>=>{
  let target:{url:string;keyId:string;secret:Buffer};
  try{target=selectedAcademicDeliveryTarget(institutionId,encodedTargets,{enabled:process.env.SIII_COMPANION_HMAC_ROLLOVER_ENABLED,targets:process.env.SIII_COMPANION_HMAC_ROLLOVER_TARGETS_JSON})}catch{return {status:'retryable'}}
  try{
   const timestamp=Math.floor(Date.now()/1000).toString();
   const nonce=randomBytes(24).toString('base64url');
   const hash=createHash('sha256').update(body,'utf8').digest('hex');
   const canonical=['POST',path,timestamp,nonce,hash].join('\n');
   const signature='v1='+createHmac('sha256',target.secret).update(canonical).digest('hex');
   const response=await http(target.url,{
    ...noStore,method:'POST',body,signal,
    headers:{
     'Content-Type':'application/json',
     'X-Integration-Key-Id':target.keyId,
     'X-Integration-Timestamp':timestamp,
     'X-Integration-Nonce':nonce,
     'X-Integration-Signature':signature,
    },
   });
   if(response.status===429||response.status>=500)return {status:'retryable'};
   if(![200,202].includes(response.status))return {status:response.status===401?'retryable':'rejected'};
   const size=Number(response.headers.get('content-length'));
   if(Number.isFinite(size)&&size>4096)return {status:'retryable'};
   const receipt:unknown=await response.json();
   if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return {status:'retryable'};
   const r=receipt as Record<string,unknown>;
   if(r.eventId!==eventId||!['received','duplicate'].includes(String(r.status)))return {status:'retryable'};
   return {status:'accepted'};
  }catch{
   return {status:'retryable'};
  }finally{
   target.secret.fill(0);
  }
 };
}
