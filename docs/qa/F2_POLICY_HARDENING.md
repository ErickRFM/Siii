# F2 — Policy hardening and build cleanup

## Baseline
- Source: `merge/supabase-into-identity`, SHA `5df55d6fc48f803f05b42d311fa371bd9bc84c6e`.
- The earlier verified run for the portal branch is [Verify SIS run 38466324830](https://github.com/ErickRFM/Siii/actions/runs/38466324830): typecheck, six unit tests, two PostgreSQL integration tests and production build completed successfully.
- That run's two **build warnings** were Autoprefixer `align-items:start`, **not typed-route type errors**. There are also upstream dependency deprecation warnings.
- PR #2 was closed without merging. The consolidated merge branch preserves identity and audit work.

## This incremental patch
1. Change two CSS declarations to `align-items:flex-start` to address the actionable Autoprefixer warnings.
2. Restrict institutional admins from granting the `admin` role. Only a `super_admin` can grant `admin`; `super_admin` cannot be granted from this normal API. Role assignment must still reject self-grants and out-of-scope memberships at route level.
3. Require `Sec-Fetch-Site` to be `same-origin` or `none` when supplied, alongside the existing Origin verification for state-changing requests. Non-browser clients without either header remain supported; session/authorization enforcement is separate.
4. Add focused unit tests for origin policy and role grants.

## Still required before F2 closure
- Verify this branch's new CI results; **the prior portal CI does not prove these new commits passed**.
- Run identity lifecycle and tenant isolation integration tests using a real PostgreSQL test database.
- Build and verify invitation, recovery, membership revocation, and session management operations.
- Add an appropriate account-and-IP rate limiter to login, verify under concurrency.
- Validate staging migrations, security headers, API origin handling behind the actual reverse proxy, and UI accessibility.
- Do not change production Supabase data or claim staging verified without evidence.

## Integration
Target the repo's current working foundation line by pull request. Do not merge until CI and review pass. Keep F2 partial until the checklist above is satisfied.
