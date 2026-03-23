#!/usr/bin/env node
/**
 * Start the Firebase emulator fresh (no imported data), wait for it to
 * become ready, seed it with production data, then keep running.
 *
 * Usage:
 *   node scripts/start-and-seed.js
 *   (or via: npm run emulator:seed)
 *
 * Requires:
 *   - emulator-data/seed.json  (created by: node scripts/export-prod-data.js)
 *   - functions built           (handled automatically by the emulator npm script)
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const SEED_FILE = path.join(__dirname, '..', 'emulator-data', 'seed.json');
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const POLL_INTERVAL_MS = 1000;
const MAX_WAIT_MS = 120000;

if (!fs.existsSync(SEED_FILE)) {
  console.error(`\nSeed file not found: ${SEED_FILE}`);
  console.error('Run this first:  node scripts/export-prod-data.js\n');
  process.exit(1);
}

// --- 1. Start the emulator (fresh — no import, but export on exit) ---------
console.log('[seed] Starting emulators (fresh)...');
const emulator = spawn('npm', ['run', 'build', '&&',
  'firebase', 'emulators:start', '--export-on-exit=../emulator-data'], {
  cwd: path.join(__dirname, '..', 'functions'),
  stdio: 'inherit',
  shell: true,
});

emulator.on('error', (err) => {
  console.error('[seed] Failed to start emulator:', err);
  process.exit(1);
});

emulator.on('exit', (code) => {
  process.exit(code ?? 0);
});

// Forward signals so Ctrl-C shuts down the emulator cleanly
['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => emulator.kill(sig));
});

// --- 2. Wait for Firestore emulator to be ready ---------------------------
function firestoreReady() {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${FIRESTORE_HOST}:${FIRESTORE_PORT}/`,
      (res) => {
        res.resume();
        resolve(res.statusCode === 200 || res.statusCode === 404);
      },
    );
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

async function waitForFirestore() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    if (await firestoreReady()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

// --- 3. Seed it ------------------------------------------------------------
async function seed() {
  const ready = await waitForFirestore();
  if (!ready) {
    console.error('[seed] Timed out waiting for Firestore emulator.');
    return;
  }

  console.log('[seed] Firestore emulator is ready — seeding...');

  // Require firebase-admin from functions/node_modules
  const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  admin.initializeApp({ projectId: 'f3-workout' });
  const db = admin.firestore();

  const raw = fs.readFileSync(SEED_FILE, 'utf-8');
  const seedData = JSON.parse(raw);

  for (const [collectionName, documents] of Object.entries(seedData)) {
    const docEntries = Object.entries(documents);
    console.log(`[seed] Importing ${docEntries.length} documents into '${collectionName}'...`);

    const BATCH_SIZE = 500;
    for (let i = 0; i < docEntries.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const slice = docEntries.slice(i, i + BATCH_SIZE);
      for (const [docId, docData] of slice) {
        batch.set(db.collection(collectionName).doc(docId), docData);
      }
      await batch.commit();
      console.log(`[seed]   Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${slice.length} documents`);
    }
  }

  console.log('[seed] Done! Emulator is seeded and running. Press Ctrl-C to stop.\n');
}

seed().catch((err) => {
  console.error('[seed] Seeding failed:', err.message);
  // Don't exit — let the emulator keep running so the user can debug
});
