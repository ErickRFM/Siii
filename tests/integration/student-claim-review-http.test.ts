import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {hashPassword} from '@/shared/auth/password';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';

const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const password='Synthetic-claim-review-2026!';
type Actor={id:string;member:string|null;cookie:string};
let unit:string,foreign:string,program:string,passwordHash:string;

async function request(method:string,path:string,body:unknown,cookie='',origin=base){
 return fetch(base+path,{method,headers:{origin,cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
}
const listPath=(tenant=unit)=>`/api/v1/institutions/${tenant}/student-links/claims`;
const decide=(claim:string,body:unknown,who:Actor,tenant=unit,origin=base)=>request('PATCH',`${listPath(tenant)}/${claim}`,body,who.cookie,origin);
async function institution(){return (await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic review tenant',$1) RETURNING id",['REV-'+randomUUID()])).rows[0].id as string;}
async function actor(options:{tenant?:string;role?:string;mfa?:boolean;email?:string}={}):Promise<Actor>{
 const tenant=options.tenant??unit,email=options.email??'review-'+randomUUID()+'@example.test';
 const person=(await sql.query("INSERT INTO people(first_name,last_name,email) VALUES('Synthetic','Reviewer',$1) RETURNING id",[email])).rows[0].id;
 const id=(await sql.query('INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,$3) RETURNING id',[person,'review-'+randomUUID(),passwordHash])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,id])).rows[0].id;
 await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,options.role??'student']);
 if(options.mfa)await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[id,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',id)]);
 const raw=randomBytes(32).toString('base64url');
 await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at,step_up_at) VALUES($1,$2,now()+interval '1 hour',$3,$3)",[id,createHash('sha256').update(raw).digest('hex'),options.mfa?new Date():null]);
 return {id,member,cookie:(process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_session':'siii_session')+'='+raw};
}
const admin=(tenant=unit)=>actor({tenant,role:'admin',mfa:true});
async function student(options:{email?:string|null;status?:string;tenant?:string}={}){
 const number='RV-'+randomUUID();
 const id=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name,institutional_email,status) VALUES($1,$2,$3,'Synthetic','Record',$4,$5) RETURNING id",
  [options.tenant??unit,program,number,options.email===undefined?'record-'+randomUUID()+'@example.test':options.email,options.status??'active'])).rows[0].id as string;
 return {id,number};
}
/** A pending claim exactly as the claim endpoint leaves it when the mailbox evidence does not match. */
async function pendingClaim(applicant:Actor,enrollmentNumber:string,tenant=unit){
 const response=await request('POST',`/api/v1/institutions/${tenant}/student-links/claim`,{enrollmentNumber},applicant.cookie);
 expect(response.status).toBe(201);const body=await response.json();expect(body.data.autoApproved).toBe(false);
 return body.data.claim.id as string;
}
const claimRow=async(id:string)=>(await sql.query('SELECT verification_status,reviewed_by,rejection_reason FROM student_claim_requests WHERE id=$1',[id])).rows[0];
const links=async(studentId:string)=>(await sql.query('SELECT membership_id,linked_by FROM student_account_links WHERE student_id=$1 AND revoked_at IS NULL',[studentId])).rows;
const audits=async(action:string,claim:string)=>(await sql.query('SELECT actor_user_id FROM security_audit_log WHERE action=$1 AND target=$2',[action,'student_claim:'+claim])).rows;

