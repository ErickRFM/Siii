import {describe,it,expect} from 'vitest';
import {usableInvitation,claimableDelivery,nextDeliveryAttempt} from '../../src/shared/invitations/state-policy';
const now=new Date('2026-10-14T20:00:00Z'),future=new Date(now.getTime()+60000),past=new Date(now.getTime()-1);
describe('invitation and durable delivery state policy',()=>{
 it('accepts only unconsumed pending invitations strictly before expiry',()=>{
  expect(usableInvitation({state:'pending',expiresAt:future,consumedAt:null},now)).toBe(true);
  for(const state of ['accepted','rejected','revoked','expired','unknown']) expect(usableInvitation({state,expiresAt:future,consumedAt:null},now)).toBe(false);
  expect(usableInvitation({state:'pending',expiresAt:now,consumedAt:null},now)).toBe(false);
  expect(usableInvitation({state:'pending',expiresAt:future,consumedAt:past},now)).toBe(false);
  expect(usableInvitation({state:'pending',expiresAt:new Date('bad'),consumedAt:null},now)).toBe(false);
 });
 it('denies active leases, exhausted attempts, expired events and future scheduled retries',()=>{
  const row={state:'queued',expiresAt:future,nextAttemptAt:now,leaseUntil:null,attempts:0};
  expect(claimableDelivery(row,now)).toBe(true);
  for(const changes of [{leaseUntil:future},{attempts:8},{attempts:-1},{attempts:NaN},{expiresAt:now},{nextAttemptAt:future},{state:'accepted'},{state:'failed'}]) expect(claimableDelivery({...row,...changes},now)).toBe(false);
  expect(claimableDelivery({...row,leaseUntil:past},now)).toBe(true);
 });
 it('bounds retries below provider 24h idempotency lifetime and never retries exhausted events',()=>{
  const created=new Date(now.getTime()-60*60000);
  expect(nextDeliveryAttempt(1,created,now)?.getTime()).toBe(now.getTime()+30000);
  expect(nextDeliveryAttempt(7,created,now)?.getTime()).toBe(now.getTime()+1800000);
  for(const attempts of [0,-1,8,NaN,1.5]) expect(nextDeliveryAttempt(attempts,created,now)).toBeNull();
  expect(nextDeliveryAttempt(1,new Date(now.getTime()-23*3600000),now)).toBeNull();
  expect(nextDeliveryAttempt(1,future,now)).toBeNull();
  expect(nextDeliveryAttempt(1,new Date('bad'),now)).toBeNull();
 });
});
