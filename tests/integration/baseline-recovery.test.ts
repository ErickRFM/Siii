import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {isolatedDatabaseUrl} from '../support/database-url';
import {schemaSignature} from '../../db/schema-signature';
import {restoreBaselineBackup} from '../../scripts/baseline-recovery';
const admin=new pg.Client({connectionString:isolatedDatabaseUrl()});
const prefix='p0_recovery_'+randomUUID().replaceAll('-','').slice(0,10),names=[prefix+'_source',prefix+'_target'];
let source:pg.Client,target:pg.Client,snapshot:Parameters<typeof restoreBaselineBackup>[1];
describe.sequential('logical baseline recovery boundary',()=>{
 beforeAll(async()=>{await admin.connect();for(const name of names)await admin.query('CREATE DATABASE '+name+' TEMPLATE template0');const clients=names.map(name=>{const url=new URL(isolatedDatabaseUrl());url.pathname='/'+name;return new pg.Client({connectionString:url.href})});[source,target]=clients;for(const client of clients){await client.connect();await client.query("SET timezone='UTC'")}for(const tag of ['0000_siii_foundation_identity','0001_academic_catalogs'])await source.query(readFileSync('db/migrations/'+tag+'.sql','utf8'));await source.query("INSERT INTO institutions(name,code) VALUES('Synthetic recovery','RECOVERY')");const records:Record<string,Record<string,unknown>[]>={};for(const{tablename}of(await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows)records[tablename]=(await source.query("SELECT to_jsonb(t) AS row FROM public."+pg.escapeIdentifier(tablename)+' t ORDER BY id')).rows.map(x=>x.row);snapshot={format:'SIII_APPLICATION_LOGICAL_BACKUP_V1',source_project:'kkjzbqsaummyralqjqrb',signature:await schemaSignature(source) as Record<string,unknown>,records,auth_users:0,storage_objects:0,storage_buckets:[],triggers:[],policies:[],history_columns:[],supabase_migrations:[]}});
 it('rejects a remote client endpoint even if a database has a synthetic name',async()=>{const endpoint=target as pg.Client&{host:string};const original=endpoint.host;endpoint.host='db.remote.supabase.co';try{await expect(restoreBaselineBackup(target,snapshot)).rejects.toThrow('LOCAL_RECOVERY_ONLY')}finally{endpoint.host=original}});
 it('rejects incomplete archives atomically without leaving a partial schema',async()=>{const incomplete={...snapshot,records:{...snapshot.records}};delete incomplete.records.people;await expect(restoreBaselineBackup(target,incomplete)).rejects.toThrow('BACKUP_TABLE_SET_MISMATCH');expect((await target.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n).toBe(0)});
 it('restores all original values and history into an empty local target',async()=>{expect(await restoreBaselineBackup(target,snapshot)).toEqual({tables:12,records:1,allRowsEqual:true,historyEqual:true});expect((await target.query('SELECT code FROM institutions')).rows).toEqual([{code:'RECOVERY'}])});
 it('refuses to overwrite an already restored database',async()=>{await expect(restoreBaselineBackup(target,snapshot)).rejects.toThrow('EMPTY_RECOVERY_DATABASE_REQUIRED')});
 afterAll(async()=>{await source?.end();await target?.end();for(const name of names)await admin.query('DROP DATABASE IF EXISTS '+name);await admin.end()});
});
