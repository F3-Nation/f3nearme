/**
 * Run syncAllBeatdowns directly against PRODUCTION Firestore.
 *
 * This lets you test your local sync logic against real data WITHOUT
 * deploying Cloud Functions.  It defaults to dry-run mode so nothing
 * is written unless you explicitly pass --live.
 *
 * Usage:
 *   npm run sync:dry          # dry run (safe — read only)
 *   npm run sync:live         # real write (asks for confirmation)
 *
 * Or directly:
 *   node scripts/run-sync.js              # dry run
 *   node scripts/run-sync.js --live       # real write
 *
 * Requires:
 *   - functions/service-account.json (Firebase Admin credentials)
 *   - Run `npm run build` in functions/ first (or use the npm scripts above)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ---------------------------------------------------------------------------
// 1. Validate service account exists
// ---------------------------------------------------------------------------
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'functions', 'service-account.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`\n❌  Service account not found at: ${SERVICE_ACCOUNT_PATH}`);
  console.error('   Place your service-account.json in functions/\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Validate compiled output exists
// ---------------------------------------------------------------------------
const LIB_INDEX = path.join(__dirname, '..', 'functions', 'lib', 'index.js');

if (!fs.existsSync(LIB_INDEX)) {
  console.error('\n❌  functions/lib/index.js not found.');
  console.error('   Run "cd functions && npm run build" first.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2b. Load functions/.env so F3_API_KEY (and any future vars) are available
// ---------------------------------------------------------------------------
const ENV_PATH = path.join(__dirname, '..', 'functions', '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx);
      const value = trimmed.slice(idx + 1);
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Parse flags
// ---------------------------------------------------------------------------
const isLive = process.argv.includes('--live');
const dryRun = !isLive;

// ---------------------------------------------------------------------------
// 4. Point firebase-admin at PRODUCTION using service account
//    index.js calls admin.initializeApp() at load time, which uses
//    GOOGLE_APPLICATION_CREDENTIALS for auto-discovery outside the emulator.
//    Also set CLOUD_RUNTIME_CONFIG so functions.config() works.
// ---------------------------------------------------------------------------
process.env.GOOGLE_APPLICATION_CREDENTIALS = SERVICE_ACCOUNT_PATH;

const RUNTIME_CONFIG_PATH = path.join(__dirname, '..', 'functions', '.runtimeconfig.json');
if (fs.existsSync(RUNTIME_CONFIG_PATH)) {
  process.env.CLOUD_RUNTIME_CONFIG = fs.readFileSync(RUNTIME_CONFIG_PATH, 'utf8');
}

// ---------------------------------------------------------------------------
// 5. Import syncAllBeatdowns from compiled functions
//    (this also triggers admin.initializeApp() inside index.js)
// ---------------------------------------------------------------------------
const { syncAllBeatdowns } = require(LIB_INDEX);

const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const db = admin.firestore();

// ---------------------------------------------------------------------------
// 6. Run it
// ---------------------------------------------------------------------------
async function confirm(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  console.log('');
  console.log('='.repeat(60));
  if (dryRun) {
    console.log('  🔍  DRY RUN — no changes will be written to Firestore');
  } else {
    console.log('  ⚠️   LIVE MODE — changes WILL be written to PRODUCTION Firestore');
  }
  console.log('  📦  Project: ' + (admin.app().options.projectId || 'unknown'));
  console.log('='.repeat(60));
  console.log('');

  // Safety confirmation for live writes
  if (!dryRun) {
    const answer = await confirm('Type "yes" to proceed with LIVE writes to production: ');
    if (answer !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
    console.log('');
  }

  try {
    const result = await syncAllBeatdowns(db, { dryRun });

    console.log('');
    console.log('='.repeat(60));
    console.log('  ✅  Sync complete');
    console.log('='.repeat(60));
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    if (dryRun) {
      console.log('This was a dry run. To apply changes, run:');
      console.log('  npm run sync:live');
    }
  } catch (err) {
    console.error('\n❌  Sync failed:', err.message || err);
    process.exit(1);
  }

  process.exit(0);
}

main();
