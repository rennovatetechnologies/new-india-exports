/**
 * Create prod + nonprod databases, ensure all collections/indexes,
 * and seed nonprod for frontend integration.
 *
 * Usage: node scripts/setupDatabases.js
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { ensureAuditLogTtl } = require('../db');

const NONPROD_DB = process.env.MONGODB_DB_NAME_NONPROD || 'virastra_nonprod';
const PROD_DB = process.env.MONGODB_DB_NAME_PROD || 'virastra_prod';

/** All product collections (contract + runtime). */
const COLLECTIONS = [
  'users',
  'staff_requests',
  'otps',
  'otp_verified',
  'plans',
  'events',
  'event_registrations',
  'event_communications',
  'installment_plans',
  'notifications',
  'brochures',
  'customer_cases',
  'case_messages',
  'case_documents',
  'doc_requests',
  'payments',
  'orders',
  'invoices',
  'bookings',
  'workshop_registrations',
  'support_tickets',
  'leads',
  'concierge_bookings',
  'email_outbox',
  'whatsapp_outbox',
  'audit_logs',
  'drive_folders',
  'files',
  'idempotency_keys',
  'config',
  'counters',
  'cases', // legacy optional
];

async function ensureCollections(db) {
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      console.log(`  + created collection ${db.databaseName}.${name}`);
    }
  }
}

