-- R3 gradebook foundation. Do not apply to production without migration reconciliation.
CREATE UNIQUE INDEX "institution_member_id_scope_uidx" ON institution_memberships(id,institution_id);--> statement-breakpoint
CREATE TABLE teacher_account_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 teacher_id uuid NOT NULL,
 membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CONSTRAINT teacher_links_teacher_scope_fk FOREIGN KEY(teacher_id,institution_id) REFERENCES institutional_teachers(id,institution_id),
 CONSTRAINT teacher_links_member_scope_fk FOREIGN KEY(membership_id,institution_id) REFERENCES institution_memberships(id,institution_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX teacher_account_links_active_teacher_uidx ON teacher_account_links(teacher_id) WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX teacher_account_links_active_member_uidx ON teacher_account_links(membership_id) WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE TABLE assessment_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
 section_id uuid NOT NULL, code text NOT NULL, title text NOT NULL, weight integer NOT NULL CHECK(weight BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT assessment_component_section_fk FOREIGN KEY(section_id,institution_id) REFERENCES academic_sections(id,institution_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX assessment_component_section_code_uidx ON assessment_components(section_id,code);--> statement-breakpoint
CREATE UNIQUE INDEX assessment_component_id_institution_uidx ON assessment_components(id,institution_id);--> statement-breakpoint
CREATE TABLE assessment_scores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
 component_id uuid NOT NULL, student_id uuid NOT NULL, score_hundredths integer NOT NULL CHECK(score_hundredths BETWEEN 0 AND 1000),
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT assessment_scores_component_fk FOREIGN KEY(component_id,institution_id) REFERENCES assessment_components(id,institution_id),
 CONSTRAINT assessment_scores_student_fk FOREIGN KEY(student_id,institution_id) REFERENCES institutional_students(id,institution_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX assessment_scores_component_student_uidx ON assessment_scores(component_id,student_id);--> statement-breakpoint
CREATE TABLE grade_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
 section_id uuid NOT NULL, operation_id uuid NOT NULL, published_by uuid NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), published_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT grade_publication_section_fk FOREIGN KEY(section_id,institution_id) REFERENCES academic_sections(id,institution_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX grade_publication_operation_uidx ON grade_publications(institution_id,operation_id);--> statement-breakpoint
CREATE UNIQUE INDEX grade_publication_section_version_uidx ON grade_publications(section_id,version);--> statement-breakpoint
CREATE UNIQUE INDEX grade_publication_id_institution_uidx ON grade_publications(id,institution_id);--> statement-breakpoint
CREATE INDEX grade_publication_section_idx ON grade_publications(section_id,published_at);--> statement-breakpoint
CREATE TABLE final_grades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid NOT NULL REFERENCES institutions(id),
 publication_id uuid NOT NULL, student_id uuid NOT NULL, score_hundredths integer NOT NULL CHECK(score_hundredths BETWEEN 0 AND 1000),
 CONSTRAINT final_grade_publication_fk FOREIGN KEY(publication_id,institution_id) REFERENCES grade_publications(id,institution_id),
 CONSTRAINT final_grade_student_fk FOREIGN KEY(student_id,institution_id) REFERENCES institutional_students(id,institution_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX final_grade_per_publication_uidx ON final_grades(publication_id,student_id);--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON teacher_account_links,assessment_components,assessment_scores,grade_publications,final_grades FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON teacher_account_links,assessment_components,assessment_scores,grade_publications,final_grades FROM authenticated; END IF;
END $$;