import type pg from 'pg';
import {readFileSync} from 'node:fs';
import {schemaSignature} from '../db/schema-signature';
interface Snapshot {format:string;source_project:string;signature:Record<string,unknown>;records:Record<string,Record<string,unknown>[]>;auth_users:number;storage_objects:number;storage_buckets:unknown[];triggers:unknown[];policies:unknown[];history_columns:{name:string;type:string;not_null:boolean;default:string|null}[];supabase_migrations:unknown[]}
const stable=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const identifier=(value:string)=>'"'+value.replaceAll('"','""')+'"';
/** Accept decrypted data only in memory. Caller must supply an empty, isolated local database. */
export async function restoreBaselineBackup(client:pg.Client,snapshot:Snapshot){
 const reference=JSON.parse(readFileSync(new URL('../db/baseline/0001-schema.json',import.meta.url),'utf8'));
 if(snapshot.format!=='SIII_APPLICATION_LOGICAL_BACKUP_V1'||snapshot.source_project!=='kkjzbqsaummyralqjqrb'||stable(snapshot.signature)!==stable(reference)||snapshot.auth_users!==0||snapshot.storage_objects!==0||snapshot.storage_buckets.length||snapshot.triggers.length||snapshot.policies.length)throw Error('BACKUP_SCOPE_OR_SCHEMA_NOT_SUPPORTED');
 const local=(await client.query("SELECT host(inet_server_addr()) AS host,current_database() AS database")).rows[0];
 if(!['localhost','127.0.0.1','::1'].includes(local.host)||!local.database.startsWith('p0_'))throw Error('LOCAL_RECOVERY_ONLY');
 if((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n!==0)throw Error('EMPTY_RECOVERY_DATABASE_REQUIRED');
 await client.query('BEGIN');
 try{
 await client.query("SET LOCAL timezone='UTC'");
 for(const tag of ['0000_siii_foundation_identity','0001_academic_catalogs'])await client.query(readFileSync(new URL('../db/migrations/'+tag+'.sql',import.meta.url),'utf8'));
 if(stable(await schemaSignature(client))!==stable(snapshot.signature))throw Error('RESTORED_SCHEMA_MISMATCH');
 const tables=new Set((snapshot.signature.columns as {table_name:string}[]).map(x=>x.table_name));
 if(tables.size!==Object.keys(snapshot.records).length||Object.keys(snapshot.records).some(t=>!tables.has(t)))throw Error('BACKUP_TABLE_SET_MISMATCH');
 const pending=new Set(tables),done=new Set<string>();let restored=0;
 while(pending.size){let progress=false;for(const table of pending){const parents=(snapshot.signature.constraints as {table_name:string;definition:string}[]).filter(x=>x.table_name===table&&x.definition.startsWith('FOREIGN KEY')).map(x=>x.definition.match(/REFERENCES (?:public\.)?"?(\w+)"?/)![1]);if(parents.some(x=>x!==table&&!done.has(x)))continue;await client.query('INSERT INTO public.'+identifier(table)+' SELECT * FROM jsonb_populate_recordset(NULL::public.'+identifier(table)+',$1::jsonb)',[JSON.stringify(snapshot.records[table])]);pending.delete(table);done.add(table);restored+=snapshot.records[table].length;progress=true}if(!progress)throw Error('RESTORE_DEPENDENCY_CYCLE')}
 // History DDL is fixed from the known provider shape, never interpreted from backup strings.
 const shape=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'")).rows;
 if(shape.length)throw Error('EMPTY_RECOVERY_HISTORY_REQUIRED');
 await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
 await client.query('CREATE TABLE supabase_migrations.schema_migrations(version text NOT NULL PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text[])');
 await client.query('INSERT INTO supabase_migrations.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::supabase_migrations.schema_migrations,$1::jsonb)',[JSON.stringify(snapshot.supabase_migrations)]);
 for(const[table,rows]of Object.entries(snapshot.records)){const actual=(await client.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) AS rows FROM public."+identifier(table)+' t')).rows[0].rows;if(stable(actual)!==stable(rows))throw Error('RESTORED_DATA_MISMATCH')}
 const history=(await client.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY version),'[]'::jsonb) AS rows FROM supabase_migrations.schema_migrations t")).rows[0].rows;if(stable(history)!==stable(snapshot.supabase_migrations))throw Error('RESTORED_HISTORY_MISMATCH');
 await client.query('COMMIT');return{tables:tables.size,records:restored,allRowsEqual:true,historyEqual:true};
 }catch(error){await client.query('ROLLBACK');throw error}
}
