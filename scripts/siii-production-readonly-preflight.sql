-- SIII institutional read-only release gate. PostgreSQL / Supabase.
-- Review before running in the SQL Editor or psql. SELECT-only: never mutates production.
-- A passing table existence check does NOT replace hash, owner, RLS, grants or restore evidence.

-- 1. Two different migration ledgers; do not confuse their counts.
select 'drizzle' as ledger, count(*)::integer as records, max(created_at) as newest_journal_timestamp
from drizzle.__drizzle_migrations;

-- 2. Validate the 0017 -> 0018 migration boundary before enabling outbound events.
-- Each missing table is a NO-GO; newer tables additionally require 0019..0023.
with required(migration, table_name) as (
 values
 ('0018','academic_section_versions'),
 ('0018','academic_section_outbox'),
 ('0019','admission_cycles'),
 ('0019','applicant_profiles'),
 ('0019','admission_applications'),
 ('0019','admission_documents'),
 ('0019','admission_decisions'),
 ('0020','student_account_links'),
 ('0020','student_claim_requests'),
 ('0021','financial_fee_types'),
 ('0021','payment_orders'),
 ('0021','payment_transactions'),
 ('0021','financial_waivers')
)
select migration, table_name,
       to_regclass(format('public.%I',table_name)) is not null as exists_in_public
from required order by migration,table_name;

-- 3. Existing public table RLS posture (does not prove policies/grants are correct).
select count(*)::integer as tables,
       count(*) filter (where c.relrowsecurity)::integer as rls_on,
       count(*) filter (where c.relforcerowsecurity)::integer as rls_forced,
       count(*) filter (where not c.relrowsecurity)::integer as rls_off
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p');

-- 4. Relevant roles, no password, secret, contact or row data is retrieved.
select rolname,rolcanlogin,rolbypassrls
from pg_roles
where rolname in ('siii_app','siii_migrator','siii_production_web_744fe951ed9c')
order by rolname;

-- 5. Once 0018 exists, inspect table owner and forced RLS. No write permissions.
select c.relname as relation,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_on,
       c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('academic_section_versions','academic_section_outbox');
