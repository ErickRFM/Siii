import {createHash,createHmac,randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {readProjectionStatus} from '@/integrations/companion/projection-status';

const institution=randomUUID(),eventId=randomUUID(),sectionId=randomUUID(),secret=Buffer.alloc(32,7);
const targets=JSON.stringify({[institution]:{origin:'https://companion.fixture.example',keyId:'fixture',secretBase64:secret.toString('base64')}});
const expected=[{eventId,sectionId,sourceVersion:3}];
const response=()=>({contract:'siii.projection_status.v1',observedAtEpochSeconds:Math.floor(Date.now()/1000),receipts:[{eventId,sectionId,sourceVersion:3,status:'projected',attempts:1,failureCode:null,receivedAtEpochSeconds:Math.floor(Date.now()/1000),completedAtEpochSeconds:Math.floor(Date.now()/1000)}]});
describe('bounded signed projection observation independent of delivery acknowledgement',()=>{
 it('signs exact purpose and checks event/version identity',async()=>{
  const http=vi.fn<typeof fetch>(async(url,init)=>{
   expect(String(url)).toBe('https://companion.fixture.example/integration/v1/projection-status');expect(init?.redirect).toBe('manual');expect(init?.cache).toBe('no-store');
   const headers=new Headers(init?.headers),canonical=['POST','/integration/v1/projection-status',headers.get('X-Integration-Timestamp'),headers.get('X-Integration-Nonce'),createHash('sha256').update(String(init?.body)).digest('hex')].join('\n');
   expect(headers.get('X-Integration-Signature')).toBe('v1='+createHmac('sha256',secret).update(canonical).digest('hex'));
   return Response.json(response());
  });
  expect(await readProjectionStatus(institution,expected,{targets,http})).toMatchObject({status:'verified',receipts:[{eventId,status:'projected'}]});expect(http).toHaveBeenCalledTimes(1);
 });
 it.each(['pending','processing','retryable','failed','superseded','unsupported','pending_identity'] as const)('preserves receiver %s without claiming projected',async status=>{
  const body=response();body.receipts[0].status=status;
  expect(await readProjectionStatus(institution,expected,{targets,http:vi.fn(async()=>Response.json(body))})).toMatchObject({status:'verified',receipts:[{status}]});
 });
 it.each(['foreign-event','foreign-section','wrong-version','duplicate','stale','unknown-field','oversized','redirect','error'] as const)('fails closed for %s',async mode=>{
  const body=response();if(mode==='foreign-event')body.receipts[0].eventId=randomUUID();if(mode==='foreign-section')body.receipts[0].sectionId=randomUUID();if(mode==='wrong-version')body.receipts[0].sourceVersion=4;if(mode==='duplicate')body.receipts.push(body.receipts[0]);if(mode==='stale')body.observedAtEpochSeconds-=120;
  const http=vi.fn<typeof fetch>(async()=>mode==='oversized'?new Response(' '.repeat(32769)):mode==='redirect'?new Response(null,{status:302,headers:{location:'https://foreign.example'}}):mode==='error'?Promise.reject(Error('private provider failure')):Response.json(mode==='unknown-field'?{...body,secret:'private'}:body));
  expect(await readProjectionStatus(institution,expected,{targets,http})).toEqual({status:'unavailable'});expect(http).toHaveBeenCalledTimes(1);
 });
 it('missing receipt remains explicitly unknown',async()=>{
  expect(await readProjectionStatus(institution,expected,{targets,http:vi.fn(async()=>Response.json({...response(),receipts:[]}))})).toMatchObject({status:'verified',receipts:[{eventId,status:'unknown'}]});
 });
 it('keeps historical receipt version separate from the current projected head',async()=>{
  const body=response();const observed=await readProjectionStatus(institution,expected,{targets,http:vi.fn(async()=>Response.json({...body,receipts:body.receipts.map(item=>({...item,appliedSourceVersion:7}))}))});
  expect(observed).toMatchObject({status:'verified',receipts:[{sourceVersion:3,appliedSourceVersion:7}]});
 });
 it('does not infer a current projected head from a historical projected receipt',async()=>{
  expect(await readProjectionStatus(institution,expected,{targets,http:vi.fn(async()=>Response.json(response()))})).toMatchObject({status:'verified',receipts:[{status:'projected',appliedSourceVersion:null}]});
 });
 it('accepts nullable metadata omitted by the real Kotlin serializer',async()=>{
  const body=response();const {failureCode,completedAtEpochSeconds,...item}=body.receipts[0];void failureCode;void completedAtEpochSeconds;
  expect(await readProjectionStatus(institution,expected,{targets,http:vi.fn(async()=>Response.json({...body,receipts:[{...item,status:'pending'}]}))})).toMatchObject({status:'verified',receipts:[{status:'pending',failureCode:null,completedAtEpochSeconds:null,appliedSourceVersion:null}]});
 });
 it('invalid configuration or request never sends',async()=>{
  const http=vi.fn<typeof fetch>();expect(await readProjectionStatus(institution,expected,{targets:'{}',http})).toEqual({status:'unavailable'});expect(await readProjectionStatus(institution,[],{targets,http})).toEqual({status:'unavailable'});expect(http).not.toHaveBeenCalled();
 });
});
