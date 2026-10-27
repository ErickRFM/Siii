# Managed PostgreSQL migration proposal — NOT APPLIED

Automatic approval review rejected changing historical migration0003 because existing ledgers would drift. Its original bytes have been restored from dff8c2d9. Production and existing cloud ledgers were not modified.

PostgreSQL17 rejects even a redundant NOSUPERUSER clause under a non-superuser migration owner (SQLSTATE42501). A real local PostgreSQL regression reproduced this. The proposed SQL normalizes only attributes currently enabled, with the same final five forbidden attributes all false and no privilege escalation; a non-superuser must still fail to clear an actually superuser target.

This is a review artifact, never an executable migration path. The paired pending test is not included in passing suite totals. Original migration remains canonical and the staging gate remains open. Approval must first choose a compatible release/baseline strategy for every ledger that has already recorded the original hash; no ledger may be rewritten to force acceptance. Then rerun clean and populated staging, runtime, RLS, backup/restore and reversal checks before promotion.

Reference: https://www.postgresql.org/docs/17/sql-alterrole.html and https://supabase.com/docs/guides/database/postgres/roles-superuser
