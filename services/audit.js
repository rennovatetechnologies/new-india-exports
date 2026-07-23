const { getDb } = require('../db');
const { utcnow } = require('./helpers');

async function writeAudit(who, what, { meta = {}, tone = 'info' } = {}) {
  const db = getDb();
  if (!db) return;
  await db.collection('audit_logs').insertOne({
    who,
    what,
    tone,
    meta,
    createdAt: utcnow(),
  });
}

module.exports = { writeAudit };
