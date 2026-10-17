-- Academic source foundation only: no writer, scheduler or production enablement.
CREATE TABLE academic_section_versions (
 institution_id uuid NOT NULL, section_id uuid NOT NULL,
 source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(institution_id,section_id),
 CONSTRAINT academic_version_section_tenant_fk FOREIGN KEY(section_id,institution_id) REFERENCES academic_sections(id,institution_id) ON DELETE RESTRICT
);
CREATE TABLE academic_section_outbox (
 event_id uuid PRIMARY KEY, institution_id uuid NOT NULL, section_id uuid NOT NULL,
 source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),
 occurred_at timestamptz NOT NULL, operation text NOT NULL CHECK(operation IN('upsert','delete')),
 body_encrypted text NOT NULL CHECK(length(body_encrypted) BETWEEN 1 AND 1400000),
 body_digest text NOT NULL CHECK(body_digest ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','accepted','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
 failure_code text CHECK(failure_code IN('TRANSPORT_RETRY','TRANSPORT_REJECTED','BODY_INVALID','KEY_UNAVAILABLE','RETRY_EXHAUSTED')),
 accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT academic_outbox_version_unique UNIQUE(institution_id,section_id,source_version),
 CONSTRAINT academic_outbox_section_tenant_fk FOREIGN KEY(section_id,institution_id) REFERENCES academic_sections(id,institution_id) ON DELETE RESTRICT,
 CONSTRAINT academic_outbox_lease_pair CHECK((lease_token IS NULL)=(lease_until IS NULL)),
 CONSTRAINT academic_outbox_state_lease CHECK(state='queued' OR lease_token IS NULL),
 CONSTRAINT academic_outbox_acceptance CHECK((state='accepted')=(accepted_at IS NOT NULL))
);
CREATE INDEX academic_outbox_due_idx ON academic_section_outbox(next_attempt_at,event_id) WHERE state='queued';
ALTER TABLE academic_section_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_section_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE academic_section_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_section_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON academic_section_versions,academic_section_outbox FROM PUBLIC,anon,authenticated,siii_app;
GRANT SELECT,INSERT ON academic_section_versions,academic_section_outbox TO siii_app;
GRANT UPDATE(source_version) ON academic_section_versions TO siii_app;
-- Workers can change delivery metadata; frozen identity/body/version/provenance remain immutable.
GRANT UPDATE(state,attempts,next_attempt_at,lease_token,lease_until,failure_code,accepted_at,updated_at) ON academic_section_outbox TO siii_app;
CREATE POLICY academic_outbox_backend ON academic_section_versions FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_outbox_backend ON academic_section_outbox FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY academic_outbox_deny_anon ON academic_section_versions AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_outbox_deny_authenticated ON academic_section_versions AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY academic_outbox_deny_anon ON academic_section_outbox AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY academic_outbox_deny_authenticated ON academic_section_outbox AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
-- Inherited and SET-only API paths must not reach backend grants or public schema.
DO $$ DECLARE api record; reachable record; BEGIN
 FOR api IN SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated') LOOP
  FOR reachable IN SELECT oid FROM pg_roles WHERE oid=api.oid OR pg_has_role(api.oid,oid,'USAGE') OR pg_has_role(api.oid,oid,'SET') LOOP
   IF has_schema_privilege(reachable.oid,'public','USAGE') OR has_schema_privilege(reachable.oid,'public','CREATE')
    OR has_any_column_privilege(reachable.oid,'academic_section_versions','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege(reachable.oid,'academic_section_outbox','SELECT,INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'ACADEMIC_OUTBOX_API_PATH_UNSAFE';
   END IF;
  END LOOP;
 END LOOP;
END $$;
