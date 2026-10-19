import {describe,it,expect} from 'vitest';
import {cronAuthorized} from '../../src/infrastructure/email/cron-auth';

describe('email delivery cron authorization',()=>{
 const secret='S'.repeat(48);
 it('rejects all unauthenticated and weak configurations without fallback',()=>{
  expect(cronAuthorized(null,undefined)).toBe(false);
  expect(cronAuthorized('Bearer '+secret,undefined)).toBe(false);
  expect(cronAuthorized('Bearer '+secret,'short')).toBe(false);
  expect(cronAuthorized('',secret)).toBe(false);
  expect(cronAuthorized(secret,secret)).toBe(false);
  expect(cronAuthorized('bearer '+secret,secret)).toBe(false);
 });
 it('accepts only the exact bearer token',()=>{
  expect(cronAuthorized('Bearer '+secret,secret)).toBe(true);
  expect(cronAuthorized('Bearer '+secret+'X',secret)).toBe(false);
  expect(cronAuthorized('Bearer '+secret.slice(0,-1)+'X',secret)).toBe(false);
 });
});
