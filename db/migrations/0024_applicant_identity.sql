-- Additive C32 only. Existing auto-verification is not mailbox ownership proof.
ALTER TABLE applicant_profiles ADD COLUMN verification_expires_at timestamptz, ADD COLUMN mailbox_verified_at timestamptz;
-- Do not merge conflicting legacy identities; a collision stops release for manual reconciliation.
CREATE UNIQUE INDEX applicant_profiles_canonical_email_uidx ON applicant_profiles(lower(btrim(email)));
ALTER TABLE admission_cycles ADD COLUMN application_sequence integer NOT NULL DEFAULT 0 CHECK (application_sequence >= 0);
ALTER TABLE auth_throttle DROP CONSTRAINT auth_throttle_scope_check;
ALTER TABLE auth_throttle ADD CONSTRAINT auth_throttle_scope_check CHECK (scope IN ('login_account','login_ip','password_account','password_ip','invitation_sender','invitation_accept_ip','password_reset_account','password_reset_ip','admissions_ip','admissions_account'));
CREATE TABLE applicant_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), applicant_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE RESTRICT,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CONSTRAINT applicant_session_expiry CHECK (expires_at>created_at AND expires_at<=created_at+interval '8 hours')
);
CREATE INDEX applicant_sessions_owner_idx ON applicant_sessions(applicant_id);
CREATE TABLE applicant_verification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), applicant_id uuid NOT NULL REFERENCES applicant_profiles(id) ON DELETE RESTRICT,
 token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'), payload_encrypted text NOT NULL CHECK (length(payload_encrypted) BETWEEN 1 AND 701000),
 sender_email text, reply_to_email text, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','accepted','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8), next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_token uuid, expires_at timestamptz NOT NULL,
 provider_message_id text, failure_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT applicant_delivery_lease CHECK ((lease_until IS NULL)=(lease_token IS NULL)),
 CONSTRAINT applicant_delivery_sender CHECK ((sender_email IS NULL)=(reply_to_email IS NULL)),
 CONSTRAINT applicant_delivery_acceptance CHECK ((state='accepted')=(provider_message_id IS NOT NULL)),
 CONSTRAINT applicant_delivery_expiry CHECK (expires_at>created_at AND expires_at<=created_at+interval '30 minutes')
);
CREATE INDEX applicant_delivery_due_idx ON applicant_verification_outbox(next_attempt_at,id) WHERE state='queued';
DO $$
DECLARE relation_name text; DECLARE api_role text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY['applicant_sessions','applicant_verification_outbox'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',relation_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,siii_app',relation_name);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('REVOKE ALL ON public.%I FROM %I',relation_name,api_role);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %I USING (false) WITH CHECK(false)','applicant_deny_'||api_role,relation_name,api_role);
   END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO siii_app',relation_name);
  EXECUTE format('CREATE POLICY applicant_backend ON public.%I FOR ALL TO siii_app USING (true) WITH CHECK(true)',relation_name);
  EXECUTE format('ALTER TABLE public.%I OWNER TO siii_migrator',relation_name);
 END LOOP;
END $$;
