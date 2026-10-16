-- F08 additive invitations, explicit email-possession consent and encrypted durable delivery.
CREATE UNIQUE INDEX role_assignment_id_member_uidx ON public.role_assignments(id,membership_id);
CREATE TABLE public.institution_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
 email text NOT NULL,
 role public.user_role NOT NULL,
 scope_type text NOT NULL DEFAULT 'institution',
 scope_program_id uuid, scope_campus_id uuid,
 grant_expires_at timestamptz,
 issuer_membership_id uuid NOT NULL,
 issuer_grant_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE RESTRICT,
 token_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'pending',
 consumed_at timestamptz,
 accepted_user_id uuid REFERENCES public.platform_users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 resend_window_at timestamptz NOT NULL DEFAULT now(),
 resend_count integer NOT NULL DEFAULT 0,
 last_requested_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT invitation_id_tenant_uidx UNIQUE(id,institution_id),
 CONSTRAINT invitation_token_uidx UNIQUE(token_hash),
 CONSTRAINT invitation_email_check CHECK(email=lower(email) AND length(email) BETWEEN 3 AND 254),
 CONSTRAINT invitation_token_check CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 CONSTRAINT invitation_state_check CHECK(state IN ('pending','accepted','rejected','revoked')),
 CONSTRAINT invitation_consumption_check CHECK(
  (state='pending' AND consumed_at IS NULL AND accepted_user_id IS NULL)
  OR (state='accepted' AND consumed_at IS NOT NULL AND accepted_user_id IS NOT NULL)
  OR (state IN ('rejected','revoked') AND consumed_at IS NOT NULL AND accepted_user_id IS NULL)),
 CONSTRAINT invitation_expiry_check CHECK(expires_at>created_at AND expires_at<=created_at+interval '7 days'),
 CONSTRAINT invitation_grant_expiry_check CHECK(grant_expires_at IS NULL OR (grant_expires_at>created_at AND expires_at<=grant_expires_at)),
 CONSTRAINT invitation_resend_count_check CHECK(resend_count BETWEEN 0 AND 3),
 CONSTRAINT invitation_role_check CHECK(role::text<>'super_admin' AND (role::text<>'admin' OR scope_type='institution')),
 CONSTRAINT invitation_scope_check CHECK(
  (scope_type='institution' AND scope_program_id IS NULL AND scope_campus_id IS NULL)
  OR (scope_type='program' AND scope_program_id IS NOT NULL AND scope_campus_id IS NULL)
  OR (scope_type='campus' AND scope_campus_id IS NOT NULL AND scope_program_id IS NULL)),
 CONSTRAINT invitation_issuer_member_tenant_fk FOREIGN KEY(issuer_membership_id,institution_id) REFERENCES public.institution_memberships(id,institution_id),
 CONSTRAINT invitation_issuer_grant_member_fk FOREIGN KEY(issuer_grant_id,issuer_membership_id) REFERENCES public.role_assignments(id,membership_id),
 CONSTRAINT invitation_program_tenant_fk FOREIGN KEY(scope_program_id,institution_id) REFERENCES public.academic_programs(id,institution_id),
 CONSTRAINT invitation_campus_tenant_fk FOREIGN KEY(scope_campus_id,institution_id) REFERENCES public.campuses(id,institution_id)
);
CREATE INDEX invitation_tenant_created_idx ON public.institution_invitations(institution_id,created_at,id);
CREATE INDEX invitation_pending_email_idx ON public.institution_invitations(institution_id,email) WHERE state='pending';
CREATE UNIQUE INDEX invitation_accepted_email_user_uidx ON public.institution_invitations(id,email,accepted_user_id);
--> statement-breakpoint
CREATE TABLE public.invitation_delivery_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invitation_id uuid NOT NULL,
 institution_id uuid NOT NULL,
 payload_encrypted text NOT NULL,
 sender_email text, reply_to_email text,
 state text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz, lease_token uuid,
 expires_at timestamptz NOT NULL,
 provider_message_id text,
 failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT invitation_delivery_tenant_fk FOREIGN KEY(invitation_id,institution_id) REFERENCES public.institution_invitations(id,institution_id),
 CONSTRAINT invitation_delivery_state_check CHECK(state IN ('queued','accepted','failed','cancelled')),
 CONSTRAINT invitation_delivery_attempts_check CHECK(attempts BETWEEN 0 AND 8),
 CONSTRAINT invitation_delivery_lease_check CHECK((lease_until IS NULL)=(lease_token IS NULL)),
 CONSTRAINT invitation_delivery_sender_check CHECK((sender_email IS NULL)=(reply_to_email IS NULL)),
 CONSTRAINT invitation_delivery_payload_check CHECK(length(payload_encrypted) BETWEEN 1 AND 701000),
 CONSTRAINT invitation_delivery_expiry_check CHECK(expires_at>created_at AND expires_at<=created_at+interval '23 hours'),
 CONSTRAINT invitation_delivery_acceptance_check CHECK((state='accepted')=(provider_message_id IS NOT NULL)),
 CONSTRAINT invitation_delivery_error_check CHECK(failure_code IS NULL OR failure_code IN ('EMAIL_NOT_CONFIGURED','EMAIL_PROVIDER_RETRY','EMAIL_PROVIDER_REJECTED','EMAIL_MESSAGE_INVALID','INVITATION_KEY_UNAVAILABLE','INVITATION_DELIVERY_INVALID','INVITATION_EXPIRED','RETRY_EXHAUSTED'))
);
CREATE INDEX invitation_delivery_due_idx ON public.invitation_delivery_outbox(next_attempt_at,id) WHERE state='queued';
CREATE INDEX invitation_delivery_invitation_idx ON public.invitation_delivery_outbox(invitation_id);
CREATE TABLE public.account_email_verifications (
 user_id uuid PRIMARY KEY REFERENCES public.platform_users(id) ON DELETE RESTRICT,
 verified_email text NOT NULL UNIQUE,
 proof_invitation_id uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT account_verified_email_check CHECK(verified_email=lower(verified_email) AND length(verified_email) BETWEEN 3 AND 254),
 CONSTRAINT account_email_proof_fk FOREIGN KEY(proof_invitation_id,verified_email,user_id) REFERENCES public.institution_invitations(id,email,accepted_user_id)
);
--> statement-breakpoint
ALTER TABLE public.auth_throttle DROP CONSTRAINT auth_throttle_scope_check;
ALTER TABLE public.auth_throttle ADD CONSTRAINT auth_throttle_scope_check CHECK(scope IN ('login_account','login_ip','password_account','password_ip','invitation_sender','invitation_accept_ip','password_reset_account','password_reset_ip'));
DO $$
DECLARE table_name text; api_role text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['institution_invitations','invitation_delivery_outbox','account_email_verifications'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',table_name);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,api_role);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %I USING(false) WITH CHECK(false)','p1_invite_deny_'||api_role,table_name,api_role);
   END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO siii_app',table_name);
  EXECUTE format('CREATE POLICY p1_invitation_backend_access ON public.%I FOR ALL TO siii_app USING(true) WITH CHECK(true)',table_name);
  EXECUTE format('ALTER TABLE public.%I OWNER TO siii_migrator',table_name);
 END LOOP;
END $$;
