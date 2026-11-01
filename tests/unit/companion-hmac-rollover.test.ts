import {createHash,createHmac,randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {academicDeliveryTarget,selectedAcademicDeliveryTarget,signedAcademicTransport} from '@/integrations/companion/outbox/signed-transport';
import {readProjectionStatus} from '@/integrations/companion/projection-status';

const institutionId=randomUUID(),otherInstitution=randomUUID(),eventId=randomUUID(),sectionId=randomUUID();
const originalSecret=Buffer.alloc(32,11),newSecret=Buffer.alloc(32,22);
const entry=(keyId:string,secret:Buffer)=>({origin:'https://companion.example.org',keyId,secretBase64:secret.toString('base64')});
const original=JSON.stringify({[institutionId]:entry('old_20261025',originalSecret),[otherInstitution]:entry('unrelated',originalSecret)});
const successor=JSON.stringify({[institutionId]:entry('new_20261031',newSecret)});
const signedBody=JSON.stringify({eventId,sectionId,sourceVersion:1});

afterEach(()=>vi.unstubAllEnvs());

describe('SIII → Compañero HMAC rollover without replacing the stored original',()=>{
 it('keeps the old credential until promotion and selects a successor only for the matching tenant',()=>{
  let selected=selectedAcademicDeliveryTarget(institutionId,original);
  expect(selected.keyId).toBe('old_20261025');
  selected.secret.fill(0);
  selected=selectedAcademicDeliveryTarget(institutionId,original,{enabled:'true',targets:successor});
  expect(selected.keyId).toBe('new_20261031');
  expect(selected.secret.equals(newSecret)).toBe(true);
  selected.secret.fill(0);
  selected=selectedAcademicDeliveryTarget(otherInstitution,original,{enabled:'true',targets:successor});
  expect(selected.keyId).toBe('unrelated');
  selected.secret.fill(0);
  expect(academicDeliveryTarget(institutionId,original).keyId).toBe('old_20261025');
 });
 it('fails closed for bad rollout configuration and never falls back when the selected key is invalid',()=>{
  expect(()=>selectedAcademicDeliveryTarget(institutionId,original,{enabled:'TRUE',targets:successor})).toThrow();
  expect(()=>selectedAcademicDeliveryTarget(institutionId,original,{enabled:'true'})).toThrow();
  expect(()=>selectedAcademicDeliveryTarget(institutionId,original,{enabled:'true',targets:'{broken'})).toThrow();
  expect(()=>selectedAcademicDeliveryTarget(institutionId,original,{enabled:'true',targets:JSON.stringify({[institutionId]:{...entry('next',newSecret),secretBase64:'invalid'}})})).toThrow();
 });
 it('signs the outgoing event with the successor after promotion',async()=>{
  vi.stubEnv('SIII_COMPANION_HMAC_ROLLOVER_ENABLED','true');
  vi.stubEnv('SIII_COMPANION_HMAC_ROLLOVER_TARGETS_JSON',successor);
  const http=vi.fn<typeof fetch>(async(url,init)=>{
   expect(String(url)).toBe('https://companion.example.org/integration/v1/events');
   const headers=new Headers(init?.headers);
   expect(headers.get('X-Integration-Key-Id')).toBe('new_20261031');
   const canonical=['POST','/integration/v1/events',headers.get('X-Integration-Timestamp'),headers.get('X-Integration-Nonce'),createHash('sha256').update(signedBody).digest('hex')].join('\\n');
   expect(headers.get('X-Integration-Signature')).toBe('v1='+createHmac('sha256',newSecret).update(canonical).digest('hex'));
   return Response.json({eventId,status:'received'},{status:202});
  });
  expect(await signedAcademicTransport(original,http)({eventId,institutionId,sectionId,sourceVersion:1,body:signedBody,signal:new AbortController().signal})).toEqual({status:'accepted'});
  expect(http).toHaveBeenCalledTimes(1);
 });
 it('uses the successor for projection observation without changing explicit test credentials',async()=>{
  vi.stubEnv('SIII_COMPANION_HMAC_ROLLOVER_ENABLED','true');
  vi.stubEnv('SIII_COMPANION_HMAC_ROLLOVER_TARGETS_JSON',successor);
  vi.stubEnv('SIII_COMPANION_DELIVERY_TARGETS_JSON',original);
  const http=vi.fn<typeof fetch>(async(_url,init)=>{
   expect(new Headers(init?.headers).get('X-Integration-Key-Id')).toBe('new_20261031');
   return Response.json({contract:'siii.projection_status.v1',observedAtEpochSeconds:Math.floor(Date.now()/1000),receipts:[]});
  });
  const references=[{eventId,sectionId,sourceVersion:1}];
  expect(await readProjectionStatus(institutionId,references,{http})).toMatchObject({status:'verified',receipts:[{eventId,status:'unknown'}]});
  expect(http).toHaveBeenCalledTimes(1);
 });
 it('does not send events if the rollover config is invalid',async()=>{
  vi.stubEnv('SIII_COMPANION_HMAC_ROLLOVER_ENABLED','true');
  vi.stubEnv('SIII_COMPANION_HMAC_ROLLOVER_TARGETS_JSON','invalid');
  const http=vi.fn<typeof fetch>();
  expect(await signedAcademicTransport(original,http)({eventId,institutionId,sectionId,sourceVersion:1,body:signedBody,signal:new AbortController().signal})).toEqual({status:'retryable'});
  expect(http).not.toHaveBeenCalled();
 });
});
