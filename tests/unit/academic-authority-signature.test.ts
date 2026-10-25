import {describe,it,expect} from 'vitest';
import {createHash,createHmac} from 'node:crypto';
import {academicAuthorityCredential,ACADEMIC_AUTHORITY_PATH} from '../../src/integrations/companion/authority-signature';

const institutionId='63e4b250-a26e-46da-897d-dc674ef2eb1e';
const secret=Buffer.alloc(32,71),nonce='unique-test-nonce-0123456789';
const targets=JSON.stringify({[institutionId]:{origin:'https://companion.fixture.example',keyId:'test-key',secretBase64:secret.toString('base64')}});
const now=1792800000000;
const body=JSON.stringify({contract:'siii.academic_authority_request.v1',institutionId,kind:'student',externalId:'STUDENT-01'});
function headers(offset:number,path=ACADEMIC_AUTHORITY_PATH){
 const timestamp=String(now/1000+offset);
 const canonical=['POST',path,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
 return new Headers({'x-integration-key-id':'test-key','x-integration-timestamp':timestamp,'x-integration-nonce':nonce,'x-integration-signature':'v1='+createHmac('sha256',secret).update(canonical).digest('hex')});
}
describe('academic authority HMAC time and purpose binding',()=>{
 it.each([-60,0,60])('accepts a correctly signed request %s seconds from the fixed clock',offset=>{
  expect(academicAuthorityCredential(headers(offset),body,targets,now)?.institutionId).toBe(institutionId);
 });
 it.each([-61,61])('refuses a valid signature outside the exact %s second boundary',offset=>{
  expect(academicAuthorityCredential(headers(offset),body,targets,now)).toBeNull();
 });
 it('refuses a signature for the existing event path',()=>{
  expect(academicAuthorityCredential(headers(0,'/integration/v1/events'),body,targets,now)).toBeNull();
 });
 it('binds the nonce reservation to source institution and credential',()=>{
  const first=academicAuthorityCredential(headers(0),body,targets,now)!;
  expect(first.reservationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(academicAuthorityCredential(headers(60),body,targets,now)?.reservationId).toBe(first.reservationId);
 });
 it('never returns the credential bytes or a signature',()=>{
  const result=academicAuthorityCredential(headers(0),body,targets,now)!;
  expect(Object.keys(result).sort()).toEqual(['institutionId','reservationId']);
 });
});
