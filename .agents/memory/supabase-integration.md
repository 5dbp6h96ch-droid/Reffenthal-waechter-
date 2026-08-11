---
name: Supabase Integration
description: Supabase client, auth, user_settings, gauges hooks – setup decisions and known quirks.
---

# Supabase Integration – R(h)einschiffer

## Rule
`@supabase/supabase-js` v2 is installed in `@workspace/mobile`. The anon key is stored as Replit Secret `EXPO_PUBLIC_SUPABASE_KEY`; the URL as env var `EXPO_PUBLIC_SUPABASE_URL`.

**Why:** App is a GitHub Pages PWA – no Replit runtime dependency allowed. All Supabase access uses RLS + anon key only.

## How to apply
- Import client from `@/app/utils/supabase`
- Auth via `@/hooks/useAuth`
- User settings via `@/hooks/useUserSettings(userId)`
- Gauge list via `@/hooks/useGauges()`
- Database types in `@/app/types/database.ts` – update manually when schema changes

## Known quirks
- `upsert()` on `user_settings` requires `// eslint-disable-next-line @typescript-eslint/no-explicit-any` cast due to supabase-js generic inference bug with custom Database types and `onConflict`.
- After `pnpm add @supabase/supabase-js`, Metro may crash with `ENOENT: no such file or directory, watch …_tmp_NNN/dist/umd`. Fix: restart the Expo workflow (temp dir is cleaned up after install).
- `detectSessionInUrl: false` is required for React Native/Expo – without it, auth breaks on web builds.

## Auth UI location
"Mein Konto" accordion item is the 8th item in the MENÜ card in `artifacts/mobile/app/index.tsx`. It shows login/register when logged out, and gauge selector + logout when logged in.
