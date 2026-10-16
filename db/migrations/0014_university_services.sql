-- R5 academic services, all data institution-scoped; no sample data, no payment claims.
CREATE TABLE institutional_announcements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 title text NOT NULL,body text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED')),
 author_user_id uuid NOT NULL REFERENCES platform_users(id),
 published_at timestamptz,expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX announcements_institution_status_idx ON institutional_announcements(institution_id,status);--> statement-breakpoint

CREATE TABLE student_service_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 student_id uuid NOT NULL,
 request_type text NOT NULL CHECK(request_type IN ('CERTIFICATE','ENROLLMENT_CHANGE','JUSTIFICATION','OTHER')),
 summary text NOT NULL,
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','IN_REVIEW','APPROVED','REJECTED','CLOSED')),
 decision_reason text,decided_by uuid REFERENCES platform_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT service_request_student_scope_fk FOREIGN KEY(student_id,institution_id) REFERENCES institutional_students(id,institution_id)
);--> statement-breakpoint
CREATE INDEX service_request_student_idx ON student_service_requests(institution_id,student_id);--> statement-breakpoint

CREATE TABLE tutoring_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 student_id uuid NOT NULL,teacher_id uuid NOT NULL,
 subject text NOT NULL,private_notes text,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','CLOSED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT tutoring_student_scope_fk FOREIGN KEY(student_id,institution_id) REFERENCES institutional_students(id,institution_id),
 CONSTRAINT tutoring_teacher_scope_fk FOREIGN KEY(teacher_id,institution_id) REFERENCES institutional_teachers(id,institution_id)
);--> statement-breakpoint
CREATE INDEX tutoring_institution_student_idx ON tutoring_cases(institution_id,student_id);--> statement-breakpoint

CREATE TABLE institutional_workshops(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 title text NOT NULL,description text NOT NULL,
 teacher_id uuid, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT workshop_teacher_scope_fk FOREIGN KEY(teacher_id,institution_id) REFERENCES institutional_teachers(id,institution_id),
 CONSTRAINT workshop_time_check CHECK(starts_at<ends_at)
);--> statement-breakpoint
CREATE INDEX workshops_institution_status_idx ON institutional_workshops(institution_id,status);--> statement-breakpoint
CREATE UNIQUE INDEX institutional_workshops_scope_uidx ON institutional_workshops(id,institution_id);--> statement-breakpoint
CREATE TABLE workshop_enrollments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 institution_id uuid NOT NULL REFERENCES institutions(id),
 workshop_id uuid NOT NULL,student_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'ENROLLED' CHECK(status IN ('ENROLLED','WITHDRAWN')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT workshop_enrollment_workshop_fk FOREIGN KEY(workshop_id,institution_id) REFERENCES institutional_workshops(id,institution_id),
 CONSTRAINT workshop_enrollment_student_fk FOREIGN KEY(student_id,institution_id) REFERENCES institutional_students(id,institution_id)
);--> statement-breakpoint
CREATE UNIQUE INDEX workshop_student_enrolled_uidx ON workshop_enrollments(workshop_id,student_id) WHERE status='ENROLLED';--> statement-breakpoint

DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON institutional_announcements,student_service_requests,tutoring_cases,institutional_workshops,workshop_enrollments FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON institutional_announcements,student_service_requests,tutoring_cases,institutional_workshops,workshop_enrollments FROM authenticated;
 END IF;
END $$;
