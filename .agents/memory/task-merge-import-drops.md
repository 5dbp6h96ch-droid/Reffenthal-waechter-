---
name: Task-merge import drops
description: Task agents repeatedly add hook calls to index.tsx without adding the import → ReferenceError crash caught by ErrorBoundary as "Something went wrong"
---

## Pattern

After every task-agent merge into `artifacts/mobile/app/index.tsx`, check for missing imports before concluding the merge is clean. Metro compiles without errors (Babel, not tsc), so the crash is silent until the user opens the app on their device.

## Hooks that have been dropped so far

| Hook / symbol | Import path |
|---|---|
| `useNfbNotifications` | `@/hooks/useNfbNotifications` |
| `useColors` | `@/hooks/useColors` |

## Quick diagnostic

```bash
cd artifacts/mobile && npx tsc --noEmit 2>&1 | grep "error TS2552\|Cannot find name"
```

`TS2552 "Cannot find name 'X'"` = used but not imported → runtime crash.
`TS2305 "has no exported member"` from `@workspace/api-client-react` = false positive (tsc has no project ref; Metro resolves via src directly → harmless).

**Why:** Task agents write code against their local snapshot of index.tsx and don't always see all existing imports in the 2000-line file.

**How to apply:** After any task merge that touches `artifacts/mobile/app/index.tsx`, run the tsc check above and look for TS2552 errors before declaring the app healthy.
