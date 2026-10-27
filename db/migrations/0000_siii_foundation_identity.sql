CREATE TYPE "entity_status" AS ENUM ('active','inactive','archived','suspended');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM ('student','workshop_participant','teacher_pending','teacher','tutor','coordinator','admin','super_admin');--> statement-breakpoint
CREATE TYPE "membership_status" AS ENUM ('active','suspended');--> statement-breakpoint
CREATE TABLE "institutions" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL, "short_name" text, "code" text NOT NULL UNIQUE,
 "timezone" text NOT NULL DEFAULT 'America/Mexico_City',
 "status" "entity_status" NOT NULL DEFAULT 'active',
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE "campuses" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "institution_id" uuid NOT NULL REFERENCES "institutions"("id"),
 "name" text NOT NULL, "code" text, "is_primary" boolean NOT NULL DEFAULT false,
 "status" "entity_status" NOT NULL DEFAULT 'active',
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE "academic_terms" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "institution_id" uuid NOT NULL REFERENCES "institutions"("id"),
 "name" text NOT NULL,"code" text NOT NULL,
 "start_date" timestamp NOT NULL, "end_date" timestamp NOT NULL,
 "status" "entity_status" NOT NULL DEFAULT 'active',
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "academic_terms_dates_valid" CHECK ("end_date" >= "start_date")
);--> statement-breakpoint
CREATE TABLE "people" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "first_name" text NOT NULL, "last_name" text NOT NULL, "middle_name" text,
 "email" text, "phone" text,
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE "platform_users" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "person_id" uuid NOT NULL REFERENCES "people"("id"),
 "username" text NOT NULL UNIQUE, "password_hash" text,
 "is_active" boolean NOT NULL DEFAULT true,
 "must_change_password" boolean NOT NULL DEFAULT false,
 "failed_login_attempts" integer NOT NULL DEFAULT 0,
 "locked_until" timestamptz,
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE "institution_memberships" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "institution_id" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT,
 "user_id" uuid NOT NULL REFERENCES "platform_users"("id") ON DELETE RESTRICT,
 "status" "membership_status" NOT NULL DEFAULT 'active',
 "created_at" timestamptz NOT NULL DEFAULT now(),"updated_at" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "institution_member_unique" UNIQUE("institution_id","user_id")
);--> statement-breakpoint
CREATE INDEX "institution_member_user_idx" ON "institution_memberships"("user_id");--> statement-breakpoint
CREATE TABLE "role_assignments" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "membership_id" uuid NOT NULL REFERENCES "institution_memberships"("id") ON DELETE RESTRICT,
 "role" "user_role" NOT NULL,
 "granted_by" uuid REFERENCES "platform_users"("id"),
 "created_at" timestamptz NOT NULL DEFAULT now(),"revoked_at" timestamptz
);--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignment_unique_active" ON "role_assignments"("membership_id","role") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE TABLE "auth_sessions" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL REFERENCES "platform_users"("id") ON DELETE CASCADE,
 "token_hash" text NOT NULL UNIQUE,
 "created_at" timestamptz NOT NULL DEFAULT now(),
 "expires_at" timestamptz NOT NULL,
 "revoked_at" timestamptz
);--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions"("user_id");--> statement-breakpoint
CREATE TABLE "security_audit_log" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "actor_user_id" uuid REFERENCES "platform_users"("id"),
 "institution_id" uuid REFERENCES "institutions"("id"),
 "action" text NOT NULL, "target" text NOT NULL,"request_id" text,
 "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "audit_institution_created_idx" ON "security_audit_log"("institution_id","created_at");
