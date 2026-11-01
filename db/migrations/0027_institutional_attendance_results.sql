-- Additive institutional archive. Enabled only after migration and receiver v2 deployment.
CREATE UNIQUE INDEX occurrence_result_scope_uidx ON public.class_occurrences(id,section_id,institution_id);
CREATE TABLE public.institutional_attendance_results (
 institution_id uuid NOT NULL REFERENCES public.institutions(id),
 audit_record_id text NOT NULL CHECK(audit_record_id ~ '^[0-9a-f]{64}$'),
 record_revision bigint NOT NULL CHECK(record_revision BETWEEN 1 AND 9007199254740991),
 student_id uuid NOT NULL,section_id uuid NOT NULL,occurrence_id uuid NOT NULL,
 session_id text NOT NULL CHECK(length(session_id) BETWEEN 1 AND 128),
 source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),
 occurrence_date date NOT NULL,body jsonb NOT NULL,teacher_source_ids uuid[] NOT NULL DEFAULT '{}',
 body_digest text NOT NULL CHECK(body_digest ~ '^[0-9a-f]{64}$'),
 accepted_by uuid REFERENCES public.platform_users(id),
 request_id uuid NOT NULL,accepted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,audit_record_id,record_revision),
 FOREIGN KEY(student_id,institution_id) REFERENCES public.institutional_students(id,institution_id),
 FOREIGN KEY(section_id,institution_id) REFERENCES public.academic_sections(id,institution_id),
 FOREIGN KEY(occurrence_id,section_id,institution_id) REFERENCES public.class_occurrences(id,section_id,institution_id),
 CHECK(jsonb_typeof(body)='object'),
 UNIQUE(institution_id,student_id,session_id,record_revision)
);
CREATE INDEX institutional_attendance_student_idx ON public.institutional_attendance_results(institution_id,student_id,occurrence_date DESC,audit_record_id,record_revision DESC);
CREATE INDEX institutional_attendance_section_idx ON public.institutional_attendance_results(institution_id,section_id,occurrence_date DESC);
ALTER TABLE public.institutional_attendance_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutional_attendance_results FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.institutional_attendance_results FROM PUBLIC,anon,authenticated,siii_app;
GRANT SELECT,INSERT ON public.institutional_attendance_results TO siii_app;
CREATE POLICY attendance_results_backend_read ON public.institutional_attendance_results FOR SELECT TO siii_app USING(true);
CREATE POLICY attendance_results_backend_insert ON public.institutional_attendance_results FOR INSERT TO siii_app WITH CHECK(true);
CREATE POLICY attendance_results_deny_anon ON public.institutional_attendance_results AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY attendance_results_deny_authenticated ON public.institutional_attendance_results AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.institutional_attendance_results OWNER TO siii_migrator;

-- Resumable full scans; separate job per student prevents a missing link blocking a tenant.
CREATE TABLE public.attendance_result_reconciliation (
 institution_id uuid NOT NULL,student_id uuid NOT NULL,page integer NOT NULL DEFAULT 1 CHECK(page BETWEEN 1 AND 10000),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','failed')),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_token uuid,lease_until timestamptz,last_success_at timestamptz,
 PRIMARY KEY(institution_id,student_id),FOREIGN KEY(student_id,institution_id) REFERENCES public.institutional_students(id,institution_id),
 CHECK((lease_token IS NULL)=(lease_until IS NULL))
);
CREATE INDEX attendance_result_reconciliation_due_idx ON public.attendance_result_reconciliation(next_attempt_at) WHERE state='queued';
ALTER TABLE public.attendance_result_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_result_reconciliation FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_result_reconciliation FROM PUBLIC,anon,authenticated,siii_app;
GRANT SELECT,INSERT,UPDATE ON public.attendance_result_reconciliation TO siii_app;
CREATE POLICY attendance_reconciliation_backend ON public.attendance_result_reconciliation FOR ALL TO siii_app USING(true) WITH CHECK(true);
CREATE POLICY attendance_reconciliation_deny_anon ON public.attendance_result_reconciliation AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY attendance_reconciliation_deny_authenticated ON public.attendance_result_reconciliation AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
ALTER TABLE public.attendance_result_reconciliation OWNER TO siii_migrator;

CREATE TABLE public.institutional_class_sessions (
 institution_id uuid NOT NULL REFERENCES public.institutions(id),session_id text NOT NULL CHECK(length(session_id) BETWEEN 1 AND 128),session_revision integer NOT NULL CHECK(session_revision IN (1,2)),teacher_id uuid NOT NULL,section_id uuid NOT NULL,occurrence_id uuid NOT NULL,source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),occurrence_date date NOT NULL,body jsonb NOT NULL,student_source_ids uuid[] NOT NULL DEFAULT '{}',body_digest text NOT NULL CHECK(body_digest ~ '^[0-9a-f]{64}$'),request_id uuid NOT NULL,accepted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(institution_id,session_id,session_revision),UNIQUE(institution_id,occurrence_id,session_revision),
 FOREIGN KEY(teacher_id,institution_id) REFERENCES public.institutional_teachers(id,institution_id),
 FOREIGN KEY(occurrence_id,section_id,institution_id) REFERENCES public.class_occurrences(id,section_id,institution_id),CHECK(jsonb_typeof(body)='object')
);
CREATE INDEX institutional_class_teacher_idx ON public.institutional_class_sessions(institution_id,teacher_id,occurrence_date DESC,session_id,session_revision DESC);
CREATE TABLE public.class_session_reconciliation (
 institution_id uuid NOT NULL,teacher_id uuid NOT NULL,page integer NOT NULL DEFAULT 1 CHECK(page BETWEEN 1 AND 10000),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','failed')),next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_token uuid,lease_until timestamptz,last_success_at timestamptz,
 PRIMARY KEY(institution_id,teacher_id),FOREIGN KEY(teacher_id,institution_id) REFERENCES public.institutional_teachers(id,institution_id),CHECK((lease_token IS NULL)=(lease_until IS NULL))
);
CREATE INDEX class_session_reconciliation_due_idx ON public.class_session_reconciliation(next_attempt_at) WHERE state='queued';
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['institutional_class_sessions','class_session_reconciliation'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,siii_app',relation);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO siii_app',relation);
  EXECUTE format('CREATE POLICY class_results_backend_read ON public.%I FOR SELECT TO siii_app USING(true)',relation);
  EXECUTE format('CREATE POLICY class_results_backend_insert ON public.%I FOR INSERT TO siii_app WITH CHECK(true)',relation);
  EXECUTE format('CREATE POLICY class_results_deny_anon ON public.%I AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false)',relation);
  EXECUTE format('CREATE POLICY class_results_deny_authenticated ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false)',relation);
  EXECUTE format('ALTER TABLE public.%I OWNER TO siii_migrator',relation);
 END LOOP;
END $$;
GRANT UPDATE ON public.class_session_reconciliation TO siii_app;
CREATE POLICY class_jobs_backend_update ON public.class_session_reconciliation FOR UPDATE TO siii_app USING(true) WITH CHECK(true);
