-- F06 additive tenant user lifecycle and self-owned password reset. Historical SQL is immutable.
ALTER TABLE public.institution_memberships ADD COLUMN display_name text, ADD COLUMN institutional_code text, ADD COLUMN institutional_email text, ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.institution_memberships ADD CONSTRAINT membership_deleted_suspended_check CHECK(deleted_at IS NULL OR status='suspended');
ALTER TABLE public.institution_memberships ADD CONSTRAINT membership_profile_lengths_check CHECK((display_name IS NULL OR length(display_name) BETWEEN 1 AND 160) AND (institutional_code IS NULL OR length(institutional_code) BETWEEN 1 AND 80) AND (institutional_email IS NULL OR length(institutional_email) BETWEEN 3 AND 254));
CREATE UNIQUE INDEX membership_institutional_code_uidx ON public.institution_memberships(institution_id,institutional_code) WHERE institutional_code IS NOT NULL;
CREATE INDEX membership_lifecycle_created_idx ON public.institution_memberships(institution_id,status,deleted_at,created_at,id);
CREATE TABLE public.membership_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid NOT NULL,membership_id uuid NOT NULL,actor_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('profile','suspend','activate','delete','rehabilitate','password-reset-request')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),changes jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT membership_event_tenant_fk FOREIGN KEY(membership_id,institution_id) REFERENCES public.institution_memberships(id,institution_id)
);
CREATE INDEX membership_event_history_idx ON public.membership_events(institution_id,membership_id,created_at,id);
CREATE UNIQUE INDEX account_verified_user_email_uidx ON public.account_email_verifications(user_id,verified_email);
CREATE TABLE public.password_reset_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,verified_email text NOT NULL,auth_version integer NOT NULL CHECK(auth_version>=0),token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','consumed','revoked')),consumed_at timestamptz,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 CONSTRAINT password_reset_verified_owner_fk FOREIGN KEY(user_id,verified_email) REFERENCES public.account_email_verifications(user_id,verified_email) ON DELETE RESTRICT,
 CONSTRAINT password_reset_expiry_check CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
 CONSTRAINT password_reset_consumption_check CHECK((state='pending')=(consumed_at IS NULL))
);
CREATE UNIQUE INDEX password_reset_id_user_uidx ON public.password_reset_requests(id,user_id);
CREATE INDEX password_reset_user_state_idx ON public.password_reset_requests(user_id,state);
CREATE TABLE public.password_reset_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reset_id uuid NOT NULL REFERENCES public.password_reset_requests(id) ON DELETE RESTRICT,user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE RESTRICT,
 payload_encrypted text NOT NULL CHECK(length(payload_encrypted) BETWEEN 1 AND 701000),sender_email text,reply_to_email text,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','accepted','failed','cancelled')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,lease_token uuid,expires_at timestamptz NOT NULL,provider_message_id text,failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT password_reset_outbox_owner_fk FOREIGN KEY(reset_id,user_id) REFERENCES public.password_reset_requests(id,user_id),
 CONSTRAINT password_reset_outbox_lease_check CHECK((lease_until IS NULL)=(lease_token IS NULL)),
 CONSTRAINT password_reset_outbox_sender_check CHECK((sender_email IS NULL)=(reply_to_email IS NULL)),
 CONSTRAINT password_reset_outbox_expiry_check CHECK(expires_at>created_at AND expires_at<=created_at+interval '23 hours'),
 CONSTRAINT password_reset_outbox_acceptance_check CHECK((state='accepted')=(provider_message_id IS NOT NULL)),
 CONSTRAINT password_reset_outbox_error_check CHECK(failure_code IS NULL OR failure_code IN ('EMAIL_NOT_CONFIGURED','EMAIL_PROVIDER_RETRY','EMAIL_PROVIDER_REJECTED','EMAIL_MESSAGE_INVALID','PASSWORD_RESET_KEY_UNAVAILABLE','PASSWORD_RESET_DELIVERY_INVALID','RESET_UNAVAILABLE','RETRY_EXHAUSTED'))
);
CREATE INDEX password_reset_outbox_due_idx ON public.password_reset_outbox(next_attempt_at,id) WHERE state='queued';
CREATE INDEX password_reset_outbox_reset_idx ON public.password_reset_outbox(reset_id);
--> statement-breakpoint
DO $$ DECLARE table_name text; api_role text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['membership_events','password_reset_requests','password_reset_outbox'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',table_name);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,api_role);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %I USING(false) WITH CHECK(false)','p1_users_deny_'||api_role,table_name,api_role);
   END IF;
  END LOOP;
  IF table_name='membership_events' THEN
   EXECUTE format('GRANT SELECT,INSERT ON TABLE public.%I TO siii_app',table_name);
  ELSE
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO siii_app',table_name);
  END IF;
  EXECUTE format('CREATE POLICY p1_users_backend_access ON public.%I FOR ALL TO siii_app USING(true) WITH CHECK(true)',table_name);
  EXECUTE format('ALTER TABLE public.%I OWNER TO siii_migrator',table_name);
 END LOOP;
END $$;
