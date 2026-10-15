import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isolatedDatabaseUrl} from '../support/database-url';
import {fixtureMfaLogin,fixtureCookie} from '../support/mfa-fixture';
import {openInvitationDelivery} from '../../src/shared/invitations/delivery-seal';
const base='http://127.0.0.1:3107',sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-invitation-account-2026!';
let unit:string,foreign:string,issuerId:string,issuerName:string,issuerMember:string,issuerGrant:string,cookie:string,hash:string;
let deliver:typeof import('../../src/shared/invitations/outbox-worker').deliverInvitations,workerPool:typeof import('../../src/infrastructure/database').pool;
const originalMail={apiKey:process.env.RESEND_API_KEY,from:process.env.SIII_EMAIL_FROM,replyTo:process.env.SIII_EMAIL_REPLY_TO};
function configureMail(){process.env.RESEND_API_KEY='re_synthetic_test_only';process.env.SIII_EMAIL_FROM='frozen@example.test';process.env.SIII_EMAIL_REPLY_TO='reply@example.test';}
function resetMail(){for(const [key,value] of Object.entries({RESEND_API_KEY:originalMail.apiKey,SIII_EMAIL_FROM:originalMail.from,SIII_EMAIL_REPLY_TO:originalMail.replyTo})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
async function eventRow(id:string){return (await sql.query('SELECT * FROM invitation_delivery_outbox WHERE id=$1',[id])).rows[0];}
// Make retry explicitly due despite PostgreSQL microseconds and the worker clock's millisecond floor.
async function due(id:string){await sql.query("UPDATE invitation_delivery_outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);}
const url=(suffix='')=>'/api/v1/institutions/'+unit+'/invitations'+suffix;
async function request(path:string,body?:unknown,session=cookie,method=body===undefined?'GET':'POST'){
 return fetch(base+path,{method,headers:{origin:base,...(body===undefined?{}:{'content-type':'application/json'}),...(session?{cookie:session}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function newUser(role='student',email:string|null=null){
 const username='invite-'+randomUUID(),person=(await sql.query('INSERT INTO people(first_name,last_name,email) VALUES($1,$2,$3) RETURNING id',['Own','Recipient',email])).rows[0].id;
 const id=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,username,hash])).rows[0].id;
 let membershipId:string|undefined,grantId:string|undefined;
 if(role){membershipId=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[unit,id])).rows[0].id;grantId=(await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2) RETURNING id',[membershipId,role])).rows[0].id;}
 return {id,username,person,membershipId,grantId};
}
async function login(username:string,critical=true){
 const response=await request('/api/v1/auth/login',{username,password},'');expect(response.status).toBe(200);
 return fixtureMfaLogin(sql,base,username,password,response,critical);
}
async function issue(extra:Record<string,unknown>={}){
 const email='recipient-'+randomUUID()+'@example.test';
 const response=await request(url(),{email,role:'teacher',...extra});expect(response.status).toBe(201);
 const data=(await response.json()).data;
 const event=(await sql.query('SELECT * FROM invitation_delivery_outbox WHERE invitation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[data.id])).rows[0];
 const message=openInvitationDelivery(event.payload_encrypted,event.id,unit);
 const link=new URL(message.text.match(/https:\/\/[^\s]+/)![0]),fragment=new URLSearchParams(link.hash.slice(1));
 const token=fragment.get('token')!,invitationId=fragment.get('id')!;
 expect(invitationId).toBe(data.id);
 expect(JSON.stringify(data).includes(token)).toBe(false);
 return {data,event,message,token,invitationId,email:String(extra.email??email)};
}
const proof=(invite:{invitationId:string;token:string})=>({invitationId:invite.invitationId,token:invite.token});
const account=()=>({username:'new-'+randomUUID(),password,firstName:'Own',lastName:'Registration'});
describe.sequential('F08 real invitations and explicit consent',()=>{
 beforeAll(async()=>{
  await sql.connect();hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1});
  const app=JSON.parse(readFileSync('.superpowers/sdd/2026-10-13-p0-hardening/app-connection.json','utf8')).connectionString;
  isolatedDatabaseUrl({SIII_DATABASE_ENV:'test',DATABASE_URL:app});
  const original=process.env.DATABASE_URL;process.env.DATABASE_URL=app;
  try{deliver=(await import('../../src/shared/invitations/outbox-worker')).deliverInvitations;const database=await import('../../src/infrastructure/database');workerPool=database.pool;await database.assertApplicationRole();}finally{process.env.DATABASE_URL=original;}
 });
 beforeEach(async()=>{
  await sql.query('DELETE FROM auth_throttle');
  resetMail();
  // Other cases leave reviewable history. Keep this bounded batch focused on its current synthetic fixture.
  await sql.query("UPDATE invitation_delivery_outbox SET next_attempt_at=now()+interval '1 day' WHERE state='queued'");
  unit=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic invitation institution',$1) RETURNING id",[randomUUID()])).rows[0].id;
  foreign=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic foreign institution',$1) RETURNING id",[randomUUID()])).rows[0].id;
  const issuer=await newUser('super_admin');issuerId=issuer.id;issuerName=issuer.username;issuerMember=issuer.membershipId!;issuerGrant=issuer.grantId!;
  cookie=await login(issuerName);
 });
 afterAll(async()=>{resetMail();await workerPool?.end();await sql.end();});
 it('persists a real encrypted message and digest while exposing truthful queued delivery without bearer',async()=>{
  const invite=await issue({email:' Recipient@Example.Test '});
  expect(invite.data.email).toBe('recipient@example.test');
  expect(invite.data.delivery).toEqual({state:'queued',code:'EMAIL_NOT_CONFIGURED'});
  const row=(await sql.query('SELECT token_hash FROM institution_invitations WHERE id=$1',[invite.data.id])).rows[0];
  expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);expect(invite.event.payload_encrypted.includes(invite.token)).toBe(false);
  const audit=(await sql.query("SELECT details FROM security_audit_log WHERE action='invitation.create' AND target=$1",['invitation:'+invite.data.id])).rows[0];
  expect(JSON.stringify(audit).includes(invite.token)).toBe(false);expect(JSON.stringify(audit).includes('recipient@example.test')).toBe(false);
  expect(invite.data.actions).toEqual({canRevoke:true,canResend:false});
 });
 it('paginates only the authorized tenant and does not leak tokens or recipient account existence',async()=>{
  await issue();await issue();
  const first=await (await request(url()+'?limit=1')).json();expect(first.data).toHaveLength(1);expect(first.page.nextCursor).toBeTruthy();
  const second=await (await request(url()+'?limit=1&cursor='+encodeURIComponent(first.page.nextCursor))).json();expect(second.data[0].id).not.toBe(first.data[0].id);
  expect((await request('/api/v1/institutions/'+foreign+'/invitations')).status).toBe(403);
  const invite=await issue(),preview=await request('/api/v1/invitations/preview',proof(invite),'');expect(preview.status).toBe(200);
  const data=(await preview.json()).data;expect(data.institutionId).toBe(unit);expect(Object.hasOwn(data,'email')).toBe(false);expect(Object.hasOwn(data,'accountExists')).toBe(false);
 });
 it('enforces MFA and fresh step-up for issuance with strict mass-assignment rejection',async()=>{
  const fresh=await login(issuerName,false);
  const denied=await request(url(),{email:'own@example.test',role:'teacher'},fresh);expect(denied.status).toBe(403);expect((await denied.json()).error.code).toBe('STEP_UP_REQUIRED');
  expect((await request(url(),{email:'own@example.test',role:'super_admin'})).status).toBe(422);
  expect((await request(url(),{email:'own@example.test',role:'teacher',createdBy:issuerId})).status).toBe(422);
 });
 it('registers a consenting new account, canonicalizes username, and requires actual login without minting a session',async()=>{
  const invite=await issue(),own={...account(),username:'MiXeD-'+randomUUID()};
  const accepted=await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:own},'');expect(accepted.status).toBe(200);
  expect((await accepted.json()).data).toMatchObject({state:'accepted',requiresLogin:true});
  expect(fixtureCookie(accepted)).toBe('');
  const login=await request('/api/v1/auth/login',{username:own.username,password},'');expect(login.status).toBe(200);
  expect((await request('/api/v1/auth/me',undefined,fixtureCookie(login))).status).toBe(200);
  const verified=(await sql.query('SELECT verified_email FROM account_email_verifications WHERE proof_invitation_id=$1',[invite.data.id])).rows[0];expect(verified.verified_email).toBe(invite.email);
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:account()},'')).status).toBe(404);
 });
 it('accepts existing self-consent after fresh proof without editing global PII and invalidates the old session',async()=>{
  const email='existing-'+randomUUID()+'@example.test',recipient=await newUser('',email),session=await login(recipient.username),invite=await issue({email});
  const before=(await sql.query('SELECT * FROM people WHERE id=$1',[recipient.person])).rows[0];
  const accepted=await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},session);expect(accepted.status).toBe(200);
  expect((await sql.query('SELECT * FROM people WHERE id=$1',[recipient.person])).rows[0]).toEqual(before);
  expect((await request('/api/v1/auth/me',undefined,session)).status).toBe(401);
  expect((await sql.query('SELECT accepted_user_id FROM institution_invitations WHERE id=$1',[invite.data.id])).rows[0].accepted_user_id).toBe(recipient.id);
 });
 it('allows a legacy null contact to establish its own verification only with fresh own proof',async()=>{
  const recipient=await newUser('',null),invite=await issue();
  const notFreshResponse=await request('/api/v1/auth/login',{username:recipient.username,password},''),notFresh=fixtureCookie(notFreshResponse);
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},notFresh)).status).toBe(403);
  const session=await login(recipient.username),accepted=await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},session);
  expect(accepted.status).toBe(200);
  expect((await sql.query('SELECT email FROM people WHERE id=$1',[recipient.person])).rows[0].email).toBeNull();
 });
 it('does not duplicate a legacy contact owner into a new identity or bind a mismatched logged-in identity',async()=>{
  const email='legacy-'+randomUUID()+'@example.test';await newUser('',email);const invite=await issue({email});
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:account()},'')).status).toBe(404);
  const stranger=await newUser('','different@example.test'),session=await login(stranger.username);
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},session)).status).toBe(404);
 });
 it('does not duplicate legacy canonical email whose contact has ECMAScript whitespace',async()=>{
  const email='spaces-'+randomUUID()+'@example.test';await newUser('','\t'+email.toUpperCase()+'\n');
  const invite=await issue({email});
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:account()},'')).status).toBe(404);
 });
 it('distinguishes own-session onboarding prerequisites after verifying a real invitation bearer',async()=>{
  const invite=await issue();
  const missing=await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},'');
  expect(missing.status).toBe(401);expect((await missing.json()).error.code).toBe('UNAUTHENTICATED');
  const recipient=await newUser('',null),sessionResponse=await request('/api/v1/auth/login',{username:recipient.username,password},'');
  const session=fixtureCookie(sessionResponse),stale=await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},session);
  expect(stale.status).toBe(403);expect((await stale.json()).error.code).toBe('STEP_UP_REQUIRED');
 });
 it('serializes verified canonical email ownership across two institutions and two simultaneous new registrations',async()=>{
  const email='shared-'+randomUUID()+'@example.test',first=await issue({email});
  const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[foreign,issuerId])).rows[0].id;
  await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'super_admin')",[member]);
  const original=unit;unit=foreign;const second=await issue({email});unit=original;
  const responses=await Promise.all([first,second].map(invite=>request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:account()},'')));
  expect(responses.map(r=>r.status).sort()).toEqual([200,404]);
  expect((await sql.query('SELECT count(*)::int AS n FROM account_email_verifications WHERE verified_email=$1',[email])).rows[0].n).toBe(1);
 });
 it('consumes one invitation once under competing accepts without orphan people or memberships',async()=>{
  const invite=await issue(),responses=await Promise.all([1,2].map(()=>request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:account()},'')));
  expect(responses.map(r=>r.status).sort()).toEqual([200,404]);
  expect((await sql.query('SELECT count(*)::int AS n FROM people WHERE email=$1',[invite.email])).rows[0].n).toBe(1);
 });
 it('rejects consent once and revokes only its own tenant with reusable history',async()=>{
  const invite=await issue();
  expect((await request('/api/v1/invitations/reject',{...proof(invite),consent:true},'')).status).toBe(200);
  expect((await request('/api/v1/invitations/preview',proof(invite),'')).status).toBe(404);
  expect((await request('/api/v1/invitations/reject',{...proof(invite),consent:true},'')).status).toBe(404);
  const second=await issue();expect((await request(url('/'+second.data.id+'/revoke'),{})).status).toBe(200);
  expect((await sql.query('SELECT state FROM institution_invitations WHERE id=$1',[second.data.id])).rows[0].state).toBe('revoked');
 });
 it('rotates bearer and event on resend without extending original expiry and cancels old delivery',async()=>{
  const invite=await issue();expect((await request(url('/'+invite.data.id+'/resend'),{})).status).toBe(429);
  await sql.query("UPDATE institution_invitations SET last_requested_at=now()-interval '61 seconds' WHERE id=$1",[invite.data.id]);
  const resent=await request(url('/'+invite.data.id+'/resend'),{});expect(resent.status).toBe(200);expect((await resent.json()).data.expiresAt).toBe(invite.data.expiresAt);
  expect((await request('/api/v1/invitations/preview',proof(invite),'')).status).toBe(404);
  expect((await sql.query('SELECT state FROM invitation_delivery_outbox WHERE id=$1',[invite.event.id])).rows[0].state).toBe('cancelled');
 });
 it('revalidates the exact original issuer grant on preview and consent even when a replacement grant has same role',async()=>{
  const invite=await issue();await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[issuerGrant]);
  await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'super_admin')",[issuerMember]);
  expect((await request('/api/v1/invitations/preview',proof(invite),'')).status).toBe(404);
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:account()},'')).status).toBe(404);
 });
 it('keeps target grant scope tenant-safe and lifetime no greater than the original issuer authority',async()=>{
  const expiry=new Date(Date.now()+3600000);await sql.query('UPDATE role_assignments SET expires_at=$1 WHERE id=$2',[expiry,issuerGrant]);
  expect((await request(url(),{email:'time@example.test',role:'teacher'})).status).toBe(403);
  expect((await request(url(),{email:'time@example.test',role:'teacher',grantExpiresAt:new Date(expiry.getTime()+1).toISOString()})).status).toBe(403);
  const invite=await issue({grantExpiresAt:expiry.toISOString()});expect(new Date(invite.data.expiresAt).getTime()).toBeLessThanOrEqual(expiry.getTime());
  const other=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'FOREIGN','Foreign','ingenieria','presencial') RETURNING id",[foreign])).rows[0].id;
  expect((await request(url(),{email:'scope@example.test',role:'teacher',scopeType:'program',scopeId:other,grantExpiresAt:expiry.toISOString()})).status).toBe(422);
 });
 it('does not permit ordinary self-grants through invitation consent',async()=>{
  const email='issuer-'+randomUUID()+'@example.test';await sql.query('UPDATE people SET email=$1 WHERE id=(SELECT person_id FROM platform_users WHERE id=$2)',[email,issuerId]);
  const invite=await issue({email});
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'})).status).toBe(403);
 });
 it('does not let institutional admin manage a protected super-admin via consenting invitation',async()=>{
  await sql.query("UPDATE role_assignments SET role='admin' WHERE id=$1",[issuerGrant]);cookie=await login(issuerName);
  const email='protected-'+randomUUID()+'@example.test',recipient=await newUser('super_admin',email),session=await login(recipient.username),invite=await issue({email});
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},session)).status).toBe(404);
 });
 it('enforces RLS and API grants on all three new tables',async()=>{
  for(const table of ['institution_invitations','invitation_delivery_outbox','account_email_verifications']){
   const row=(await sql.query("SELECT c.relrowsecurity,c.relforcerowsecurity,has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated FROM pg_class c WHERE c.oid=$1::regclass",[table])).rows[0];
   expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,anon:false,authenticated:false});
  }
 });
 it('rolls back invitation, outbox and sensitive success when its transactional audit fails',async()=>{
  const name='invite_audit_'+randomUUID().replaceAll('-','');
  await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='invitation.create' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$");
  await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
  try{
   const email='rollback-'+randomUUID()+'@example.test';expect((await request(url(),{email,role:'teacher'})).status).toBe(500);
   expect((await sql.query('SELECT count(*)::int AS n FROM institution_invitations WHERE institution_id=$1 AND email=$2',[unit,email])).rows[0].n).toBe(0);
  }finally{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');}
 });
 it('expires or deactivates a target parent without consuming consent',async()=>{
  const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'PROGRAM','Own','ingenieria','presencial') RETURNING id",[unit])).rows[0].id;
  const invite=await issue({scopeType:'program',scopeId:program});await sql.query("UPDATE academic_programs SET status='inactive' WHERE id=$1",[program]);
  expect((await request('/api/v1/invitations/preview',proof(invite),'')).status).toBe(404);
  expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:account()},'')).status).toBe(404);
  expect((await sql.query('SELECT state FROM institution_invitations WHERE id=$1',[invite.data.id])).rows[0].state).toBe('pending');
 });

 it('does not claim or call transport when server mail configuration is absent',async()=>{
  const invite=await issue();delete process.env.RESEND_API_KEY;
  let calls=0;const result=await deliver({limit:1,transport:async()=>{calls++;return {status:'accepted',messageId:randomUUID()};}});
  expect(result).toEqual({claimed:0,accepted:0,retried:0,failed:0});expect(calls).toBe(0);
  expect(await eventRow(invite.event.id)).toMatchObject({state:'queued',attempts:0,lease_token:null,sender_email:null,failure_code:'EMAIL_NOT_CONFIGURED'});
 });
 it('durably claims before synthetic provider acceptance and preserves immutable ciphertext and routing on retry',async()=>{
  const invite=await issue();configureMail();
  const messages:string[]=[],senders:unknown[]=[];
  const first=await deliver({limit:1,transport:async(message,sender)=>{
   const row=await eventRow(invite.event.id);expect(row.lease_token).toBeTruthy();expect(row.attempts).toBe(1);
   messages.push(JSON.stringify(message));senders.push(sender);return {status:'retryable',code:'EMAIL_PROVIDER_RETRY'};
  }});
  expect(first).toMatchObject({claimed:1,retried:1});
  const retry=await eventRow(invite.event.id);expect(retry.payload_encrypted).toBe(invite.event.payload_encrypted);expect(retry.lease_token).toBeNull();
  process.env.SIII_EMAIL_FROM='rotated@example.test';process.env.SIII_EMAIL_REPLY_TO='rotated-reply@example.test';await due(invite.event.id);
  const providerId=randomUUID(),second=await deliver({limit:1,transport:async(message,sender)=>{messages.push(JSON.stringify(message));senders.push(sender);return {status:'accepted',messageId:providerId};}});
  expect(second).toMatchObject({claimed:1,accepted:1});expect(messages[1]).toBe(messages[0]);expect(senders).toEqual([{from:'frozen@example.test',replyTo:'reply@example.test'},{from:'frozen@example.test',replyTo:'reply@example.test'}]);
  expect(await eventRow(invite.event.id)).toMatchObject({state:'accepted',provider_message_id:providerId,attempts:2,lease_token:null});
  expect((await (await request(url())).json()).data[0].delivery).toEqual({state:'accepted',code:null});
 });
 it('allows only one concurrent worker to own an unexpired lease',async()=>{
  const invite=await issue();configureMail();let calls=0,entered!:()=>void,release!:()=>void;
  const arrived=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const first=deliver({limit:1,transport:async()=>{calls++;entered();await gate;return {status:'accepted',messageId:randomUUID()};}});
  await arrived;
  try{expect(await deliver({limit:1,transport:async()=>{calls++;return {status:'accepted',messageId:randomUUID()};}})).toMatchObject({claimed:0,accepted:0});}finally{release();}
  expect((await first).accepted).toBe(1);expect(calls).toBe(1);expect((await eventRow(invite.event.id)).attempts).toBe(1);
 });
 it('cannot resurrect a revoked invitation when an in-flight provider submission completes',async()=>{
  const invite=await issue();configureMail();let entered!:()=>void,release!:()=>void;
  const arrived=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const pending=deliver({limit:1,transport:async()=>{entered();await gate;return {status:'accepted',messageId:randomUUID()};}});
  await arrived;try{expect((await request(url('/'+invite.data.id+'/revoke'),{})).status).toBe(200);}finally{release();}
  expect((await pending).accepted).toBe(0);expect(await eventRow(invite.event.id)).toMatchObject({state:'cancelled',provider_message_id:null,lease_token:null});
 });
 it('cannot overwrite a replacement lease after an ambiguous delayed submission',async()=>{
  const invite=await issue();configureMail();let entered!:()=>void,release!:()=>void;
  const arrived=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const old=deliver({limit:1,transport:async()=>{entered();await gate;return {status:'accepted',messageId:randomUUID()};}});
  await arrived;
  const providerId=randomUUID();
  try{
   await sql.query("UPDATE invitation_delivery_outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[invite.event.id]);
   expect((await deliver({limit:1,transport:async()=>({status:'accepted',messageId:providerId})})).accepted).toBe(1);
  }finally{release();}
  expect((await old).accepted).toBe(0);expect(await eventRow(invite.event.id)).toMatchObject({state:'accepted',provider_message_id:providerId,attempts:2});
 });
 it('cancels stale issuer authority before calling the provider',async()=>{
  const invite=await issue();configureMail();await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[issuerGrant]);
  let calls=0;await deliver({limit:1,transport:async()=>{calls++;return {status:'accepted',messageId:randomUUID()};}});
  expect(calls).toBe(0);expect((await eventRow(invite.event.id)).state).toBe('cancelled');
 });
 it('fails closed on tampered ciphertext before submission without exposing the message',async()=>{
  const invite=await issue();configureMail();await sql.query("UPDATE invitation_delivery_outbox SET payload_encrypted='invalid' WHERE id=$1",[invite.event.id]);
  let calls=0;expect((await deliver({limit:1,transport:async()=>{calls++;return {status:'accepted',messageId:randomUUID()};}})).failed).toBe(1);
  expect(calls).toBe(0);expect(await eventRow(invite.event.id)).toMatchObject({state:'failed',failure_code:'INVITATION_DELIVERY_INVALID',provider_message_id:null});
 });
 it('bounds retries to eight attempts and stops before provider idempotency retention expires',async()=>{
  const invite=await issue();configureMail();await sql.query('UPDATE invitation_delivery_outbox SET attempts=7 WHERE id=$1',[invite.event.id]);
  expect((await deliver({limit:1,transport:async()=>({status:'retryable',code:'EMAIL_PROVIDER_RETRY'})})).failed).toBe(1);
  expect(await eventRow(invite.event.id)).toMatchObject({state:'failed',attempts:8,failure_code:'RETRY_EXHAUSTED'});
  const late=await issue();await sql.query("UPDATE invitation_delivery_outbox SET created_at=now()-interval '22 hours 59 minutes 50 seconds',expires_at=now()+interval '10 seconds' WHERE id=$1",[late.event.id]);
  expect((await deliver({limit:1,transport:async()=>({status:'retryable',code:'EMAIL_PROVIDER_RETRY'})})).failed).toBe(1);
  expect((await eventRow(late.event.id)).state).toBe('failed');
 });
 it('retains accepted delivery history even after the pending invitation is revoked',async()=>{
  const invite=await issue();configureMail();const providerId=randomUUID();
  expect((await deliver({limit:1,transport:async()=>({status:'accepted',messageId:providerId})})).accepted).toBe(1);
  const revoked=await request(url('/'+invite.data.id+'/revoke'),{});expect(revoked.status).toBe(200);
  expect((await revoked.json()).data.delivery).toEqual({state:'accepted',code:null});
  expect(await eventRow(invite.event.id)).toMatchObject({state:'accepted',provider_message_id:providerId});
 });
 it('rolls back registration, verification and membership if acceptance audit fails',async()=>{
  const invite=await issue(),own=account(),name='invite_accept_audit_'+randomUUID().replaceAll('-','');
  await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='invitation.accept' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$");
  await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
  try{
   expect((await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:own},'')).status).toBe(500);
   expect((await sql.query('SELECT count(*)::int AS n FROM platform_users WHERE username=$1',[own.username])).rows[0].n).toBe(0);
   expect((await sql.query('SELECT count(*)::int AS n FROM people WHERE email=$1',[invite.email])).rows[0].n).toBe(0);
   expect((await sql.query('SELECT count(*)::int AS n FROM account_email_verifications WHERE verified_email=$1',[invite.email])).rows[0].n).toBe(0);
   expect((await sql.query('SELECT state FROM institution_invitations WHERE id=$1',[invite.data.id])).rows[0].state).toBe('pending');
  }finally{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');}
 });
 it('rolls back a newly inserted identity when the bearer is revoked while acceptance waits on its row',async()=>{
  const invite=await issue(),own=account(),gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();
  await gate.query('BEGIN');await gate.query('SELECT id FROM institution_invitations WHERE id=$1 FOR UPDATE',[invite.data.id]);
  const pending=request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'new',account:own},'');
  try{
   const deadline=Date.now()+7000;let waiting=false;
   while(Date.now()<deadline){const row=(await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) AS blocked",[(await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid])).rows[0];if(row.blocked){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,30));}
   expect(waiting).toBe(true);
   await gate.query("UPDATE institution_invitations SET state='revoked',consumed_at=now() WHERE id=$1",[invite.data.id]);await gate.query('COMMIT');
   expect((await pending).status).toBe(404);
   expect((await sql.query('SELECT count(*)::int AS n FROM platform_users WHERE username=$1',[own.username])).rows[0].n).toBe(0);
   expect((await sql.query('SELECT count(*)::int AS n FROM people WHERE email=$1',[invite.email])).rows[0].n).toBe(0);
  }finally{await gate.query('ROLLBACK');await gate.end();await pending;}
 });

 it('returns actionable own-session password-change requirements without consuming valid consent',async()=>{
  const recipient=await newUser('',null),session=await login(recipient.username),invite=await issue();
  await sql.query('UPDATE platform_users SET must_change_password=true WHERE id=$1',[recipient.id]);
  const response=await request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},session);
  expect(response.status).toBe(403);expect((await response.json()).error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  expect((await sql.query('SELECT state FROM institution_invitations WHERE id=$1',[invite.data.id])).rows[0].state).toBe('pending');
 });
 it.each(['revoked','stale'] as const)('revalidates %s own-session proof after waiting on the institution lock',async(change)=>{
  const recipient=await newUser('',null),session=await login(recipient.username),invite=await issue(),gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();
  await gate.query('BEGIN');await gate.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[unit]);
  const pid=(await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pending=request('/api/v1/invitations/accept',{...proof(invite),consent:true,mode:'existing'},session);
  try{
   const deadline=Date.now()+7000;let waiting=false;
   while(Date.now()<deadline){const row=(await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) AS blocked",[pid])).rows[0];if(row.blocked){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,30));}
   expect(waiting).toBe(true);
   if(change==='revoked')await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',[recipient.id]);
   else await sql.query("UPDATE auth_sessions SET step_up_at=now()-interval '6 minutes' WHERE user_id=$1",[recipient.id]);
   await gate.query('COMMIT');const response=await pending;expect(response.status).toBe(change==='revoked'?401:403);expect((await response.json()).error.code).toBe(change==='revoked'?'UNAUTHENTICATED':'STEP_UP_REQUIRED');
   expect((await sql.query('SELECT count(*)::int AS n FROM institution_memberships WHERE institution_id=$1 AND user_id=$2',[unit,recipient.id])).rows[0].n).toBe(0);
   expect((await sql.query('SELECT state FROM institution_invitations WHERE id=$1',[invite.data.id])).rows[0].state).toBe('pending');
  }finally{await gate.query('ROLLBACK');await gate.end();await pending;}
 });
 it('applies an IP budget to invalid bearer attempts without distinguishing unknown invitations',async()=>{
  for(let index=0;index<30;index++){
   const response=await request('/api/v1/invitations/preview',{invitationId:randomUUID(),token:'A'.repeat(43)},'');
   expect(response.status).toBe(404);expect((await response.json()).error.code).toBe('INVITATION_UNAVAILABLE');
  }
  const response=await request('/api/v1/invitations/preview',{invitationId:randomUUID(),token:'A'.repeat(43)},'');expect(response.status).toBe(429);
  expect((await response.json()).error.code).toBe('RATE_LIMITED');
  expect((await sql.query("SELECT count(*)::int AS n FROM security_audit_log WHERE action='invitation.consent.throttled' AND target='invitation:unavailable'")).rows[0].n).toBeGreaterThan(0);
 });
 it('does not submit encrypted mail when its key is unavailable',async()=>{
  const invite=await issue();configureMail();const keys=process.env.SIII_INVITATION_KEYS;process.env.SIII_INVITATION_KEYS='{}';let calls=0;
  try{
   expect((await deliver({limit:1,transport:async()=>{calls++;return {status:'accepted',messageId:randomUUID()};}})).failed).toBe(1);
   expect(calls).toBe(0);expect(await eventRow(invite.event.id)).toMatchObject({state:'failed',failure_code:'INVITATION_KEY_UNAVAILABLE'});
  }finally{process.env.SIII_INVITATION_KEYS=keys;}
 });

 it.each(['bearer','issuer'] as const)('does not disclose preview after %s authority is revoked during its final parent lookup',async(change)=>{
  const invite=await issue(),gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();
  await gate.query('BEGIN');await gate.query('LOCK TABLE institutions IN ACCESS EXCLUSIVE MODE');
  const pid=(await gate.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,pending=request('/api/v1/invitations/preview',proof(invite),'');
  try{
   const deadline=Date.now()+7000;let waiting=false;
   while(Date.now()<deadline){if((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) AS blocked",[pid])).rows[0].blocked){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,30));}
   expect(waiting).toBe(true);
   if(change==='bearer')await sql.query("UPDATE institution_invitations SET state='revoked',consumed_at=now() WHERE id=$1",[invite.data.id]);
   else await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[issuerGrant]);
   await gate.query('COMMIT');expect((await pending).status).toBe(404);
  }finally{await gate.query('ROLLBACK');await gate.end();await pending;}
 });
});
