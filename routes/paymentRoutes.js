const express = require('express');
const config = require('../config');
const { optionalAuth, protect } = require('../middleware/auth');
const { createOrderLimiter } = require('../middleware/rateLimit');
const { idempotency } = require('../middleware/idempotency');
const { validateBody } = require('../middleware/validate');
const { actorFromReq } = require('../services/audit');
const payments = require('../services/payments');
const installments = require('../services/installments');
const { requireDb } = require('../db');
const { publicChannelFlags } = require('../services/notify/prefs');
const { asyncHandler } = require('../utils/asyncHandler');
const { normalizeEmail, utcnow } = require('../services/helpers');
const { writeAudit } = require('../services/audit');
const {
  createOrderSchema,
  verifyPaymentSchema,
  bookingSchema,
  workshopRegisterSchema,
} = require('../schemas');

const router = express.Router();

function orderResponse(result) {
  return {
    success: true,
    order: result.order,
    id: result.id,
    amount: result.amount,
    currency: result.currency || 'INR',
    paymentId: result.payment?.id,
    amounts: result.payment?.amounts,
    installment: result.installment || null,
  };
}

async function createOrderHandler(req, res) {
  try {
    const result = await payments.createOrder(req.body || {}, req.user, {
      actor: actorFromReq(req),
    });
    if (result.free) {
      return res.json({
        success: true,
        free: true,
        message: 'Event is free — register without payment',
        pricing: result.pricing,
      });
    }
    return res.json(orderResponse(result));
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({
      success: false,
      message: e.message || 'Failed to create order',
    });
  }
}

async function verifyHandler(req, res) {
  const orderId = req.body.razorpay_order_id;
  const paymentId = req.body.razorpay_payment_id;
  const signature = req.body.razorpay_signature;
  if (!payments.verifyPaymentSignature(orderId, paymentId, signature)) {
    return res.status(400).json({ success: false, message: 'Invalid signature' });
  }
  try {
    const { payment, invoice } = await payments.capturePayment({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      source: 'verify',
      actor: actorFromReq(req),
    });
    return res.json({
      success: true,
      message: 'Payment verified',
      data: {
        paymentId: payment.id,
        razorpay_payment_id: paymentId,
        status: 'paid',
        amounts: payment.amounts,
        invoice: invoice
          ? {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              pdfUrl: `/api/invoices/${invoice.id}/pdf`,
              emailStatus: invoice.email?.status || 'queued',
            }
          : null,
      },
      // FE-friendly top-level
      paymentId: payment.id,
      amounts: payment.amounts,
      invoice: invoice
        ? {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            pdfUrl: `/api/invoices/${invoice.id}/pdf`,
            emailStatus: invoice.email?.status || 'queued',
          }
        : null,
    });
  } catch (e) {
    console.error('verify-payment error:', e);
    return res.status(e.status || 500).json({
      success: false,
      message: e.message || 'Payment verification failed',
    });
  }
}

router.post(
  '/create-order',
  optionalAuth,
  createOrderLimiter,
  idempotency({ required: false }),
  validateBody(createOrderSchema),
  asyncHandler(createOrderHandler)
);
router.post(
  '/payment/create-order',
  optionalAuth,
  createOrderLimiter,
  idempotency({ required: false }),
  validateBody(createOrderSchema),
  asyncHandler(createOrderHandler)
);
router.post(
  '/verify-payment',
  optionalAuth,
  idempotency({ required: false }),
  validateBody(verifyPaymentSchema),
  asyncHandler(verifyHandler)
);
router.post(
  '/payment/verify',
  optionalAuth,
  idempotency({ required: false }),
  validateBody(verifyPaymentSchema),
  asyncHandler(verifyHandler)
);

router.post(
  '/bookings',
  optionalAuth,
  idempotency({ required: false }),
  validateBody(bookingSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.body.email || req.user?.email || '');
    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Valid email required',
      });
    }
    const doc = {
      email,
      name: req.body.name || '',
      phone: req.body.phone || '',
      company: req.body.company || '',
      planId: req.body.planId || null,
      eventId: req.body.eventId || null,
      notes: req.body.notes || '',
      paymentId: req.body.paymentId || null,
      status: 'received',
      createdAt: utcnow(),
    };
    const result = await db.collection('bookings').insertOne(doc);
    await writeAudit(actorFromReq(req), 'booking.created', {
      meta: { id: String(result.insertedId) },
    });
    return res.json({ id: String(result.insertedId), status: 'received', success: true });
  })
);

router.post(
  '/workshops/virtual-shipment/register',
  optionalAuth,
  idempotency({ required: false }),
  validateBody(workshopRegisterSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.body.email || req.user?.email || '');
    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Valid email required',
      });
    }
    const doc = {
      email,
      name: req.body.name || '',
      company: req.body.company || '',
      phone: req.body.phone || '',
      razorpayPaymentId: req.body.razorpay_payment_id || req.body.paymentId || null,
      createdAt: utcnow(),
    };
    await db.collection('workshop_registrations').insertOne(doc);
    return res.json({ success: true, ok: true, email });
  })
);

router.get(
  '/payments/:paymentId',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc =
      (await db.collection('payments').findOne({ id: req.params.paymentId })) ||
      (await db.collection('payments').findOne({ razorpayPaymentId: req.params.paymentId }));
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const email = normalizeEmail(req.user.email);
    if (
      req.user.role === 'customer' &&
      normalizeEmail(doc.customerEmail) !== email
    ) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return res.json({
      success: true,
      data: {
        id: doc.id,
        razorpayPaymentId: doc.razorpayPaymentId,
        razorpayOrderId: doc.razorpayOrderId,
        status: doc.status,
        amounts: doc.amounts,
        invoiceId: doc.invoiceId,
        purpose: doc.purpose,
        description: doc.description,
        paidAt: doc.paidAt,
      },
    });
  })
);

router.get(
  '/me/installment-plans',
  protect,
  asyncHandler(async (req, res) => {
    const items = await installments.listPlansForEmail(req.user.email);
    return res.json({ success: true, data: items, items });
  })
);

router.get('/config/public', (req, res) => {
  res.json({
    success: true,
    data: {
      razorpayKeyId: config.razorpayKeyId || '',
      appName: config.appName,
      supportEmail: config.supportEmail,
      gstRate: config.gstRate,
      installmentThresholdInr: config.installmentThresholdInr,
      installmentCount: config.installmentCount,
      installmentGapDays: config.installmentGapDays,
      installmentWindowDays: config.installmentWindowDays,
      seller: {
        legalName: config.seller.legalName,
        gstin: config.seller.gstin,
        address: (config.seller.addressLines || []).join(', '),
      },
      channels: publicChannelFlags(),
    },
    // FE also reads top-level
    razorpayKeyId: config.razorpayKeyId || '',
    appName: config.appName,
    supportEmail: config.supportEmail,
    gstRate: config.gstRate,
    installmentThresholdInr: config.installmentThresholdInr,
    installmentCount: config.installmentCount,
    installmentGapDays: config.installmentGapDays,
    installmentWindowDays: config.installmentWindowDays,
    seller: {
      legalName: config.seller.legalName,
      gstin: config.seller.gstin,
      address: (config.seller.addressLines || []).join(', '),
    },
    channels: publicChannelFlags(),
  });
});

module.exports = router;
