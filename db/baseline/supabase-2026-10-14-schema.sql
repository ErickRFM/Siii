-- Generated offline from docs/audit/P0_1_PRODUCTION_STRUCTURE.json.
-- Observed production institutional structure 2026-10-14. NO PERSONAL DATA.
-- ISOLATED REHEARSAL ONLY: preserves insecure source ACL/defaults/RLS to test hardening.
-- Requires fresh PostgreSQL 17 DB and pre-created source roles or explicit fixture role maps.
-- No managed schemas, ledger, secrets, login roles, extension changes or data are replayed.
-- Grantor identity is the executor; source owner/grantee permissions/grant options are preserved.
BEGIN;
CREATE SCHEMA IF NOT EXISTS "public";
ALTER SCHEMA "public" OWNER TO "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON TABLES FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON TABLES FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON TABLES FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON TABLES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON TABLES FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL PRIVILEGES ON TABLES FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" GRANT USAGE ON SEQUENCES TO "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" GRANT EXECUTE ON FUNCTIONS TO "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON TABLES FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON TABLES FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON TABLES FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON TABLES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON TABLES FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL PRIVILEGES ON TABLES FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON SEQUENCES FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON FUNCTIONS FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "supabase_admin";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "pg_database_owner";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL PRIVILEGES ON TABLES FROM "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "service_role";
CREATE TYPE "public"."entity_status" AS ENUM ('active', 'inactive', 'archived', 'suspended');
ALTER TYPE "public"."entity_status" OWNER TO "postgres";
GRANT USAGE ON TYPE "public"."entity_status" TO PUBLIC;
CREATE TYPE "public"."membership_status" AS ENUM ('active', 'suspended');
ALTER TYPE "public"."membership_status" OWNER TO "postgres";
GRANT USAGE ON TYPE "public"."membership_status" TO PUBLIC;
CREATE TYPE "public"."user_role" AS ENUM ('student', 'workshop_participant', 'teacher_pending', 'teacher', 'tutor', 'coordinator', 'admin', 'super_admin');
ALTER TYPE "public"."user_role" OWNER TO "postgres";
GRANT USAGE ON TYPE "public"."user_role" TO PUBLIC;
CREATE TABLE "public"."academic_courses" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "credits" integer NOT NULL,
  "status" "public"."entity_status" DEFAULT 'active'::"public"."entity_status" NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."academic_programs" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "level" text NOT NULL,
  "modality" text NOT NULL,
  "status" "public"."entity_status" DEFAULT 'active'::"public"."entity_status" NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."academic_terms" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "start_date" timestamp without time zone NOT NULL,
  "end_date" timestamp without time zone NOT NULL,
  "status" "public"."entity_status" DEFAULT 'active'::"public"."entity_status" NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."auth_sessions" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);
CREATE TABLE "public"."campuses" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "status" "public"."entity_status" DEFAULT 'active'::"public"."entity_status" NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."curriculum_versions" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "program_id" uuid NOT NULL,
  "version" text NOT NULL,
  "status" "public"."entity_status" DEFAULT 'active'::"public"."entity_status" NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."institution_memberships" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" "public"."membership_status" DEFAULT 'active'::"public"."membership_status" NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."institutions" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "short_name" text,
  "code" text NOT NULL,
  "timezone" text DEFAULT 'America/Mexico_City'::text NOT NULL,
  "status" "public"."entity_status" DEFAULT 'active'::"public"."entity_status" NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."people" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "middle_name" text,
  "email" text,
  "phone" text,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."platform_users" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "username" text NOT NULL,
  "password_hash" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "must_change_password" boolean DEFAULT false NOT NULL,
  "failed_login_attempts" integer DEFAULT 0 NOT NULL,
  "locked_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE TABLE "public"."role_assignments" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "membership_id" uuid NOT NULL,
  "role" "public"."user_role" NOT NULL,
  "granted_by" uuid,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "revoked_at" timestamp with time zone
);
CREATE TABLE "public"."security_audit_log" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "actor_user_id" uuid,
  "institution_id" uuid,
  "action" text NOT NULL,
  "target" text NOT NULL,
  "request_id" text,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);
