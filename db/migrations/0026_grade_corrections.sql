-- Additive infrastructure. Disabled until SIII_GRADE_CORRECTIONS_ENABLED=true.
CREATE TABLE public.grade_correction_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES public.institutions(id),section_id uuid NOT NULL,student_id uuid NOT NULL,source_publication_id uuid NOT NULL,base_version integer NOT NULL,original_score_hundredths integer NOT NULL,requested_score_hundredths integer NOT NULL,reason text NOT NULL,status text NOT NULL DEFAULT 'DRAFT',revision integer NOT NULL DEFAULT 1,operation_id uuid NOT NULL,requested_by uuid NOT NULL REFERENCES public.platform_users(id),reviewed_by uuid REFERENCES public.platform_users(id),approved_by uuid REFERENCES public.platform_users(id),executed_by uuid REFERENCES public.platform_users(id),resolution_reason text,policy_hash text,closed_authorized boolean NOT NULL DEFAULT false,applied_publication_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT grade_correction_scope UNIQUE(id,institution_id),
 FOREIGN KEY(section_id,institution_id) REFERENCES public.academic_sections(id,institution_id),
 FOREIGN KEY(student_id,institution_id) REFERENCES public.institutional_students(id,institution_id),
 FOREIGN KEY(source_publication_id,institution_id) REFERENCES public.grade_publications(id,institution_id),
 FOREIGN KEY(applied_publication_id,institution_id) REFERENCES public.grade_publications(id,institution_id),
 CONSTRAINT grade_correction_valid CHECK(status IN ('DRAFT','SUBMITTED','IN_REVIEW','APPROVED','REJECTED','APPLIED') AND revision>0 AND base_version>0 AND original_score_hundredths BETWEEN 0 AND 1000 AND requested_score_hundredths BETWEEN 0 AND 1000 AND length(trim(reason)) BETWEEN 10 AND 4000 AND (approved_by IS NULL OR approved_by<>requested_by) AND (status NOT IN ('APPROVED','APPLIED') OR approved_by IS NOT NULL) AND (status<>'APPLIED' OR (executed_by IS NOT NULL AND applied_publication_id IS NOT NULL)))
);
CREATE UNIQUE INDEX grade_correction_operation_uidx ON public.grade_correction_requests(institution_id,operation_id);
CREATE UNIQUE INDEX grade_correction_active_uidx ON public.grade_correction_requests(institution_id,section_id,student_id) WHERE status IN ('DRAFT','SUBMITTED','IN_REVIEW','APPROVED');
--> statement-breakpoint
CREATE TABLE public.grade_correction_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid NOT NULL REFERENCES public.institutions(id),request_id uuid NOT NULL,file_name text NOT NULL,media_type text NOT NULL,size integer NOT NULL,sha256 text NOT NULL,content bytea NOT NULL,uploaded_by uuid NOT NULL REFERENCES public.platform_users(id),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(request_id,institution_id) REFERENCES public.grade_correction_requests(id,institution_id),CONSTRAINT grade_correction_evidence_valid CHECK(size BETWEEN 1 AND 2097152 AND octet_length(content)=size AND media_type IN ('application/pdf','image/png','image/jpeg')));
CREATE UNIQUE INDEX grade_correction_one_evidence_uidx ON public.grade_correction_evidence(request_id);
--> statement-breakpoint
CREATE TABLE public.grade_correction_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid NOT NULL REFERENCES public.institutions(id),request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES public.platform_users(id),action text NOT NULL,status text NOT NULL,note text,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(request_id,institution_id) REFERENCES public.grade_correction_requests(id,institution_id));
--> statement-breakpoint
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['grade_correction_requests','grade_correction_evidence','grade_correction_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',relation);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO siii_app',relation);
  EXECUTE format('CREATE POLICY correction_backend_read ON public.%I FOR SELECT TO siii_app USING(true)',relation);
  EXECUTE format('CREATE POLICY correction_backend_insert ON public.%I FOR INSERT TO siii_app WITH CHECK(true)',relation);
  EXECUTE format('CREATE POLICY correction_deny_anon ON public.%I AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false)',relation);
  EXECUTE format('CREATE POLICY correction_deny_authenticated ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false)',relation);
  EXECUTE format('ALTER TABLE public.%I OWNER TO siii_migrator',relation);
 END LOOP;
END $$;
GRANT UPDATE ON public.grade_correction_requests TO siii_app;
CREATE POLICY correction_backend_update ON public.grade_correction_requests FOR UPDATE TO siii_app USING(true) WITH CHECK(true);
