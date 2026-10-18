import { describe, it, expect, vi, afterEach } from 'vitest';
import { newInvitationToken, hashInvitationToken, invitationLink } from '../../src/shared/invitations/token';
import { sendTransactionalEmail, emailSenderSnapshot, sendFrozenTransactionalEmail } from '../../src/infrastructure/email/transactional';

const invitationId='8d82db37-07d6-4d76-b454-365f185ef083';
const tenant='de63dd9a-f6d6-4c8d-8583-1d37313438d0';
describe('invitation bearer tokens',()=>{
 it('uses 256-bit independent canonical tokens and stores only a context-bound digest',()=>{
  const a=newInvitationToken(), b=newInvitationToken();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(Buffer.from(a,'base64url')).toHaveLength(32); expect(a).not.toBe(b);
  const digest=hashInvitationToken(a,invitationId,tenant); expect(digest).toMatch(/^[a-f0-9]{64}$/); expect(digest).not.toContain(a);
  expect(hashInvitationToken(a,invitationId,'29421a4f-82a6-4588-b6ec-c369fcfe4e6b')).not.toBe(digest);
  expect(hashInvitationToken(a,'d6ae75e6-6951-4268-99a9-18c770f1f098',tenant)).not.toBe(digest);
 });
 it.each(['', 'abc', 'x'.repeat(44), 'x'.repeat(42)+'=', 'x'.repeat(43)+'\n', 'x'.repeat(42)+'z'])('rejects noncanonical token %s',token=>{
  expect(()=>hashInvitationToken(token,invitationId,tenant)).toThrow('INVALID_INVITATION_TOKEN');
 });
 it('validates identifiers rather than accepting caller-defined context',()=>{
  expect(()=>hashInvitationToken(newInvitationToken(),'../other',tenant)).toThrow('INVALID_INVITATION_CONTEXT');
 });
 it('keeps token in fragment and accepts only configured HTTPS origins',()=>{
  const token=newInvitationToken();
  const url=new URL(invitationLink('https://siii.example.com',invitationId,token));
  expect(url.pathname).toBe('/invitations/accept'); expect(url.search).toBe('');
  expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe(token);
  expect(new URLSearchParams(url.hash.slice(1)).get('id')).toBe(invitationId);
  for(const origin of ['http://siii.example.com','https://user:pass@example.com','https://example.com/path','https://example.com?next=x','https://example.com#x','https://example.com/\\evil']){
   expect(()=>invitationLink(origin,invitationId,token)).toThrow('INVALID_PUBLIC_ORIGIN');
  }
 });
});
const email={to:'synthetic@example.com',subject:'Invitación institucional SIII',text:'Invitación sintética, sin datos reales.',eventId:invitationId};
const config={apiKey:'re_synthetic_only',from:'invites@example.com',replyTo:'support@example.com'};
afterEach(()=>vi.unstubAllGlobals());
describe('transactional email provider boundary',()=>{
 it('does not claim a send or contact provider when configuration is missing',async()=>{
  const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
  expect(await sendTransactionalEmail(email,{})).toEqual({status:'unconfigured',code:'EMAIL_NOT_CONFIGURED'}); expect(fetch).not.toHaveBeenCalled();
 });
 it('sends once with stable idempotency, fixed endpoint and timeout; distinguishes accepted from delivered',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:invitationId}),{status:200})); vi.stubGlobal('fetch',fetch);
  expect(await sendTransactionalEmail(email,config)).toEqual({status:'accepted',messageId:invitationId});
  expect(fetch).toHaveBeenCalledOnce();
  const [url,init]=fetch.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails'); expect(init.redirect).toBe('error'); expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(init.headers['Idempotency-Key']).toBe('siii-invitation-'+invitationId);
  const body=JSON.parse(init.body); expect(body).toMatchObject({from:'Siii - Sistema Institucional Integral <'+config.from+'>',to:[email.to],reply_to:config.replyTo,subject:email.subject,text:email.text}); expect(body.html).toContain('SIII'); expect(body.html).toContain('Invitación institucional');
 });
 it.each([429,500,503])('classifies transient provider status %i without echoing its body',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private provider error with credentials',{status})));
  expect(await sendTransactionalEmail(email,config)).toEqual({status:'retryable',code:'EMAIL_PROVIDER_RETRY'});
 });
 it.each([400,401,403,422])('classifies permanent provider status %i without exposing request data',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('secret provider response',{status})));
  expect(await sendTransactionalEmail(email,config)).toEqual({status:'failed',code:'EMAIL_PROVIDER_REJECTED'});
 });
 it.each(['concurrent_idempotent_requests','resource_locked'])('retries documented 409 %s without changing idempotency key',async name=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({name,message:'private payload must not escape'}),{status:409})));
  expect(await sendTransactionalEmail(email,config)).toEqual({status:'retryable',code:'EMAIL_PROVIDER_RETRY'});
 });
 it('does not retry a conflicting payload under an existing idempotency key',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({name:'invalid_idempotent_request',message:'private original recipient'}),{status:409})));
  expect(await sendTransactionalEmail(email,config)).toEqual({status:'failed',code:'EMAIL_PROVIDER_REJECTED'});
 });
 it('treats timeout and ambiguous acceptance as retryable with same event key',async()=>{
  const fetch=vi.fn().mockRejectedValueOnce(new Error('key and recipient must not escape')).mockResolvedValueOnce(new Response('{}',{status:200}));
  vi.stubGlobal('fetch',fetch);
  expect(await sendTransactionalEmail(email,config)).toEqual({status:'retryable',code:'EMAIL_PROVIDER_RETRY'});
  expect(await sendTransactionalEmail(email,config)).toEqual({status:'retryable',code:'EMAIL_PROVIDER_RETRY'});
 });
 it.each([{...email,to:'other@example.com\r\nBcc: victim@example.com'}, {...email,eventId:'bad-key'}, {...email,subject:'invite\r\nheader'}, {...email,text:'x'.repeat(100001)}])('rejects invalid messages before contacting provider',async input=>{
  const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
  expect(await sendTransactionalEmail(input,config)).toEqual({status:'failed',code:'EMAIL_MESSAGE_INVALID'}); expect(fetch).not.toHaveBeenCalled();
 });
});

