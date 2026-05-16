# F3 Near Me

Discover F3 workout locations near you. Find a free, outdoor, peer-led workout group for men today.

**Live site:** [https://f3near.me](https://f3near.me)

![localhost_8100_nearby(Pixel 5) (2)](https://user-images.githubusercontent.com/8845360/193480152-5bebfd00-8ac7-4b2a-bc9c-0152c11ffefc.png)

## Architecture

- **Frontend:** Ionic/Angular 14 PWA
- **Backend:** Firebase (Firestore, Cloud Functions, Cloud Storage)
- **Data source:** [F3 Nation API](https://api.f3nation.com) — workout events and locations
- **Hosting:** Firebase Hosting
- **Project ID:** `f3-workout`

### How data flows

1. The **F3 Nation API** is the source of truth for workout events and locations
2. **Cloud Functions** sync data from the API into **Firestore** (hourly scheduled + webhook-triggered)
3. A **JSON cache** (`all.json`) is generated from Firestore and stored in **Cloud Storage**
4. The **Angular app** loads workout data from the JSON cache (with Firestore as fallback)

### Cloud Functions

| Function | Trigger | Description |
|---|---|---|
| `scheduledSyncAllBeatdowns` | Pub/Sub (hourly) | Full sync from F3 API to Firestore |
| `scheduledRegenerateJsonCache` | Pub/Sub (hourly) | Regenerate `all.json` from Firestore |
| `mapWebhook` | HTTP POST | Processes webhook notifications for real-time updates |
| `adminSyncAllBeatdowns` | Callable | Manually trigger full sync (supports `dryRun`) |
| `localTriggerSync` | HTTP GET | Emulator-only endpoint to trigger sync |
| `adminRegenerateJsonCache` | Callable | Manually regenerate JSON cache |
| `adminGetAllLocationIds` | Callable | List all location IDs from API |
| `adminUpdateSingleLocation` | Callable | Update a single location |
| `adminRefreshSpecificLocations` | Callable | Refresh a batch of locations |
| `adminRerunWebhooks` | Callable | Re-process webhooks after a date |

## Prerequisites

- **Node.js 20.x** (`node -v` to verify)
- **Java 17+** (required by Firebase emulators — `sudo apt install openjdk-17-jre-headless`)
- **Ionic CLI** (`npm install -g @ionic/cli`)
- **Firebase service account** — place at `functions/service-account.json` (gitignored)

## Setup

```bash
# Clone and install
git clone <repo-url> && cd f3nearme
npm install  # installs repo-local dev tools, including firebase-tools
cd functions && npm install && cd ..

# Configure local environment for Cloud Functions
# Use .env.local for local-only vars (GOOGLE_APPLICATION_CREDENTIALS, test API keys)
# .env.local is NOT deployed to production; .env IS deployed
cp functions/.env.example functions/.env.local
# Edit functions/.env.local and set F3_API_KEY, GOOGLE_APPLICATION_CREDENTIALS, etc.

# Place your Firebase service account key
# Download from: Firebase Console > Project Settings > Service Accounts > Generate new private key
cp /path/to/your/service-account.json functions/service-account.json
```

The Firebase CLI is installed locally from the root `package.json`, so commands like `npm run emulator` work without a global `firebase` install.

## Local Development

### Quick start (emulator)

```bash
# Build functions + start all emulators (Firestore, Functions, Storage, Hosting, Pub/Sub)
npm run emulator

# Emulator UI:        http://localhost:4000
# Functions:          http://localhost:5001
# Firestore:          http://localhost:8080
# Hosting:            http://localhost:5000
# Storage:            http://localhost:9199
```

The emulator persists data between runs in `emulator-data/`. To start with an empty database:

```bash
npm run emulator:empty   # starts without importing previous data (but still exports on exit)
```

### Stopping the emulator

**Ctrl-C** in the emulator terminal is the cleanest way — it exports data before shutting down.

Check if the emulator is still running:

```bash
curl -s http://localhost:8080 >/dev/null 2>&1 && echo "Running" || echo "Stopped"
```

If the terminal is gone or the emulator is stuck, kill the processes by port:

```bash
lsof -ti :5001 -ti :8080 -ti :8085 -ti :4000 | xargs -r kill -9
rm -f /tmp/hub-f3-workout.json   # clean up stale hub file
```

### Running the Angular app

In a separate terminal:

```bash
npm start   # ng serve on http://localhost:4200
```

To connect the Angular app to the emulators, set `useEmulators: true` in `src/environments/environment.ts`.

### Seeding emulator with production data (first time only)

You only need to do this **once**. After the initial seed, the emulator auto-exports its
data on exit to `emulator-data/`, and `npm run emulator` auto-imports it on startup.

```bash
# Step 1: Export from production Firestore (one-time, requires service-account.json)
node scripts/export-prod-data.js

# Step 2: Start emulator, seed it, and keep running (one command)
npm run emulator:seed
```

The `emulator:seed` command starts a fresh emulator, waits for Firestore to be ready,
imports the seed data, and keeps running. Once it finishes seeding you'll see:

```
[seed] Done! Emulator is seeded and running. Press Ctrl-C to stop.
```

From now on, just use `npm run emulator` — your data will persist automatically.

### Triggering scheduled functions locally

Scheduled functions (Pub/Sub triggers) can't be invoked from the Emulator UI directly. Instead, use the local-only HTTP endpoints that are automatically available when the emulator is running:

```bash
# Trigger full sync (syncAllBeatdowns + generateJsonCache)
curl http://localhost:5001/f3-workout/us-central1/localTriggerSync

# Dry run — see what would change without writing to Firestore
curl "http://localhost:5001/f3-workout/us-central1/localTriggerSync?dryRun=true"

# Trigger only JSON cache regeneration
curl http://localhost:5001/f3-workout/us-central1/localTriggerJsonCache
```

These endpoints only exist in the emulator — they are not deployed to production.

### Running sync against production Firestore

You can run your **local** sync logic against the **real** production Firestore without deploying.
This requires `functions/service-account.json`.

```bash
# Dry run — preview what would change (safe, read-only)
npm run sync:dry

# Live — actually write changes (prompts for confirmation)
npm run sync:live
```

Example dry-run output:

```
============================================================
  🔍  DRY RUN — no changes will be written to Firestore
  📦  Project: f3-workout
============================================================

[SYNC] Found 7742 existing beatdowns in Firestore
[SYNC] Found 6529 events in API
[SYNC] Found 67 beatdowns to write (0 new, 0 updated, 67 undeleted, 6364 unchanged)
[SYNC] DRY RUN completed in 5867ms

{ newBeatdowns: 0, updatedBeatdowns: 0, undeletedBeatdowns: 67, ... dryRun: true }
```

You can also trigger syncs from the **admin page** (`/admin`) in the deployed app.

## Debugging Functions (step-through)

1. Start the emulator with debug mode:

   ```bash
   npm run emulator:debug
   ```

   This starts the functions runtime with `--inspect` on port 9229.

2. In VS Code, open the **Run and Debug** panel and select **"Attach to Functions Emulator"**.

3. Set breakpoints in `functions/src/index.ts` (e.g., inside `syncAllBeatdowns`).

4. Trigger the function:

   ```bash
   curl http://localhost:5001/f3-workout/us-central1/localTriggerSync
   ```

5. The debugger will pause at your breakpoints. You can step through the sync logic, inspect variables, etc.

## Deployment

The Firebase CLI is not installed globally — use `npx firebase-tools@latest` or install it first:

```bash
npm install -g firebase-tools
```

```bash
# Deploy only functions (most common)
npx firebase-tools@latest deploy --only functions

# Deploy everything (hosting + functions)
npm run build:prod && npx firebase-tools@latest deploy

# Deploy only hosting (also triggered automatically on push to main via GitHub Actions)
npm run build:prod && npx firebase-tools@latest deploy --only hosting
```

> **Note:** Hosting is also auto-deployed via GitHub Actions on any push to `main` that changes files under `src/`. Functions must be deployed manually.

### Functions configuration (production)

API credentials are set via Firebase Functions config (not committed to repo):

```bash
npx firebase-tools@latest functions:config:set f3.api_key="YOUR_API_KEY"
npx firebase-tools@latest functions:config:set f3.client="f3nearme"
```

## Project Structure

```
├── functions/              # Firebase Cloud Functions
│   ├── src/
│   │   └── index.ts        # All function definitions + sync logic
│   ├── .env                # Env vars deployed to production Cloud Functions (gitignored)
│   ├── .env.local          # Local-only overrides — NOT deployed (gitignored)
│   ├── .env.example         # Template for .env / .env.local
│   ├── .runtimeconfig.json  # Emulator functions.config() (gitignored)
│   ├── service-account.json # Firebase Admin credentials (gitignored)
│   ├── package.json
│   └── tsconfig.json
├── src/                    # Angular/Ionic frontend
│   ├── app/
│   │   ├── pages/
│   │   │   ├── admin/       # Admin page for manual sync controls
│   │   │   ├── nearby/      # Main map/list view
│   │   │   └── workout/     # Individual workout detail
│   │   ├── services/
│   │   │   ├── beatdown.service.ts  # Data fetching (JSON cache + Firestore fallback)
│   │   │   └── http.service.ts
│   │   └── pipes/
│   ├── environments/        # Angular environment configs
│   └── assets/
├── scripts/                # Local development utility scripts
│   ├── export-prod-data.js  # Export prod Firestore to seed file
│   ├── run-sync.js          # Run sync against prod without deploying
│   ├── seed-emulator.js     # Import seed data into running emulator
│   └── start-and-seed.js    # One-command emulator start + seed
├── .vscode/
│   └── launch.json          # VS Code debug configurations
├── firebase.json            # Firebase config (hosting, functions, emulators)
├── firestore.rules
└── firestore.indexes.json
```
