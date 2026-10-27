import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {seedFinancialBaseline24} from '../support/financial-tenant-database';
import {isolatedDatabaseUrl} from '../support/database-url';

const source=isolatedDatabaseUrl(),admin=new pg.Client({connectionString:source});
const prefix='siii_financial_fk_'+randomUUID().replaceAll('-','').slice(0,10);
const created:{name:string;url:string;client:pg.Client}[]=[];
const migrationTimes=(JSON.parse(readFileSync(new URL('../../db/migrations/meta/_journal.json',import.meta.url),'utf8')) as {entries:{when:number}[]}).entries.map(entry=>entry.when);
const expectedFks=['orders_payer_student_tenant_fk','orders_payer_user_tenant_fk'];
function command(script:string,url:string,profile?:string){
 const result=spawnSync(process.execPath,['--import','tsx',script],{env:{...process.env,DATABASE_URL:url,INTEGRATION_DATABASE_URL:url,SIII_DATABASE_ENV:'test',SIII_MIGRATION_PROFILE:profile},encoding:'utf8',windowsHide:true,timeout:30000});
 return {status:result.status,output:result.stdout+result.stderr};
}
async function database(label:string,baseline=false,profile='canonical'){
 const name=prefix+'_'+label+'_test';await admin.query('CREATE DATABASE '+pg.escapeIdentifier(name));
 const url=new URL(source);url.pathname='/'+name;const client=new pg.Client({connectionString:url.href});await client.connect();
 const entry={name,url:url.href,client};created.push(entry);
 if(baseline)await seedFinancialBaseline24(client,profile);
 return entry;
}
type Fixture={tenant:string;foreign:string;fee:string;foreignFee:string;student:string;foreignStudent:string;user:string;foreignUser:string;member:string};
async function fixture(c:pg.Client):Promise<Fixture>{
 const tenant=(await c.query("INSERT INTO institutions(name,code) VALUES('Synthetic FK tenant',$1) RETURNING id",[randomUUID()])).rows[0].id;
 const foreign=(await c.query("INSERT INTO institutions(name,code) VALUES('Synthetic foreign tenant',$1) RETURNING id",[randomUUID()])).rows[0].id;
 async function records(institution:string){
  const program=(await c.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,'FK','Synthetic','ingenieria','presencial') RETURNING id",[institution])).rows[0].id;
  const student=(await c.query("INSERT INTO institutional_students(institution_id,program_id,enrollment_number,first_name,last_name,status) VALUES($1,$2,'FK','Synthetic','Payer','graduated') RETURNING id",[institution,program])).rows[0].id;
  const fee=(await c.query("INSERT INTO financial_fee_types(institution_id,code,name,default_amount_cents) VALUES($1,'FK','Synthetic',15000) RETURNING id",[institution])).rows[0].id;
  const person=(await c.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Payer') RETURNING id")).rows[0].id;
  const user=(await c.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,randomUUID()])).rows[0].id;
  const member=(await c.query("INSERT INTO institution_memberships(institution_id,user_id,status) VALUES($1,$2,'suspended') RETURNING id",[institution,user])).rows[0].id;
  return {student,fee,user,member};
 }
 const own=await records(tenant),other=await records(foreign);
 return {tenant,foreign,fee:own.fee,foreignFee:other.fee,student:own.student,foreignStudent:other.student,user:own.user,foreignUser:other.user,member:own.member};
}
async function order(c:pg.Client,f:Fixture,student:string|null=f.student,user:string|null=f.user){
 return (await c.query('INSERT INTO payment_orders(institution_id,fee_type_id,payer_student_id,payer_user_id,order_number,total_amount_cents,paid_amount_cents) VALUES($1,$2,$3,$4,$5,15000,2000) RETURNING *',[f.tenant,f.fee,student,user,randomUUID()])).rows[0];
}
const ledger=async(c:pg.Client)=>(await c.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
const constraints=async(c:pg.Client)=>(await c.query("SELECT conname FROM pg_constraint WHERE conrelid='payment_orders'::regclass AND conname=ANY($1::text[]) ORDER BY conname",[expectedFks])).rows;
async function security(c:pg.Client){
 return (await c.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relowner::regrole::text owner,c.relacl::text acl FROM pg_class c WHERE c.oid=ANY(ARRAY['payment_orders'::regclass,'institutional_students'::regclass,'institution_memberships'::regclass]) ORDER BY c.relname")).rows;
}

describe.sequential('financial payer tenant constraints through real PostgreSQL and migration ledger',()=>{
 let live:Awaited<ReturnType<typeof database>>;
 beforeAll(async()=>{await admin.connect();live=await database('live',true);expect(command('db/migrate.ts',live.url).status).toBe(0)},120000);
 afterAll(async()=>{for(const entry of created){await entry.client.end();await admin.query('DROP DATABASE '+pg.escapeIdentifier(entry.name))}await admin.end()},120000);
 it.each(['student','user'] as const)('rejects INSERT of foreign %s despite an existing scalar identity',async kind=>{
  const f=await fixture(live.client);
  await expect(order(live.client,f,kind==='student'?f.foreignStudent:f.student,kind==='user'?f.foreignUser:f.user)).rejects.toMatchObject({code:'23503',constraint:kind==='student'?expectedFks[0]:expectedFks[1]});
 });
 it.each(['student','user'] as const)('rejects INSERT of missing %s',async kind=>{
  const f=await fixture(live.client);
  await expect(order(live.client,f,kind==='student'?randomUUID():f.student,kind==='user'?randomUUID():f.user)).rejects.toHaveProperty('code','23503');
 });
 it.each(['student','user'] as const)('rejects UPDATE to foreign or missing %s and preserves the original order',async kind=>{
  const f=await fixture(live.client),before=await order(live.client,f),column=kind==='student'?'payer_student_id':'payer_user_id';
  for(const id of [kind==='student'?f.foreignStudent:f.foreignUser,randomUUID()]){
   await expect(live.client.query('UPDATE payment_orders SET '+column+'=$1 WHERE id=$2',[id,before.id])).rejects.toHaveProperty('code','23503');
   expect((await live.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual(before);
  }
 });
 it('rejects an existing global user without an institution membership',async()=>{
  const f=await fixture(live.client);await live.client.query('DELETE FROM institution_memberships WHERE id=$1',[f.member]);
  await expect(order(live.client,f)).rejects.toMatchObject({code:'23503',constraint:expectedFks[1]});
 });
 it('allows clearing nullable payer references through UPDATE',async()=>{
  const f=await fixture(live.client),before=await order(live.client,f);
  await live.client.query('UPDATE payment_orders SET payer_student_id=NULL,payer_user_id=NULL WHERE id=$1',[before.id]);
  expect((await live.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual({...before,payer_student_id:null,payer_user_id:null});
 });
 it('rejects reassignment of order tenant even when its fee is valid in the destination',async()=>{
  const f=await fixture(live.client),row=await order(live.client,f);
  await expect(live.client.query('UPDATE payment_orders SET institution_id=$1,fee_type_id=$2 WHERE id=$3',[f.foreign,f.foreignFee,row.id])).rejects.toHaveProperty('code','23503');
 });
 it('rejects membership key changes that would detach a financial payer',async()=>{
  const f=await fixture(live.client);await order(live.client,f);
  await expect(live.client.query('UPDATE institution_memberships SET user_id=$1 WHERE id=$2',[f.foreignUser,f.member])).rejects.toHaveProperty('code','23503');
 });
 it.each([[null,null],['student',null],[null,'user'],['student','user']] as const)('allows nullable payers %s/%s and both graduated/suspended identities',async(s,u)=>{
  const f=await fixture(live.client),row=await order(live.client,f,s?f.student:null,u?f.user:null);
  expect(row).toMatchObject({institution_id:f.tenant,payer_student_id:s?f.student:null,payer_user_id:u?f.user:null,total_amount_cents:15000,paid_amount_cents:2000});
 });
 it('deleting a student nulls only its payer column with scalar and composite FKs coexisting',async()=>{
  const f=await fixture(live.client),before=await order(live.client,f);await live.client.query('DELETE FROM institutional_students WHERE id=$1',[f.student]);
  expect((await live.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual({...before,payer_student_id:null});
 });
 it('deleting a membership nulls only payer_user_id and preserves its global user',async()=>{
  const f=await fixture(live.client),before=await order(live.client,f);await live.client.query('DELETE FROM institution_memberships WHERE id=$1',[f.member]);
  expect((await live.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual({...before,payer_user_id:null});
  expect((await live.client.query('SELECT id FROM platform_users WHERE id=$1',[f.user])).rowCount).toBe(1);
 });
 it('preserves the existing global-user RESTRICT lifecycle while membership remains',async()=>{
  const f=await fixture(live.client),before=await order(live.client,f);
  await expect(live.client.query('DELETE FROM platform_users WHERE id=$1',[f.user])).rejects.toHaveProperty('code','23503');
  expect((await live.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual(before);
  await live.client.query('DELETE FROM institution_memberships WHERE id=$1',[f.member]);
  await live.client.query('DELETE FROM platform_users WHERE id=$1',[f.user]);
  expect((await live.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual({...before,payer_user_id:null});
 });
 it('declares fully validated MATCH SIMPLE FKs with only the intended SET NULL column',async()=>{
  const rows=(await live.client.query("SELECT conname,confrelid::regclass::text parent,confdeltype,confupdtype,confmatchtype,convalidated,condeferrable,ARRAY(SELECT attname::text FROM unnest(conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.num ORDER BY ord) columns,ARRAY(SELECT attname::text FROM unnest(confdelsetcols) k(num) JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.num) null_columns FROM pg_constraint WHERE conrelid='payment_orders'::regclass AND conname=ANY($1::text[]) ORDER BY conname",[expectedFks])).rows;
  expect(rows).toEqual([
   {conname:expectedFks[0],parent:'institutional_students',confdeltype:'n',confupdtype:'a',confmatchtype:'s',convalidated:true,condeferrable:false,columns:['payer_student_id','institution_id'],null_columns:['payer_student_id']},
   {conname:expectedFks[1],parent:'institution_memberships',confdeltype:'n',confupdtype:'a',confmatchtype:'s',convalidated:true,condeferrable:false,columns:['institution_id','payer_user_id'],null_columns:['payer_user_id']},
  ]);
  const indexes=(await live.client.query("SELECT c.relname,i.indisvalid,i.indisunique FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname=ANY($1::text[]) ORDER BY c.relname",[['payment_orders_payer_student_tenant_idx','payment_orders_payer_user_tenant_idx']])).rows;
  expect(indexes).toEqual([{relname:'payment_orders_payer_student_tenant_idx',indisvalid:true,indisunique:false},{relname:'payment_orders_payer_user_tenant_idx',indisvalid:true,indisunique:false}]);
 });
 it.each(['canonical','supabase-v1'])('migrates a fresh %s database and repeats without ledger changes',async profile=>{
  const db=await database('fresh_'+profile.replace('-',''));const result=command('db/migrate.ts',db.url,profile);
  expect(result).toMatchObject({status:0});expect((await ledger(db.client)).map(row=>Number(row.created_at))).toEqual(migrationTimes);expect(await constraints(db.client)).toHaveLength(2);
  const before=await ledger(db.client);expect(command('db/migrate.ts',db.url).status).toBe(0);expect(await ledger(db.client)).toEqual(before);
 },60000);
 it.each(['canonical','supabase-v1'])('upgrades populated0024 %s without data, roles or grants changes',async profile=>{
  const db=await database('populated_'+profile.replace('-',''),true,profile),f=await fixture(db.client),before=await order(db.client,f),guards=await security(db.client);
  expect(await ledger(db.client)).toHaveLength(25);expect(command('db/migrate.ts',db.url,profile).status).toBe(0);
  expect((await db.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual(before);
  expect(await security(db.client)).toEqual(guards);expect((await ledger(db.client)).map(row=>Number(row.created_at))).toEqual(migrationTimes);
 },60000);
 it.each(['student','user'] as const)('fails closed on historical foreign %s without changing data, DDL or ledger',async kind=>{
  const db=await database('dirty_'+kind,true),f=await fixture(db.client),before=await order(db.client,f,kind==='student'?f.foreignStudent:f.student,kind==='user'?f.foreignUser:f.user),history=await ledger(db.client);
  const preflight=command('scripts/db-preflight.ts',db.url);
  expect(preflight.status).toBe(2);const report=JSON.parse(preflight.output);
  expect(report.financialTenantIntegrity.invalidReferences).toEqual({payerStudent:kind==='student'?1:0,payerUser:kind==='user'?1:0});
  expect(preflight.output).not.toContain(before.id);expect(preflight.output).not.toContain(f.foreignStudent);
  expect(command('db/migrate.ts',db.url).status).toBe(1);
  expect(await ledger(db.client)).toEqual(history);expect(await constraints(db.client)).toEqual([]);
  expect((await db.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual(before);
 },60000);
 it('preflight distinguishes clean preparation0024 from verified installed0025',async()=>{
  const db=await database('preflight_clean',true);
  const before=JSON.parse(command('scripts/db-preflight.ts',db.url).output);
  expect(before.financialTenantIntegrity).toMatchObject({phase:'PRE_0025',readiness:'PREPARED_FOR_0025',constraintsVerified:false});
  expect(command('db/migrate.ts',db.url).status).toBe(0);
  const result=command('scripts/db-preflight.ts',db.url);expect(result.status).toBe(0);
  expect(JSON.parse(result.output).financialTenantIntegrity).toMatchObject({phase:'POST_0025',readiness:'VERIFIED_0025',constraintsVerified:true});
 },60000);
 it.each(['table','columns'] as const)('preflight rejects a parent index with the expected name but wrong %s',async kind=>{
  const db=await database('preflight_key_'+kind,true);
  await db.client.query('ALTER INDEX institutional_students_id_institution_uidx RENAME TO original_student_tenant_key');
  await db.client.query('CREATE UNIQUE INDEX institutional_students_id_institution_uidx ON '+(kind==='table'?'platform_users(id)':'institutional_students(id)'));
  const result=command('scripts/db-preflight.ts',db.url);expect(result.status).toBe(2);
  expect(JSON.parse(result.output).financialTenantIntegrity.parentKeysVerified).toBe(false);
 },60000);
 it.each(['missing','unvalidated','delete_columns'] as const)('preflight rejects installed0025 with %s FK drift',async kind=>{
  const db=await database('preflight_fk_'+kind);expect(command('db/migrate.ts',db.url).status).toBe(0);
  await db.client.query('ALTER TABLE payment_orders DROP CONSTRAINT orders_payer_student_tenant_fk');
  if(kind!=='missing')await db.client.query('ALTER TABLE payment_orders ADD CONSTRAINT orders_payer_student_tenant_fk FOREIGN KEY(payer_student_id,institution_id) REFERENCES institutional_students(id,institution_id) ON DELETE SET NULL'+(kind==='unvalidated'?' (payer_student_id) NOT VALID':''));
  const result=command('scripts/db-preflight.ts',db.url);expect(result.status).toBe(2);
  expect(JSON.parse(result.output).financialTenantIntegrity).toMatchObject({phase:'POST_0025',constraintsVerified:false,readiness:'BLOCKED'});
 },60000);
 it('preflight refuses a DEFERRABLE parent unique key and migration preserves baseline on failure',async()=>{
  const db=await database('preflight_deferred',true),before=await ledger(db.client);
  await db.client.query('ALTER TABLE institution_memberships DROP CONSTRAINT institution_member_unique');
  await db.client.query('ALTER TABLE institution_memberships ADD CONSTRAINT institution_member_unique UNIQUE(institution_id,user_id) DEFERRABLE INITIALLY IMMEDIATE');
  const result=command('scripts/db-preflight.ts',db.url);expect(result.status).toBe(2);
  expect(JSON.parse(result.output).financialTenantIntegrity.parentKeysVerified).toBe(false);
  expect(command('db/migrate.ts',db.url).status).toBe(1);expect(await ledger(db.client)).toEqual(before);
 },60000);
 it.each(['hash','timestamp','missing'] as const)('preflight refuses tampered0025 ledger %s without treating it as preparation',async kind=>{
  const db=await database('preflight_ledger_'+kind);expect(command('db/migrate.ts',db.url).status).toBe(0);
  await db.client.query(kind==='hash'?"UPDATE drizzle.__drizzle_migrations SET hash='tampered' WHERE created_at=1792623603000":kind==='timestamp'?"UPDATE drizzle.__drizzle_migrations SET created_at=0 WHERE created_at=1792623603000":"DELETE FROM drizzle.__drizzle_migrations WHERE created_at=1792623603000");
  const result=command('scripts/db-preflight.ts',db.url);expect(result.status).toBe(2);
  expect(JSON.parse(result.output).financialTenantIntegrity).toMatchObject({phase:'LEDGER_DRIFT',readiness:'BLOCKED'});
 },60000);
 it('bounds table-lock contention and leaves DDL and ledger unchanged',async()=>{
  const db=await database('locked',true),history=await ledger(db.client),gate=new pg.Client({connectionString:db.url});
  await gate.connect();await gate.query('BEGIN');await gate.query('LOCK TABLE institution_memberships IN ACCESS EXCLUSIVE MODE');
  try{
   const start=Date.now();expect(command('db/migrate.ts',db.url).status).toBe(1);expect(Date.now()-start).toBeLessThan(15000);
   expect(await ledger(db.client)).toEqual(history);expect(await constraints(db.client)).toEqual([]);
  }finally{await gate.query('ROLLBACK');await gate.end()}
 },30000);
 it('rolls back earlier DDL and ledger when a later constraint fails',async()=>{
  const db=await database('rollback',true),f=await fixture(db.client),before=await order(db.client,f),history=await ledger(db.client);
  await db.client.query('ALTER TABLE payment_orders ADD CONSTRAINT orders_payer_user_tenant_fk CHECK(true)');
  expect(command('db/migrate.ts',db.url).status).toBe(1);expect(await ledger(db.client)).toEqual(history);
  expect((await db.client.query("SELECT contype FROM pg_constraint WHERE conrelid='payment_orders'::regclass AND conname='orders_payer_user_tenant_fk'")).rows).toEqual([{contype:'c'}]);
  expect((await db.client.query("SELECT 1 FROM pg_constraint WHERE conrelid='payment_orders'::regclass AND conname='orders_payer_student_tenant_fk'")).rows).toEqual([]);
  expect((await db.client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'payment_orders_payer_%_tenant_idx'")).rows).toEqual([]);
  expect((await db.client.query('SELECT * FROM payment_orders WHERE id=$1',[before.id])).rows[0]).toEqual(before);
 },60000);
});
