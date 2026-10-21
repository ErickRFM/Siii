import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {signedAcademicTransport} from '../../src/integrations/companion/outbox/signed-transport';

const institutionId=randomUUID();
const sectionId=randomUUID();
const eventId=randomUUID();
const secret=randomBytes(32);
const body=JSON.stringify({eventId,entityType:'group',sectionId});
const target=(origin='https://compa-ero-de-esc.onrender.com')=>JSON.stringify({
 [institutionId]:{origin,keyId:'SIII_LINK_TEST',secretBase64:secret.toString('base64')},
});
const input={eventId,institutionId,sectionId,sourceVersion:1,body,signal:new AbortController().signal};

describe('signed Companion delivery boundary',()=>{
 it('binds tenant to configured destination and authenticates exact immutable body',async()=>{
  let calls=0;
  const http:typeof fetch=async (url,init)=>{
   calls++;
   expect(String(url)).toBe('https://compa-ero-de-esc.onrender.com/integration/v1/events');
   expect(init?.redirect).toBe('manual');
   expect(init?.body).toBe(body);
   const headers=new Headers(init?.headers);
   const nonce=headers.get('X-Integration-Nonce')!;
   expect(nonce.length).toBeGreaterThan(15);
   const canonical=['POST','/integration/v1/events',headers.get('X-Integration-Timestamp')!,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
   const expected='v1='+createHmac('sha256',secret).update(canonical).digest('hex');
   expect(headers.get('X-Integration-Signature')).toBe(expected);
   return new Response(JSON.stringify({eventId,status:'received',receivedAtEpochSeconds:1}),{status:202,headers:{'Content-Type':'application/json'}});
  };
  expect(await signedAcademicTransport(target(),http)(input)).toEqual({status:'accepted'});
  expect(calls).toBe(1);
 });
 it('never contacts a non HTTPS or unmapped destination',async()=>{
  let calls=0;
  const http:typeof fetch=async ()=>{calls++;return new Response('')};
  expect(await signedAcademicTransport(target('http://localhost:3333'),http)(input)).toEqual({status:'retryable'});
  expect(await signedAcademicTransport(target(),http)({...input,institutionId:randomUUID()})).toEqual({status:'retryable'});
  expect(calls).toBe(0);
 });
 it('requires a verified receipt and treats a redirect as rejected',async()=>{
  const fake=(status:number,receipt:object):typeof fetch=>async ()=>new Response(JSON.stringify(receipt),{status});
  expect(await signedAcademicTransport(target(),fake(302,{eventId,status:'received'}))(input)).toEqual({status:'rejected'});
  expect(await signedAcademicTransport(target(),fake(202,{eventId:randomUUID(),status:'received'}))(input)).toEqual({status:'retryable'});
  expect(await signedAcademicTransport(target(),fake(200,{eventId,status:'duplicate'}))(input)).toEqual({status:'accepted'});
 });
});