describe('outbox immutable provider routing',()=>{
 it('freezes a validated routing pair only when a complete server configuration is available',()=>{
  expect(emailSenderSnapshot(config)).toEqual({from:config.from,replyTo:config.replyTo});
  expect(emailSenderSnapshot({from:config.from,replyTo:config.replyTo})).toBeNull();
  expect(emailSenderSnapshot({...config,from:'bad\r\nBcc: victim@example.com'})).toBeNull();
 });
 it('retains sender and reply-to across environment rotation while using the current API key',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:invitationId}),{status:200})); vi.stubGlobal('fetch',fetch);
  const frozen={from:'original@example.com',replyTo:'original-support@example.com'};
  expect(await sendFrozenTransactionalEmail(email,frozen,{...config,apiKey:'re_rotated_key',from:'changed@example.com',replyTo:'changed-support@example.com'})).toEqual({status:'accepted',messageId:invitationId});
  const [,init]=fetch.mock.calls[0]; const body=JSON.parse(init.body);
  expect(body.from).toBe('Siii - Sistema Institucional Integral <'+frozen.from+'>'); expect(body.reply_to).toBe(frozen.replyTo); expect(init.headers.Authorization).toBe('Bearer re_rotated_key');
  expect(init.headers['Idempotency-Key']).toBe('siii-invitation-'+invitationId);
 });
 it('never falls back to environment routing when the frozen pair is invalid',async()=>{
  const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
  expect(await sendFrozenTransactionalEmail(email,{from:'bad\r\nheader',replyTo:config.replyTo},config)).toEqual({status:'failed',code:'EMAIL_MESSAGE_INVALID'});
  expect(fetch).not.toHaveBeenCalled();
 });
});