async function ensureIndexes(db) {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('otps').createIndex({ email: 1, purpose: 1 });
  try {
    await db.collection('otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch (_) {}
  await db.collection('otp_verified').createIndex({ email: 1, purpose: 1 });
  await db.collection('staff_requests').createIndex({ id: 1 }, { unique: true });
  await db.collection('staff_requests').createIndex({ email: 1 });
  await db.collection('customer_cases').createIndex({ id: 1 }, { unique: true });
  try {
    await db.collection('customer_cases').createIndex(
      { customerEmail: 1 },
      { unique: true, partialFilterExpression: { status: { $ne: 'closed' } } }
    );
  } catch (_) {
    await db.collection('customer_cases').createIndex({ customerEmail: 1 });
  }
  await db.collection('case_messages').createIndex({ caseId: 1, createdAt: 1 });
  await db.collection('case_documents').createIndex({ caseId: 1, id: 1 }, { unique: true });
  await db.collection('doc_requests').createIndex({ caseId: 1, id: 1 });
  await db.collection('plans').createIndex({ id: 1 }, { unique: true });
  await db.collection('events').createIndex({ id: 1 }, { unique: true });
  await db.collection('event_registrations').createIndex({ eventId: 1, email: 1 }, { unique: true });
  await db.collection('event_communications').createIndex({ eventId: 1, createdAt: -1 });
  await db.collection('installment_plans').createIndex({ id: 1 }, { unique: true });
  await db.collection('installment_plans').createIndex({ customerEmail: 1, eventId: 1, status: 1 });
  await db.collection('installment_plans').createIndex({ status: 1, 'installments.dueAt': 1 });
  await db.collection('notifications').createIndex({ email: 1, createdAt: -1 });
  await db.collection('brochures').createIndex({ id: 1 }, { unique: true });
  await db.collection('payments').createIndex({ id: 1 }, { unique: true });
  await db.collection('payments').createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true });
  // Sparse unique still indexes null; only enforce uniqueness when a real Razorpay payment id exists.
  try {
    await db.collection('payments').dropIndex('razorpayPaymentId_1');
  } catch (_) {}
  await db.collection('payments').createIndex(
    { razorpayPaymentId: 1 },
    {
      unique: true,
      name: 'razorpayPaymentId_1',
      partialFilterExpression: { razorpayPaymentId: { $type: 'string' } },
    }
  );
  await db.collection('invoices').createIndex({ id: 1 }, { unique: true });
  await db.collection('invoices').createIndex({ paymentId: 1 }, { unique: true });
  await db.collection('invoices').createIndex({ invoiceNumber: 1 }, { unique: true });
  await db.collection('orders').createIndex({ razorpayOrderId: 1 }, { unique: true });
  await ensureAuditLogTtl(db);
  await db.collection('email_outbox').createIndex({ status: 1, updatedAt: 1 });
  await db.collection('whatsapp_outbox').createIndex({ status: 1, updatedAt: 1 });
  await db.collection('whatsapp_outbox').createIndex({ toEmail: 1, createdAt: -1 });
  await db.collection('idempotency_keys').createIndex({ keyHash: 1 }, { unique: true });
  try {
    await db.collection('idempotency_keys').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch (_) {}
  await db.collection('drive_folders').createIndex({ key: 1 }, { unique: true });
  await db.collection('files').createIndex({ id: 1 }, { unique: true });
  await db.collection('files').createIndex({ driveFileId: 1 });
  await db.collection('config').createIndex({ key: 1 }, { unique: true });
  await db.collection('bookings').createIndex({ email: 1, createdAt: -1 });
  await db.collection('support_tickets').createIndex({ id: 1 }, { unique: true });
  await db.collection('workshop_registrations').createIndex({ email: 1, createdAt: -1 });
  await db.collection('leads').createIndex({ createdAt: -1 });
  await db.collection('cases').createIndex({ id: 1 }, { unique: true });
  console.log(`  ✓ indexes on ${db.databaseName}`);
}

function baseUri(uri) {
  // Strip path db name so we can select db explicitly
  return String(uri || '').replace(
    /mongodb(\+srv)?:\/\/([^/]+)\/[^?]*/,
    'mongodb$1://$2/'
  );
}

async function main() {
  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) {
    console.error('MONGODB_URI missing in .env');
    process.exit(1);
  }
  const uri = baseUri(rawUri);
  const client = new MongoClient(uri);
  await client.connect();
  console.log('Connected to Atlas');

  // --- NONPROD ---
  console.log(`\n[nonprod] ${NONPROD_DB}`);
  const nonprod = client.db(NONPROD_DB);
  await ensureCollections(nonprod);
  await ensureIndexes(nonprod);

  // Seed via app seed against this db name
  process.env.MONGODB_DB_NAME = NONPROD_DB;
  // Reset mongoose if previously connected — use native seed here instead
  const { seedIfEmpty } = require('./seed');
  // seed uses getDb from mongoose — connect mongoose for seed
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  await mongoose.connect(uri, { dbName: NONPROD_DB });
  const { ensureIndexes: appEnsure } = require('../db');
  // monkey: getDb reads mongoose connection
  await seedIfEmpty();
  console.log(`  ✓ seeded ${NONPROD_DB}`);

  // Marker doc so empty-looking DBs show in Atlas UI reliably
  await nonprod.collection('config').updateOne(
    { key: 'env' },
    {
      $set: {
        key: 'env',
        value: { name: 'nonprod', db: NONPROD_DB, updatedAt: new Date() },
      },
    },
    { upsert: true }
  );

  // --- PROD (users/events stay empty; plans + brochures are shared via seed) ---
  console.log(`\n[prod] ${PROD_DB}`);
  const prod = client.db(PROD_DB);
  await ensureCollections(prod);
  await ensureIndexes(prod);
  await prod.collection('config').updateOne(
    { key: 'env' },
    {
      $set: {
        key: 'env',
        value: { name: 'prod', db: PROD_DB, updatedAt: new Date() },
      },
    },
    { upsert: true }
  );
  console.log(`  ✓ structure ready (events not seeded; plans/brochures shared with nonprod)`);

  const listNonprod = (await nonprod.listCollections().toArray()).map((c) => c.name).sort();
  const listProd = (await prod.listCollections().toArray()).map((c) => c.name).sort();
  console.log(`\nnonprod collections (${listNonprod.length}):`, listNonprod.join(', '));
  console.log(`prod collections (${listProd.length}):`, listProd.join(', '));

  const plans = await nonprod.collection('plans').countDocuments();
  const events = await nonprod.collection('events').countDocuments();
  const users = await nonprod.collection('users').countDocuments();
  const prodPlans = await prod.collection('plans').countDocuments();
  const prodBrochures = await prod.collection('brochures').countDocuments({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  });
  const prodEvents = await prod.collection('events').countDocuments();
  console.log(`\nnonprod seed counts → plans=${plans} events=${events} users=${users}`);
  console.log(`prod catalog counts → plans=${prodPlans} brochures=${prodBrochures} events=${prodEvents} (events stay separate)`);

  await mongoose.disconnect();
  await client.close();
  console.log('\nDone. Point APP_ENV=development / MONGODB_DB_NAME to nonprod for FE integration.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
