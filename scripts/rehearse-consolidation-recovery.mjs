import fs from 'node:fs/promises';import pg from 'pg';import {randomUUID,createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';import {schemaSignature} from '../db/schema-signature.ts';import {assertMigrationLedger} from '../db/migration-safety.ts';import {isolatedDatabaseUrl} from '../tests/support/database-url.ts';
if(process.env.SIII_RECOVERY_CONFIRM!=='LOCAL_CONSOLIDATION_ONLY')throw Error('LOCAL_RECOVERY_CONFIRM_REQUIRED');
const raw=isolatedDatabaseUrl(),sourceUrl=new URL(raw),source=sourceUrl.pathname.slice(1);
if(source!=='p0_sii_consolidation_lf_test')throw Error('CONSOLIDATION_SOURCE_REQUIRED');
const adminUrl=new URL(raw);adminUrl.pathname='/postgres';const admin=new pg.Client({connectionString:adminUrl.href});await admin.connect();
const suffix=randomUUID().replaceAll('-','').slice(0,10),backup='p0_consolidation_backup_'+suffix,restored='p0_consolidation_restore_'+suffix;
const identifier=value=>{if(!/^[a-z0-9_]+$/.test(value))throw Error('INVALID_DATABASE_IDENTIFIER');return '"'+value+'"'};
async function capture(name){const url=new URL(raw);url.pathname='/'+name;const client=new pg.Client({connectionString:url.href});await client.connect();try{
 await assertMigrationLedger(client);const signature=await schemaSignature(client);
 const tables=(await client.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)).rows;
 const contents=[];for(const table of tables){const result=(await client.query("SELECT count(*)::int AS rows,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY md5(to_jsonb(t)::text))::text,'[]')) AS checksum FROM public."+identifier(table.relname)+' t')).rows[0];contents.push({table:table.relname,...result})}
 const ledger=(await client.query('SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
 const policies=(await client.query(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`)).rows;
 return {schemaHash:createHash('sha256').update(JSON.stringify({signature,tables,policies,ledger})).digest('hex'),tables:contents,ledgerEntries:ledger.length};
 }finally{await client.end()}}
try{
 const initial=await capture(source);const sessions=(await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',[source])).rows[0].n;if(sessions!==0)throw Error('SOURCE_HAS_ACTIVE_SESSIONS');
 const start=performance.now();await admin.query('CREATE DATABASE '+identifier(backup)+' TEMPLATE '+identifier(source));const backupMs=performance.now()-start;
 const restoreStart=performance.now();await admin.query('CREATE DATABASE '+identifier(restored)+' TEMPLATE '+identifier(backup));const restoreMs=performance.now()-restoreStart;
 const recovered=await capture(restored);if(JSON.stringify(initial)!==JSON.stringify(recovered))throw Error('RESTORE_CONTENT_OR_SECURITY_MISMATCH');
 const report={kind:'LOCAL_POSTGRESQL_TEMPLATE_RECOVERY',at:new Date().toISOString(),source,backup,restored,backupMs:Math.round(backupMs),restoreMs:Math.round(restoreMs),verified:true,...recovered,limits:['Local synthetic PostgreSQL only','Same-cluster template copy; not a portable pg_dump or cloud backup','All source, backup and restored databases preserved','No production or cloud SQL; no ledger rewriting']};
 await fs.mkdir('docs/audit',{recursive:true});await fs.writeFile('docs/audit/SII_CONSOLIDATION_RECOVERY.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verified:true,tables:report.tables.length,ledgerEntries:report.ledgerEntries,backupMs:report.backupMs,restoreMs:report.restoreMs}));
}finally{await admin.end()}
