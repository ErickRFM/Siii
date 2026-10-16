import {describe,it,expect} from 'vitest';
import {createInvitationBody,invitationConsentBody} from '@/shared/invitations/validation';
describe('strict invitation and recipient consent boundary',()=>{
 it('canonicalizes an address without accepting arbitrary grant authority or global UUID attachment',()=>{
  expect(createInvitationBody.parse({email:' Recipient@Example.com ',role:'teacher'}).email).toBe('recipient@example.com');
  expect(createInvitationBody.safeParse({email:'a@example.com',role:'teacher',userId:'guessed'}).success).toBe(false);
  expect(createInvitationBody.safeParse({email:'a@example.com',role:'super_admin'}).success).toBe(false);
 });
 it('requires typed scopes and explicit own-account consent',()=>{
  expect(createInvitationBody.safeParse({email:'a@example.com',role:'teacher',scopeType:'program',scopeId:null}).success).toBe(false);
  expect(invitationConsentBody.safeParse({invitationId:'a',token:'x',mode:'existing',consent:false}).success).toBe(false);
 });
 it('requires a strong new-account password and rejects institutional profile mass assignment',()=>{
  const base={invitationId:'d053ebd7-1c89-46d2-ae47-0024b3e7fd57',token:'A'.repeat(43),mode:'new',consent:true};
  expect(invitationConsentBody.safeParse({...base,account:{username:'recipient',password:'short',firstName:'Own',lastName:'Account'}}).success).toBe(false);
  expect(invitationConsentBody.safeParse({...base,account:{username:'recipient',password:'Strong-synthetic-2026!',firstName:'Own',lastName:'Account',isActive:true}}).success).toBe(false);
 });
});
