const express = require('express');
const { requireDb } = require('../db');
const { requireAdmin, requireRoles } = require('../middleware/auth');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { razorpayCreateOrder } = require('../services/razorpay');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/plans',
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db.collection('plans').find({}).sort({ price: 1 }).toArray();
    return res.json(rows.map(cleanDoc));
  })
);

router.post(
  '/plans',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const planId = String(req.body?.id || String(req.body?.name || '').toLowerCase().replace(/\s+/g, '-')).trim();
    if (req.body?.featured) await db.collection('plans').updateMany({}, { $set: { featured: false } });
    const doc = {
      id: planId,
      name: req.body?.name,
      price: Number(req.body?.price),
      tagline: req.body?.tagline || '',
      featured: Boolean(req.body?.featured),
      features: Array.isArray(req.body?.features) ? req.body.features : [],
    };
    await db.collection('plans').updateOne({ id: planId }, { $set: doc }, { upsert: true });
    return res.json(doc);
  })
);

router.put(
  '/plans/:planId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const planId = req.params.planId;
    if (req.body?.featured) {
      await db.collection('plans').updateMany({ id: { $ne: planId } }, { $set: { featured: false } });
    }
    const doc = {
      id: planId,
      name: req.body?.name,
      price: Number(req.body?.price),
      tagline: req.body?.tagline || '',
      featured: Boolean(req.body?.featured),
      features: Array.isArray(req.body?.features) ? req.body.features : [],
    };
    await db.collection('plans').updateOne({ id: planId }, { $set: doc }, { upsert: true });
    return res.json(doc);
  })
);

router.delete(
  '/plans/:planId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    await db.collection('plans').deleteOne({ id: req.params.planId });
    return res.json({ ok: true });
  })
);

router.get(
  '/billing/subscription',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const sub = await db.collection('subscriptions').findOne({ email });
    if (!sub) {
      return res.json({
        planId: 'standard',
        planName: 'Standard',
        paidAt: null,
        usage: { categoriesUsed: 1, categoriesLimit: 5, activeShipments: 0 },
      });
    }
    return res.json(cleanDoc(sub));
  })
);

router.post(
  '/billing/checkout',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const plan = await db.collection('plans').findOne({ id: req.body?.planId });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    const amount = Number(plan.price) * 100;
    let order;
    try {
      order = await razorpayCreateOrder(amount, 'INR', `plan_${req.body.planId}_${Date.now()}`);
    } catch (e) {
      return res.status(500).json({ success: false, message: e.message });
    }
    await db.collection('orders').insertOne({
      razorpayOrderId: order.id,
      amount,
      currency: 'INR',
      status: 'created',
      planId: req.body.planId,
      email: normalizeEmail(req.user.email),
      paymentMethod: req.body?.paymentMethod || 'upi',
      createdAt: utcnow(),
    });
    return res.json({ success: true, order, id: order.id, amount, currency: 'INR' });
  })
);

router.get(
  '/billing/invoices',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    let rows = (await db.collection('invoices').find({ email }).sort({ date: -1 }).toArray()).map(cleanDoc);
    const q = String(req.query.q || '').toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) => (r.id || '').toLowerCase().includes(q) || (r.plan || '').toLowerCase().includes(q)
      );
    }
    return res.json(rows);
  })
);

router.get('/billing/invoices/export.csv', requireRoles('customer'), asyncHandler(async (req, res) => {
  const db = requireDb();
  const email = normalizeEmail(req.user.email);
  const rows = await db.collection('invoices').find({ email }).toArray();
  const lines = ['id,date,plan,amount,status'];
  for (const r of rows) lines.push(`${r.id},${r.date},${r.plan},${r.amount},${r.status}`);
  res.type('text/csv').send(lines.join('\n'));
}));

router.get('/billing/invoices/:invoiceId.pdf', requireRoles('customer'), (req, res) => {
  const content = `Invoice ${req.params.invoiceId}\nNew India Exports\n`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.invoiceId}.pdf"`);
  res.send(content);
});

router.get(
  '/billing/ledger',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db.collection('invoices').find({}).sort({ date: -1 }).limit(100).toArray();
    return res.json(rows.map(cleanDoc));
  })
);

router.get('/pricing/templates', requireAdmin, (req, res) => {
  res.json([
    { id: 'exporter-starter', name: 'Exporter starter', basePlan: 'basic' },
    { id: 'growth', name: 'Growth desk', basePlan: 'standard' },
    { id: 'enterprise', name: 'Enterprise white-glove', basePlan: 'premium' },
  ]);
});

module.exports = router;
