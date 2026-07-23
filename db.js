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
    } catch (_) {
      /* index may already exist */
    }
    await db.collection('staff_requests').createIndex({ id: 1 }, { unique: true });
    await db.collection('staff_requests').createIndex({ email: 1 });
    await db.collection('cases').createIndex({ id: 1 }, { unique: true });
    await db.collection('cases').createIndex({ accountEmail: 1 });
    await db.collection('case_activity').createIndex({ caseId: 1, when: -1 });
    await db.collection('case_documents').createIndex({ caseId: 1, docId: 1 }, { unique: true });
    await db.collection('plans').createIndex({ id: 1 }, { unique: true });
    await db.collection('events').createIndex({ id: 1 }, { unique: true });
    await db.collection('orders').createIndex({ razorpayOrderId: 1 }, { unique: true });
    await db.collection('payments').createIndex({ razorpayPaymentId: 1 });
    await db.collection('audit_logs').createIndex({ createdAt: -1 });
    await db.collection('kyc_profiles').createIndex({ email: 1 }, { unique: true });
    console.log('MongoDB indexes ensured');
  } catch (e) {
    console.warn('Index ensure warning:', e.message);
  }
}

module.exports = { connectDb, getDb, requireDb, getFs, ensureIndexes };
