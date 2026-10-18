import {randomBytes} from 'node:crypto';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {projectUserHistory} from '../../src/shared/users/history';
import {sealResetDelivery,openResetDelivery} from '../../src/shared/password-reset/delivery-seal';
import {sealInvitationDelivery,openInvitationDelivery} from '../../src/shared/invitations/delivery-seal';
import {sendFrozenTransactionalEmail} from '../../src/infrastructure/email/transactional';
const event='20a61098-8f9b-4a6d-beb5-56e87b40bfef',user='b5a18fba-e172-45e4-acb7-d7f25bf07118',message={eventId:event,to:'synthetic@example.test',subject:'Synthetic password reset',text:'Synthetic bearer message'};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function keys(){const key=randomBytes(32).toString('base64');for(const prefix of ['INVITATION','PASSWORD_RESET']){vi.stubEnv('SIII_'+prefix+'_KEYS',JSON.stringify({fixture:key}));vi.stubEnv('SIII_'+prefix+'_ACTIVE_KEY_ID','fixture');}}
describe('safe institutional history projection',()=>{
 it('selects bounded reviewed fields and drops recovery email and secrets recursively',()=>{const projected=projectUserHistory({before:{status:'active',password:'secret',email:'global@example.test'},after:{status:'suspended',token:'bearer',payloadEncrypted:'ciphertext',nested:{password:'secret'}}});expect(projected).toEqual({before:{status:'active'},after:{status:'suspended'}});});
 it('rejects malformed values instead of blindly serializing audit details',()=>{expect(projectUserHistory({before:{status:{secret:'value'}},after:{displayName:'x'.repeat(161)}})).toEqual({});expect(projectUserHistory('secret')).toEqual({});});
});
describe('reset delivery purpose and provider separation',()=>{
 it('rejects invitation ciphertext even when the same key material is configured intentionally',()=>{keys();const invite=sealInvitationDelivery(message,event,user),reset=sealResetDelivery(message,event,user);expect(()=>openResetDelivery(invite,event,user)).toThrow('PASSWORD_RESET_DELIVERY_INVALID');expect(()=>openInvitationDelivery(reset,event,user)).toThrow('INVITATION_DELIVERY_INVALID');expect(openResetDelivery(reset,event,user)).toEqual(message);});
 it('binds a reset ciphertext to its own user, event and key identity',()=>{keys();const sealed=sealResetDelivery(message,event,user);expect(()=>openResetDelivery(sealed,user,event)).toThrow('PASSWORD_RESET_DELIVERY_INVALID');expect(sealed).not.toContain(message.to);expect(sealed).not.toContain(message.text);});
 it('never falls back to invitation keys when reset keys are absent',()=>{keys();vi.stubEnv('SIII_PASSWORD_RESET_KEYS','');expect(()=>sealResetDelivery(message,event,user)).toThrow('PASSWORD_RESET_KEY_UNAVAILABLE');});
 it('uses a purpose-specific stable provider idempotency key with frozen sender',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({id:event})});vi.stubGlobal('fetch',fetch);expect(await sendFrozenTransactionalEmail(message,{from:'frozen@example.test',replyTo:'reply@example.test'},{apiKey:'re_synthetic_only',from:'rotated@example.test',replyTo:'rotatedreply@example.test'},'password-reset')).toEqual({status:'accepted',messageId:event});const call=fetch.mock.calls[0];expect(call[1].headers['Idempotency-Key']).toBe('siii-password-reset-'+event);expect(JSON.parse(call[1].body)).toMatchObject({from:'Siii - Sistema Institucional Integral <frozen@example.test>',reply_to:'reply@example.test'}); expect(JSON.parse(call[1].body).html).toContain('Recuperación de contraseña');});
});