describe('student claim review',()=>{
 beforeAll(async()=>{await sql.connect();passwordHash=await hashPassword(password);});afterAll(async()=>{await sql.end();});
 beforeEach(async()=>{
  await sql.query('DELETE FROM auth_throttle');unit=await institution();foreign=await institution();
  program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'REV','Synthetic review program','ingenieria','presencial') RETURNING id",[unit])).rows[0].id;
 });

 it('lists pending claims with comparison evidence only for membership managers',async()=>{
  const owner=await actor(),record=await student(),claim=await pendingClaim(owner,record.number);
  const reviewer=await admin(),listed=await request('GET',listPath(),undefined,reviewer.cookie);
  expect(listed.status).toBe(200);
  const item=(await listed.json()).data.find((row:{id:string})=>row.id===claim);
  expect(item).toMatchObject({enrollmentNumber:record.number,applicant:{userId:owner.id},student:{id:record.id,status:'active'},evidence:{verifiedMatchesRecord:false,profileMatchesRecord:false}});
  for(const role of ['control_escolar','coordinator','student'])expect((await request('GET',listPath(),undefined,(await actor({role,mfa:true})).cookie)).status,role).toBe(403);
  expect((await request('GET',listPath(foreign),undefined,reviewer.cookie)).status).toBe(403);
  expect((await request('GET',listPath(),undefined,(await actor({role:'admin',mfa:false})).cookie)).status).toBe(403);
 });

 it('approval links the record once, records the reviewer and audits',async()=>{
  const owner=await actor(),record=await student(),claim=await pendingClaim(owner,record.number),reviewer=await admin();
  const approved=await decide(claim,{decision:'approve'},reviewer);expect(approved.status).toBe(200);
  expect((await approved.json()).data).toMatchObject({claimId:claim,verificationStatus:'approved'});
  expect(await links(record.id)).toEqual([{membership_id:owner.member,linked_by:reviewer.id}]);
  expect(await claimRow(claim)).toEqual({verification_status:'approved',reviewed_by:reviewer.id,rejection_reason:null});
  expect(await audits('student.claim.approved',claim)).toEqual([{actor_user_id:reviewer.id}]);
  const again=await decide(claim,{decision:'approve'},reviewer);expect(again.status).toBe(404);
  expect(await links(record.id)).toHaveLength(1);
 });

 it('rejection requires a reason and never creates a link',async()=>{
  const owner=await actor(),record=await student(),claim=await pendingClaim(owner,record.number),reviewer=await admin();
  for(const body of [{decision:'reject'},{decision:'reject',reason:'  '},{decision:'reject',reason:'x'.repeat(501)},{decision:'other'},{decision:'approve',extra:true}])
   expect((await decide(claim,body,reviewer)).status,JSON.stringify(body).slice(0,40)).toBe(422);
  const rejected=await decide(claim,{decision:'reject',reason:'Matrícula de otra persona'},reviewer);expect(rejected.status).toBe(200);
  expect(await claimRow(claim)).toEqual({verification_status:'rejected',reviewed_by:reviewer.id,rejection_reason:'Matrícula de otra persona'});
  expect(await links(record.id)).toEqual([]);
  expect(await audits('student.claim.rejected',claim)).toEqual([{actor_user_id:reviewer.id}]);
  expect((await decide(claim,{decision:'approve'},reviewer)).status).toBe(404);
 });

 it('fails closed for self review, foreign tenants, cross-origin and unprivileged sessions',async()=>{
  const reviewer=await admin(),record=await student(),own=await pendingClaim(reviewer,record.number);
  expect((await decide(own,{decision:'approve'},reviewer)).status).toBe(403);
  expect((await claimRow(own)).verification_status).toBe('pending');
  const outsider=await admin(foreign);
  expect((await decide(own,{decision:'approve'},outsider,foreign)).status).toBe(404);
  expect((await decide(own,{decision:'approve'},outsider)).status).toBe(403);
  const other=await admin();
  expect((await decide(own,{decision:'approve'},other,unit,'https://attacker.example')).status).toBe(403);
  expect((await decide(own,{decision:'approve'},await actor({role:'control_escolar',mfa:true}))).status).toBe(403);
  expect((await decide(own,{decision:'approve'},await actor({role:'admin',mfa:false}))).status).toBe(403);
  expect(await links(record.id)).toEqual([]);
  expect((await claimRow(own)).verification_status).toBe('pending');
 });

 it('keeps the claim pending when the record is linked, inactive or the applicant left',async()=>{
  const reviewer=await admin();
  const taken=await student(),first=await actor(),second=await actor();
  const firstClaim=await pendingClaim(first,taken.number),secondClaim=await pendingClaim(second,taken.number);
  expect((await decide(firstClaim,{decision:'approve'},reviewer)).status).toBe(200);
  const conflict=await decide(secondClaim,{decision:'approve'},reviewer);expect(conflict.status).toBe(409);
  expect((await conflict.json()).error.code).toBe('ALREADY_LINKED');
  expect((await claimRow(secondClaim)).verification_status).toBe('pending');

  const withdrawn=await student({status:'withdrawn'}),applicant=await actor(),inactiveClaim=await pendingClaim(applicant,withdrawn.number);
  const inactive=await decide(inactiveClaim,{decision:'approve'},reviewer);expect(inactive.status).toBe(422);
  expect((await inactive.json()).error.code).toBe('STUDENT_NOT_ACTIVE');

  const record=await student(),leaver=await actor(),leaverClaim=await pendingClaim(leaver,record.number);
  await sql.query("UPDATE institution_memberships SET status='suspended' WHERE id=$1",[leaver.member]);
  const left=await decide(leaverClaim,{decision:'approve'},reviewer);expect(left.status).toBe(422);
  expect((await left.json()).error.code).toBe('APPLICANT_MEMBERSHIP_INACTIVE');
  expect(await links(record.id)).toEqual([]);
 });

 it('reports the student own claim lifecycle through student-links/me',async()=>{
  const owner=await actor(),record=await student(),reviewer=await admin();
  const mePath=()=>'/api/v1/institutions/'+unit+'/student-links/me';
  const me=async(who=owner)=>{const response=await request('GET',mePath(),undefined,who.cookie);expect(response.status).toBe(200);return (await response.json()).data;};
  expect((await me()).claim).toBeNull();
  const first=await pendingClaim(owner,record.number);
  expect((await me()).claim).toMatchObject({id:first,enrollmentNumber:record.number,status:'pending',rejectionReason:null});
  expect((await decide(first,{decision:'reject',reason:'Corrige la matrícula'},reviewer)).status).toBe(200);
  expect((await me()).claim).toMatchObject({id:first,status:'rejected',rejectionReason:'Corrige la matrícula'});
  const second=await pendingClaim(owner,record.number);
  expect((await me()).claim).toMatchObject({id:second,status:'pending'});
  expect((await decide(second,{decision:'approve'},reviewer)).status).toBe(200);
  const linked=await me();expect(linked.studentRecord).toMatchObject({studentId:record.id,enrollmentNumber:record.number});expect(linked.claim).toBeNull();
  expect((await me(await actor())).claim).toBeNull();
 });
 it('serializes concurrent approvals of the same claim into a single link',async()=>{
  const owner=await actor(),record=await student(),claim=await pendingClaim(owner,record.number),reviewer=await admin();
  const results=await Promise.all([decide(claim,{decision:'approve'},reviewer),decide(claim,{decision:'approve'},reviewer)]);
  expect(results.map(response=>response.status).sort()).toEqual([200,404]);
  expect(await links(record.id)).toHaveLength(1);
  expect(await audits('student.claim.approved',claim)).toHaveLength(1);
 });
});
