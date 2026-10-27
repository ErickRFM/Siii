-- P0 additive hardening for the eleven institutional tables created by 0019–0021.
-- Keep RLS forced and Data API roles blocked; the trusted backend remains the only DML path.
-- Ownership matches preexisting P0/P1 tables and is required for local security/date replay.
DO $$
DECLARE relation_name text;
DECLARE api_role text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='siii_app')
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='siii_migrator') THEN
  RAISE EXCEPTION 'INSTITUTIONAL_ROLES_REQUIRED';
 END IF;
 FOREACH relation_name IN ARRAY ARRAY[
  'admission_cycles','applicant_profiles','admission_applications',
  'admission_documents','admission_decisions','student_account_links',
  'student_claim_requests','financial_fee_types','payment_orders',
  'payment_transactions','financial_waivers'
 ] LOOP
  IF to_regclass(format('public.%I',relation_name)) IS NULL THEN
   RAISE EXCEPTION 'NEW_MODULE_TABLE_REQUIRED: %',relation_name;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',relation_name);
  -- Remove inherited creator defaults before granting only the needed backend DML.
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,siii_app',relation_name);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',relation_name,api_role);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO %I USING (false) WITH CHECK (false)',
      'new_modules_deny_'||api_role,relation_name,api_role);
   END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO siii_app',relation_name);
  -- Server authorization and per-institution filters remain mandatory in handlers.
  EXECUTE format('CREATE POLICY new_modules_backend_access ON public.%I FOR ALL TO siii_app USING (true) WITH CHECK (true)',relation_name);
  EXECUTE format('ALTER TABLE public.%I OWNER TO siii_migrator',relation_name);
 END LOOP;
END $$;
