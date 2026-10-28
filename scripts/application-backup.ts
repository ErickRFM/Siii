import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import type pg from 'pg';
import {SCHEMA_SIGNATURE_SQL,schemaSignature} from '../db/schema-signature';
import {readReleaseMigrations,releaseAppendixHash,releaseDefinitionHash} from '../db/release-profile';
import {assertLocalRecoveryEndpoint} from './baseline-recovery';

const FORMAT='SIII_APPLICATION_LOGICAL_BACKUP_V2';
const PROJECTS=['kkjzbqsaummyralqjqrb','vsnrbjexusidlvhkhmqg'];
const MIGRATIONS=fileURLToPath(new URL('../db/migrations',import.meta.url));
type JsonObject=Record<string,unknown>;
interface Signature extends JsonObject {
 columns:({table_name:string;column_name:string;ordinal_position:number}&JsonObject)[];
 constraints:({table_name:string;name:string;definition:string}&JsonObject)[];
}
export interface BackupTable {schema:string;name:string;columns:string[];primaryKey:string[]}
export interface ApplicationBackupStructure {signature:Signature;tables:BackupTable[];pgcrypto_schema:string|null;unsupported:number}
export interface ApplicationBackupMetadata extends ApplicationBackupStructure {
 ledger:{id:number;hash:string;created_at:string}[];
 release_profile:{singleton:boolean;profile:string;definition_hash:string;registered_at:string}[];
 release_appendix:{name:string;definition_hash:string;registered_at:string}[];
}
export interface ApplicationBackupPlan extends ApplicationBackupMetadata {format:typeof FORMAT;source_project:string;profile:'canonical'|'supabase-v1'}
export interface ApplicationBackupManifest extends ApplicationBackupPlan {captured_at:string;statistics:Record<string,{count:number;sha256:string}>}
export interface ApplicationCapture {ciphertext_base64:string;ciphertext_sha256:string;recipient_key_id:string;manifest:ApplicationBackupManifest}
const fail=(code:string):never=>{throw new Error(code)};
function ident(value:string){if(typeof value!=='string'||!/^[a-z_][a-z0-9_]{0,62}$/.test(value))fail('BACKUP_IDENTIFIER_INVALID');return '"'+value+'"'}
const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";
const json=(value:unknown)=>literal(JSON.stringify(value))+'::jsonb';
const stable=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const equal=(a:unknown,b:unknown)=>stable(a)===stable(b);
const qualified=(table:BackupTable)=>ident(table.schema)+'.'+ident(table.name);
const key=(table:BackupTable)=>table.schema+'.'+table.name;
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const AUXILIARY:Record<string,{columns:string[];primaryKey:string[];ddl:string}>={
 'drizzle.__drizzle_migrations':{columns:['id','hash','created_at'],primaryKey:['id'],ddl:'CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL)'},
 'drizzle.siii_release_profile':{columns:['singleton','profile','definition_hash','registered_at'],primaryKey:['singleton'],ddl:'CREATE TABLE drizzle.siii_release_profile(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),profile text NOT NULL,definition_hash text NOT NULL,registered_at timestamptz NOT NULL DEFAULT now())'},
 'drizzle.siii_release_appendix':{columns:['name','definition_hash','registered_at'],primaryKey:['name'],ddl:'CREATE TABLE drizzle.siii_release_appendix(name text PRIMARY KEY,definition_hash text NOT NULL,registered_at timestamptz NOT NULL DEFAULT now())'},
 'supabase_migrations.schema_migrations':{columns:['version','statements','name','created_by','idempotency_key','rollback'],primaryKey:['version'],ddl:'CREATE TABLE supabase_migrations.schema_migrations(version text NOT NULL PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text[])'},
};

