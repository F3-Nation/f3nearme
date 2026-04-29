/**
 * Seed the running Firestore emulator with exported production data.
 * 
 * Usage:
 *   node scripts/seed-emulator.js
 * 
 * Requires:
 *   - Firestore emulator running on localhost:8080
 *   - emulator-data/seed.json (created by export-prod-data.js)
 */

const fs = require('fs');
const path = require('path');

// firebase-admin is installed in functions/, not the root
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const SEED_FILE = path.join(__dirname, '..', 'emulator-data', 'seed.json');

if (!fs.existsSync(SEED_FILE)) {
  console.error(`Seed file not found at: ${SEED_FILE}`);
  console.error('Run "node scripts/export-prod-data.js" first to export prod data.');
  process.exit(1);
}

// Connect to the Firestore emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

admin.initializeApp({ projectId: 'f3-workout' });
const db = admin.firestore();

async function seedEmulator() {
  console.log('[SEED] Loading seed data...');
  const raw = fs.readFileSync(SEED_FILE, 'utf-8');
  const seed = JSON.parse(raw);
  
  for (const [collectionName, documents] of Object.entries(seed)) {
    const docEntries = Object.entries(documents);
    console.log(`[SEED] Importing ${docEntries.length} documents into '${collectionName}'...`);
    
    const BATCH_SIZE = 500;
    for (let i = 0; i < docEntries.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchEntries = docEntries.slice(i, i + BATCH_SIZE);
      
      for (const [docId, docData] of batchEntries) {
        batch.set(db.collection(collectionName).doc(docId), docData);
      }
      
      await batch.commit();
      console.log(`[SEED]   Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchEntries.length} documents`);
    }
  }
  
  console.log('[SEED] Done! Emulator is seeded with production data.');
  process.exit(0);
}

seedEmulator().catch(err => {
  console.error('[SEED] Error:', err);
  process.exit(1);
});
