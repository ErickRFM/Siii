import {readFileSync} from 'node:fs';
import {readReleaseMigrations,releaseDefinitionHash} from '../db/release-profile';
import {SCHEMA_SIGNATURE_SQL} from '../db/schema-signature';
const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";
/** Reviewed connector transport for the same managed SQL and actual hashes as db:migrate. */
export function managedReleaseSql(target:{database?:string;actor?:string;expectedRows?:Record<string,string>}={}){
 const migrations=readReleaseMigrations('supabase-v1');
 const reference=JSON.parse(readFileSync(new URL('../db/baseline/0001-schema.json',import.meta.url),'utf8'));
 const tables=[...new Set((reference.columns as {table_name:string}[]).map(x=>x.table_name))];
 if(!target.database&&!target.expectedRows)throw Error('PRODUCTION_BACKUP_GUARD_REQUIRED');
 if(target.expectedRows&&(Object.keys(target.expectedRows).length!==tables.length||tables.some(t=>! /^[a-f0-9]{64}$/.test(target.expectedRows![t]??''))))throw Error('BACKUP_ROW_GUARD_INVALID');
 const guard=target.expectedRows?tables.map(t=>`IF (SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text,'UTF8')),'hex') FROM public."${t}" t)<>${literal(target.expectedRows![t])} THEN RAISE EXCEPTION 'BACKUP_SOURCE_CHANGED'; END IF;`).join('\n'):'';
 const expected=migrations.map(m=>({hash:m.hash,created_at:m.folderMillis}));
 const signature=SCHEMA_SIGNATURE_SQL.trim().replace(/AS signature\s*$/,'INTO signature');
 return `BEGIN;
SELECT pg_advisory_xact_lock(hashtext('siii:migrations'));
DO $release$
DECLARE signature jsonb; history jsonb; count_entries integer:=0;
 expected jsonb:=${literal(JSON.stringify(expected))}::jsonb;
BEGIN
 IF current_database()<>${literal(target.database??'postgres')} OR session_user<>${literal(target.actor??'postgres')} OR (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'RELEASE_ACTOR_UNSAFE'; END IF;
 IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
  ${signature};
  IF signature<>${literal(JSON.stringify(reference))}::jsonb THEN RAISE EXCEPTION 'BASELINE_SCHEMA_DRIFT'; END IF;
  ${guard}
  CREATE SCHEMA IF NOT EXISTS drizzle;
  CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL);
  ${migrations.slice(0,2).map(m=>`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${literal(m.hash)},${m.folderMillis});`).join('\n  ')}
 END IF;
 SELECT count(*),coalesce(jsonb_agg(jsonb_build_object('hash',hash,'created_at',created_at) ORDER BY created_at,id),'[]') INTO count_entries,history FROM drizzle.__drizzle_migrations;
 IF count_entries<2 OR count_entries>jsonb_array_length(expected) OR history<>(SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(expected) WITH ORDINALITY WHERE ordinality<=count_entries) THEN RAISE EXCEPTION 'MIGRATION_LEDGER_DRIFT'; END IF;
 IF to_regclass('drizzle.siii_release_profile') IS NOT NULL THEN
  IF (SELECT count(*) FROM drizzle.siii_release_profile)<>1 OR NOT EXISTS(SELECT FROM drizzle.siii_release_profile WHERE profile='supabase-v1' AND definition_hash=${literal(releaseDefinitionHash('supabase-v1'))}) THEN RAISE EXCEPTION 'MIGRATION_PROFILE_DRIFT'; END IF;
 ELSE
  IF count_entries>3 THEN RAISE EXCEPTION 'MIGRATION_PROFILE_CONFLICT'; END IF;
  CREATE TABLE drizzle.siii_release_profile(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),profile text NOT NULL,definition_hash text NOT NULL,registered_at timestamptz NOT NULL DEFAULT now());
  INSERT INTO drizzle.siii_release_profile(profile,definition_hash) VALUES('supabase-v1',${literal(releaseDefinitionHash('supabase-v1'))});
 END IF;
 ${migrations.slice(2).map((m,i)=>`IF count_entries<=${i+2} THEN\n${m.sql.filter(s=>s.trim()).map(s=>'EXECUTE '+literal(s)+';').join('\n')}\nINSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${literal(m.hash)},${m.folderMillis});\nEND IF;`).join('\n')}
END $release$;
COMMIT;`;
}
