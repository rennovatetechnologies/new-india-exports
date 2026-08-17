/**
 * Mirror plans + brochures across virastra_nonprod and virastra_prod.
 * Events, users, payments, and cases are left untouched.
 *
 * Usage: npm run catalog:sync
 */
require('dotenv').config();
const { connectDb, getCatalogDbs, requireDb, ensureIndexes } = require('../db');
const { seedIfEmpty } = require('./seed');
const drive = require('../services/drive');

function liveFilter() {
  return { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };
}

async function summarize(db) {
  const plans = await db.collection('plans').find(liveFilter()).toArray();
  const brochures = await db.collection('brochures').find(liveFilter()).toArray();
  const events = await db.collection('events').find(liveFilter()).toArray();
  return {
    db: db.databaseName,
    plans: plans.map((p) => `${p.id} ₹${p.price} featured=${Boolean(p.featured)}`),
    brochures: brochures.map((b) => `${b.id} → ${b.driveFileId || '(no file)'}`),
    events: events.map((e) => `${e.id}: ${e.title}`),
  };
}

async function main() {
  await connectDb();
  await ensureIndexes();
  await seedIfEmpty();

  const dbs = getCatalogDbs();
  const targets = dbs.length ? dbs : [requireDb()];
  console.log('\n--- catalog after sync (events stay per-env) ---');
  for (const d of targets) {
    console.log(JSON.stringify(await summarize(d), null, 2));
  }
  const tree = await drive.ensureRootTree();
  console.log('Storage:', tree);
}

main()
  .then(() => {
    console.log('\nShared catalog sync complete');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
