-- Reconcile an upgrade where unsafe defaults created objects after 0003.
-- Unknown public tables receive no runtime grants; new capabilities grant explicitly.
DO $$
DECLARE item record;col record;
BEGIN
 FOR item IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')
 LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM siii_app',item.relname);
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=item.oid AND attnum>0 AND NOT attisdropped
  LOOP EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM siii_app',col.attname,item.relname); END LOOP;
  IF item.relname='security_audit_log' THEN
   EXECUTE format('GRANT SELECT,INSERT ON TABLE public.%I TO siii_app',item.relname);
  ELSIF item.relname=ANY(ARRAY['institutions','people','platform_users','institution_memberships','role_assignments','auth_sessions','auth_throttle','campuses','programs','academic_terms','curricula','courses']) THEN
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO siii_app',item.relname);
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.relname);
 END LOOP;
 GRANT DELETE ON public.auth_sessions,public.auth_throttle TO siii_app;
 REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM siii_app;
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND (
  has_table_privilege('siii_app',c.oid,'TRUNCATE,TRIGGER,MAINTAIN') OR has_any_column_privilege('siii_app',c.oid,'REFERENCES')
  OR (c.relname NOT IN('auth_sessions','auth_throttle') AND has_table_privilege('siii_app',c.oid,'DELETE'))
  OR (c.relname='security_audit_log' AND has_any_column_privilege('siii_app',c.oid,'UPDATE'))
 )) THEN RAISE EXCEPTION 'APPLICATION_ROLE_UNSAFE'; END IF;
END $$;
