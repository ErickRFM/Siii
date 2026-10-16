-- Additive defense in depth for existing institutional tables. No data or policies are removed.
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN('r','p')
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.relname);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',item.relname);
 END LOOP;
END $$;
