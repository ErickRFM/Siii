import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {isolatedDatabaseUrl} from '../support/database-url';
import {sealMfaSecret} from '@/shared/auth/mfa-primitives';

const base='http://127.0.0.1:'+(process.env.SIII_TEST_PORT||3107);
const sql=new pg.Client({connectionString:isolatedDatabaseUrl()});
type Actor={id:string;member:string;session:string;cookie:string};
let institution:string,foreign:string,fee:string,foreignFee:string,student:string,foreignStudent:string,admin:Actor;
const path=(kind:'orders'|'fee-types',tenant=institution)=>'/api/v1/institutions/'+tenant+'/financials/'+kind;
const feeBody=()=>({code:'F'+randomUUID().slice(0,12),name:'Synthetic financial fee',defaultAmountCents:15000});
const orderBody=()=>({feeTypeId:fee,payerStudentId:student,totalAmountCents:15000});
async function post(kind:'orders'|'fee-types',body:unknown,cookie=admin.cookie,origin=base){
 return fetch(base+path(kind),{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)});
}
async function actor(tenant=institution,role='admin',mfa=true):Promise<Actor>{
 const person=(await sql.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Financial operator') RETURNING id")).rows[0].id;
 const id=(await sql.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,'finance-'+randomUUID()])).rows[0].id;
 const member=(await sql.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[tenant,id])).rows[0].id;
 await sql.query('INSERT INTO role_assignments(membership_id,role) VALUES($1,$2)',[member,role]);
 if(mfa)await sql.query("INSERT INTO auth_mfa_factors(user_id,secret_encrypted,enabled_at) VALUES($1,$2,now()-interval '1 minute')",[id,sealMfaSecret('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',id)]);
 const raw=randomBytes(32).toString('base64url');
 const session=(await sql.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',$3) RETURNING id",[id,createHash('sha256').update(raw).digest('hex'),mfa?new Date():null])).rows[0].id;
 return {id,member,session,cookie:(process.env.SIII_HTTP_TEST_PRODUCTION==='1'?'__Host-siii_session':'siii_session')+'='+raw};
}
async function count(kind:'orders'|'fee-types'){
 const table=kind==='orders'?'payment_orders':'financial_fee_types';
 return Number((await sql.query('SELECT count(*)::int n FROM '+table+' WHERE institution_id=$1',[institution])).rows[0].n);
}
async function hasWait(pid:number){
 return (await sql.query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND application_name='siii-app' AND $1::int=ANY(pg_blocking_pids(pid))) blocked",[pid])).rows[0].blocked;
}
async function waitBlocked(pid:number){
 const until=Date.now()+7000;while(Date.now()<until){if(await hasWait(pid))return true;await new Promise(resolve=>setTimeout(resolve,25));}return false;
}
const actions={'fee-types':'financial.fee_type.create',orders:'financial.order.create'} as const;
async function auditTrigger(kind:'orders'|'fee-types',body:string){
 const name='financial_audit_'+randomUUID().replaceAll('-','');
 await sql.query('CREATE FUNCTION '+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='"+actions[kind]+"' THEN "+body+' END IF; RETURN NEW; END $$');
 await sql.query('CREATE TRIGGER '+name+' BEFORE INSERT ON security_audit_log FOR EACH ROW EXECUTE FUNCTION '+name+'()');
 return async()=>{await sql.query('DROP TRIGGER '+name+' ON security_audit_log');await sql.query('DROP FUNCTION '+name+'()');};
}

describe.sequential('financial HTTP writes retain MFA, tenant references and transactional authority',()=>{
 beforeAll(async()=>{await sql.connect();});afterAll(async()=>{await sql.end();});
 beforeEach(async()=>{
  institution=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic financial tenant',$1) RETURNING id",['FW-'+randomUUID()])).rows[0].id;
  foreign=(await sql.query("INSERT INTO institutions(name,code) VALUES('Synthetic foreign tenant',$1) RETURNING id",['FW-'+randomUUID()])).rows[0].id;
  const program=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'FW','Synthetic program','ingenieria','presencial') RETURNING id",[institution])).rows[0].id;
  const otherProgram=(await sql.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'FW','Foreign program','ingenieria','presencial') RETURNING id",[foreign])).rows[0].id;
  student=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,'OWN','Own','Synthetic') RETURNING id",[institution,program])).rows[0].id;
  foreignStudent=(await sql.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name) VALUES($1,$2,'PRIVATE-FOREIGN','ForeignPrivate','Synthetic') RETURNING id",[foreign,otherProgram])).rows[0].id;
  fee=(await sql.query("INSERT INTO financial_fee_types(institution_id,code,name,default_amount_cents) VALUES($1,'FW','Own fee',15000) RETURNING id",[institution])).rows[0].id;
  foreignFee=(await sql.query("INSERT INTO financial_fee_types(institution_id,code,name,default_amount_cents) VALUES($1,'FW','Foreign fee',15000) RETURNING id",[foreign])).rows[0].id;
  admin=await actor();
 });

 for(const kind of ['fee-types','orders'] as const){
  const body=()=>kind==='orders'?orderBody():feeBody();
  it(kind+': preserves401/403 and denies an administrator without configured MFA',async()=>{
   expect((await post(kind,body(),'')).status).toBe(401);
   const noMfa=await actor(institution,'admin',false),coordinator=await actor(institution,'coordinator'),other=await actor(foreign);
   const before=await count(kind);
   for(const owner of [noMfa,coordinator,other])expect((await post(kind,body(),owner.cookie)).status).toBe(403);
   expect(await count(kind)).toBe(before);
  });
  it(kind+': rejects cross-origin mutation and malformed input before writing',async()=>{
   const before=await count(kind);
   expect((await post(kind,body(),admin.cookie,'https://attacker.example')).status).toBe(403);
   expect((await post(kind,{})).status).toBe(400);
   const malformed=await fetch(base+path(kind),{method:'POST',headers:{origin:base,cookie:admin.cookie,'content-type':'application/json'},body:'{'});
   expect(malformed.status).toBe(400);expect(await count(kind)).toBe(before);
  });
  it(kind+': permits MFA without step-up and preserves success payload, actor, resource and request',async()=>{
   const response=await post(kind,body());expect(response.status).toBe(201);
   const row=(await response.json()).data;
   expect(row).toMatchObject({institutionId:institution,...(kind==='orders'?{feeTypeId:fee,payerStudentId:student,totalAmountCents:15000,paidAmountCents:0,status:'pending'}:{name:'Synthetic financial fee',defaultAmountCents:15000,currency:'MXN',status:'active'})});
   const event=(await sql.query('SELECT actor_user_id,institution_id,request_id,target,details FROM security_audit_log WHERE action=$1 AND institution_id=$2',[actions[kind],institution])).rows[0];
   expect(event).toMatchObject({actor_user_id:admin.id,institution_id:institution,target:(kind==='orders'?'payment_order:':'financial_fee_type:')+row.id});
   expect(event.request_id).toMatch(/^[0-9a-f-]{36}$/);
   expect(event.request_id).toBe(response.headers.get('x-request-id'));
   expect(event.details).toEqual({after:kind==='orders'?{feeTypeId:fee,payerStudentId:student,payerUserId:null,totalAmountCents:15000,currency:'MXN',status:'pending'}:{code:row.code,defaultAmountCents:15000,currency:'MXN',status:'active'}});
  });
  it(kind+': rolls back the financial write if its audit cannot be persisted',async()=>{
   const before=await count(kind),cleanup=await auditTrigger(kind,"RAISE EXCEPTION 'synthetic financial audit failure';");
   try{const response=await post(kind,body());expect(response.status).toBe(500);expect((await response.json()).error.code).toBe('CREATE_FAILED');expect(await count(kind)).toBe(before);}
   finally{await cleanup();}
  });
  it(kind+': denies a grant revoked while the initial transaction waits for the institution mutex',async()=>{
   // Warm this exact route before observing database lock waits.
   expect((await post(kind,{})).status).toBe(400);
   const before=await count(kind),gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');
   await gate.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[institution]);
   const pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=post(kind,body());
   try{
    expect(await waitBlocked(pid)).toBe(true);
    await sql.query('UPDATE role_assignments SET revoked_at=clock_timestamp() WHERE membership_id=$1',[admin.member]);
    await gate.query('COMMIT');expect((await pending).status).toBe(403);expect(await count(kind)).toBe(before);
   }finally{await gate.query('ROLLBACK');await gate.end();await pending;}
  });
  it(kind+': rechecks a grant revoked after the write transaction started and rolls back its inserted row',async()=>{
   expect((await post(kind,{})).status).toBe(400);
   const before=await count(kind),gate=new pg.Client({connectionString:isolatedDatabaseUrl()});await gate.connect();await gate.query('BEGIN');
   await gate.query('LOCK TABLE '+(kind==='orders'?'payment_orders':'financial_fee_types')+' IN ACCESS EXCLUSIVE MODE');
   const pid=(await gate.query('SELECT pg_backend_pid() pid')).rows[0].pid,pending=post(kind,body());
   try{
    expect(await waitBlocked(pid)).toBe(true);
    await sql.query('UPDATE role_assignments SET revoked_at=clock_timestamp() WHERE membership_id=$1',[admin.member]);
    await gate.query('COMMIT');expect((await pending).status).toBe(403);expect(await count(kind)).toBe(before);
    expect((await sql.query('SELECT count(*)::int n FROM security_audit_log WHERE action=$1 AND institution_id=$2',[actions[kind],institution])).rows[0].n).toBe(0);
   }finally{await gate.query('ROLLBACK');await gate.end();await pending;}
  });
  it(kind+': rolls back when session expiry advances during its audit insert',async()=>{
   expect((await post(kind,{})).status).toBe(400);
   const before=await count(kind),cleanup=await auditTrigger(kind,'PERFORM pg_sleep(3);');
   try{
    await sql.query("UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1",[admin.session]);
    expect((await post(kind,body())).status).toBe(403);expect(await count(kind)).toBe(before);
    expect((await sql.query('SELECT count(*)::int n FROM security_audit_log WHERE action=$1 AND institution_id=$2',[actions[kind],institution])).rows[0].n).toBe(0);
   }finally{await cleanup();}
  });
 }

 it.each(['foreign student','missing student','foreign fee','missing fee','foreign user','missing user'])('orders: rejects %s with400 without disclosing existence or writing',async(kind)=>{
  const other=await actor(foreign),before=await count('orders');
  const fields=kind.endsWith('student')?{payerStudentId:kind.startsWith('foreign')?foreignStudent:randomUUID()}:kind.endsWith('fee')?{feeTypeId:kind.startsWith('foreign')?foreignFee:randomUUID()}:{payerUserId:kind.startsWith('foreign')?other.id:randomUUID()};
  const response=await post('orders',{...orderBody(),...fields});expect(response.status).toBe(400);expect((await response.json()).error.code).toBe('INVALID_INPUT');
  expect(await count('orders')).toBe(before);
 });
 it('orders: accepts own payer membership and graduated students without adding academic eligibility rules',async()=>{
  await sql.query("UPDATE institutional_students SET status='graduated' WHERE id=$1",[student]);
  const response=await post('orders',{...orderBody(),payerUserId:admin.id});expect(response.status).toBe(201);expect((await response.json()).data.payerUserId).toBe(admin.id);
 });
 it('orders: never joins a historical cross-tenant payer to another institution student names or enrollment',async()=>{
  // Existing single-column FK permits this legacy corrupt row until the later DB constraint migration.
  const id=(await sql.query("INSERT INTO payment_orders(institution_id,fee_type_id,payer_student_id,order_number,total_amount_cents) VALUES($1,$2,$3,$4,15000) RETURNING id",[institution,fee,foreignStudent,'LEGACY-'+randomUUID()])).rows[0].id;
  const response=await fetch(base+path('orders'),{headers:{cookie:admin.cookie}});expect(response.status).toBe(200);
  const row=(await response.json()).data.find((value:{id:string})=>value.id===id);
  expect(row).toMatchObject({id,studentFirstName:null,studentLastName:null,enrollmentNumber:null});
 });
});
