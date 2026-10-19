CREATE TABLE IF NOT EXISTS "student_account_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"linked_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_claim_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"applicant_user_id" uuid NOT NULL,
	"enrollment_number" text NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_claim_requests_status_check" CHECK ("verification_status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
ALTER TABLE "student_account_links" ADD CONSTRAINT "student_account_links_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_account_links" ADD CONSTRAINT "student_account_links_membership_id_institution_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."institution_memberships"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_account_links" ADD CONSTRAINT "student_account_links_student_id_institutional_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."institutional_students"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_account_links" ADD CONSTRAINT "student_account_links_linked_by_platform_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_account_links" ADD CONSTRAINT "student_links_membership_tenant_fk" FOREIGN KEY ("membership_id","institution_id") REFERENCES "public"."institution_memberships"("id","institution_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_account_links" ADD CONSTRAINT "student_links_student_tenant_fk" FOREIGN KEY ("student_id","institution_id") REFERENCES "public"."institutional_students"("id","institution_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_claim_requests" ADD CONSTRAINT "student_claim_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_claim_requests" ADD CONSTRAINT "student_claim_requests_applicant_user_id_platform_users_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_claim_requests" ADD CONSTRAINT "student_claim_requests_reviewed_by_platform_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_account_links_active_student_uidx" ON "student_account_links" USING btree ("student_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_account_links_active_member_uidx" ON "student_account_links" USING btree ("membership_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "student_account_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "student_claim_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "student_account_links" TO siii_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "student_claim_requests" TO siii_app;
