-- P0.1 additive privacy correction. Historical SQL and ledger hashes stay unchanged.
-- Normalize only attributes that need changing. PostgreSQL requires SUPERUSER even for a redundant NOSUPERUSER clause.
DO $$
DECLARE role_name text; state record;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['siii_app','siii_migrator'] LOOP
  SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls INTO STRICT state FROM pg_roles WHERE rolname=role_name;
  IF state.rolsuper THEN EXECUTE format('ALTER ROLE %I NOSUPERUSER',role_name); END IF;
  IF state.rolcanlogin THEN EXECUTE format('ALTER ROLE %I NOLOGIN',role_name); END IF;
  IF state.rolcreatedb THEN EXECUTE format('ALTER ROLE %I NOCREATEDB',role_name); END IF;
  IF state.rolcreaterole THEN EXECUTE format('ALTER ROLE %I NOCREATEROLE',role_name); END IF;
  IF state.rolbypassrls THEN EXECUTE format('ALTER ROLE %I NOBYPASSRLS',role_name); END IF;
 END LOOP;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN ('siii_app','siii_migrator') AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)) THEN RAISE EXCEPTION 'UNSAFE_DATABASE_ROLE'; END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM siii_app;
DO $$
DECLARE item record;col record;parent_role text;creator text;api_role text;
BEGIN
 FOR parent_role IN SELECT p.rolname FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname='siii_app')
 LOOP
  EXECUTE format('REVOKE %I FROM siii_app',parent_role);
 END LOOP;
 FOR item IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
 LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM siii_app',item.relname);
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=item.oid AND attnum>0 AND NOT attisdropped
  LOOP
   EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM siii_app',col.attname,item.relname);
  END LOOP;
  IF item.relname='security_audit_log' THEN
   EXECUTE format('GRANT SELECT,INSERT ON TABLE public.%I TO siii_app',item.relname);
  ELSE
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO siii_app',item.relname);
  END IF;
 END LOOP;
 GRANT DELETE ON auth_sessions,auth_throttle TO siii_app;
 REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM siii_app;
 REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC,siii_app;
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated']
 LOOP
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=api_role) THEN
   EXECUTE format('REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM %I',api_role);
  END IF;
 END LOOP;
 FOR creator IN SELECT DISTINCT name FROM (
  SELECT current_user::text AS name UNION SELECT 'siii_migrator'
  UNION SELECT pg_get_userbyid(defaclrole) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
   WHERE d.defaclnamespace=0 OR n.nspname='public'
  UNION SELECT pg_get_userbyid(relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 ) creators WHERE name <> 'supabase_admin' OR pg_has_role(current_user,name,'USAGE')
 LOOP
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,siii_app',creator);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,siii_app',creator);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated']
  LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM %I',creator,api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',creator,api_role);
   END IF;
  END LOOP;
 END LOOP;
END $$;
