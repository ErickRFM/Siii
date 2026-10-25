/** Local synthetic rehearsal only. Never accepts a production endpoint or data backup. */
import pg from 'pg';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {readReleaseMigrations,releaseAppendixHash,registerReleaseProfile} from '../db/release-profile';
import {assertMigrationLedger} from '../db/migration-safety';
import {SCHEMA_SIGNATURE_SQL} from '../db/schema-signature';
import {assertCompanionLocalEndpoint,validateCompanionProductionLedger} from './companion-db-readiness';

const identifier=(name:string)=>{if(!/^[a-z0-9_]+$/.test(name))throw Error('COMPANION_IDENTIFIER_INVALID');return pg.escapeIdentifier(name);};
async function main(){
 if(process.env.SIII_DATABASE_ENV!=='test'||process.env.SIII_COMPANION_DB_REHEARSAL!=='LOCAL_SYNTHETIC_ONLY')throw Error('COMPANION_REHEARSAL_CONFIRM_REQUIRED');
 const raw=process.env.SIII_COMPANION_REHEARSAL_URL??'';assertCompanionLocalEndpoint(raw,true);
 const expected=process.env.SIII_COMPANION_EXPECTED_SCHEMA_HASH??'';if(!/^[a-f0-9]{64}$/.test(expected))throw Error('COMPANION_SCHEMA_REFERENCE_REQUIRED');
 const directory=resolve('.p0-local/companion-connection');mkdirSync(directory,{recursive:true});
 const production=JSON.parse(readFileSync(resolve(directory,'production-ledger.json'),'utf8')),readiness=validateCompanionProductionLedger(production);
 const migrations=readReleaseMigrations('supabase-v1').slice(0,26),suffix=randomUUID().replaceAll('-','').slice(0,10),prefix='p0_companion_'+suffix,actor=prefix+'_executor';
 const databases={baseline:prefix+'_baseline',rollback:prefix+'_rollback',upgraded:prefix+'_upgraded',restored:prefix+'_restored'};
 const admin=new pg.Client({connectionString:raw});await admin.connect();
 const endpoint=(database:string,user=actor)=>{const value=new URL(raw);value.pathname='/'+database;value.username=user;value.password='';assertCompanionLocalEndpoint(value.href);return value.href;};
 async function connected<T>(database:string,operation:(client:pg.Client)=>Promise<T>){const client=new pg.Client({connectionString:endpoint(database)});await client.connect();try{return await operation(client);}finally{await client.end();}}
 async function apply(client:pg.Client,start:number,end:number,fail=false){
  await client.query('BEGIN');try{
   if(start===0){await registerReleaseProfile(client,'supabase-v1');await client.query('CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)');await client.query('CREATE TABLE drizzle.siii_release_appendix(name text PRIMARY KEY,definition_hash text NOT NULL,registered_at timestamptz NOT NULL DEFAULT now())');await client.query("INSERT INTO drizzle.siii_release_appendix(name,definition_hash) VALUES('schema-isolation-v1',$1)",[releaseAppendixHash()]);}
   for(const migration of migrations.slice(start,end)){for(const statement of migration.sql)if(statement.trim())await client.query(statement);await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)',[migration.hash,migration.folderMillis]);}
   if(fail)await client.query('SELECT 1/0');await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
 }
 async function capture(client:pg.Client){
  await assertMigrationLedger(client);
  const schema=(await client.query("SELECT encode(sha256(convert_to(signature::text,'UTF8')),'hex') AS hash FROM ("+SCHEMA_SIGNATURE_SQL+') source')).rows[0].hash as string;
  const ledger=(await client.query('SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  const tables=(await client.query("SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")).rows;
  const policies=(await client.query("SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows;
  const rows=[];for(const table of tables)rows.push({table:table.name,...(await client.query("SELECT count(*)::int AS count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') AS hash FROM public."+identifier(table.name)+' t')).rows[0]});
  return {schema,ledger,tables,policies,rows};
 }
 try{
  const shared=(await admin.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN('anon','authenticated','siii_app','siii_migrator')")).rows;if(shared.length!==4||shared.some(role=>role.rolsuper||role.rolbypassrls))throw Error('COMPANION_LOCAL_SHARED_ROLES_UNSAFE');
  // Only a new isolated executor receives memberships; existing role attributes are untouched.
  await admin.query('CREATE ROLE '+identifier(actor)+' LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE');await admin.query('GRANT siii_app,siii_migrator TO '+identifier(actor));
  await admin.query('CREATE DATABASE '+identifier(databases.baseline)+' OWNER '+identifier(actor)+' TEMPLATE template0');
  const baseline=await connected(databases.baseline,async client=>{await apply(client,0,18);const metadata=await capture(client);if(metadata.schema!==expected)throw Error('COMPANION_BASELINE_SCHEMA_DRIFT');await client.query("INSERT INTO institutions(code,name) VALUES('SYNTHETIC-RECOVERY','Synthetic companion recovery')");return capture(client);});
  for(const name of [databases.rollback,databases.upgraded])await admin.query('CREATE DATABASE '+identifier(name)+' OWNER '+identifier(actor)+' TEMPLATE '+identifier(databases.baseline));
  const rolledBack=await connected(databases.rollback,async client=>{let rejected=false;try{await apply(client,18,26,true);}catch(error){if((error as {code?:string}).code!=='22012')throw error;rejected=true;}if(!rejected)throw Error('COMPANION_ROLLBACK_NOT_EXERCISED');return capture(client);});
  if(JSON.stringify(rolledBack)!==JSON.stringify(baseline))throw Error('COMPANION_ROLLBACK_MISMATCH');
  const upgraded=await connected(databases.upgraded,async client=>{await apply(client,18,26);return capture(client);});
  if(upgraded.ledger.length!==26||upgraded.tables.some(table=>!table.rls||!table.force_rls))throw Error('COMPANION_UPGRADE_SECURITY_FAILED');
  const originalRows=baseline.rows;for(const row of originalRows)if(JSON.stringify(upgraded.rows.find(item=>item.table===row.table))!==JSON.stringify(row))throw Error('COMPANION_UPGRADE_DATA_CHANGED');
  const binaryDirectory=process.env.SIII_LOCAL_PG_BIN??'C:/Program Files/PostgreSQL/17/bin';
  const cli=(name:string,args:string[],input?:Buffer)=>{const result=spawnSync(resolve(binaryDirectory,name+(process.platform==='win32'?'.exe':'')),['--host','127.0.0.1','--port','55439','--username','postgres',...args],{input,encoding:null,maxBuffer:64*1024*1024,timeout:60000,windowsHide:true});if(result.error||result.status!==0)throw Error('COMPANION_'+name.toUpperCase()+'_FAILED');return result.stdout;};
  const dump=cli('pg_dump',['--dbname',databases.baseline,'--format=custom','--schema=public','--schema=drizzle']);
  // Synthetic fixture only: encrypt on disk, authenticate, then restore from memory.
  // The ephemeral key is deliberately not persisted; this is a same-run rehearsal,
  // not a retained production backup or an operator key-custody mechanism.
  const key=randomBytes(32),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce),ciphertext=Buffer.concat([cipher.update(dump),cipher.final()]),tag=cipher.getAuthTag();
  const artifact=resolve(directory,prefix+'.synthetic-backup.enc');writeFileSync(artifact,Buffer.concat([nonce,tag,ciphertext]),{mode:0o600,flag:'wx'});
  const sealed=readFileSync(artifact),decipher=createDecipheriv('aes-256-gcm',key,sealed.subarray(0,12));decipher.setAuthTag(sealed.subarray(12,28));const recovered=Buffer.concat([decipher.update(sealed.subarray(28)),decipher.final()]);key.fill(0);if(!dump.equals(recovered))throw Error('COMPANION_BACKUP_AUTHENTICATION_FAILED');
  await admin.query('CREATE DATABASE '+identifier(databases.restored)+' OWNER '+identifier(actor)+' TEMPLATE template0');cli('pg_restore',['--dbname',databases.restored,'--exit-on-error','--single-transaction','--clean','--if-exists'],recovered);dump.fill(0);recovered.fill(0);
  const restored=await connected(databases.restored,capture);if(JSON.stringify(restored)!==JSON.stringify(baseline))throw Error('COMPANION_RESTORE_MISMATCH');
  const report={kind:'COMPANION_PENDING_LOCAL_REHEARSAL',at:new Date().toISOString(),readiness,databases,actor,sourceObservation:production.checked_at,baselineSchemaHash:baseline.schema,baselineTables:baseline.tables.length,finalTables:upgraded.tables.length,finalLedgerEntries:upgraded.ledger.length,rollbackVerified:true,dataPreserved:true,encryptedSyntheticDumpBytes:sealed.length,authenticatedRestoreVerified:true,productionBackupVerified:false,limits:['No production DDL or rows read/exported','Baseline matches production public columns/constraints/indexes/enums fingerprint; provider-managed schemas are outside this local fixture','Synthetic encrypted dump key not retained; not a retained production backup','Local databases and isolated executor preserved for inspection']};
  writeFileSync(resolve(directory,'pending-db-rehearsal.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await admin.end();}
}
main().catch(error=>{const message=error instanceof Error&&/^COMPANION_[A-Z0-9_]+$/.test(error.message)?error.message:'COMPANION_REHEARSAL_FAILED';console.error(JSON.stringify({error:message,postgresCode:(error as {code?:string}).code??null}));process.exitCode=1;});
