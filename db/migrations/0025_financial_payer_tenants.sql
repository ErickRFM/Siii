-- SQL is authoritative for these PostgreSQL >=15 column-specific delete actions.
-- The migrator holds siii:migrations and wraps pending DDL + ledger in one transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
BEGIN
 IF current_setting('server_version_num')::integer < 150000 THEN
  RAISE EXCEPTION 'FINANCIAL_PAYER_REQUIRES_PG15';
 END IF;
END $$;
--> statement-breakpoint
-- Fixed parent-before-child order; keep writes out between preflight and validation.
LOCK TABLE public.institution_memberships, public.institutional_students, public.payment_orders IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM public.payment_orders o
  WHERE o.payer_student_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.institutional_students s
   WHERE s.id=o.payer_student_id AND s.institution_id=o.institution_id
  )
 ) OR EXISTS (
  SELECT 1 FROM public.payment_orders o
  WHERE o.payer_user_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.institution_memberships m
   WHERE m.institution_id=o.institution_id AND m.user_id=o.payer_user_id
  )
 ) THEN
  -- No deletion, nulling or backfill: an invalid historical row stops the release.
  RAISE EXCEPTION 'FINANCIAL_PAYER_TENANT_INVALID';
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX payment_orders_payer_student_tenant_idx ON public.payment_orders(payer_student_id,institution_id);
--> statement-breakpoint
CREATE INDEX payment_orders_payer_user_tenant_idx ON public.payment_orders(institution_id,payer_user_id);
--> statement-breakpoint
ALTER TABLE public.payment_orders ADD CONSTRAINT orders_payer_student_tenant_fk
 FOREIGN KEY(payer_student_id,institution_id)
 REFERENCES public.institutional_students(id,institution_id)
 MATCH SIMPLE ON DELETE SET NULL (payer_student_id) ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE public.payment_orders ADD CONSTRAINT orders_payer_user_tenant_fk
 FOREIGN KEY(institution_id,payer_user_id)
 REFERENCES public.institution_memberships(institution_id,user_id)
 MATCH SIMPLE ON DELETE SET NULL (payer_user_id) ON UPDATE NO ACTION;
