import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';

const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
const kinds=['cycle','decision'] as const;
type Kind=typeof kinds[number];
async function offer(){
 const institution=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic admissions authority',$1) RETURNING id",['AWA-'+randomUUID()])).rows[0].id;
 const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'AWA','Synthetic program','ingenieria','presencial') RETURNING id",[institution])).rows[0].id;
 const cycle=(await sql.query("INSERT INTO admission_cycles(institution_id,code,name,start_date,end_date,status) VALUES($1,'AWA','Synthetic cycle',now()-interval '1 day',now()+interval '1 day','open') RETURNING id",[institution])).rows[0].id;
 const applicant=(await sql.query("INSERT INTO applicant_profiles(email,first_name,last_name,password_hash) VALUES($1,'Synthetic','Applicant','unused') RETURNING id",['awa-'+randomUUID()+'@example.test'])).rows[0].id;
 const application=(await sql.query("INSERT INTO admission_applications(institution_id,cycle_id,program_id,applicant_id,application_number,status) VALUES($1,$2,$3,$4,$5,'submitted') RETURNING id",[institution,cycle,program,applicant,'AWA-'+randomUUID()])).rows[0].id;
 return {institution,program,application};
}
type Offer=Awaited<ReturnType<typeof offer>>;
async function actor(o:Offer,role='admin',mfa=true,scoped=false){
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Operator') RETURNING id")).rows[0].id;
 const user=(await sql.query("INSERT INTO platform_users(person_id,username,password_hash) VALUES($1,$2,'unused') RETURNING id",[person,'awa-'+randomUUID()])).rows[0].id;
 const membership=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[o.institution,user])).rows[0].id;
 const grant=(await sql.query('INSERT INTO role_assignments(institution_id,membership_id,role,scope_type,scope_program_id) VALUES($1,$2,$3,$4,$5) RETURNING id',[o.institution,membership,role,scoped?'program':'institution',scoped?o.program:null])).rows[0].id;
 if(mfa)await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[user,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',user)]);
 const raw=randomBytes(32).toString('base64url');
 const session=(await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',$3) RETURNING id",[user,createHash('sha256').update(raw).digest('hex'),mfa?new Date():null])).rows[0].id;
 return {user,grant,session,membership,cookie:(process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_session':'siii_session')+'='+raw};
}
function path(kind:Kind,o:Offer){return '/api/v1/institutions/'+o.institution+'/admissions/'+(kind==='cycle'?'cycles':'applications/'+o.application+'/decision');}
function body(kind:Kind){return kind==='cycle'?{code:'NEW-'+randomUUID().slice(0,8),name:'Synthetic new cycle',startDate:'2026-01-01T00:00:00.000Z',endDate:'2027-01-01T00:00:00.000Z',status:'open'}:{decision:'admitted',reason:'Synthetic acceptance decision'};}
function post(kind:Kind,o:Offer,cookie='',value:unknown=body(kind),origin=base,requestId=randomUUID()){
 return fetch(base+path(kind,o),{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-request-id':requestId},body:typeof value==='string'?value:JSON.stringify(value),redirect:'manual'});
}
async function snapshot(o:Offer){return (await sql.query("SELECT (SELECT count(*)::int FROM admission_cycles WHERE institution_id=$1) cycles,(SELECT count(*)::int FROM admission_decisions WHERE institution_id=$1) decisions,(SELECT status FROM admission_applications WHERE id=$2) status,(SELECT count(*)::int FROM security_audit_log WHERE institution_id=$1) audits",[o.institution,o.application])).rows[0];}
async function waitBlocked(pattern:string){const until=Date.now()+7000;while(Date.now()<until){if((await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND wait_event_type='Lock' AND query LIKE $1) blocked",[pattern])).rows[0].blocked)return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('EXPECTED_WRITE_LOCK_WAIT');}

describe.sequential('admissions writers: authority and audit through HTTP/PostgreSQL',()=>{
 beforeAll(async()=>{await sql.connect();});afterAll(async()=>{await sql.end();});
 for(const kind of kinds){
  describe(kind,()=>{
   it('requires institutional authentication',async()=>{const o=await offer(),before=await snapshot(o);expect((await post(kind,o)).status).toBe(401);expect(await snapshot(o)).toEqual(before);});
   it.each(['admin','control_escolar'])('permits %s with MFA and audits the same request',async role=>{
    const o=await offer(),a=await actor(o,role),requestId=randomUUID(),response=await post(kind,o,a.cookie,body(kind),base,requestId);
    expect(response.status).toBe(201);const data=(await response.json()).data;expect(data.institutionId).toBe(o.institution);
    const audits=(await sql.query('SELECT actor_user_id,request_id,target,details FROM security_audit_log WHERE institution_id=$1',[o.institution])).rows;
    expect(audits).toHaveLength(1);expect(audits[0]).toMatchObject({actor_user_id:a.user,request_id:response.headers.get('x-request-id')});expect(audits[0].request_id).not.toBe(requestId);expect(audits[0].target).toContain(kind==='cycle'?data.id:o.application);
    expect(audits[0].details).toHaveProperty('after');if(kind==='decision')expect(audits[0].details.before.status).toBe('submitted');
   });
   it.each(['missing-mfa','guest','scoped','foreign','revoked','expired'])('denies %s without writes',async scenario=>{
    const o=await offer(),a=await actor(scenario==='foreign'?await offer():o,scenario==='guest'?'guest':scenario==='scoped'?'control_escolar':'admin',scenario!=='missing-mfa',scenario==='scoped');
    if(scenario==='revoked')await sql.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',[a.session]);
    if(scenario==='expired')await sql.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[a.session]);
    const before=await snapshot(o);expect((await post(kind,o,a.cookie)).status).toBe(['revoked','expired'].includes(scenario)?401:403);expect(await snapshot(o)).toEqual(before);
   });
   it('rejects foreign origin and malformed JSON without writes',async()=>{const o=await offer(),a=await actor(o),before=await snapshot(o);expect((await post(kind,o,a.cookie,body(kind),'https://attacker.example')).status).toBe(403);expect((await post(kind,o,a.cookie,'{')).status).toBe(400);expect(await snapshot(o)).toEqual(before);});
   it('rechecks a grant revoked before the initial transaction lock',async()=>{
    const o=await offer(),a=await actor(o),gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');await gate.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[o.institution]);
    const pending=post(kind,o,a.cookie);try{await waitBlocked('%institutions%');await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[a.grant]);await gate.query('COMMIT');expect((await pending).status).toBe(403);expect(await snapshot(o)).toEqual({cycles:1,decisions:0,status:'submitted',audits:0});}finally{await gate.query('ROLLBACK');await gate.end();await pending;}
   });
   it.each(['grant','expiry'])('rolls back when final %s authority is lost during audit wait',async scenario=>{
    const o=await offer(),a=await actor(o),gate=new pg.Client({connectionString:isolatedDatabaseUrl()});
    if(scenario==='expiry')await sql.query("UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '5 seconds' WHERE id=$1",[a.session]);
    await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE security_audit_log IN ACCESS EXCLUSIVE MODE');
    const pending=post(kind,o,a.cookie);try{await waitBlocked('%security_audit_log%');if(scenario==='grant')await sql.query('UPDATE role_assignments SET revoked_at=now() WHERE id=$1',[a.grant]);else await sql.query('SELECT pg_sleep(greatest(0,extract(epoch FROM (expires_at-clock_timestamp())))+0.1) FROM auth_sessions WHERE id=$1',[a.session]);await gate.query('COMMIT');expect((await pending).status).toBe(403);expect(await snapshot(o)).toEqual({cycles:1,decisions:0,status:'submitted',audits:0});}finally{await gate.query('ROLLBACK');await gate.end();await pending;}
   });
   it('rolls back resource changes on audit failure and preserves operation error',async()=>{
    const o=await offer(),a=await actor(o),name='awa_'+randomUUID().replaceAll('-','');
    await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.institution_id='"+o.institution+"'::uuid THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
    try{const response=await post(kind,o,a.cookie);expect(response.status).toBe(500);expect((await response.json()).error.code).toBe(kind==='cycle'?'CYCLE_CREATE_FAILED':'DECISION_FAILED');expect(await snapshot(o)).toEqual({cycles:1,decisions:0,status:'submitted',audits:0});}finally{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');}
   });
  });
 }
 it('denies missing and foreign-tenant applications before writing a decision',async()=>{const o=await offer(),other=await offer(),a=await actor(o),before=await snapshot(o);for(const application of [randomUUID(),other.application])expect((await post('decision',{...o,application},a.cookie)).status).toBe(404);expect(await snapshot(o)).toEqual(before);});
 it('serializes two decisions and records both before/after transitions',async()=>{
  const o=await offer(),a=await actor(o),results=await Promise.all(['admitted','rejected'].map(decision=>post('decision',o,a.cookie,{decision,reason:'Synthetic concurrent '+decision})));
  expect(results.map(r=>r.status)).toEqual([201,201]);expect((await sql.query('SELECT count(*)::int n FROM admission_decisions WHERE application_id=$1',[o.application])).rows[0].n).toBe(2);
  const audits=(await sql.query('SELECT details FROM security_audit_log WHERE institution_id=$1 ORDER BY created_at,id',[o.institution])).rows;
  expect(audits).toHaveLength(2);const first=audits.find(row=>row.details.before.status==='submitted'),second=audits.find(row=>row!==first);expect(first).toBeDefined();expect(second!.details.before.status).toBe(first!.details.after.status);expect((await snapshot(o)).status).toBe(second!.details.after.status);
 });
});
