const { getCatalogDbs, requireDb } = require('../db');

/** Marketing catalog — identical in virastra_nonprod and virastra_prod. Events stay per-database. */
const SHARED_COLLECTIONS = new Set(['plans', 'brochures']);

function catalogDbs() {
  const dbs = getCatalogDbs();
  return dbs.length ? dbs : [requireDb()];
}

async function catalogUpdateOne(collection, filter, update, options = {}) {
  const dbs = SHARED_COLLECTIONS.has(collection) ? catalogDbs() : [requireDb()];
  let last = null;
  for (const db of dbs) {
    last = await db.collection(collection).updateOne(filter, update, options);
  }
  return last;
}

/** Brochure file rows only — KYC/case files must stay on the current env DB. */
async function catalogUpsertFile(doc) {
  const now = doc.createdAt || new Date();
  const { _id, createdAt, ...rest } = doc;
  let last = null;
  for (const db of catalogDbs()) {
    last = await db.collection('files').updateOne(
      { id: rest.id },
      { $set: { ...rest, deletedAt: rest.deletedAt ?? null }, $setOnInsert: { createdAt: createdAt || now } },
      { upsert: true }
    );
  }
  return last;
}

module.exports = { catalogDbs, catalogUpdateOne, catalogUpsertFile, SHARED_COLLECTIONS };
