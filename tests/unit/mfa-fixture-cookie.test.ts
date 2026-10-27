import {describe,it,expect} from 'vitest';
import {fixtureCookie} from '../support/mfa-fixture';
function response(...cookies:string[]){const headers=new Headers();for(const cookie of cookies)headers.append('Set-Cookie',cookie);return new Response(null,{headers})}
describe('real HTTP fixture cookie modes',()=>{
 it('retains secure production session and challenge names for subsequent real requests',()=>{
  const session=response('__Host-siii_session=synthetic-session; Path=/; Secure; HttpOnly; SameSite=Lax');
  const challenge=response('__Host-siii_mfa_challenge=synthetic-challenge; Path=/; Secure; HttpOnly; SameSite=Lax');
  expect(fixtureCookie(session)).toBe('__Host-siii_session=synthetic-session');
  expect(fixtureCookie(challenge,'siii_mfa_challenge')).toBe('__Host-siii_mfa_challenge=synthetic-challenge');
 });
 it('preserves development fixtures and ignores unrelated or empty cookies',()=>{
  expect(fixtureCookie(response('siii_session=synthetic-development; Path=/; HttpOnly'))).toBe('siii_session=synthetic-development');
  expect(fixtureCookie(response('other_session=synthetic-other; Path=/','siii_session=; Max-Age=0'))).toBe('');
 });
});
