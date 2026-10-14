import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sealInvitationDelivery, openInvitationDelivery } from '../../src/shared/invitations/delivery-seal';
const row='8d82db37-07d6-4d76-b454-365f185ef083',tenant='de63dd9a-f6d6-4c8d-8583-1d37313438d0';
const message={to:'synthetic@example.com',subject:'Invitación SIII',text:'https://siii.example.com/invitations/accept#token=synthetic',eventId:row};
function keys(active='new') {
 vi.stubEnv('SIII_INVITATION_KEYS',JSON.stringify({old:randomBytes(32).toString('base64'),new:randomBytes(32).toString('base64')}));
 vi.stubEnv('SIII_INVITATION_ACTIVE_KEY_ID',active);
}
afterEach(()=>vi.unstubAllEnvs());
describe('encrypted invitation delivery outbox',()=>{
 it('stores neither recipient nor bearer link in plaintext and uses fresh IVs',()=>{
  keys();const a=sealInvitationDelivery(message,row,tenant),b=sealInvitationDelivery(message,row,tenant);
  expect(a).not.toBe(b);expect(a).not.toContain(message.to);expect(a).not.toContain(message.text);
  expect(openInvitationDelivery(a,row,tenant)).toEqual(message);
 });
 it('binds ciphertext to tenant, event and purpose, rejecting relocated content',()=>{
  keys();const sealed=sealInvitationDelivery(message,row,tenant);
  expect(()=>openInvitationDelivery(sealed,row,'29421a4f-82a6-4588-b6ec-c369fcfe4e6b')).toThrow('INVITATION_DELIVERY_INVALID');
  expect(()=>openInvitationDelivery(sealed,'d6ae75e6-6951-4268-99a9-18c770f1f098',tenant)).toThrow('INVITATION_DELIVERY_INVALID');
 });
 it('allows old ciphertext after active key rotation; missing old key fails closed',()=>{
  keys('old');const sealed=sealInvitationDelivery(message,row,tenant);
  vi.stubEnv('SIII_INVITATION_ACTIVE_KEY_ID','new');expect(openInvitationDelivery(sealed,row,tenant)).toEqual(message);
  const ring=JSON.parse(process.env.SIII_INVITATION_KEYS!);delete ring.old;vi.stubEnv('SIII_INVITATION_KEYS',JSON.stringify(ring));
  expect(()=>openInvitationDelivery(sealed,row,tenant)).toThrow('INVITATION_KEY_UNAVAILABLE');
 });
 it.each(['iv','tag','ciphertext'])('rejects tampered %s before returning any contents',field=>{
  keys();const envelope=JSON.parse(sealInvitationDelivery(message,row,tenant));
  const bytes=Buffer.from(envelope[field],'base64url');bytes[0]^=1;envelope[field]=bytes.toString('base64url');
  expect(()=>openInvitationDelivery(JSON.stringify(envelope),row,tenant)).toThrow('INVITATION_DELIVERY_INVALID');
 });
 it('rejects malformed encryption configuration instead of creating a plaintext queue',()=>{
  vi.stubEnv('SIII_INVITATION_KEYS','{}');vi.stubEnv('SIII_INVITATION_ACTIVE_KEY_ID','old');
  expect(()=>sealInvitationDelivery(message,row,tenant)).toThrow('INVITATION_KEY_UNAVAILABLE');
 });
 it('does not use MFA key configuration as an implicit fallback',()=>{
  vi.stubEnv('SIII_INVITATION_KEYS','');vi.stubEnv('SIII_MFA_KEYS',JSON.stringify({old:randomBytes(32).toString('base64')}));
  expect(()=>sealInvitationDelivery(message,row,tenant)).toThrow('INVITATION_KEY_UNAVAILABLE');
 });
 it('rejects wrong event ID and invalid message even before sealing',()=>{
  keys();expect(()=>sealInvitationDelivery({...message,eventId:tenant},row,tenant)).toThrow('INVITATION_DELIVERY_INVALID');
  expect(()=>sealInvitationDelivery({...message,to:'a@example.com\r\nbcc:x@example.com'},row,tenant)).toThrow('INVITATION_DELIVERY_INVALID');
 });
 it('rejects unsupported envelope versions, unknown fields and oversized inputs',()=>{
  keys();const original=sealInvitationDelivery(message,row,tenant),parsed=JSON.parse(original);
  for(const envelope of [{...parsed,version:2},{...parsed,unexpected:'x'},{...parsed,ciphertext:'a'.repeat(700001)}]){
   expect(()=>openInvitationDelivery(JSON.stringify(envelope),row,tenant)).toThrow('INVITATION_DELIVERY_INVALID');
  }
 });
});