CREATE UNIQUE INDEX "academic_courses_institution_code_uidx" ON "public"."academic_courses" USING btree ("institution_id", "code");
CREATE UNIQUE INDEX "academic_programs_id_institution_uidx" ON "public"."academic_programs" USING btree ("id", "institution_id");
CREATE UNIQUE INDEX "academic_programs_institution_code_uidx" ON "public"."academic_programs" USING btree ("institution_id", "code");
CREATE UNIQUE INDEX "academic_terms_institution_code_uidx" ON "public"."academic_terms" USING btree ("institution_id", "code");
CREATE INDEX "auth_sessions_user_idx" ON "public"."auth_sessions" USING btree ("user_id");
CREATE UNIQUE INDEX "campuses_institution_code_uidx" ON "public"."campuses" USING btree ("institution_id", "code");
CREATE UNIQUE INDEX "curriculum_versions_program_version_uidx" ON "public"."curriculum_versions" USING btree ("program_id", "version");
CREATE INDEX "institution_member_user_idx" ON "public"."institution_memberships" USING btree ("user_id");
CREATE UNIQUE INDEX "role_assignment_unique_active" ON "public"."role_assignments" USING btree ("membership_id", "role") WHERE ("revoked_at" IS NULL);
CREATE INDEX "audit_institution_created_idx" ON "public"."security_audit_log" USING btree ("institution_id", "created_at");
ALTER TABLE "public"."academic_courses" ADD CONSTRAINT "academic_courses_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."academic_programs" ADD CONSTRAINT "academic_programs_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."academic_terms" ADD CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."auth_sessions" ADD CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."campuses" ADD CONSTRAINT "campuses_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."curriculum_versions" ADD CONSTRAINT "curriculum_versions_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."institution_memberships" ADD CONSTRAINT "institution_memberships_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."institutions" ADD CONSTRAINT "institutions_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."people" ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."platform_users" ADD CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."role_assignments" ADD CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."security_audit_log" ADD CONSTRAINT "security_audit_log_pkey" PRIMARY KEY ("id");
ALTER TABLE "public"."auth_sessions" ADD CONSTRAINT "auth_sessions_token_hash_key" UNIQUE ("token_hash");
ALTER TABLE "public"."institution_memberships" ADD CONSTRAINT "institution_member_unique" UNIQUE ("institution_id", "user_id");
ALTER TABLE "public"."institutions" ADD CONSTRAINT "institutions_code_key" UNIQUE ("code");
ALTER TABLE "public"."platform_users" ADD CONSTRAINT "platform_users_username_key" UNIQUE ("username");
ALTER TABLE "public"."academic_courses" ADD CONSTRAINT "academic_courses_credits_range" CHECK ("credits" >= 0 AND "credits" <= 30);
ALTER TABLE "public"."academic_terms" ADD CONSTRAINT "academic_terms_dates_valid" CHECK ("end_date" >= "start_date");
ALTER TABLE "public"."academic_courses" ADD CONSTRAINT "academic_courses_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions" ("id") ON DELETE RESTRICT;
ALTER TABLE "public"."academic_programs" ADD CONSTRAINT "academic_programs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions" ("id") ON DELETE RESTRICT;
ALTER TABLE "public"."academic_terms" ADD CONSTRAINT "academic_terms_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions" ("id");
ALTER TABLE "public"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users" ("id") ON DELETE CASCADE;
ALTER TABLE "public"."campuses" ADD CONSTRAINT "campuses_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions" ("id");
ALTER TABLE "public"."curriculum_versions" ADD CONSTRAINT "curriculum_program_tenant_fk" FOREIGN KEY ("program_id", "institution_id") REFERENCES "public"."academic_programs" ("id", "institution_id") ON DELETE RESTRICT;
ALTER TABLE "public"."curriculum_versions" ADD CONSTRAINT "curriculum_versions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions" ("id") ON DELETE RESTRICT;
ALTER TABLE "public"."curriculum_versions" ADD CONSTRAINT "curriculum_versions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."academic_programs" ("id") ON DELETE RESTRICT;
ALTER TABLE "public"."institution_memberships" ADD CONSTRAINT "institution_memberships_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions" ("id") ON DELETE RESTRICT;
ALTER TABLE "public"."institution_memberships" ADD CONSTRAINT "institution_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."platform_users" ("id") ON DELETE RESTRICT;
ALTER TABLE "public"."platform_users" ADD CONSTRAINT "platform_users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people" ("id");
ALTER TABLE "public"."role_assignments" ADD CONSTRAINT "role_assignments_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."platform_users" ("id");
ALTER TABLE "public"."role_assignments" ADD CONSTRAINT "role_assignments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."institution_memberships" ("id") ON DELETE RESTRICT;
ALTER TABLE "public"."security_audit_log" ADD CONSTRAINT "security_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."platform_users" ("id");
ALTER TABLE "public"."security_audit_log" ADD CONSTRAINT "security_audit_log_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions" ("id");
ALTER TABLE "public"."academic_courses" OWNER TO "postgres";
ALTER TABLE "public"."academic_courses" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."academic_courses" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_courses" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_courses" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_courses" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_courses" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_courses" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_courses" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_courses" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_courses" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."academic_courses" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."academic_courses" TO "service_role";
ALTER TABLE "public"."academic_programs" OWNER TO "postgres";
ALTER TABLE "public"."academic_programs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."academic_programs" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_programs" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_programs" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_programs" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_programs" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_programs" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_programs" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_programs" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_programs" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."academic_programs" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."academic_programs" TO "service_role";
ALTER TABLE "public"."academic_terms" OWNER TO "postgres";
ALTER TABLE "public"."academic_terms" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."academic_terms" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_terms" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_terms" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_terms" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_terms" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_terms" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_terms" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_terms" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."academic_terms" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."academic_terms" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."academic_terms" TO "service_role";
ALTER TABLE "public"."auth_sessions" OWNER TO "postgres";
ALTER TABLE "public"."auth_sessions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auth_sessions" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_sessions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_sessions" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_sessions" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_sessions" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_sessions" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_sessions" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_sessions" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."auth_sessions" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."auth_sessions" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."auth_sessions" TO "service_role";
ALTER TABLE "public"."campuses" OWNER TO "postgres";
ALTER TABLE "public"."campuses" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."campuses" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."campuses" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."campuses" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."campuses" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."campuses" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."campuses" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."campuses" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."campuses" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."campuses" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."campuses" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."campuses" TO "service_role";
ALTER TABLE "public"."curriculum_versions" OWNER TO "postgres";
ALTER TABLE "public"."curriculum_versions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."curriculum_versions" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."curriculum_versions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."curriculum_versions" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."curriculum_versions" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."curriculum_versions" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."curriculum_versions" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."curriculum_versions" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."curriculum_versions" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."curriculum_versions" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."curriculum_versions" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."curriculum_versions" TO "service_role";
ALTER TABLE "public"."institution_memberships" OWNER TO "postgres";
ALTER TABLE "public"."institution_memberships" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."institution_memberships" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."institution_memberships" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."institution_memberships" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."institution_memberships" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."institution_memberships" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."institution_memberships" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."institution_memberships" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."institution_memberships" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."institution_memberships" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."institution_memberships" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."institution_memberships" TO "service_role";
ALTER TABLE "public"."institutions" OWNER TO "postgres";
ALTER TABLE "public"."institutions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."institutions" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."institutions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."institutions" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."institutions" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."institutions" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."institutions" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."institutions" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."institutions" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."institutions" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."institutions" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."institutions" TO "service_role";
ALTER TABLE "public"."people" OWNER TO "postgres";
ALTER TABLE "public"."people" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."people" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."people" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."people" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."people" TO "service_role";
ALTER TABLE "public"."platform_users" OWNER TO "postgres";
ALTER TABLE "public"."platform_users" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_users" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."platform_users" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."platform_users" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."platform_users" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."platform_users" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."platform_users" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."platform_users" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."platform_users" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."platform_users" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."platform_users" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."platform_users" TO "service_role";
ALTER TABLE "public"."role_assignments" OWNER TO "postgres";
ALTER TABLE "public"."role_assignments" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_assignments" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."role_assignments" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."role_assignments" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."role_assignments" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."role_assignments" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."role_assignments" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."role_assignments" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."role_assignments" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."role_assignments" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."role_assignments" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."role_assignments" TO "service_role";
ALTER TABLE "public"."security_audit_log" OWNER TO "postgres";
ALTER TABLE "public"."security_audit_log" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."security_audit_log" NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."security_audit_log" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."security_audit_log" FROM "postgres";
REVOKE ALL PRIVILEGES ON TABLE "public"."security_audit_log" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON TABLE "public"."security_audit_log" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON TABLE "public"."security_audit_log" FROM "anon";
REVOKE ALL PRIVILEGES ON TABLE "public"."security_audit_log" FROM "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."security_audit_log" FROM "service_role";
REVOKE ALL PRIVILEGES ON TABLE "public"."security_audit_log" FROM "dashboard_user";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."security_audit_log" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE "public"."security_audit_log" TO "service_role";
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM "postgres";
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM "supabase_admin";
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM "pg_database_owner";
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM "anon";
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM "authenticated";
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM "service_role";
REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM "dashboard_user";
GRANT USAGE, CREATE ON SCHEMA "public" TO "pg_database_owner";
GRANT USAGE ON SCHEMA "public" TO PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
COMMIT;
