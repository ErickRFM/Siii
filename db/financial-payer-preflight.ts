import type pg from 'pg';
import {assertMigrationLedger} from './migration-safety';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const parentContracts=[
 {name:'institution_member_unique',table:'institution_memberships',columns:['institution_id','user_id']},
 {name:'institutional_students_id_institution_uidx',table:'institutional_students',columns:['id','institution_id']},
];
const fkContracts=[
 {name:'orders_payer_student_tenant_fk',table:'institutional_students',columns:['payer_student_id','institution_id'],parentColumns:['id','institution_id'],nullColumns:['payer_student_id']},
 {name:'orders_payer_user_tenant_fk',table:'institution_memberships',columns:['institution_id','payer_user_id'],parentColumns:['institution_id','user_id'],nullColumns:['payer_user_id']},
];
const sameColumns=(actual:unknown,expected:string[])=>JSON.stringify(actual)===JSON.stringify(expected);

/** SELECT-only diagnostics. PRE_0025 readiness never certifies installed constraints. */
export async function readFinancialPayerIntegrity(pool:pg.Pool,tables:Set<string>,hasLedger:boolean){
 const serverVersion=Number((await pool.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
 const available=['payment_orders','institutional_students','institution_memberships'].every(table=>tables.has(table));
 const invalidReferences=available?(await pool.query<{payerStudent:number;payerUser:number}>([
  'SELECT (SELECT count(*)::int FROM public.payment_orders o WHERE o.payer_student_id IS NOT NULL',
  'AND NOT EXISTS(SELECT 1 FROM public.institutional_students s WHERE s.id=o.payer_student_id AND s.institution_id=o.institution_id)) AS "payerStudent",',
  '(SELECT count(*)::int FROM public.payment_orders o WHERE o.payer_user_id IS NOT NULL',
  'AND NOT EXISTS(SELECT 1 FROM public.institution_memberships m WHERE m.institution_id=o.institution_id AND m.user_id=o.payer_user_id)) AS "payerUser"',
 ].join(' '))).rows[0]:null;
 const parentKeys=(await pool.query(
  "SELECT c.relname AS name,t.relname AS parent_table,n.nspname AS parent_schema,i.indisvalid AS valid,i.indisunique AS unique,i.indimmediate AS immediate,i.indpred IS NULL AND i.indexprs IS NULL AS complete,ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE ord<=i.indnkeyatts ORDER BY ord) AS columns FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[]) ORDER BY c.relname",
  [parentContracts.map(key=>key.name)]
 )).rows;
 const parentKeysVerified=parentKeys.length===2&&parentContracts.every(expected=>{
  const actual=parentKeys.find(row=>row.name===expected.name);
  return actual?.valid&&actual.unique&&actual.immediate&&actual.complete&&actual.parent_schema==='public'&&actual.parent_table===expected.table&&sameColumns(actual.columns,expected.columns);
 });
 const constraints=available&&serverVersion>=150000?(await pool.query(
  "SELECT c.conname,c.convalidated,c.confdeltype,c.confupdtype,c.confmatchtype,c.condeferrable,t.relname AS parent_table,n.nspname AS parent_schema,ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY ord) AS columns,ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY ord) AS parent_columns,ARRAY(SELECT a.attname::text FROM unnest(c.confdelsetcols) k(num) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num) AS null_columns FROM pg_constraint c JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.conrelid='public.payment_orders'::regclass AND c.contype='f' AND c.conname=ANY($1::text[]) ORDER BY c.conname",
  [fkContracts.map(key=>key.name)]
 )).rows:[];
 const constraintShapeValid=constraints.length===2&&fkContracts.every(expected=>{
  const actual=constraints.find(row=>row.conname===expected.name);
  return actual?.convalidated&&actual.confdeltype==='n'&&actual.confupdtype==='a'&&actual.confmatchtype==='s'&&!actual.condeferrable
   &&actual.parent_schema==='public'&&actual.parent_table===expected.table&&sameColumns(actual.columns,expected.columns)
   &&sameColumns(actual.parent_columns,expected.parentColumns)&&sameColumns(actual.null_columns,expected.nullColumns);
 });
 const journal=JSON.parse(await readFile(new URL('./migrations/meta/_journal.json',import.meta.url),'utf8')) as {entries:{idx:number;tag:string;when:number}[]};
 const definition=journal.entries.find(entry=>entry.idx===25&&entry.tag==='0025_financial_payer_tenants');
 if(!definition)throw new Error('FINANCIAL_MIGRATION_DEFINITION_MISSING');
 const hash=createHash('sha256').update(await readFile(new URL('./migrations/'+definition.tag+'.sql',import.meta.url))).digest('hex');
 let ledgerVerified=false;
 if(hasLedger){
  const client=await pool.connect();
  try{await assertMigrationLedger(client);ledgerVerified=true}catch{}finally{client.release()}
 }
 const applied=hasLedger?(await pool.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows:[];
 const entry=applied[25];
 // A missing/tampered0025 row must not downgrade an installed schema to readiness.
 const phase=!hasLedger?'BASELINE_REQUIRED':!ledgerVerified?'LEDGER_DRIFT':applied.length<=25
  ?constraints.length===0?'PRE_0025':'LEDGER_DRIFT'
  :entry&&Number(entry.created_at)===definition.when&&entry.hash===hash?'POST_0025':'LEDGER_DRIFT';
 const constraintsVerified=phase==='POST_0025'&&constraintShapeValid;
 const blocked=!ledgerVerified||!available||serverVersion<150000||!parentKeysVerified||invalidReferences===null
  ||invalidReferences.payerStudent>0||invalidReferences.payerUser>0||phase==='LEDGER_DRIFT'||phase==='POST_0025'&&!constraintsVerified;
 return {available,serverVersion,requiresPostgres15:serverVersion<150000,phase,readiness:blocked?'BLOCKED':phase==='PRE_0025'?'PREPARED_FOR_0025':'VERIFIED_0025',invalidReferences,parentKeys,parentKeysVerified,constraints,constraintsVerified,blocked};
}
