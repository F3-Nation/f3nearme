# Cost incident (Sept 2026) & migration to static JSON serving

## What happened

Firestore document reads jumped from ~6M/day to ~19M/day on **2026-09-01**
(~$4/day → ~$12/day). Site traffic was flat (hosting bandwidth unchanged), and
the extra reads ran flat 24/7: an external party started dumping the
publicly-readable `beatdowns` collection (9,674 docs) roughly **once per
minute**. The remaining ~6M/day baseline was the app itself: `useJsonCache`
was `false`, so every visitor read all ~9.7k docs (including ~3k soft-deleted)
via a Firestore listener.

## New architecture (phase 1 — deployed 2026-09-08)

- `all.json` is now generated **directly from the F3 Nation API**
  (`/v1/event` + `/v1/location`) by `generateJsonCache()` in
  `functions/src/index.ts` — minified, stored gzipped (~486KB on the wire),
  `Cache-Control: public, max-age=300, stale-while-revalidate=3600`, with a
  safety check that refuses to overwrite the file if the new dataset shrinks >50%.
- Triggers: hourly `scheduledSyncAllBeatdowns`, the `mapWebhook` on changes,
  and the `adminRegenerateJsonCache` callable.
- The client (`beatdown.service.ts`) has `useJsonCache = true` and serves all
  UI (nearby list, workout detail, deep links) from the JSON file. Firestore is
  an emergency fallback only.
- The redundant hourly `scheduledRegenerateJsonCache` function was removed.
- Firestore writes still happen during the hourly sync **only as a bridge** for
  stale PWA bundles that predate this deploy.

## Phase 2 — after ~2026-09-15

1. Replace `firestore.rules` with `firestore.rules.phase2-locked` and
   `firebase deploy --only firestore:rules`. This cuts off the scraper.
   Verify reads drop: Cloud Monitoring → `firestore.googleapis.com/document/read_count`.
2. Optional decommission (removes the rest of the Firestore machinery):
   - Delete `syncAllBeatdowns` + Firestore reads/writes from
     `functions/src/index.ts`; keep only JSON generation. The webhook handler
     can drop its Firestore updates and just call `generateJsonCache()`.
   - Delete the admin location/event functions or gate them behind auth
     (they are currently unauthenticated callables).
   - Delete the `beatdowns` and `webhookLogs` collections.
   - Remove `AngularFirestore` fallback paths from `beatdown.service.ts`.

## Useful checks

- Live file: `curl -sI https://storage.googleapis.com/f3-workout.appspot.com/data/all.json`
  (expect `content-encoding: gzip` after phase 1 regen, and metadata
  `beatdownCount` via `gsutil stat`).
- Daily reads: Cloud Monitoring metric `firestore.googleapis.com/document/read_count`
  summed per day should fall to near zero after phase 2.
