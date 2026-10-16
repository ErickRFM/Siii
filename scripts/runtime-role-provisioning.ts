import {releaseDefinitionHash} from '../db/release-profile';
/** Server-side random credential, encrypted to the operator; no password literal in the query. */
export function runtimeRoleProvisioningSql(project:'staging'|'production',role:string,publicKey:string){
 if(!['staging','production'].includes(project)||!new RegExp('^siii_'+project+'_web_[a-f0-9]{12}$').test(role)||!publicKey.startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----'))throw Error('RUNTIME_PROVISIONING_INPUT_INVALID');
 const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";
 const fingerprint=releaseDefinitionHash('supabase-v1');
 return `BEGIN;
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR session_user<>'postgres' OR NOT EXISTS(SELECT FROM drizzle.siii_release_profile WHERE profile='supabase-v1' AND definition_hash=${literal(fingerprint)}) OR (SELECT count(*) FROM drizzle.__drizzle_migrations)<>17 THEN RAISE EXCEPTION 'RELEASE_RUNTIME_PREFLIGHT_FAILED'; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname=${literal(role)}) THEN RAISE EXCEPTION 'RUNTIME_ROLE_ALREADY_EXISTS'; END IF;
END $guard$;
CREATE TABLE IF NOT EXISTS drizzle.siii_credential_handoff(role_name text PRIMARY KEY,ciphertext bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON drizzle.siii_credential_handoff FROM PUBLIC,anon,authenticated,siii_app;
DO $credential$
DECLARE password text:=encode(extensions.gen_random_bytes(48),'hex');
BEGIN
 EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',${literal(role)},password);
 EXECUTE format('GRANT siii_app TO %I',${literal(role)});
 INSERT INTO drizzle.siii_credential_handoff(role_name,ciphertext) VALUES(${literal(role)},extensions.pgp_pub_encrypt(jsonb_build_object('role',${literal(role)},'password',password)::text,extensions.dearmor(${literal(publicKey)}),'cipher-algo=aes256'));
 INSERT INTO public.security_audit_log(action,target,request_id,details) VALUES('database.runtime_role.provisioned',${literal(role)},gen_random_uuid()::text,jsonb_build_object('environment',${literal(project)},'credential','encrypted-to-operator','role','siii_app'));
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'RUNTIME_CREDENTIAL_PROVISION_FAILED';
END $credential$;
COMMIT;`;
}
