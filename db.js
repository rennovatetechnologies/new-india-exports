const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const config = require('./config');

let connecting = null;

async function connectDb() {
  if (!config.mongodbUri) {
    console.warn('MONGODB_URI not set; DB features will fail until configured');
    return null;
  }
  if (mongoose.connection.readyState === 1) return mongoose.connection.db;
  if (connecting) return connecting;

  mongoose.set('strictQuery', true);
  connecting = mongoose
    .connect(config.mongodbUri, {
      dbName: config.mongodbDbName,
      family: 4,
      serverSelectionTimeoutMS: 15000,
    })
    .then(() => {
      console.log('MongoDB Connected');
      return mongoose.connection.db;
    })
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

function getDb() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  return mongoose.connection.db;
}

function requireDb() {
  const db = getDb();
  if (!db) {
    const message = config.mongodbUri
      ? 'Database unavailable. MongoDB is not connected — check Atlas Network Access (IP whitelist).'
      : 'Database unavailable. Set MONGODB_URI.';
    const err = new Error(message);
    err.status = 503;
    err.body = { success: false, message };
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
