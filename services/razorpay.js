const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../config');
const { getDb } = require('../db');

function getRazorpayClient() {
  if (!config.razorpayKeyId || !config.razorpayKeySecret || config.razorpayKeyId === 'YOUR_KEY_ID') {
    throw new Error('Razorpay Key ID or Secret is missing in .env');
  }
  return new Razorpay({
    key_id: config.razorpayKeyId,
    key_secret: config.razorpayKeySecret,
  });
}

async function razorpayCreateOrder(amount, currency, receipt) {
  const client = getRazorpayClient();
  return client.orders.create({
    amount: Number(amount),
    currency,
    receipt,
  });
}

function verifyPaymentSignature(orderId, paymentId, signature) {
  const keySecret = config.razorpayKeySecret || 'YOUR_KEY_SECRET';
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature || ''));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = config.razorpayWebhookSecret;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch (_) {
    return false;
  }
}

async function resolveAmount({ amount, sku, planId, eventId, bookingDetails }) {
  const db = getDb();
  if (planId && db) {
    const plan = await db.collection('plans').findOne({ id: planId });
    if (plan && typeof plan.price === 'number') return Math.floor(plan.price) * 100;
  }
  if (sku === 'workshop' || (bookingDetails && bookingDetails.category === 'Workshop')) {
    return config.workshopAmountPaise;
  }
  if (sku === 'booking' || (bookingDetails && bookingDetails.shipment)) {
    return config.bookingAmountPaise;
  }
  if (eventId) return config.workshopAmountPaise;
  if (amount == null || amount < 100) {
    const err = new Error('Minimum amount must be 100 paise');
    err.status = 400;
    throw err;
  }
  return Number(amount);
}

module.exports = {
  razorpayCreateOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  resolveAmount,
};
