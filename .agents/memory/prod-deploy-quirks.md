---
name: Production deploy quirks (Rheinschiffer)
description: Base-path and Supabase edge function pitfalls between test and production deployments
---

- Production web app is served by GitHub Pages under the subpath `/Reffenthal-waechter-/`; the test deployment serves from root. Any absolute URL or service-worker registration (`/foo.js`, scope `/`) works on test but silently breaks on production.
  **Why:** a ported, fully tested push feature failed review because the SW was registered at `/push-sw.js`.
  **How to apply:** derive paths from `process.env.EXPO_ROUTER_BASE_URL` (empty on test) instead of hardcoding `/`.
- Supabase Edge Functions deploy via `npx supabase@latest functions deploy <name> --project-ref <ref> --use-api` with `SUPABASE_ACCESS_TOKEN` set (personal token from Account Settings → Access Tokens; the project API keys do NOT work). Deploy with `--no-verify-jwt`: the new `sb_secret_…` keys are not JWTs, so gateway JWT verification rejects server-to-server calls; the functions authenticate callers themselves.
- Read-only production SQL checks are possible via the Management API: `POST https://api.supabase.com/v1/projects/<ref>/database/query` with the access token.
