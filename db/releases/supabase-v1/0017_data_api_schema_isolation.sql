-- Additive guard: provider defaults are safe only without any API path to public.
-- Include SET-only memberships; do not change provider/group grants implicitly.
DO $$
DECLARE api record; reachable record;
BEGIN
 FOR api IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  FOR reachable IN SELECT oid,rolname FROM pg_roles
    WHERE oid=api.oid OR pg_has_role(api.oid,oid,'USAGE') OR pg_has_role(api.oid,oid,'SET') LOOP
   IF has_schema_privilege(reachable.oid,'public','USAGE') OR has_schema_privilege(reachable.oid,'public','CREATE') THEN
    RAISE EXCEPTION 'DATA_API_SCHEMA_PATH_UNSAFE';
   END IF;
  END LOOP;
 END LOOP;
END $$;