/** First inspection: catalog metadata only. No institutional rows leave PostgreSQL. */
export const APPLICATION_BACKUP_METADATA_SQL=`WITH signature AS (${SCHEMA_SIGNATURE_SQL})
 SELECT jsonb_build_object('signature',signature.signature,
 'tables',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,
  'columns',(SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'primaryKey',COALESCE((SELECT jsonb_agg(a.attname ORDER BY u.position) FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY u(attnum,position) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum WHERE p.conrelid=c.oid AND p.contype='p'),'[]'::jsonb)
 ) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND (n.nspname IN ('public','drizzle') OR (n.nspname='supabase_migrations' AND c.relname='schema_migrations'))),'[]'::jsonb),
 'pgcrypto_schema',(SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto'),
 'unsupported',(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m','f','S','p'))
  +(SELECT count(*)::int FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND (a.attgenerated<>'' OR a.attidentity<>''))
 ) AS metadata FROM signature`;

function validateStructure(structure:ApplicationBackupStructure){
 if(!structure||!Array.isArray(structure.tables)||!structure.tables.length||!Array.isArray(structure.signature?.columns)||!Array.isArray(structure.signature?.constraints)||structure.unsupported!==0)fail('BACKUP_SCHEMA_UNSUPPORTED');
 if(structure.pgcrypto_schema!==null&&!['public','extensions'].includes(structure.pgcrypto_schema))fail('BACKUP_CRYPTO_SCHEMA_INVALID');
 const names=new Set<string>();
 for(const table of structure.tables){
  ident(table.schema);ident(table.name);
  if(names.has(key(table)))fail('BACKUP_TABLE_SET_MISMATCH');names.add(key(table));
  if(!Array.isArray(table.columns)||!table.columns.length||new Set(table.columns).size!==table.columns.length||!Array.isArray(table.primaryKey)||!table.primaryKey.length||new Set(table.primaryKey).size!==table.primaryKey.length)fail('BACKUP_COLUMNS_INVALID');
  table.columns.forEach(ident);table.primaryKey.forEach(ident);
  if(table.primaryKey.some(p=>!table.columns.includes(p)))fail('BACKUP_PRIMARY_KEY_INVALID');
  if(table.schema==='public'){
   const columns=structure.signature.columns.filter(c=>c.table_name===table.name).sort((a,b)=>a.ordinal_position-b.ordinal_position).map(c=>c.column_name);
   if(!equal(columns,table.columns))fail('BACKUP_COLUMNS_MISMATCH');
   const pk=structure.signature.constraints.find(c=>c.table_name===table.name&&c.definition.startsWith('PRIMARY KEY ('));
   if(!pk||!equal(pk.definition.slice(13,-1).split(',').map(c=>c.trim().replaceAll('"','')),table.primaryKey))fail('BACKUP_PRIMARY_KEY_INVALID');
  }else if(!AUXILIARY[key(table)]||!equal(table.columns,AUXILIARY[key(table)].columns)||!equal(table.primaryKey,AUXILIARY[key(table)].primaryKey))fail('BACKUP_AUXILIARY_SHAPE_UNSUPPORTED');
 }
 const publicNames=[...new Set(structure.signature.columns.map(c=>c.table_name))].sort();
 if(!equal(publicNames,structure.tables.filter(t=>t.schema==='public').map(t=>t.name).sort())||!names.has('drizzle.__drizzle_migrations'))fail('BACKUP_TABLE_SET_MISMATCH');
}

/** Second inspection: ledger/profile metadata; optional relations are taken only from the catalog. */
export function buildApplicationBackupInspectionSql(structure:ApplicationBackupStructure){
 validateStructure(structure);
 const present=(name:string)=>structure.tables.some(t=>key(t)===name);
 const rows=(name:string,order:string)=>present(name)?`(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY ${order}),'[]'::jsonb) FROM ${name} t)`:`'[]'::jsonb`;
 return `WITH structure AS (${APPLICATION_BACKUP_METADATA_SQL}) SELECT metadata || jsonb_build_object(
 'ledger',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'hash',hash,'created_at',created_at::text) ORDER BY created_at,id),'[]'::jsonb) FROM drizzle.__drizzle_migrations),
 'release_profile',${rows('drizzle.siii_release_profile','singleton')},'release_appendix',${rows('drizzle.siii_release_appendix','name')}) AS metadata FROM structure`;
}

