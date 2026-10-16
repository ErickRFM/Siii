# Runtime access — operator authorized

Recipient: only the Siii web backend hosted by Vercel project prj_5OMS0EPuwS3cuQF4ICqBYBF6UNlT, team er-i1.

- Existing staging vsnrbjexusidlvhkhmqg: siii_staging_web_80f5c89b2ec2; only Preview/staging.
- Existing production kkjzbqsaummyralqjqrb: siii_production_web_744fe951ed9c; only Production, after reviewed migration and release gates.
- Each login inherits only siii_app. No SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE, REPLICATION, schema ownership or DDL. Post-creation APPLICATION_ROLE_QUERY must pass; otherwise stop before hosting changes.
- Password generated inside PostgreSQL using48 random bytes, encrypted OpenPGP to the operator public key before handoff. Keyrings and connection configuration remain encrypted locally; decryption only in memory. Vercel receives server-only Secret values. No plaintext credential files, no logs or Git secrets, no frontend keys.
- Existing database roles, users, password hashes and application sessions are not reset or deleted. Provisioning writes an audit event.
- SQL generator: scripts/runtime-role-provisioning.ts. It requires postgres session/database, the exact release profile fingerprint and18 ledger rows, and rejects existing role names. Unit checks for environment and identifier isolation passed3/3; real staging DML/HTTP and TLS checks passed after authorization.
- Reversal: disable only each newly named login (NOLOGIN), revoke siii_app from it, retain its audit/metadata, and preserve existing roles and all institutional data. Revert hosting to the previous ready deployment with its original environment snapshot.

Automatic approval review rejected the original execution because persistent access and plaintext local materialization were not explicitly authorized. This revised proposal removes plaintext storage and requests authorization for the named backend recipients and scopes. The operator explicitly authorized both roles in this chat. The staging role has been provisioned and verified; the production role remains gated on reviewed migration and release checks.
