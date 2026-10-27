-- P1 MFA: additive identity assurance, encrypted factors, single-use hashed challenges/recovery.
ALTER TABLE platform_users ADD COLUMN auth_version integer NOT NULL DEFAULT 0 CONSTRAINT platform_users_auth_version_check CHECK(auth_version>=0);
ALTER TABLE auth_sessions ADD COLUMN auth_version integer NOT NULL DEFAULT 0 CONSTRAINT auth_sessions_auth_version_check CHECK(auth_version>=0);
ALTER TABLE auth_sessions ADD COLUMN mfa_verified_at timestamptz;
ALTER TABLE auth_sessions ADD COLUMN step_up_at timestamptz;
--> statement-breakpoint
CREATE TABLE auth_mfa_factors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 secret_encrypted text, enabled_at timestamptz, revoked_at timestamptz,
 last_time_step bigint CONSTRAINT auth_mfa_factor_step_check CHECK(last_time_step IS NULL OR last_time_step>=0),
 failed_attempts integer NOT NULL DEFAULT 0 CONSTRAINT auth_mfa_factor_attempts_check CHECK(failed_attempts BETWEEN 0 AND 5),
 blocked_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT auth_mfa_factor_secret_check CHECK(enabled_at IS NULL OR secret_encrypted IS NOT NULL)
);
CREATE UNIQUE INDEX auth_mfa_factor_user_uidx ON auth_mfa_factors(user_id);
CREATE TABLE auth_mfa_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
 auth_version integer NOT NULL CONSTRAINT auth_mfa_enrollment_version_check CHECK(auth_version>=0), secret_encrypted text NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CONSTRAINT auth_mfa_enrollment_attempts_check CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_mfa_enrollment_user_idx ON auth_mfa_enrollments(user_id);
CREATE INDEX auth_mfa_enrollment_expiry_idx ON auth_mfa_enrollments(expires_at);
CREATE TABLE auth_mfa_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 factor_id uuid NOT NULL REFERENCES auth_mfa_factors(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, auth_version integer NOT NULL CONSTRAINT auth_mfa_challenge_version_check CHECK(auth_version>=0),
 attempts integer NOT NULL DEFAULT 0 CONSTRAINT auth_mfa_challenge_attempts_check CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_mfa_challenge_user_idx ON auth_mfa_challenges(user_id);
CREATE INDEX auth_mfa_challenge_expiry_idx ON auth_mfa_challenges(expires_at);
CREATE TABLE auth_mfa_recovery_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
 factor_id uuid NOT NULL REFERENCES auth_mfa_factors(id) ON DELETE CASCADE,
 code_hash text NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT auth_mfa_recovery_code_uidx UNIQUE(user_id,code_hash)
);
CREATE INDEX auth_mfa_recovery_factor_idx ON auth_mfa_recovery_codes(factor_id);
--> statement-breakpoint
DO $$
DECLARE table_name text; api_role text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['auth_mfa_factors','auth_mfa_enrollments','auth_mfa_challenges','auth_mfa_recovery_codes'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',table_name);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,api_role);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %I USING(false) WITH CHECK(false)','p1_deny_'||api_role,table_name,api_role);
   END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO siii_app',table_name);
  EXECUTE format('CREATE POLICY p1_backend_access ON public.%I FOR ALL TO siii_app USING(true) WITH CHECK(true)',table_name);
  EXECUTE format('ALTER TABLE public.%I OWNER TO siii_migrator',table_name);
 END LOOP;
END $$;