function trustedMigrations(profile:string){
 if(profile==='canonical')return readMigrationFiles({migrationsFolder:MIGRATIONS});
 if(profile==='supabase-v1')return readReleaseMigrations(profile,MIGRATIONS);
 return fail('BACKUP_PROFILE_INVALID');
}

export function createApplicationBackupPlan(metadata:ApplicationBackupMetadata,sourceProject:string):ApplicationBackupPlan {
 if(!PROJECTS.includes(sourceProject))fail('BACKUP_PROJECT_INVALID');
 validateStructure(metadata);
 if(!Array.isArray(metadata.ledger)||!metadata.ledger.length||!Array.isArray(metadata.release_profile)||!Array.isArray(metadata.release_appendix))fail('BACKUP_LEDGER_INVALID');
 const hasProfile=metadata.tables.some(t=>key(t)==='drizzle.siii_release_profile');
 const hasAppendix=metadata.tables.some(t=>key(t)==='drizzle.siii_release_appendix');
 const profile=hasProfile?'supabase-v1':'canonical';
 if(profile==='canonical'){
  if(metadata.release_profile.length||metadata.release_appendix.length||hasAppendix)fail('BACKUP_PROFILE_INVALID');
 }else{
  const p=metadata.release_profile[0];
  if(metadata.release_profile.length!==1||p?.singleton!==true||p.profile!==profile||p.definition_hash!==releaseDefinitionHash(profile)||!Number.isFinite(Date.parse(p.registered_at)))fail('BACKUP_PROFILE_INVALID');
  if(hasAppendix){const a=metadata.release_appendix[0];if(metadata.release_appendix.length!==1||a?.name!=='schema-isolation-v1'||a.definition_hash!==releaseAppendixHash()||!Number.isFinite(Date.parse(a.registered_at)))fail('BACKUP_APPENDIX_INVALID')}
  else if(metadata.release_appendix.length||metadata.ledger.length>17)fail('BACKUP_APPENDIX_INVALID');
 }
 const migrations=trustedMigrations(profile),ids=new Set<number>();
 if(metadata.ledger.length>migrations.length)fail('BACKUP_LEDGER_INVALID');
 metadata.ledger.forEach((row,i)=>{
  if(!Number.isSafeInteger(row.id)||row.id<1||ids.has(row.id)||row.hash!==migrations[i].hash||String(row.created_at)!==String(migrations[i].folderMillis))fail('BACKUP_LEDGER_INVALID');ids.add(row.id);
 });
 return {...structuredClone(metadata),format:FORMAT,source_project:sourceProject,profile};
}

function checkedPlan(plan:ApplicationBackupPlan){
 const checked=createApplicationBackupPlan(plan,plan.source_project);
 if(plan.format!==FORMAT||plan.profile!==checked.profile)fail('BACKUP_FORMAT_INVALID');
 return checked;
}

function recordSelect(table:BackupTable){return `SELECT ${literal(key(table))} AS name,COALESCE(jsonb_agg(to_jsonb(t) ORDER BY ${table.primaryKey.map(p=>'t.'+ident(p)).join(',')}),'[]'::jsonb) AS rows FROM ${qualified(table)} t`}
function statisticsSql(records:string){return `SELECT jsonb_object_agg(name,jsonb_build_object('count',jsonb_array_length(rows),'sha256',encode(sha256(convert_to(rows::text,'UTF8')),'hex'))) AS statistics FROM ${records}`}

