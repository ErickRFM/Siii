# Vercel npm ERESOLVE recovery (2026-10-13)

## Confirmed cause

Deployment on `feat/sis-foundation` at `08584b0` fails npm dependency resolution. The committed `package.json` declares `zod: ^4.1.11` alongside `@asteasolutions/zod-to-openapi: ^7.3.0`. The latter resolves to 7.3.4 with a `zod: ^3.20.2` peer dependency. This is not compatible with Zod 4.

The foundation repo does not import this OpenAPI generator, and `docs:openapi` references an as-yet-unimplemented script. The least risky solution for this deploy is to remove the unused v7 library from both the manifest and the npm lockfile. Continue using Zod 4 for validation. If OpenAPI generation is implemented later, add a Zod-4-compatible v8+ generator and tests as a separate change.

## Change

- Remove the unused incompatible package from manifest and root npm lock dependencies.
- Remove the now-orphaned package and its `openapi3-ts` dependency from the lockfile.
- Keep `yaml` in the lockfile because Vite also declares it as an optional peer.
- Add GitHub Actions with a clean `npm ci`, TypeScript verification, Vitest tests, and Next.js production build.

No `--force` or `--legacy-peer-deps` flags are used. No Supabase schema or data changes are made.

## Verification and deployment

1. Checkout the proposed fix branch.
2. Run `npm ci --no-audit --no-fund` from a clean directory, then `npm run typecheck`, `npm test`, and `npm run build`.
3. Inspect the pull request's CI results.
4. After validation, merge into the actual Vercel production branch (`feat/sis-foundation`, as shown in the failure screenshot); the resulting Vercel deployment must point at the new SHA.
5. Inspect Vercel build logs and confirm the deployment is Ready, then check `/api/health`.

This PR fixes the dependency resolution failure, not all future deployment or database-configuration errors.
