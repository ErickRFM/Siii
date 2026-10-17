import {afterEach,describe,expect,it,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {sealAcademicBody,openAcademicBody} from '../../src/integrations/companion/outbox/seal';
import {nextAcademicAttempt} from '../../src/integrations/companion/outbox/policy';
const scope={eventId:randomUUID(),institutionId:randomUUID(),sectionId:randomUUID()};
afterEach(()=>{delete process.env.SIII_ACADEMIC_OUTBOX_KEYS;delete process.env.SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID});
function keys(){process.env.SIII_ACADEMIC_OUTBOX_KEYS=JSON.stringify({test:randomBytes(32).toString('base64')});process.env.SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID='test'}
describe('academic outbox cryptographic boundary',()=>{
 it('freezes exact UTF8 body and binds tenant/section/event without plaintext PII',()=>{
  keys();const body=JSON.stringify({fullName:'Persona sintética',eventId:scope.eventId});const sealed=sealAcademicBody(body,scope);
  expect(sealed).not.toContain('Persona');expect(openAcademicBody(sealed,scope)).toBe(body);
  for(const key of ['eventId','institutionId','sectionId'] as const)expect(()=>openAcademicBody(sealed,{...scope,[key]:randomUUID()})).toThrow('ACADEMIC_OUTBOX_BODY_INVALID');
 });
 it('rejects unavailable keys and oversized bodies with safe errors',()=>{
  expect(()=>sealAcademicBody('body',scope)).toThrow('ACADEMIC_OUTBOX_KEY_UNAVAILABLE');keys();
  expect(()=>sealAcademicBody('a'.repeat(1024*1024+1),scope)).toThrow('ACADEMIC_OUTBOX_BODY_INVALID');
 });
 it('retains old keys after rotation and detects ciphertext tampering',()=>{
  keys();const original=process.env.SIII_ACADEMIC_OUTBOX_KEYS!;const sealed=sealAcademicBody('frozen',scope);
  process.env.SIII_ACADEMIC_OUTBOX_KEYS=JSON.stringify({...JSON.parse(original),next:randomBytes(32).toString('base64')});process.env.SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID='next';
  expect(openAcademicBody(sealed,scope)).toBe('frozen');const envelope=JSON.parse(sealed);envelope.tag='A'.repeat(22);
  expect(()=>openAcademicBody(JSON.stringify(envelope),scope)).toThrow('ACADEMIC_OUTBOX_BODY_INVALID');
 });
 it('bounds retry budgets and refuses exhausted attempts',()=>{
  const now=new Date('2026-10-17T00:00:00Z');expect(nextAcademicAttempt(1,now)?.getTime()).toBe(now.getTime()+30000);
  expect(nextAcademicAttempt(8,now)).toBeNull();expect(nextAcademicAttempt(0,now)).toBeNull();
 });
});

import {validateAcademicSnapshot} from '../../src/integrations/companion/outbox/snapshot';
it('accepts real IANA aliases used by institutional settings and rejects invalid zones',()=>{
 const value={contract:'siii.academic_section_snapshot.v1',sectionId:scope.sectionId,sectionCode:'TEST-A',status:'open',timezone:'Etc/UTC',term:{sourceId:randomUUID(),code:'2026-A',startsOn:'2025-01-01',endsOn:'2027-12-31'},subject:{sourceId:randomUUID(),code:'TEST01',name:'Synthetic subject',credits:30},teachers:[],enrollments:[],occurrences:[]};
 expect(validateAcademicSnapshot(value).timezone).toBe('Etc/UTC');expect(()=>validateAcademicSnapshot({...value,timezone:'Invalid/Zone'})).toThrow('ACADEMIC_SNAPSHOT_INVALID');
});

import {runAcademicTransport} from '../../src/integrations/companion/outbox/transport';
it('aborts a stalled transport at30s, before the60s lease budget, with a safe retry outcome',async()=>{
 vi.useFakeTimers();try{let signal:AbortSignal|undefined;const pending=runAcademicTransport(async input=>{signal=input.signal;return new Promise(()=>{})},{...scope,sourceVersion:1,body:'frozen'});await vi.advanceTimersByTimeAsync(29999);expect(signal?.aborted).toBe(false);await vi.advanceTimersByTimeAsync(1);expect(await pending).toEqual({status:'retryable'});expect(signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0)}finally{vi.useRealTimers()}
});
it('clears the transport timer on receipt and preserves exact body bytes',async()=>{
 vi.useFakeTimers();try{const body='{"name":"Persona sintética"}';expect(await runAcademicTransport(async input=>{expect(input.body).toBe(body);return {status:'accepted'}},{...scope,sourceVersion:1,body})).toEqual({status:'accepted'});expect(vi.getTimerCount()).toBe(0)}finally{vi.useRealTimers()}
});
