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
| `adminSyncAllBeatdowns` | Callable | Manually trigger full sync |
| `adminRegenerateJsonCache` | Callable | Manually regenerate JSON cache |
| `adminGetAllLocationIds` | Callable | List all location IDs from API |
| `adminUpdateSingleLocation` | Callable | Update a single location |
| `adminRefreshSpecificLocations` | Callable | Refresh a batch of locations |
| `adminRerunWebhooks` | Callable | Re-process webhooks after a date |

## Prerequisites

- **Node.js 20.x** (`node -v` to verify)
- **Java 17+** (required by Firebase emulators — `sudo apt install openjdk-17-jre-headless`)
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Ionic CLI** (`npm install -g @ionic/cli`)
- **Firebase service account** — place at `functions/service-account.json` (gitignored)

## Setup

```bash
# Clone and install
git clone <repo-url> && cd f3nearme
npm install
cd functions && npm install && cd ..

# Configure local environment for Cloud Functions
cp functions/.env.example functions/.env
# Edit functions/.env and set your F3_API_KEY

# Place your Firebase service account key
# Download from: Firebase Console > Project Settings > Service Accounts > Generate new private key
cp /path/to/your/service-account.json functions/service-account.json
```

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

# Trigger only JSON cache regeneration
curl http://localhost:5001/f3-workout/us-central1/localTriggerJsonCache
```

These endpoints only exist in the emulator — they are not deployed to production.

### Writing to production Firestore

For running a manual sync against the **real** production Firestore (not the emulator):

```bash
# Option 1: Use the Firebase Functions shell (connects to real Firebase services)
cd functions && npm run shell
# Then in the shell:
#   adminSyncAllBeatdowns({})

# Option 2: Use the admin page in the deployed app
# Navigate to /admin and use the sync controls
```

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

```bash
# Deploy everything (hosting + functions)
npm run build:prod && firebase deploy

# Deploy only functions
cd functions && npm run deploy

# Deploy only hosting
npm run deploy
```

### Functions configuration (production)

API credentials are set via Firebase Functions config (not committed to repo):

```bash
firebase functions:config:set f3.api_key="YOUR_API_KEY"
firebase functions:config:set f3.client="f3nearme"
```

## Project Structure

```
├── functions/              # Firebase Cloud Functions
│   ├── src/
│   │   └── index.ts        # All function definitions + sync logic
│   ├── .env                # Local env vars (gitignored)
│   ├── .env.example         # Template for .env
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
│   └── seed-emulator.js     # Import seed data into running emulator
├── .vscode/
│   └── launch.json          # VS Code debug configurations
├── firebase.json            # Firebase config (hosting, functions, emulators)
├── firestore.rules
└── firestore.indexes.json
```
