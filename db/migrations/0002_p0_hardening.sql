-- P0: data-preserving hardening. Execute only in an isolated non-production rehearsal.
ALTER TABLE academic_terms ADD COLUMN legacy_start_date timestamp;
ALTER TABLE academic_terms ADD COLUMN legacy_end_date timestamp;
UPDATE academic_terms SET legacy_start_date=start_date,legacy_end_date=end_date;
ALTER TABLE academic_terms ALTER COLUMN start_date TYPE date USING start_date::date;
ALTER TABLE academic_terms ALTER COLUMN end_date TYPE date USING end_date::date;
--> statement-breakpoint
ALTER TABLE academic_programs ADD CONSTRAINT academic_programs_level_valid
 CHECK(level IN ('tecnico_superior','licenciatura','ingenieria','maestria','doctorado','otro'));
ALTER TABLE academic_programs ADD CONSTRAINT academic_programs_modality_valid
 CHECK(modality IN ('presencial','mixta','en_linea'));
ALTER TABLE academic_programs ADD CONSTRAINT academic_programs_status_valid CHECK(status IN ('active','inactive','archived'));
ALTER TABLE academic_courses ADD CONSTRAINT academic_courses_status_valid CHECK(status IN ('active','inactive','archived'));
ALTER TABLE academic_terms ADD CONSTRAINT academic_terms_status_valid CHECK(status IN ('active','inactive','archived'));
ALTER TABLE campuses ADD CONSTRAINT campuses_status_valid CHECK(status IN ('active','inactive','archived'));
ALTER TABLE curriculum_versions ADD CONSTRAINT curriculum_versions_status_valid CHECK(status IN ('active','inactive','archived'));
--> statement-breakpoint
CREATE UNIQUE INDEX campuses_id_institution_uidx ON campuses(id,institution_id);
CREATE UNIQUE INDEX academic_terms_id_institution_uidx ON academic_terms(id,institution_id);
CREATE UNIQUE INDEX academic_courses_id_institution_uidx ON academic_courses(id,institution_id);
CREATE UNIQUE INDEX campuses_one_primary_uidx ON campuses(institution_id) WHERE is_primary;
ALTER TABLE platform_users ADD COLUMN lockout_level integer NOT NULL DEFAULT 0 CHECK(lockout_level>=0);
ALTER TABLE auth_sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
UPDATE auth_sessions SET last_seen_at=created_at;
CREATE INDEX auth_sessions_last_seen_idx ON auth_sessions(last_seen_at);
ALTER TABLE security_audit_log ADD COLUMN details jsonb;
CREATE TABLE auth_throttle (
 key text PRIMARY KEY,
 scope text NOT NULL CHECK(scope IN ('login_account','login_ip','password_account','password_ip')),
 failures integer NOT NULL DEFAULT 0 CHECK(failures>=0),
 window_started_at timestamptz NOT NULL DEFAULT now(),
 blocked_until timestamptz,
 expires_at timestamptz NOT NULL
);
CREATE INDEX auth_throttle_expires_idx ON auth_throttle(expires_at);
--> statement-breakpoint
DO $$
BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='siii_app') THEN
  CREATE ROLE siii_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='siii_migrator') THEN
  CREATE ROLE siii_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
 END IF;
END $$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO siii_app;
GRANT USAGE,CREATE ON SCHEMA public TO siii_migrator;
DO $$
DECLARE item record;api_role text;owner_role text;
BEGIN
 -- Preserve unknown policies; restrictive policies deny Data API roles even if a permissive policy exists.
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.relname);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',item.relname);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated']
  LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',item.relname,api_role);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %I USING(false) WITH CHECK(false)','p0_deny_'||api_role,item.relname,api_role);
   END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO siii_app',item.relname);
  EXECUTE format('CREATE POLICY p0_backend_access ON public.%I FOR ALL TO siii_app USING(true) WITH CHECK(true)',item.relname);
  EXECUTE format('ALTER TABLE public.%I OWNER TO siii_migrator',item.relname);
 END LOOP;
 -- Application needs deletion only for expiry cleanup. Audit remains append-only to the app.
 REVOKE UPDATE ON security_audit_log FROM siii_app;
 GRANT DELETE ON auth_sessions,auth_throttle TO siii_app;
 REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated']
 LOOP
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=api_role) THEN
   EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I',api_role);
  END IF;
 END LOOP;
 -- Revoke defaults for every known public object creator; fail rather than silently leave a creator exposed.
 FOR owner_role IN
  SELECT DISTINCT name FROM (
   SELECT current_user::text AS name UNION SELECT 'siii_migrator'
   UNION SELECT pg_get_userbyid(defaclrole) FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public'
  ) creators
 LOOP
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC',owner_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC',owner_role);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated']
  LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I',owner_role,api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',owner_role,api_role);
   END IF;
  END LOOP;
 END LOOP;
END $$;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE siii_migrator IN SCHEMA public GRANT SELECT,INSERT,UPDATE ON TABLES TO siii_app;
ALTER TYPE entity_status OWNER TO siii_migrator;
ALTER TYPE user_role OWNER TO siii_migrator;
ALTER TYPE membership_status OWNER TO siii_migrator;
GRANT USAGE,CREATE ON SCHEMA drizzle TO siii_migrator;
ALTER TABLE drizzle.__drizzle_migrations OWNER TO siii_migrator;
