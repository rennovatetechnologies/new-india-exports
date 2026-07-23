const express = require('express');
const { getDb, requireDb } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');
const { normalizeEmail, utcnow } = require('../services/helpers');
const {
  razorpayCreateOrder,
  verifyPaymentSignature,
  resolveAmount,
} = require('../services/razorpay');
const config = require('../config');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

async function createOrderHandler(req, res) {
  let amount;
  try {
    amount = await resolveAmount({
      amount: req.body?.amount,
      sku: req.body?.sku,
      planId: req.body?.planId,
      eventId: req.body?.eventId,
      bookingDetails: req.body?.bookingDetails,
    });
  } catch (e) {
    return res.status(e.status || 400).json({ success: false, message: e.message });
  }

  const currency = req.body?.currency || 'INR';
  const receipt = req.body?.receipt || `receipt_${Date.now()}`;
  let razorpayOrder;
  try {
    razorpayOrder = await razorpayCreateOrder(amount, currency, receipt);
  } catch (e) {
    if (String(e.message || '').toLowerCase().includes('authentication')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Please check your Razorpay keys.',
      });
    }
    return res.status(500).json({ success: false, message: 'Failed to create order', error: e.message });
  }

  const db = getDb();
  let email = null;
  if (req.user) email = normalizeEmail(req.user.email);
  else if (req.body?.customerDetails?.email) {
    email = normalizeEmail(req.body.customerDetails.email);
  }

  if (db) {
    try {
      await db.collection('orders').insertOne({
        razorpayOrderId: razorpayOrder.id,
        amount,
        currency,
        status: 'created',
        customerDetails: req.body?.customerDetails || {},
        bookingDetails: req.body?.bookingDetails || {},
        planId: req.body?.planId,
        eventId: req.body?.eventId,
        sku: req.body?.sku,
        email,
        createdAt: utcnow(),
      });
    } catch (_) {
      /* non-blocking */
    }
  }

  return res.json({
    success: true,
    order: razorpayOrder,
    id: razorpayOrder.id,
    amount: razorpayOrder.amount || amount,
    currency: razorpayOrder.currency || currency,
  });
}

async function verifyHandler(req, res) {
  const orderId = req.body?.razorpay_order_id;
  const paymentId = req.body?.razorpay_payment_id;
  const signature = req.body?.razorpay_signature;
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ success: false, message: 'Missing required payment fields' });
  }
  if (!verifyPaymentSignature(orderId, paymentId, signature)) {
    return res.status(400).json({ success: false, message: 'Invalid signature' });
  }
  const db = getDb();
  if (db) {
    const existing = await db.collection('payments').findOne({ razorpayPaymentId: paymentId });
    if (!existing) {
      await db.collection('payments').insertOne({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        verified: true,
        createdAt: utcnow(),
      });
    }
    await db.collection('orders').updateOne({ razorpayOrderId: orderId }, { $set: { status: 'paid' } });
  }
  return res.json({ success: true, message: 'Payment verified successfully' });
}

router.post('/create-order', optionalAuth, asyncHandler(createOrderHandler));
router.post('/payment/create-order', optionalAuth, asyncHandler(createOrderHandler));
router.post('/verify-payment', asyncHandler(verifyHandler));
router.post('/payment/verify', asyncHandler(verifyHandler));

router.post(
  '/bookings',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.body?.email || (req.user && req.user.email) || '');
    const doc = {
      ...req.body,
      email,
      status: 'received',
      createdAt: utcnow(),
    };
    const result = await db.collection('bookings').insertOne(doc);
    await writeAudit(email || 'anon', 'booking_create', { meta: { id: String(result.insertedId) } });
    return res.json({ id: String(result.insertedId), status: 'received' });
  })
);

router.get(
  '/payments/:paymentId',
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = await db.collection('payments').findOne({ razorpayPaymentId: req.params.paymentId });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({
      razorpayPaymentId: doc.razorpayPaymentId,
      razorpayOrderId: doc.razorpayOrderId,
      verified: doc.verified,
      createdAt: doc.createdAt,
    });
  })
);

router.get('/config/public', (req, res) => {
  res.json({ razorpayKeyId: config.razorpayKeyId || '' });
});

module.exports = router;
