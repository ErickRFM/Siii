-- Additive reconciliation of inherited API grants and existing runtime defaults.
-- Managed schemas and role memberships are not modified.
DO $$
DECLARE api text;grantee text;creator text;item record;col record;
BEGIN
 FOREACH api IN ARRAY ARRAY['anon','authenticated']
 LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=api) THEN CONTINUE; END IF;
  IF pg_has_role(api,'siii_app','MEMBER') OR pg_has_role(api,'siii_migrator','MEMBER')
   OR EXISTS(SELECT FROM pg_roles r WHERE pg_has_role(api,r.oid,'MEMBER') AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb))
   OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(api,c.relowner,'MEMBER'))
  THEN RAISE EXCEPTION 'DATA_API_ROLE_UNSAFE'; END IF;
 END LOOP;
 FOR grantee IN SELECT DISTINCT r.rolname FROM pg_roles r
  WHERE EXISTS(SELECT FROM pg_roles api WHERE api.rolname IN('anon','authenticated')
   AND (pg_has_role(api.oid,r.oid,'USAGE') OR pg_has_role(api.oid,r.oid,'SET')))
 LOOP
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I',grantee);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I',grantee);
  EXECUTE format('REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM %I',grantee);
  FOR item IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')
  LOOP
   FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=item.oid AND attnum>0 AND NOT attisdropped
   LOOP EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM %I',col.attname,item.relname,grantee); END LOOP;
  END LOOP;
 END LOOP;
 FOR creator IN SELECT DISTINCT name FROM (
  SELECT current_user::text AS name UNION SELECT 'siii_migrator'
  UNION SELECT pg_get_userbyid(defaclrole) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR n.nspname='public'
  UNION SELECT pg_get_userbyid(relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 ) creators WHERE name <> 'supabase_admin' OR pg_has_role(current_user,name,'USAGE')
 LOOP
  -- A previous ALL default is not cancelled by a later minimal GRANT.
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM siii_app',creator);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM siii_app',creator);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM siii_app',creator);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM siii_app',creator);
  -- New runtime tables require an explicit reviewed grant and RLS policy.
  FOR grantee IN SELECT DISTINCT r.rolname FROM pg_roles r
   WHERE EXISTS(SELECT FROM pg_roles api WHERE api.rolname IN('anon','authenticated')
    AND (pg_has_role(api.oid,r.oid,'USAGE') OR pg_has_role(api.oid,r.oid,'SET')))
  LOOP
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM %I',creator,grantee);
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I',creator,grantee);
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM %I',creator,grantee);
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',creator,grantee);
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM %I',creator,grantee);
   EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',creator,grantee);
  END LOOP;
 END LOOP;
 FOREACH api IN ARRAY ARRAY['anon','authenticated']
 LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=api) THEN CONTINUE; END IF;
  IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND has_function_privilege(api,p.oid,'EXECUTE'))
   OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN('r','p') AND (has_table_privilege(api,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(api,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
  THEN RAISE EXCEPTION 'DATA_API_ROLE_UNSAFE'; END IF;
 END LOOP;
END $$;
