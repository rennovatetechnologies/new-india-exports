const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const config = require('./config');

let connected = false;

async function connectDb() {
  if (!config.mongodbUri) {
    console.warn('MONGODB_URI not set; DB features will fail until configured');
    return null;
  }
  if (connected) return mongoose.connection.db;
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongodbUri, {
    dbName: config.mongodbDbName,
  });
  connected = true;
  console.log('MongoDB Connected');
  return mongoose.connection.db;
}

function getDb() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  return mongoose.connection.db;
}

function requireDb() {
  const db = getDb();
  if (!db) {
    const err = new Error('Database unavailable. Set MONGODB_URI.');
    err.status = 503;
    err.body = { success: false, message: err.message };
    throw err;
  }
  return db;
}

function getFs(bucket = 'fs') {
  const db = requireDb();
  return new GridFSBucket(db, { bucketName: bucket });
}

async function ensureIndexes() {
  const db = getDb();
  if (!db) {
    console.warn('Skipping indexes; no database');
    return;
  }
  try {
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('otps').createIndex({ email: 1, purpose: 1 });
    try {
      await db.collection('otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    } catch (_) {}
    await db.collection('otp_verified').createIndex({ email: 1, purpose: 1 });
    await db.collection('signup_drafts').createIndex({ email: 1 }, { unique: true });
    try {
      await db.collection('signup_drafts').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    } catch (_) {}
    await db.collection('staff_requests').createIndex({ id: 1 }, { unique: true });
    await db.collection('staff_requests').createIndex({ email: 1 });
    await db.collection('customer_cases').createIndex({ id: 1 }, { unique: true });
    try {
      await db.collection('customer_cases').createIndex(
        { customerEmail: 1 },
        {
          unique: true,
          partialFilterExpression: { status: { $ne: 'closed' } },
        }
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
    await db.collection('audit_logs').createIndex({ at: -1 });
    await db.collection('audit_logs').createIndex({ createdAt: -1 });
    await db.collection('email_outbox').createIndex({ status: 1, updatedAt: 1 });
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
    // legacy shipment cases — keep indexes if collection exists
    await db.collection('cases').createIndex({ id: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (e) {
    console.warn('Index ensure warning:', e.message);
  }
}

module.exports = { connectDb, getDb, requireDb, getFs, ensureIndexes };