/** Returns zero capture rows on structural/ledger drift. The caller MUST require exactly one row. */
export function buildApplicationBackupSql({plan,publicKey,recipientKeyId}:{plan:ApplicationBackupPlan;publicKey:string;recipientKeyId:string}):string {
 checkedPlan(plan);
 if(!/^-----BEGIN PGP PUBLIC KEY BLOCK-----\r?\n[\s\S]+\r?\n-----END PGP PUBLIC KEY BLOCK-----\s*$/.test(publicKey)||publicKey.includes('PRIVATE KEY')||publicKey.includes('SECRET KEY')||publicKey.includes('\0'))fail('BACKUP_PUBLIC_KEY_REQUIRED');
 if(!/^[A-Fa-f0-9]{16}$/.test(recipientKeyId))fail('BACKUP_RECIPIENT_INVALID');
 if(!plan.pgcrypto_schema||!['public','extensions'].includes(plan.pgcrypto_schema))fail('BACKUP_CRYPTO_SCHEMA_INVALID');
 const crypto=ident(plan.pgcrypto_schema),metadata={signature:plan.signature,tables:plan.tables,ledger:plan.ledger,release_profile:plan.release_profile,release_appendix:plan.release_appendix,pgcrypto_schema:plan.pgcrypto_schema,unsupported:plan.unsupported};
 return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
 SET LOCAL timezone='UTC';
 SET LOCAL search_path=pg_catalog,public;
 SELECT pg_advisory_xact_lock(hashtext('siii:migrations'));
 WITH inspected AS (${buildApplicationBackupInspectionSql(plan)}),
 records AS MATERIALIZED (${plan.tables.map(recordSelect).join('\nUNION ALL\n')}),
 stats AS (${statisticsSql('records')}),
 manifest AS (SELECT ${json(plan)} || jsonb_build_object('captured_at',transaction_timestamp(),'statistics',statistics) AS value FROM stats),
 encrypted AS MATERIALIZED (
 SELECT ${crypto}.pgp_pub_encrypt(jsonb_build_object('manifest',manifest.value,'records',(SELECT jsonb_object_agg(name,rows) FROM records))::text,${crypto}.dearmor(${literal(publicKey)}),'cipher-algo=aes256,compress-algo=1') AS bytes,manifest.value
 FROM manifest,inspected WHERE inspected.metadata=${json(metadata)} AND upper(${crypto}.pgp_key_id(${crypto}.dearmor(${literal(publicKey)})))=${literal(recipientKeyId.toUpperCase())})
 SELECT encode(bytes,'base64') AS ciphertext_base64,encode(sha256(bytes),'hex') AS ciphertext_sha256,${literal(recipientKeyId.toUpperCase())} AS recipient_key_id,value AS manifest FROM encrypted;
 COMMIT;`;
}

function validateManifest(manifest:ApplicationBackupManifest){
 checkedPlan(manifest);
 if(!Number.isFinite(Date.parse(manifest.captured_at))||!manifest.statistics||!equal(Object.keys(manifest.statistics).sort(),manifest.tables.map(key).sort()))fail('BACKUP_STATISTICS_INVALID');
 for(const stat of Object.values(manifest.statistics))if(!Number.isSafeInteger(stat.count)||stat.count<0||!/^[0-9a-f]{64}$/.test(stat.sha256))fail('BACKUP_STATISTICS_INVALID');
}

export function validateApplicationCapture(capture:ApplicationCapture,recipientKeyId:string):ApplicationBackupManifest {
 if(typeof capture?.ciphertext_base64!=='string'||!capture.ciphertext_base64.length||!/^[-A-Za-z0-9+/=\r\n]+$/.test(capture.ciphertext_base64)||sha(Buffer.from(capture.ciphertext_base64,'base64'))!==capture.ciphertext_sha256)fail('BACKUP_CIPHERTEXT_CHECKSUM_MISMATCH');
 if(!/^[A-Fa-f0-9]{16}$/.test(recipientKeyId)||capture.recipient_key_id.toUpperCase()!==recipientKeyId.toUpperCase())fail('BACKUP_RECIPIENT_INVALID');
 validateManifest(capture.manifest);return capture.manifest;
}

/** No CLI, no environment lookup, no default connection. Decrypted JSON stays in memory. */
export async function restoreApplicationBackup(_client:pg.Client,_rawJson:string,_options:{expectedManifest:ApplicationBackupManifest}):Promise<{tables:number;records:number;allRowsEqual:true;historyEqual:true}> {
 return fail('NOT_IMPLEMENTED');
}
