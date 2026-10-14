-- R1/R2: institutional people and academic operations; additive, no fixture writes.
-- Keep Supabase production migration ledger separate from Drizzle until reconciled.
CREATE UNIQUE INDEX IF NOT EXISTS "academic_terms_id_institution_uidx" ON "academic_terms" ("id","institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_courses_id_institution_uidx" ON "academic_courses" ("id","institution_id");--> statement-breakpoint
CREATE TABLE "institutional_students" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
  "program_id" uuid NOT NULL,
  "enrollment_number" text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "institutional_email" text,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','inactive','withdrawn','graduated')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "students_program_tenant_fk" FOREIGN KEY ("program_id","institution_id") REFERENCES "academic_programs"("id","institution_id") ON DELETE RESTRICT
);--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_students_enrollment_uidx" ON "institutional_students" ("institution_id","enrollment_number");--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_students_id_institution_uidx" ON "institutional_students" ("id","institution_id");--> statement-breakpoint
CREATE TABLE "institutional_teachers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
  "employee_number" text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "institutional_email" text,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','inactive')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_teachers_employee_uidx" ON "institutional_teachers" ("institution_id","employee_number");--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_teachers_id_institution_uidx" ON "institutional_teachers" ("id","institution_id");--> statement-breakpoint
CREATE TABLE "academic_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
  "term_id" uuid NOT NULL,
  "course_id" uuid NOT NULL,
  "code" text NOT NULL,
  "capacity" integer NOT NULL CHECK ("capacity" > 0 AND "capacity" <= 500),
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','closed','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sections_term_tenant_fk" FOREIGN KEY ("term_id","institution_id") REFERENCES "academic_terms"("id","institution_id") ON DELETE RESTRICT,
  CONSTRAINT "sections_course_tenant_fk" FOREIGN KEY ("course_id","institution_id") REFERENCES "academic_courses"("id","institution_id") ON DELETE RESTRICT
);--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sections_term_code_uidx" ON "academic_sections" ("institution_id","term_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sections_id_institution_uidx" ON "academic_sections" ("id","institution_id");--> statement-breakpoint
CREATE TABLE "section_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
  "section_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'enrolled' CHECK ("status" IN ('enrolled','withdrawn')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "enrollments_section_tenant_fk" FOREIGN KEY ("section_id","institution_id") REFERENCES "academic_sections"("id","institution_id") ON DELETE RESTRICT,
  CONSTRAINT "enrollments_student_tenant_fk" FOREIGN KEY ("student_id","institution_id") REFERENCES "institutional_students"("id","institution_id") ON DELETE RESTRICT
);--> statement-breakpoint
CREATE UNIQUE INDEX "section_student_unique" ON "section_enrollments" ("section_id","student_id");--> statement-breakpoint
CREATE TABLE "section_teachers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
  "section_id" uuid NOT NULL,
  "teacher_id" uuid NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "section_teachers_section_tenant_fk" FOREIGN KEY ("section_id","institution_id") REFERENCES "academic_sections"("id","institution_id") ON DELETE RESTRICT,
  CONSTRAINT "section_teachers_teacher_tenant_fk" FOREIGN KEY ("teacher_id","institution_id") REFERENCES "institutional_teachers"("id","institution_id") ON DELETE RESTRICT
);--> statement-breakpoint
CREATE UNIQUE INDEX "section_teacher_unique" ON "section_teachers" ("section_id","teacher_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "institutional_students","institutional_teachers","academic_sections","section_enrollments","section_teachers" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "institutional_students","institutional_teachers","academic_sections","section_enrollments","section_teachers" FROM authenticated;
  END IF;
END $$;