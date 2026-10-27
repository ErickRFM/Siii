import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {academicDeliveryTarget} from './outbox/signed-transport';

export const ACADEMIC_AUTHORITY_PATH='/api/integrations/companion/v1/authority';
export type AcademicAuthorityCredential={institutionId:string;reservationId:string};

/** The existing delivery key binds both directions; the signed path separates their purposes. */
export function academicAuthorityCredential(
 headers:Headers,body:string,encodedTargets=process.env.SIII_COMPANION_DELIVERY_TARGETS_JSON,now=Date.now(),
):AcademicAuthorityCredential|null{
 const timestamp=headers.get('x-integration-timestamp')??'',nonce=headers.get('x-integration-nonce')??'';
 const keyId=headers.get('x-integration-key-id')??'',signature=headers.get('x-integration-signature')??'';
 if(!/^[1-9][0-9]{9,11}$/.test(timestamp)||!/^[-_A-Za-z0-9]{16,128}$/.test(nonce)||!/^v1=[0-9a-f]{64}$/i.test(signature))return null;
 if(Math.abs(Math.floor(now/1000)-Number(timestamp))>60)return null;
 let institutionId:unknown;
 try{institutionId=JSON.parse(body)?.institutionId}catch{return null}
 if(typeof institutionId!=='string')return null;
 let target:ReturnType<typeof academicDeliveryTarget>;
 try{target=academicDeliveryTarget(institutionId,encodedTargets)}catch{return null}
 try{
  if(target.keyId!==keyId)return null;
  const canonical=['POST',ACADEMIC_AUTHORITY_PATH,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
  const expected=createHmac('sha256',target.secret).update(canonical).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.slice(3),'hex')))return null;
  const digest=createHash('sha256').update(['siii-authority-v1',institutionId,keyId,nonce].join('\0')).digest('hex');
  const reservationId=`${digest.slice(0,8)}-${digest.slice(8,12)}-8${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
  return {institutionId,reservationId};
 }finally{target.secret.fill(0)}
}
