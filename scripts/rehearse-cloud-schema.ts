/** Explicitly authorized disposable cloud PostgreSQL rehearsal, never managed postgres DDL.
 * SIII_DATABASE_ENV=staging node --import tsx scripts/rehearse-cloud-schema.ts PHASE
 * PHASE: preflight, prepare, empty, legacy, verify, rollback.
 * Runtime input: ignored .p0-local/staging-connection.json {databaseUrl:string}.
 * No cleanup, deletion, production, historical SQL changes or LOCAL ONLY guard relaxation.
 */
import pg from 'pg';
import {readFile,writeFile,appendFile,mkdir} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {assertNoConnectionOverrides} from '../db/connection-url';
import {assertMigrationLedger} from '../db/migration-safety';
import {schemaSignature} from '../db/schema-signature';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {emitInstitutionalSchema,quoteIdentifier} from './replay-institutional-schema';
import {APPLICATION_ROLE_QUERY,assertRoleInspection,type ApplicationRoleInspection} from '../src/infrastructure/database/role-policy';

const PROJECT='vsnrbjexusidlvhkhmqg';
const PRODUCTION='kkjzbqsaummyralqjqrb';
const DATABASES=['p01_empty_rehearsal','p01_legacy_rehearsal'] as const;
type TargetDatabase=typeof DATABASES[number];
const PHASES=['preflight','prepare','empty','legacy','verify','rollback'] as const;
type Phase=typeof PHASES[number];
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=resolve(root,'.p0-local');
const statePath=resolve(privateDir,'cloud-rehearsal-state.json');
const credentialPath=resolve(privateDir,'cloud-rehearsal-runtime.json');
const operationsPath=resolve(privateDir,'cloud-rehearsal-operations.jsonl');
const reportPath=resolve(privateDir,'cloud-rehearsal-report.json');
const TABLES=['institutions','people','platform_users','institution_memberships','role_assignments','auth_sessions','auth_throttle','campuses','academic_terms','academic_programs','academic_courses','curriculum_versions','security_audit_log'];
const limits=['Disposable cloud PostgreSQL; managed postgres defaults/migrations remain blocked','No Supabase Auth, Data API, Storage, Realtime or hosting certification','Date reversal is partial recovery, not full migration rollback or an application-ready schema'];
export type CloudMetadata={database:string;sessionUser:string;currentUser:string;version:number;defaults:number;relations:number;publicTypes:number;ledger:string|null;managedSchemas:number};
type Entry={hash:string;created_at:string};
type Roles=Record<'owner'|'creator'|'service'|'dashboard'|'runtime',string>;
type Membership={parent:string;member:string;admin_option:boolean;inherit_option:boolean;set_option:boolean};
type State={version:1;project:string;run:string;roles:Roles;roleOids:Record<string,number>;databaseOids:Record<string,number>;prepared:boolean;completed:Phase[];ledger:Entry[];controlHash:string;legacyTerms?:string[]};
class CloudError extends Error{}
function reject(code:string):never{throw new CloudError(code);}
function code(error:unknown){return error instanceof CloudError?error.message:'CLOUD_OPERATION_FAILED';}
export function normalizeCloudConnection(raw:string,env:Record<string,string|undefined>):URL{
 if(env.SIII_DATABASE_ENV!=='staging'||env.NODE_ENV==='production'||env.NODE_TLS_REJECT_UNAUTHORIZED==='0')reject('CLOUD_ENV_REJECTED');
 let url:URL;try{url=new URL(raw);}catch{reject('CLOUD_URL_REJECTED');}
 if(!url.searchParams.has('sslmode'))url.searchParams.set('sslmode','verify-full');
 return validateCloudConnection(url.toString(),env);
}
export function validateCloudPhase(phase:string|undefined):Phase{
 if(!PHASES.includes(phase as Phase))reject('CLOUD_PHASE_REJECTED');return phase as Phase;
}
export function validateCloudConnection(raw:string,env:Record<string,string|undefined>):URL{
 if(env.SIII_DATABASE_ENV!=='staging'||env.NODE_ENV==='production'||env.NODE_TLS_REJECT_UNAUTHORIZED==='0')reject('CLOUD_ENV_REJECTED');
 try{
  const url=new URL(raw),username=decodeURIComponent(url.username);
  assertNoConnectionOverrides(url);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.port!=='5432'||url.pathname!=='/postgres'||!url.password
   ||url.hostname.includes(PRODUCTION)||username.split('.').includes(PRODUCTION))reject('CLOUD_URL_REJECTED');
  const direct=url.hostname==='db.'+PROJECT+'.supabase.co'&&username==='postgres';
  const session=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&username==='postgres.'+PROJECT;
  if((!direct&&!session)||url.searchParams.get('sslmode')!=='verify-full')reject('CLOUD_URL_REJECTED');
  return url;
 }catch{reject('CLOUD_URL_REJECTED');}
}
export function assertFreshCloudDatabase(state:CloudMetadata,expected:TargetDatabase):void{
 if(!DATABASES.includes(expected)||state.database!==expected||state.sessionUser!=='postgres'||state.currentUser!=='postgres'
  ||state.version!==170011||state.defaults!==0||state.relations!==0||state.publicTypes!==0||state.ledger!==null||state.managedSchemas!==0)reject('CLOUD_DATABASE_NOT_FRESH');
}
export function assertCloudRoleGraph(rows:Membership[],roles:Roles):void{
 const names=['siii_app','siii_migrator',...Object.values(roles)];
 for(const edge of rows){
  const executor=names.includes(edge.parent)&&edge.member==='postgres';
  const runtime=edge.parent==='siii_app'&&edge.member===roles.runtime&&!edge.admin_option&&edge.inherit_option&&edge.set_option;
  if(!executor&&!runtime)reject('CLOUD_FIXTURE_ROLE_UNSAFE');
 }
 for(const parent of names){
  const edges=rows.filter(edge=>edge.parent===parent&&edge.member==='postgres');
  if(!edges.length)reject('CLOUD_EXECUTOR_ROLE_UNSAFE');
  const automatic=(edge:Membership)=>edge.admin_option&&!edge.inherit_option&&!edge.set_option;
  // PostgreSQL 17 gives a CREATEROLE creator ADMIN via its bootstrap grantor.
  // A separate grantor row enables INHERIT/SET without granting ADMIN back.
  const combined=edges.length===1&&edges[0].admin_option&&edges[0].inherit_option&&edges[0].set_option;
  const complementary=edges.length===2&&edges.filter(automatic).length===1
   &&edges.filter(edge=>!edge.admin_option&&edge.inherit_option&&edge.set_option).length===1;
  if(parent===roles.runtime){if(edges.length!==1||!automatic(edges[0]))reject('CLOUD_FIXTURE_ROLE_UNSAFE');}
  else if(!combined&&!complementary)reject('CLOUD_FIXTURE_ROLE_UNSAFE');
 }
 const runtime=rows.filter(edge=>edge.member===roles.runtime);
 if(runtime.length!==1)reject('CLOUD_FIXTURE_ROLE_UNSAFE');
}
function target(base:URL,database:TargetDatabase){if(!DATABASES.includes(database))reject('CLOUD_TARGET_REJECTED');const url=new URL(base);url.pathname='/'+database;return url;}
async function withClient<T>(url:URL,fn:(client:pg.Client)=>Promise<T>):Promise<T>{
 const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:5000,statement_timeout:60000,query_timeout:65000,application_name:'siii-cloud-rehearsal'});
 client.on('error',()=>{/* No driver details, SQL or credentials in output. */});
 try{await client.connect();return await fn(client);}finally{await client.end().catch(()=>undefined);}
}
async function metadata(client:pg.Client):Promise<CloudMetadata>{
 return (await client.query<CloudMetadata>(`SELECT current_database() AS database,session_user::text AS "sessionUser",current_user::text AS "currentUser",current_setting('server_version_num')::int AS version,
 (SELECT count(*)::int FROM pg_default_acl) AS defaults,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','S')) AS relations,
 (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS "publicTypes",to_regclass('drizzle.__drizzle_migrations')::text AS ledger,
 (SELECT count(*)::int FROM pg_namespace WHERE nspname IN('auth','storage','vault','realtime','supabase_migrations')) AS "managedSchemas"`)).rows[0];
}
async function assertTarget(client:pg.Client,database:TargetDatabase){const value=await metadata(client);if(value.database!==database||value.sessionUser!=='postgres'||value.currentUser!=='postgres'||value.version!==170011||value.managedSchemas!==0)reject('CLOUD_TARGET_REJECTED');return value;}
const CONTROL_SQL=`SELECT jsonb_build_object(
 'defaults',(SELECT jsonb_agg(to_jsonb(x) ORDER BY owner,schema,kind) FROM (SELECT pg_get_userbyid(defaclrole) AS owner,defaclnamespace AS schema,defaclobjtype AS kind,defaclacl::text AS acl FROM pg_default_acl) x),
 'schemas',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN('public','auth','storage','vault','realtime','supabase_migrations')),
 'public_objects',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'createdb',rolcreatedb,'createrole',rolcreaterole,'login',rolcanlogin) ORDER BY rolname) FROM pg_roles WHERE rolname IN('postgres','supabase_admin','anon','authenticated','service_role','dashboard_user')),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',roleid,'member',member,'grantor',grantor,'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY roleid,member,grantor) FROM pg_auth_members WHERE member IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role','dashboard_user','supabase_admin')))) AS snapshot`;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function controlInventory(base:URL){return withClient(base,async client=>{
 await client.query('BEGIN READ ONLY');try{
  const identity=await metadata(client);if(identity.database!=='postgres'||identity.sessionUser!=='postgres'||identity.currentUser!=='postgres'||identity.version!==170011)reject('CLOUD_TARGET_REJECTED');
  const executor=(await client.query('SELECT rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0];
  const databases=(await client.query('SELECT oid,datname,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=ANY($1::text[]) ORDER BY datname',[DATABASES])).rows;
  const snapshot=(await client.query(CONTROL_SQL)).rows[0].snapshot;
  const creators=(await client.query("SELECT DISTINCT pg_get_userbyid(d.defaclrole) AS creator,pg_has_role(current_user,d.defaclrole,'USAGE') AS usable,pg_has_role(current_user,d.defaclrole,'SET') AS can_set FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR n.nspname='public' ORDER BY creator")).rows;
  await client.query('COMMIT');return {identity,executor,databases,creators,snapshot,hash:digest(snapshot)};
 }finally{await client.query('ROLLBACK').catch(()=>undefined);}
});}
async function operation<T>(phase:Phase,name:string,inventory:unknown,fn:()=>Promise<T>):Promise<T>{
 const id=randomUUID();await appendFile(operationsPath,JSON.stringify({id,at:new Date().toISOString(),project:PROJECT,phase,name,status:'INTENT',inventory})+'\n',{mode:0o600});
 try{const result=await fn();await appendFile(operationsPath,JSON.stringify({id,at:new Date().toISOString(),status:'SUCCESS'})+'\n',{mode:0o600});return result;}
 catch(error){await appendFile(operationsPath,JSON.stringify({id,at:new Date().toISOString(),status:'FAILED',code:code(error)})+'\n',{mode:0o600});throw error;}
}
async function report(phase:Phase,data:unknown){const result={kind:'SIII_CLOUD_POSTGRES_REHEARSAL',projectRef:PROJECT,phase,at:new Date().toISOString(),data,limits};await writeFile(reportPath,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));}
function localLedger():Entry[]{const entries=readMigrationFiles({migrationsFolder:resolve(root,'db/migrations')}),times=[1791900000000,1791938000000,1791940000000,1791999037864,1792000681637,1792001102854];if(entries.length!==6||entries.some((entry,i)=>entry.folderMillis!==times[i]))reject('CLOUD_MIGRATION_SET_REJECTED');return entries.map(entry=>({hash:entry.hash,created_at:String(entry.folderMillis)}));}
async function save(state:State){await writeFile(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});}
async function load():Promise<State>{let state:State;try{state=JSON.parse(await readFile(statePath,'utf8'));}catch{reject('CLOUD_STATE_REQUIRED');}
 if(state.version!==1||state.project!==PROJECT||!/^[a-f0-9]{12}$/.test(state.run)||!Array.isArray(state.completed)||!state.completed.every(value=>PHASES.includes(value))||!state.prepared||JSON.stringify(state.ledger)!==JSON.stringify(localLedger())||!/^[a-f0-9]{64}$/.test(state.controlHash))reject('CLOUD_STATE_REJECTED');
 for(const kind of ['owner','creator','service','dashboard','runtime'] as const)if(state.roles?.[kind]!=='p01_'+state.run+'_'+kind)reject('CLOUD_STATE_REJECTED');
 return state;
}
async function assertOwned(base:URL,state:State){const inventory=await controlInventory(base);if(inventory.hash!==state.controlHash||inventory.databases.length!==2||inventory.databases.some(row=>row.owner!=='postgres'||state.databaseOids[row.datname]!==row.oid))reject('CLOUD_INVENTORY_DRIFT');
 await withClient(base,async client=>{
  const names=['siii_app','siii_migrator',...Object.values(state.roles)];
  const rows=(await client.query('SELECT oid,rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolcanlogin,rolinherit FROM pg_roles WHERE rolname=ANY($1::text[])',[names])).rows;
  if(rows.length!==names.length||rows.some(row=>state.roleOids[row.rolname]!==row.oid||row.rolsuper||row.rolbypassrls||row.rolcreatedb||row.rolcreaterole||row.rolreplication||row.rolcanlogin!==(row.rolname===state.roles.runtime)||row.rolinherit!==(row.rolname===state.roles.runtime)))reject('CLOUD_FIXTURE_ROLE_UNSAFE');
  const members=(await client.query<Membership>('SELECT pg_get_userbyid(roleid) AS parent,pg_get_userbyid(member) AS member,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[])) OR member IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))',[names])).rows;
  assertCloudRoleGraph(members,state.roles);
  const executors=(await client.query("SELECT rolname,pg_has_role('postgres',oid,'USAGE') AS inherit,pg_has_role('postgres',oid,'SET') AS can_set,EXISTS(SELECT FROM pg_auth_members m WHERE m.roleid=r.oid AND m.member=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND m.admin_option) AS admin FROM pg_roles r WHERE rolname=ANY($1::text[])",[names.filter(name=>name!==state.roles.runtime)])).rows;
  if(executors.some(row=>!row.inherit||!row.can_set||!row.admin))reject('CLOUD_EXECUTOR_ROLE_UNSAFE');
 });return inventory;
}
async function prepare(base:URL){
 try{await readFile(statePath);const state=await load();await assertOwned(base,state);await report('prepare',{repeated:true,databases:DATABASES,roles:state.roles});return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const before=await controlInventory(base);if(before.databases.length||!before.executor?.rolcreaterole||!before.executor.rolcreatedb)reject('CLOUD_PREPARE_REJECTED');
 const run=randomBytes(6).toString('hex'),roles=Object.fromEntries(['owner','creator','service','dashboard','runtime'].map(kind=>[kind,'p01_'+run+'_'+kind])) as Roles,names=['siii_app','siii_migrator',...Object.values(roles)];
 await withClient(base,async client=>{if((await client.query('SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[])',[names])).rowCount)reject('CLOUD_PREPARE_REJECTED');});
 const state:State={version:1,project:PROJECT,run,roles,roleOids:{},databaseOids:{},prepared:false,completed:[],ledger:localLedger(),controlHash:before.hash};
 const password=randomBytes(32).toString('hex');await writeFile(credentialPath,JSON.stringify({project:PROJECT,run,role:roles.runtime,password})+'\n',{mode:0o600,flag:'wx'});await save(state);
 await operation('prepare','create-fixture-roles',{before,roles:names,attributes:'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; NOLOGIN except unique runtime; runtime only INHERIT/SET siii_app without ADMIN; executor memberships only new roles'},()=>withClient(base,async client=>{
  await client.query('BEGIN');try{
   for(const name of names){const runtime=name===roles.runtime;await client.query('CREATE ROLE '+quoteIdentifier(name)+(runtime?" LOGIN INHERIT PASSWORD '"+password+"'":' NOLOGIN NOINHERIT')+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');if(!runtime)await client.query('GRANT '+quoteIdentifier(name)+' TO postgres WITH INHERIT TRUE, SET TRUE');}
   await client.query('GRANT siii_app TO '+quoteIdentifier(roles.runtime)+' WITH ADMIN FALSE, INHERIT TRUE, SET TRUE');await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  for(const row of (await client.query('SELECT oid,rolname FROM pg_roles WHERE rolname=ANY($1::text[])',[names])).rows)state.roleOids[row.rolname]=row.oid;
 }));await save(state);
 for(const database of DATABASES){await operation('prepare','create-disposable-database',{database,template:'template0',owner:'postgres',preexisting:false},()=>withClient(base,async client=>{await client.query('CREATE DATABASE '+quoteIdentifier(database)+' OWNER postgres TEMPLATE template0');state.databaseOids[database]=(await client.query('SELECT oid FROM pg_database WHERE datname=$1',[database])).rows[0].oid;}));await save(state);await withClient(target(base,database),async client=>assertFreshCloudDatabase(await metadata(client),database));}
 state.prepared=true;await assertOwned(base,state);await save(state);await report('prepare',{databases:DATABASES,roles,inventoryRecordedBeforeApply:true,resourcesPreserved:true});
}
function cli(script:string,url:URL,expected:string,extra:Record<string,string>={},status=0){const result=spawnSync(process.execPath,['--import','tsx',script],{cwd:root,env:{...process.env,NODE_ENV:'test',SIII_DATABASE_ENV:'staging',DATABASE_URL:url.toString(),...extra},encoding:'utf8',timeout:180000,windowsHide:true,maxBuffer:2*1024*1024});if(result.status!==status||!((result.stdout??'')+(result.stderr??'')).includes(expected))reject('CLOUD_CLI_FAILED');return expected;}
async function applied(client:pg.Client,state:State){await assertMigrationLedger(client,resolve(root,'db/migrations'));const entries=(await client.query<Entry>('SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;if(JSON.stringify(entries)!==JSON.stringify(state.ledger))reject('CLOUD_LEDGER_MISMATCH');
 const tables=(await client.query("SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind IN('r','p') ORDER BY c.relname",[TABLES])).rows;if(tables.length!==13||tables.some(row=>row.owner!=='siii_migrator'||!row.rls))reject('CLOUD_SCHEMA_UNSAFE');
 const audit=(await client.query("SELECT has_table_privilege('siii_app','public.security_audit_log','SELECT') AS read,has_table_privilege('siii_app','public.security_audit_log','INSERT') AS append,has_any_column_privilege('siii_app','public.security_audit_log','UPDATE') AS update,has_table_privilege('siii_app','public.security_audit_log','DELETE,TRUNCATE') AS destructive")).rows[0];if(!audit.read||!audit.append||audit.update||audit.destructive)reject('CLOUD_SCHEMA_UNSAFE');
 const leaks=(await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES('anon'),('authenticated')) api(name) WHERE n.nspname='public' AND c.relkind IN('r','p') AND (has_table_privilege(api.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(api.name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))")).rowCount;if(leaks)reject('CLOUD_SCHEMA_UNSAFE');return {ledger:entries,tables,audit};
}
export function addCloudReplayCreatorPrivileges(sql:string,roles:Pick<Roles,'owner'|'creator'>):string{
 const marker='BEGIN;\nCREATE SCHEMA IF NOT EXISTS "public";\n';
 if(sql.split(marker).length!==2||sql.split('BEGIN;').length!==2||sql.split('COMMIT;').length!==2||!sql.endsWith('COMMIT;\n')||roles.owner===roles.creator)reject('CLOUD_REPLAY_BOUNDARY_REJECTED');
 return sql.replace(marker,marker+'GRANT USAGE,CREATE ON SCHEMA public TO '+quoteIdentifier(roles.owner)+','+quoteIdentifier(roles.creator)+';\n');
}
export function emitCloudLegacyReplay(snapshot:unknown,roles:Pick<Roles,'owner'|'creator'|'service'|'dashboard'>):string{
 return addCloudReplayCreatorPrivileges(emitInstitutionalSchema(snapshot,{roleMap:{postgres:roles.owner,supabase_admin:roles.creator,service_role:roles.service,dashboard_user:roles.dashboard}}),roles);
}
async function migratePhase(base:URL,state:State,phase:'empty'|'legacy'){
 if(state.completed.includes('rollback'))reject('CLOUD_REVERSED_SCHEMA');const database=phase==='empty'?DATABASES[0]:DATABASES[1],url=target(base,database);
 if(!state.completed.includes(phase)){
  const before=await withClient(url,async client=>{const value=await metadata(client);assertFreshCloudDatabase(value,database);return value;});
  if(phase==='empty')await operation(phase,'seed-own-creator-defaults',{database,creators:[state.roles.owner,state.roles.creator],objects:'Synthetic global/scoped function defaults only; schema remains empty'},()=>withClient(url,async client=>{
   for(const creator of [state.roles.owner,state.roles.creator])for(const scope of ['',' IN SCHEMA public'])await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+quoteIdentifier(creator)+scope+' GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,siii_app');
  }));
  if(phase==='legacy'){
   await operation(phase,'replay-exact-legacy-schema',{before,databases:[database],tables:TABLES.filter(name=>name!=='auth_throttle'),enumTypes:['entity_status','membership_status','user_role'],creators:[state.roles.owner,state.roles.creator],temporaryCreatorPrivilege:{schema:'public',privileges:['USAGE','CREATE'],transaction:'same replay transaction; rolled back on failure; final source ACL restored by replay'},managedSchemas:false},()=>withClient(url,async client=>{const snapshot=JSON.parse(await readFile(resolve(root,'docs/audit/P0_1_PRODUCTION_STRUCTURE.json'),'utf8'));await client.query(emitCloudLegacyReplay(snapshot,state.roles));const signature=await schemaSignature(client);for(const name of ['0001-schema.json','supabase-2026-10-14-schema.json'])if(JSON.stringify(signature)!==JSON.stringify(JSON.parse(await readFile(resolve(root,'db/baseline',name),'utf8'))))reject('CLOUD_BASELINE_DRIFT');}));
   await operation(phase,'reject-missing-ledger',{database,expected:'BASELINE_REQUIRED',writeExpected:false},async()=>cli('db/migrate.ts',url,'BASELINE_REQUIRED',{},1));
   await withClient(url,async client=>{if((await metadata(client)).ledger!==null)reject('CLOUD_LEDGER_MISMATCH');});
   await operation(phase,'baseline-cli',{database,ledger:state.ledger.slice(0,2),objects:['drizzle','drizzle.__drizzle_migrations','drizzle.__drizzle_migrations_id_seq']},async()=>cli('scripts/db-baseline.ts',url,'BASELINE_ADOPTED',{SIII_BASELINE_CONFIRM:'0001_academic_catalogs'}));
   await operation(phase,'seed-legacy-synthetic-fixtures',{database,objects:['synthetic institution','HISTORICAL/MODIFIED terms','cloud_legacy_rpc'],defaultCreators:[state.roles.owner,state.roles.creator]},()=>withClient(url,async client=>{
    const entries=(await client.query<Entry>('SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;if(JSON.stringify(entries)!==JSON.stringify(state.ledger.slice(0,2)))reject('CLOUD_LEDGER_MISMATCH');
    const institution=(await client.query("INSERT INTO institutions(name,code) VALUES('Synthetic cloud dates',$1) RETURNING id",['dates-'+state.run])).rows[0].id;
    const terms=(await client.query("INSERT INTO academic_terms(institution_id,name,code,start_date,end_date) VALUES($1,'Synthetic historical','HISTORICAL','2026-01-01 12:00:00','2026-06-30 18:00:00'),($1,'Synthetic modified','MODIFIED','2026-02-01 09:00:00','2026-07-31 16:00:00') RETURNING id,code",[institution])).rows;
    state.legacyTerms=['HISTORICAL','MODIFIED'].map(code=>terms.find(row=>row.code===code)!.id);
    await client.query('GRANT USAGE,CREATE ON SCHEMA public TO '+quoteIdentifier(state.roles.owner)+','+quoteIdentifier(state.roles.creator));
    for(const creator of [state.roles.owner,state.roles.creator])for(const scope of ['',' IN SCHEMA public']){await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+quoteIdentifier(creator)+scope+' GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,siii_app');await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+quoteIdentifier(creator)+scope+' GRANT ALL ON TABLES TO siii_app');await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+quoteIdentifier(creator)+scope+' GRANT ALL ON SEQUENCES TO siii_app');}
    await client.query('SET ROLE '+quoteIdentifier(state.roles.creator));try{await client.query("CREATE FUNCTION public.cloud_legacy_rpc() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT 1'");}finally{await client.query('RESET ROLE');}
    if(!(await client.query("SELECT has_function_privilege('anon','public.cloud_legacy_rpc()','EXECUTE') AS allowed")).rows[0].allowed)reject('CLOUD_FIXTURE_SETUP_FAILED');
   }));await save(state);
  }
 }
 await operation(phase,'canonical-migrate-cli',{database,ledger:state.ledger,tables:TABLES,objects:['drizzle ledger','institutional enums, indexes, constraints, RLS, policies, ACLs and own-creator defaults']},async()=>cli('db/migrate.ts',url,'MIGRATIONS_APPLIED'));
 const result=await withClient(url,async client=>{await assertTarget(client,database);return applied(client,state);});
 await operation(phase,'repeat-migrate-cli',{database,ledger:state.ledger},async()=>cli('db/migrate.ts',url,'MIGRATIONS_APPLIED'));await withClient(url,client=>applied(client,state));
 if(phase==='legacy')await operation(phase,'repeat-baseline-cli',{database,ledger:state.ledger},async()=>cli('scripts/db-baseline.ts',url,'BASELINE_ALREADY_RECORDED',{SIII_BASELINE_CONFIRM:'0001_academic_catalogs'}));
 if(!state.completed.includes(phase)){state.completed.push(phase);await save(state);}await assertOwned(base,state);await report(phase,{database,cliApplied:true,idempotence:true,...result});
}
async function runtimeChecks(base:URL,database:TargetDatabase,state:State){
 const credential=JSON.parse(await readFile(credentialPath,'utf8')) as {project:string;run:string;role:string;password:string};if(credential.project!==PROJECT||credential.run!==state.run||credential.role!==state.roles.runtime||!/^[a-f0-9]{64}$/.test(credential.password))reject('CLOUD_CREDENTIAL_STATE_REJECTED');
 const url=target(base,database);url.username=base.hostname.endsWith('.pooler.supabase.com')?state.roles.runtime+'.'+PROJECT:state.roles.runtime;url.password=credential.password;
 return operation('verify','real-login-runtime-fixtures',{database,login:state.roles.runtime,inheritedRole:'siii_app',tables:TABLES,rows:'Synthetic identifiers only; no existing rows modified'},()=>withClient(url,async client=>{
  const identity=(await client.query('SELECT session_user::text,current_user::text')).rows[0];if(identity.session_user!==state.roles.runtime||identity.current_user!==state.roles.runtime)reject('CLOUD_RUNTIME_IDENTITY_REJECTED');assertRoleInspection((await client.query<ApplicationRoleInspection>(APPLICATION_ROLE_QUERY)).rows[0]);
  const suffix=randomUUID(),institution=(await client.query("INSERT INTO institutions(name,code) VALUES('Synthetic cloud runtime',$1) RETURNING id",[suffix])).rows[0].id;
  const person=(await client.query("INSERT INTO people(first_name,last_name) VALUES('Synthetic','Cloud runtime') RETURNING id")).rows[0].id,user=(await client.query('INSERT INTO platform_users(person_id,username) VALUES($1,$2) RETURNING id',[person,'cloud-'+suffix])).rows[0].id;
  const member=(await client.query('INSERT INTO institution_memberships(institution_id,user_id) VALUES($1,$2) RETURNING id',[institution,user])).rows[0].id,grant=(await client.query("INSERT INTO role_assignments(membership_id,role) VALUES($1,'coordinator') RETURNING id",[member])).rows[0].id;
  const session=(await client.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour') RETURNING id",[user,'synthetic-'+suffix])).rows[0].id,campus=(await client.query("INSERT INTO campuses(institution_id,code,name) VALUES($1,$2,'Synthetic campus') RETURNING id",[institution,suffix])).rows[0].id;
  const term=(await client.query("INSERT INTO academic_terms(institution_id,code,name,start_date,end_date) VALUES($1,$2,'Synthetic term','2026-01-01','2026-06-30') RETURNING id",[institution,suffix])).rows[0].id;
  const program=(await client.query("INSERT INTO academic_programs(institution_id,code,name,level,modality) VALUES($1,$2,'Synthetic program','ingenieria','presencial') RETURNING id",[institution,suffix])).rows[0].id,course=(await client.query("INSERT INTO academic_courses(institution_id,code,name,credits) VALUES($1,$2,'Synthetic course',3) RETURNING id",[institution,suffix])).rows[0].id;
  const curriculum=(await client.query('INSERT INTO curriculum_versions(institution_id,program_id,version) VALUES($1,$2,$3) RETURNING id',[institution,program,suffix])).rows[0].id;
  await client.query("INSERT INTO auth_throttle(key,scope,expires_at) VALUES($1,'login_account',now()+interval '1 hour')",['synthetic-'+suffix]);
  const updates:[string,string,unknown][]=[['institutions',"name='Synthetic updated'",institution],['people',"first_name='Synthetic updated'",person],['platform_users','must_change_password=true',user],['institution_memberships',"status='suspended'",member],['role_assignments','revoked_at=now()',grant],['auth_sessions','last_seen_at=now()',session],['campuses',"name='Synthetic updated'",campus],['academic_terms',"name='Synthetic updated'",term],['academic_programs',"name='Synthetic updated'",program],['academic_courses','credits=4',course],['curriculum_versions',"version='synthetic-updated'",curriculum]];
  for(const [table,change,id] of updates){if((await client.query('SELECT id FROM public.'+quoteIdentifier(table)+' WHERE id=$1',[id])).rowCount!==1||(await client.query('UPDATE public.'+quoteIdentifier(table)+' SET '+change+' WHERE id=$1',[id])).rowCount!==1)reject('CLOUD_RUNTIME_CHECK_FAILED');}
  if((await client.query('SELECT key FROM auth_throttle WHERE key=$1',['synthetic-'+suffix])).rowCount!==1||(await client.query('UPDATE auth_throttle SET failures=1 WHERE key=$1',['synthetic-'+suffix])).rowCount!==1)reject('CLOUD_RUNTIME_CHECK_FAILED');
  await client.query("INSERT INTO security_audit_log(action,target,details) VALUES('rehearsal.cloud.runtime','synthetic',jsonb_build_object('environment','cloud_disposable'))");
  if(!(await client.query("SELECT id FROM security_audit_log WHERE action='rehearsal.cloud.runtime' LIMIT 1")).rowCount)reject('CLOUD_RUNTIME_CHECK_FAILED');
  // Check destructive privileges in the catalog; never issue DELETE/TRUNCATE or cleanup.
  return {identity,realLogin:true,mutableTables:12,auditAppendOnly:true,destructiveQueriesExecuted:false};
 }));
}
/** Uses an exclusively owned, idle client; every probe is rolled back, including injected failures. */
export async function runPermissionProbes(client:pg.Client,roles:Pick<Roles,'owner'|'creator'>,run:string){
 if(!/^[a-f0-9]{12}$/.test(run))reject('CLOUD_PROBE_RUN_REJECTED');
 const future=[];
 await client.query('BEGIN');
 try{
  await client.query('SAVEPOINT restrictive_rls_probe');
  await client.query('GRANT SELECT ON public.people TO anon,authenticated');
  await client.query('CREATE POLICY cloud_rehearsal_permissive ON public.people FOR SELECT TO anon,authenticated USING(true)');
  for(const api of ['anon','authenticated']){
   await client.query('SET LOCAL ROLE '+quoteIdentifier(api));
   if((await client.query('SELECT id FROM public.people LIMIT 1')).rowCount)reject('CLOUD_NEGATIVE_CHECK_FAILED');
   await client.query('RESET ROLE');
  }
  await client.query('ROLLBACK TO SAVEPOINT restrictive_rls_probe');
  await client.query('RELEASE SAVEPOINT restrictive_rls_probe');
  await client.query('GRANT USAGE,CREATE ON SCHEMA public TO '+quoteIdentifier(roles.owner)+','+quoteIdentifier(roles.creator));
  for(const [i,creator] of [roles.owner,roles.creator].entries()){
   const name='cloud_'+run+'_'+i;
   await client.query('SET LOCAL ROLE '+quoteIdentifier(creator));
   await client.query('CREATE TABLE public.'+quoteIdentifier(name+'_table')+'(id integer)');
   await client.query('CREATE SEQUENCE public.'+quoteIdentifier(name+'_seq'));
   await client.query('CREATE FUNCTION public.'+quoteIdentifier(name+'_rpc')+"() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT 1'");
   await client.query('RESET ROLE');
   for(const role of ['anon','authenticated','siii_app']){
    const checks=(await client.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS table_access,has_sequence_privilege($1,$3,'USAGE,SELECT,UPDATE') AS sequence_access,has_function_privilege($1,$4,'EXECUTE') AS rpc_access",[role,'public.'+name+'_table','public.'+name+'_seq','public.'+name+'_rpc()'])).rows[0];
    if(Object.values(checks).some(Boolean))reject('CLOUD_DEFAULT_CHECK_FAILED');
   }
   future.push({creator,table:name+'_table',sequence:name+'_seq',rpc:name+'_rpc',denied:true,persistence:'rolled-back' as const});
  }
  if((await client.query("SELECT to_regprocedure('public.cloud_legacy_rpc()') AS rpc")).rows[0].rpc)for(const role of ['anon','authenticated','siii_app'])if((await client.query("SELECT has_function_privilege($1,'public.cloud_legacy_rpc()','EXECUTE') AS allowed",[role])).rows[0].allowed)reject('CLOUD_DEFAULT_CHECK_FAILED');
 }finally{
  // ROLLBACK also restores SET LOCAL ROLE when a failed query aborted the transaction.
  try{await client.query('ROLLBACK');}finally{await client.query('RESET ROLE');}
 }
 return {restrictiveRls:true,future,probesRolledBack:true};
}
async function permissionChecks(base:URL,database:TargetDatabase,state:State){return operation('verify','restrictive-rls-and-future-default-fixtures',{database,temporaryGrantAndPolicy:'people; transaction rolled back',futureCreators:[state.roles.owner,state.roles.creator],futureNames:'cloud_'+state.run+'_0/1_{table,seq,rpc}',futurePersistence:'transaction-only; rolled back on success and failure',temporarySchemaGrant:'public USAGE, CREATE for fixture creators; rolled back',legacyRpc:'cloud_legacy_rpc'},()=>withClient(target(base,database),async client=>{
 await assertTarget(client,database);return runPermissionProbes(client,state.roles,state.run);
}));}
async function securitySnapshot(client:pg.Client){return (await client.query(`SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'policies',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',p.polname,'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY c.relname,p.polname) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'column_acl',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'acl',a.attacl::text) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped),
 'defaults',(SELECT jsonb_agg(jsonb_build_object('owner',defaclrole,'schema',defaclnamespace,'kind',defaclobjtype,'acl',defaclacl::text) ORDER BY defaclrole,defaclnamespace,defaclobjtype) FROM pg_default_acl),
 'routines',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'definer',p.prosecdef,'config',p.proconfig) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'ledger',(SELECT jsonb_agg(jsonb_build_object('hash',hash,'at',created_at) ORDER BY created_at,id) FROM drizzle.__drizzle_migrations),
 'audit',(SELECT jsonb_agg(md5(row_to_json(a)::text) ORDER BY id) FROM security_audit_log a)) AS snapshot`)).rows[0].snapshot;}
async function rollback(base:URL,state:State){
 if(!state.completed.includes('verify')||state.legacyTerms?.length!==2)reject('CLOUD_PHASE_STATE_REJECTED');const database=DATABASES[1];
 const result=await operation('rollback','legacy-date-partial-recovery',{database,columns:['academic_terms.start_date','academic_terms.end_date'],retained:['legacy_start_date','legacy_end_date','ledger','RLS','ACL','policies','audit'],fixtures:state.legacyTerms,fullMigrationRollback:false},()=>withClient(target(base,database),async client=>{
  await assertTarget(client,database);await applied(client,state);await client.query('BEGIN');try{
   await client.query("SELECT pg_advisory_xact_lock(hashtext('siii:migrations'))");const before=await securitySnapshot(client),types=(await client.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='academic_terms' AND column_name IN('start_date','end_date','legacy_start_date','legacy_end_date') ORDER BY column_name")).rows;
   const map=Object.fromEntries(types.map(row=>[row.column_name,row.data_type]));if(types.length!==4||map.legacy_start_date!=='timestamp without time zone'||map.legacy_end_date!=='timestamp without time zone')reject('CLOUD_REVERSAL_SCHEMA_UNSUPPORTED');
   if(map.start_date==='timestamp without time zone'&&map.end_date==='timestamp without time zone'&&state.completed.includes('rollback')){await client.query('COMMIT');return {repeated:true,securityUnchanged:true,ledgerUnchanged:true};}
   if(map.start_date!=='date'||map.end_date!=='date'||state.completed.includes('rollback'))reject('CLOUD_REVERSAL_SCHEMA_UNSUPPORTED');
   await client.query('LOCK TABLE public.academic_terms,public.security_audit_log IN ACCESS EXCLUSIVE MODE');
   await client.query("UPDATE academic_terms SET start_date='2026-03-15',end_date='2026-08-15' WHERE id=$1",[state.legacyTerms![1]]);
   const institution=(await client.query('SELECT institution_id FROM academic_terms WHERE id=$1',[state.legacyTerms![0]])).rows[0]?.institution_id;if(!institution)reject('CLOUD_FIXTURE_DATA_MISSING');
   const newTerm=(await client.query("INSERT INTO academic_terms(institution_id,name,code,start_date,end_date) VALUES($1,'Synthetic new date',$2,'2026-09-01','2026-12-20') RETURNING id",[institution,'NEW-'+state.run])).rows[0].id;
   await client.query("ALTER TABLE academic_terms ALTER COLUMN start_date TYPE timestamp without time zone USING(CASE WHEN legacy_start_date IS NOT NULL AND legacy_start_date::date=start_date THEN legacy_start_date ELSE start_date::timestamp END),ALTER COLUMN end_date TYPE timestamp without time zone USING(CASE WHEN legacy_end_date IS NOT NULL AND legacy_end_date::date=end_date THEN legacy_end_date ELSE end_date::timestamp END)");
   if(digest(await securitySnapshot(client))!==digest(before))reject('CLOUD_REVERSAL_SECURITY_CHANGED');
   const rows=(await client.query('SELECT id,start_date::text AS start,end_date::text AS end FROM academic_terms WHERE id=ANY($1::uuid[])',[[...state.legacyTerms!,newTerm]])).rows;
   const expected=[['2026-01-01 12:00:00','2026-06-30 18:00:00'],['2026-03-15 00:00:00','2026-08-15 00:00:00'],['2026-09-01 00:00:00','2026-12-20 00:00:00']];for(const [i,id] of [...state.legacyTerms!,newTerm].entries()){const row=rows.find(value=>value.id===id);if(row?.start!==expected[i][0]||row?.end!==expected[i][1])reject('CLOUD_REVERSAL_DATA_CHANGED');}
   await client.query("INSERT INTO security_audit_log(action,target,details) VALUES('rehearsal.cloud.dates.rollback','academic_terms',jsonb_build_object('environment','cloud_disposable','partial',true,'ledger','unchanged'))");await client.query('COMMIT');return {securityUnchanged:true,ledgerUnchanged:true,syntheticDates:rows,partial:true,applicationReady:false};
  }catch(error){await client.query('ROLLBACK');throw error;}
 }));if(!state.completed.includes('rollback')){state.completed.push('rollback');await save(state);}await assertOwned(base,state);await report('rollback',result);
}
async function main(){
 const phase=validateCloudPhase(process.argv[2]);if(process.argv.length!==3)reject('CLOUD_PHASE_REJECTED');let input:{databaseUrl?:unknown};try{input=JSON.parse(await readFile(resolve(privateDir,'staging-connection.json'),'utf8'));}catch{reject('CLOUD_CONNECTION_INPUT_REQUIRED');}if(typeof input?.databaseUrl!=='string')reject('CLOUD_CONNECTION_INPUT_REQUIRED');const base=normalizeCloudConnection(input.databaseUrl,process.env);await mkdir(privateDir,{recursive:true});
 if(phase==='preflight'){await report(phase,{inventory:await controlInventory(base),mutationsExecuted:false,existingResourcesNeverDeleted:true});return;}
 if(phase==='prepare'){await prepare(base);return;}const state=await load();await assertOwned(base,state);
 if(phase==='empty'||phase==='legacy'){await migratePhase(base,state,phase);return;}
 if(phase==='rollback'){await rollback(base,state);return;}
 if(!state.completed.includes('empty')||!state.completed.includes('legacy')||state.completed.includes('verify'))reject('CLOUD_PHASE_STATE_REJECTED');
 const results=[];for(const database of DATABASES){const schema=await withClient(target(base,database),async client=>{await assertTarget(client,database);return applied(client,state);}),runtime=await runtimeChecks(base,database,state),permissions=await permissionChecks(base,database,state);results.push({database,schema,runtime,permissions});}
 await assertOwned(base,state);state.completed.push('verify');await save(state);await report(phase,{results,managedMetadataUnchanged:true,resourcesPreserved:true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(code(error));process.exitCode=1;});
