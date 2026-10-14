-- F3 institutional academic catalog. Additive only; no automatic seed or destructive operation.
CREATE TABLE "academic_programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "level" text NOT NULL,
  "modality" text NOT NULL,
  "status" "entity_status" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "academic_programs_institution_code_uidx" ON "academic_programs" ("institution_id","code");--> statement-breakpoint
CREATE TABLE "academic_courses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "credits" integer NOT NULL,
  "status" "entity_status" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "academic_courses_credits_range" CHECK ("credits" >= 0 AND "credits" <= 30)
);--> statement-breakpoint
CREATE UNIQUE INDEX "academic_courses_institution_code_uidx" ON "academic_courses" ("institution_id","code");--> statement-breakpoint
CREATE TABLE "curriculum_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
  "program_id" uuid NOT NULL REFERENCES "academic_programs"("id") ON DELETE RESTRICT,
  "version" text NOT NULL,
  "status" "entity_status" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_versions_program_version_uidx" ON "curriculum_versions" ("program_id","version");
--> statement-breakpoint
-- Protect institution-scoped catalog codes on existing foundational tables.
CREATE UNIQUE INDEX "campuses_institution_code_uidx" ON "campuses" ("institution_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_terms_institution_code_uidx" ON "academic_terms" ("institution_id","code");--> statement-breakpoint
-- Composite FK prevents associating a plan with a program in another institution.
CREATE UNIQUE INDEX "academic_programs_id_institution_uidx" ON "academic_programs" ("id","institution_id");--> statement-breakpoint
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_program_tenant_fk"
  FOREIGN KEY ("program_id","institution_id") REFERENCES "academic_programs"("id","institution_id") ON DELETE RESTRICT;--> statement-breakpoint
-- Existing Supabase roles have default grants in public. Keep all institutional
-- records private; the Next.js backend authenticates via PostgreSQL directly.
REVOKE ALL PRIVILEGES ON TABLE "academic_programs","academic_courses","curriculum_versions" FROM anon, authenticated;
