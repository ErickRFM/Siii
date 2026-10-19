CREATE TABLE IF NOT EXISTS "admission_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_cycles_status_check" CHECK ("status" IN ('draft','open','closed','archived')),
	CONSTRAINT "admission_cycles_dates_check" CHECK ("end_date" > "start_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applicant_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"curp" text,
	"email_verified_at" timestamp with time zone,
	"verification_token_hash" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applicant_profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"campus_id" uuid,
	"application_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_applications_status_check" CHECK ("status" IN ('draft','submitted','under_review','admitted','rejected','waitlisted','cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_documents_type_check" CHECK ("document_type" IN ('identity_proof','birth_certificate','prior_degree','curp_doc','other')),
	CONSTRAINT "admission_documents_status_check" CHECK ("verification_status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"decided_by" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_decisions_decision_check" CHECK ("decision" IN ('admitted','rejected','waitlisted'))
);
--> statement-breakpoint
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_applicant_id_applicant_profiles_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_applications" ADD CONSTRAINT "applications_cycle_tenant_fk" FOREIGN KEY ("cycle_id","institution_id") REFERENCES "public"."admission_cycles"("id","institution_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_applications" ADD CONSTRAINT "applications_program_tenant_fk" FOREIGN KEY ("program_id","institution_id") REFERENCES "public"."academic_programs"("id","institution_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_applications" ADD CONSTRAINT "applications_campus_tenant_fk" FOREIGN KEY ("campus_id","institution_id") REFERENCES "public"."campuses"("id","institution_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_application_id_admission_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."admission_applications"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_application_id_admission_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."admission_applications"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_decided_by_platform_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_cycles_institution_code_uidx" ON "admission_cycles" USING btree ("institution_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_cycles_id_institution_uidx" ON "admission_cycles" USING btree ("id","institution_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_applications_number_uidx" ON "admission_applications" USING btree ("institution_id","application_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admission_applications_id_institution_uidx" ON "admission_applications" USING btree ("id","institution_id");
--> statement-breakpoint
ALTER TABLE "admission_cycles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "applicant_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admission_applications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admission_documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admission_decisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "admission_cycles" TO siii_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "applicant_profiles" TO siii_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "admission_applications" TO siii_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "admission_documents" TO siii_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "admission_decisions" TO siii_app;
