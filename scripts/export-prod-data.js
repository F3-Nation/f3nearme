/**
 * Export prod Firestore data for local emulator use.
 * 
 * Usage:
 *   node scripts/export-prod-data.js
 * 
 * Requires:
 *   - functions/service-account.json (Firebase Admin credentials)
 *   - Node 20+
 * 
 * This exports the 'beatdowns' collection from production Firestore
 * into the emulator-data/ directory format that Firebase emulators can import.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'functions', 'service-account.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`Service account not found at: ${SERVICE_ACCOUNT_PATH}`);
  console.error('Place your service-account.json in functions/');
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function exportData() {
  const outputDir = path.join(__dirname, '..', 'emulator-data', 'firestore_export');
  
  console.log('[EXPORT] Fetching beatdowns from production Firestore...');
  const snapshot = await db.collection('beatdowns').get();
  console.log(`[EXPORT] Found ${snapshot.size} beatdowns`);

  // Build the export in the format the emulator expects
  // The emulator import uses a simple JSON format when using --import
  const exportData = {};
  snapshot.forEach(doc => {
    exportData[doc.id] = doc.data();
  });

  // Also export webhookLogs (smaller collection, useful for testing)
  console.log('[EXPORT] Fetching webhookLogs from production Firestore...');
  const webhookSnapshot = await db.collection('webhookLogs').limit(100).get();
  console.log(`[EXPORT] Found ${webhookSnapshot.size} webhook logs (limited to 100)`);
  
  const webhookData = {};
  webhookSnapshot.forEach(doc => {
    webhookData[doc.id] = doc.data();
  });

  // Write as a simple JSON seed file (we'll use a different import approach)
  const seedDir = path.join(__dirname, '..', 'emulator-data');
  fs.mkdirSync(seedDir, { recursive: true });

  const seedFile = path.join(seedDir, 'seed.json');
  const seed = {
    beatdowns: exportData,
    webhookLogs: webhookData
  };
  
  fs.writeFileSync(seedFile, JSON.stringify(seed));
  console.log(`[EXPORT] Wrote seed data to ${seedFile}`);
  
  const beatdownCount = Object.keys(exportData).length;
  const webhookCount = Object.keys(webhookData).length;
  console.log(`[EXPORT] Summary: ${beatdownCount} beatdowns, ${webhookCount} webhook logs`);
  console.log(`[EXPORT] File size: ${(fs.statSync(seedFile).size / 1024 / 1024).toFixed(1)} MB`);
  console.log('');
  console.log('[EXPORT] To use with emulator, run the seed-emulator script after starting emulators:');
  console.log('  npm run emulator:fresh   # start emulators without existing data');
  console.log('  node scripts/seed-emulator.js  # import seed data into running emulator');
  
  process.exit(0);
}

exportData().catch(err => {
  console.error('[EXPORT] Error:', err);
  process.exit(1);
});
