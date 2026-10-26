import {describe,expect,it} from 'vitest';
import {invitationConsentBody} from '@/shared/invitations/validation';

const base={
 invitationId:'11111111-1111-4111-8111-111111111111',
 token:'a'.repeat(43),
 consent:true as const,
 mode:'new' as const,
 account:{username:'student_09',password:'a-strong-test-password',firstName:'Ana',lastName:'López'}
};
describe('invitation new-account usernames',()=>{
 it.each([
  ['student_09','student_09'],
  [' ANA.Example+up@Example.edu.mx ','ana.example+up@example.edu.mx'],
  ['MARIO@EXAMPLE.COM','mario@example.com'],
 ])('accepts and canonicalizes %s', (input,expected)=>{
  const parsed=invitationConsentBody.safeParse({...base,account:{...base.account,username:input}});
  expect(parsed.success).toBe(true);
  if(parsed.success&&parsed.data.mode==='new')expect(parsed.data.account.username).toBe(expected);
 });
 it.each(['ab','bad@@example.com','x y z','user@example','user@','user/name','a'.repeat(121)])('rejects invalid username %s', username=>{
  expect(invitationConsentBody.safeParse({...base,account:{...base.account,username}}).success).toBe(false);
 });
 it('preserves password length and mandatory consent',()=>{
  expect(invitationConsentBody.safeParse({...base,account:{...base.account,password:'short'}}).success).toBe(false);
  expect(invitationConsentBody.safeParse({...base,consent:false}).success).toBe(false);
 });
});
