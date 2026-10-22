import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {hashPassword} from '@/shared/auth/password';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';
import {openInvitationDelivery} from '@/shared/invitations/delivery-seal';
import {fixtureCookie} from '../support/mfa-fixture';

const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-claim-owner-2026!';
type Actor={id:string;person:string;member:string|null;session:string;cookie:string;email:string|null};
type Student={id:string;number:string};
let unit:string,foreign:string,program:string,passwordHash:string;
const actions={auto:'student.link.auto_approved',pending:'student.claim.requested'} as const;
const claimPath=(tenant=unit)=>'/api/v1/institutions/'+tenant+'/student-links/claim';
async function post(path:string,body:unknown,cookie='',origin=base){return fetch(base+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual'});}
const claim=(actor:Actor,student:Student,tenant=unit,origin=base)=>post(claimPath(tenant),{enrollmentNumber:student.number},actor.cookie,origin);
async function institution(){return (await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic claim tenant',$1) RETURNING id",['CLAIM-'+randomUUID()])).rows[0].id as string;}
async function actor(options:{tenant?:string;email?:string|null;role?:string;membership?:boolean;mfa?:boolean}={}):Promise<Actor>{
 const email=options.email===undefined?'claim-'+randomUUID()+'@example.test':options.email,tenant=options.tenant??unit;
 const person=(await sql.query("INSERT INTO people(first_name,last_name,email) VALUES('Synthetic','Claim owner',$1) RETURNING id",[email])).rows[0].id;
 const id=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,'claim-'+randomUUID(),passwordHash])).rows[0].id;
 let member:string|null=null;
 if(options.membership!==false){member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,id])).rows[0].id;await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,options.role??'student']);}
 if(options.mfa)await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[id,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',id)]);
 const raw=randomBytes(32).toString('base64url'),session=(await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at,step_up_at) VALUES($1,$2,now()+interval '1 hour',$3,$3) RETURNING id",[id,createHash('sha256').update(raw).digest('hex'),options.mfa?new Date():null])).rows[0].id;
 return {id,person,member,session,email,cookie:(process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_session':'siii_session')+'='+raw};
}
async function student(email:string|null,tenant=unit):Promise<Student>{
 const ownProgram=tenant===unit?program:(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Synthetic claim program','ingenieria','presencial') RETURNING id",[tenant,'CLAIM-'+randomUUID()])).rows[0].id;
 const number='CL-'+randomUUID(),id=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name,institutional_email) VALUES($1,$2,$3,'Synthetic','Claim student',$4) RETURNING id",[tenant,ownProgram,number,email])).rows[0].id;
 return {id,number};
}
/** Proof is established by the real issuer/consent/login endpoints, never a verified flag. */
async function verifiedActor(proofTenant=unit):Promise<Actor>{
 const issuer=await actor({tenant:proofTenant,role:'admin',mfa:true}),email='verified-claim-'+randomUUID()+'@example.test';
 const issued=await post('/api/v1/institutions/'+proofTenant+'/invitations',{email,role:'student'},issuer.cookie);expect(issued.status).toBe(201);
 const invitation=(await issued.json()).data,event=(await sql.query('SELECT id,payload_encrypted FROM invitation_delivery_outbox WHERE invitation_id=$1',[invitation.id])).rows[0];
 const message=openInvitationDelivery(event.payload_encrypted,event.id,proofTenant),link=new URL(message.text.match(/https:\/\/[^\s]+/)![0]),fragment=new URLSearchParams(link.hash.slice(1));
 const username='verified-claim-'+randomUUID();
 const accepted=await post('/api/v1/invitations/accept',{invitationId:invitation.id,token:fragment.get('token'),consent:true,mode:'new',account:{username,password,firstName:'Synthetic',lastName:'Verified owner'}});expect(accepted.status).toBe(200);
 const user=(await sql.query('SELECT id,person_id FROM platform_users WHERE username=$1',[username])).rows[0];
 expect((await sql.query('SELECT verified_email,proof_invitation_id FROM account_email_verifications WHERE user_id=$1',[user.id])).rows[0]).toEqual({verified_email:email,proof_invitation_id:invitation.id});
 let member=(await accepted.json()).data.membershipId;
 if(proofTenant!==unit){member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[unit,user.id])).rows[0].id;await sql.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'student')",[member]);}
 const login=await post('/api/v1/auth/login',{username,password});expect(login.status).toBe(200);const cookie=fixtureCookie(login);expect(cookie).toBeTruthy();
 const session=(await sql.query('SELECT id FROM auth_sessions WHERE token_hash=$1',[createHash('sha256').update(cookie.split('=')[1]).digest('hex')])).rows[0].id;
 return {id:user.id,person:user.person_id,member,session,cookie,email};
}
async function counts(){return (await sql.query('SELECT (SELECT count(*)::int FROM student_account_links WHERE institution_id=$1) links,(SELECT count(*)::int FROM student_claim_requests WHERE institution_id=$1) claims',[unit])).rows[0];}
async function auditTrigger(action:string,statement:string){
 const name='claim_audit_'+randomUUID().replaceAll('-','');
 await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action="+pg.escapeLiteral(action)+' THEN '+statement+' END IF; RETURN NEW; END $$');
 await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
 return async()=>{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');};
}
async function waitBlocked(pid:number){const end=Date.now()+7000;while(Date.now()<end){if((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) blocked",[pid])).rows[0].blocked)return true;await new Promise(resolve=>setTimeout(resolve,25));}return false;}
async function assertAudit(response:Response,body:{data:{link?:{id:string};claim?:{id:string}}},owner:Actor,kind:'auto'|'pending'){
 const resource=kind==='auto'?'student_account_link:'+body.data.link!.id:'student_claim:'+body.data.claim!.id;
 const rows=(await sql.query('SELECT actor_user_id,institution_id,request_id,target,details FROM security_audit_log WHERE action=$1 AND target=$2',[actions[kind],resource])).rows;
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({actor_user_id:owner.id,institution_id:unit,target:resource,request_id:response.headers.get('x-request-id')});expect(rows[0].details).toHaveProperty('after');
 expect(JSON.stringify(rows[0].details)).not.toContain(owner.cookie.split('=')[1]);
}

describe.sequential('student claim authority through real HTTP, mailbox proof and PostgreSQL',()=>{
 beforeAll(async()=>{await sql.connect();passwordHash=await hashPassword(password);});afterAll(async()=>{await sql.end();});
 beforeEach(async()=>{
  await sql.query('DELETE FROM auth_throttle');unit=await institution();foreign=await institution();
  program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'CLAIM','Synthetic claim program','ingenieria','presencial') RETURNING id",[unit])).rows[0].id;
 });
 it('preserves401 without a session and400 for an invalid or malformed enrollment body',async()=>{
  expect((await post(claimPath(),{enrollmentNumber:'CL-UNKNOWN'})).status).toBe(401);
  const owner=await actor();expect((await post(claimPath(),{},owner.cookie)).status).toBe(400);
  const malformed=await fetch(base+claimPath(),{method:'POST',headers:{origin:base,cookie:owner.cookie,'content-type':'application/json'},body:'{'});expect(malformed.status).toBe(400);expect(await counts()).toEqual({links:0,claims:0});
 });
 it.each(['missing-membership','suspended-membership','inactive-institution','mandatory-password','admin-without-mfa'])('denies %s before writing either branch',async(kind)=>{
  const owner=await actor({membership:kind!=='missing-membership',role:kind==='admin-without-mfa'?'admin':'student'}),record=await student(owner.email);
  if(kind==='suspended-membership')await sql.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[owner.member]);
  if(kind==='inactive-institution')await sql.query("UPDATE institutions SET status='inactive' WHERE id=$1",[unit]);
  if(kind==='mandatory-password')await sql.query('UPDATE platform_users SET must_change_password=true WHERE id=$1',[owner.id]);
  const response=await claim(owner,record);expect(response.status).toBe(403);expect((await response.json()).error.code).toBe('FORBIDDEN');expect(await counts()).toEqual({links:0,claims:0});
 });
 it('preserves404 for absent or foreign enrollment without exposing another tenant',async()=>{
  const owner=await actor(),foreignRecord=await student(owner.email,foreign);
  for(const record of [foreignRecord,{id:randomUUID(),number:'CL-MISSING'}]){const response=await claim(owner,record);expect(response.status).toBe(404);expect((await response.json()).error.code).toBe('STUDENT_NOT_FOUND');}
  expect(await counts()).toEqual({links:0,claims:0});
 });
 it('does not auto-link matching unverified email text, and accepts a non-MFA student pending request',async()=>{
  const owner=await actor(),record=await student(owner.email),response=await claim(owner,record);expect(response.status).toBe(201);
  const body=await response.json();expect(body.data).toMatchObject({autoApproved:false,claim:{institutionId:unit,applicantUserId:owner.id,enrollmentNumber:record.number,verificationStatus:'pending'}});expect(body.data).not.toHaveProperty('link');expect(await counts()).toEqual({links:0,claims:1});
 });
 it.each(['another-user-proof','old-current-email','null-current-email'])('falls back to pending when mailbox proof is %s',async(kind)=>{
  const proved=await verifiedActor();let owner=proved;
  if(kind==='another-user-proof')owner=await actor({email:proved.email});
  if(kind==='old-current-email')await sql.query('UPDATE people SET email=$1 WHERE id=$2',['changed-'+randomUUID()+'@example.test',owner.person]);
  if(kind==='null-current-email')await sql.query('UPDATE people SET email=NULL WHERE id=$1',[owner.person]);
  const record=await student(proved.email),response=await claim(owner,record);expect(response.status).toBe(201);expect((await response.json()).data).toMatchObject({autoApproved:false,claim:{verificationStatus:'pending'}});expect(await counts()).toEqual({links:0,claims:1});
 });
 it.each(['own-invitation','foreign-invitation'])('auto-links only genuine triple-email proof from %s without requiring student MFA',async(kind)=>{
  const owner=await verifiedActor(kind==='foreign-invitation'?foreign:unit),record=await student(owner.email),response=await claim(owner,record);expect(response.status).toBe(201);
  const body=await response.json();expect(body.data).toMatchObject({autoApproved:true,link:{institutionId:unit,membershipId:owner.member,studentId:record.id,linkedBy:owner.id,revokedAt:null}});expect(body.data).not.toHaveProperty('claim');expect(await counts()).toEqual({links:1,claims:0});
 });
 it('canonicalizes all three trusted email values before choosing auto-link',async()=>{
  const owner=await verifiedActor(),record=await student(' '+owner.email!.toUpperCase()+' ');await sql.query('UPDATE people SET email=$1 WHERE id=$2',[' '+owner.email!.toUpperCase()+' ',owner.person]);
  const response=await claim(owner,record);expect(response.status).toBe(201);expect((await response.json()).data.autoApproved).toBe(true);
 });
 it.each(['student','member'])('returns409 for an existing active %s link instead of a uniqueness500',async(kind)=>{
  const owner=await actor(),record=await student(owner.email),other=await actor(),otherRecord=await student(owner.email);
  await sql.query('INSERT INTO student_account_links(institution_id,membership_id,student_id,linked_by) VALUES($1,$2,$3,$4)',[unit,kind==='student'?other.member:owner.member,kind==='student'?record.id:otherRecord.id,other.id]);
  const response=await claim(owner,record);expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('ALREADY_LINKED');expect(await counts()).toEqual({links:1,claims:0});
 });
 for(const kind of ['auto','pending'] as const){
  const fixture=async()=>{const owner=kind==='auto'?await verifiedActor():await actor();return {owner,record:await student(kind==='auto'?owner.email:'different-'+randomUUID()+'@example.test')};};
  it(kind+': denies cross-origin mutation without inserting data',async()=>{const {owner,record}=await fixture();expect((await claim(owner,record,unit,'https://attacker.example')).status).toBe(403);expect(await counts()).toEqual({links:0,claims:0});});
  it(kind+': persists a request-correlated audit with the original success payload',async()=>{const {owner,record}=await fixture(),response=await claim(owner,record);expect(response.status).toBe(201);const body=await response.json();expect(body.data.autoApproved).toBe(kind==='auto');await assertAudit(response,body,owner,kind);});
  it(kind+': rolls back its row if audit insertion fails',async()=>{
   const {owner,record}=await fixture(),cleanup=await auditTrigger(actions[kind],"RAISE EXCEPTION 'synthetic claim audit failure';");
   try{const response=await claim(owner,record);expect(response.status).toBe(500);expect((await response.json()).error.code).toBe('CLAIM_FAILED');expect(await counts()).toEqual({links:0,claims:0});}finally{await cleanup();}
  });
  it(kind+': denies a grant revoked while waiting on the institution mutex',async()=>{
   const {owner,record}=await fixture();expect((await post(claimPath(),{},owner.cookie)).status).toBe(400);
   const gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[unit]);
   const pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=claim(owner,record);
   try{expect(await waitBlocked(pid)).toBe(true);await sql.query('UPDATE role_assignments SET revoked_at=clock_timestamp() WHERE membership_id=$1',[owner.member]);await gate.query('COMMIT');expect((await pending).status).toBe(403);expect(await counts()).toEqual({links:0,claims:0});}finally{await gate.query('ROLLBACK');await gate.end();await pending;}
  });
  it(kind+': rolls back when session expiry advances during audit insertion',async()=>{
   const {owner,record}=await fixture();expect((await post(claimPath(),{},owner.cookie)).status).toBe(400);const cleanup=await auditTrigger(actions[kind],'PERFORM pg_sleep(3);');
   try{await sql.query("UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1",[owner.session]);expect((await claim(owner,record)).status).toBe(403);expect(await counts()).toEqual({links:0,claims:0});expect((await sql.query('SELECT count(*)::int n FROM security_audit_log WHERE action=$1 AND institution_id=$2',[actions[kind],unit])).rows[0].n).toBe(0);}finally{await cleanup();}
  });
 }
 it('rolls back link and audit if a grant is revoked after the write reaches its audit',async()=>{
  const owner=await verifiedActor(),record=await student(owner.email),gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();const key=Math.floor(Math.random()*2000000000);await gate.query('SELECT pg_advisory_lock($1)',[key]);
  const cleanup=await auditTrigger(actions.auto,'PERFORM pg_advisory_xact_lock('+key+');'),pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=claim(owner,record);
  try{expect(await waitBlocked(pid)).toBe(true);await sql.query('UPDATE role_assignments SET revoked_at=clock_timestamp() WHERE membership_id=$1',[owner.member]);await gate.query('SELECT pg_advisory_unlock($1)',[key]);expect((await pending).status).toBe(403);expect(await counts()).toEqual({links:0,claims:0});expect((await sql.query('SELECT count(*)::int n FROM security_audit_log WHERE action=$1 AND institution_id=$2',[actions.auto,unit])).rows[0].n).toBe(0);}finally{await gate.query('SELECT pg_advisory_unlock($1)',[key]);await gate.end();await pending;await cleanup();}
 });
 it('serializes two actors claiming one student without linking the unproved actor or returning500',async()=>{
  const proved=await verifiedActor(),unproved=await actor({email:proved.email}),record=await student(proved.email),responses=await Promise.all([claim(proved,record),claim(unproved,record)]);
  for(const response of responses)expect([201,409]).toContain(response.status);
  const links=(await sql.query('SELECT membership_id,student_id FROM student_account_links WHERE institution_id=$1 AND revoked_at IS NULL',[unit])).rows;expect(links).toEqual([{membership_id:proved.member,student_id:record.id}]);
  if(responses[1].status===201)expect((await responses[1].json()).data.autoApproved).toBe(false);
 });
 it('serializes one actor claiming two students into one201 and one409 without duplicate active links',async()=>{
  const owner=await verifiedActor(),records=[await student(owner.email),await student(owner.email)],responses=await Promise.all(records.map(record=>claim(owner,record)));
  expect(responses.map(response=>response.status).sort()).toEqual([201,409]);expect((await sql.query('SELECT count(*)::int n FROM student_account_links WHERE membership_id=$1 AND revoked_at IS NULL',[owner.member])).rows[0].n).toBe(1);
 });
});
