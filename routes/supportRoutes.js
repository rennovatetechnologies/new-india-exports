const express = require('express');
const { requireDb } = require('../db');
const { protect, requireRoles } = require('../middleware/auth');
const { leadLimiter } = require('../middleware/rateLimit');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

const DEFAULT_FAQS = [
  { id: '1', q: 'How long does IEC take?', a: 'Typically 3–7 business days after KYC.' },
  { id: '2', q: 'What documents are needed?', a: 'PAN, Aadhaar, bank statement, photo, electricity bill.' },
];

router.get(
  '/support/faqs',
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db.collection('support_faqs').find({}).toArray();
    if (!rows.length) return res.json(DEFAULT_FAQS);
    return res.json(rows.map(cleanDoc));
  })
);

router.get('/support/articles', (req, res) => {
  res.json([
    { id: 'a1', title: 'Getting started with export KYC', body: 'Complete the wizard and upload documents.' },
    { id: 'a2', title: 'Understanding workflow stages', body: 'Your ops desk advances stages as docs clear.' },
  ]);
});

router.post(
  '/support/concierge/book',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    await db.collection('concierge_bookings').insertOne({
      email: normalizeEmail(req.user.email),
      preferredSlot: req.body?.preferredSlot || '',
      note: req.body?.note || '',
      createdAt: utcnow(),
    });
    return res.json({ ok: true, message: 'Concierge request received' });
  })
);

router.post(
  '/support/tickets',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = {
      email: normalizeEmail(req.user.email),
      subject: req.body?.subject || '',
      body: req.body?.body || '',
      channel: req.body?.channel || 'app',
      status: 'open',
      createdAt: utcnow(),
    };
    const result = await db.collection('support_tickets').insertOne(doc);
    return res.json({ id: String(result.insertedId), status: 'open' });
  })
);

router.post(
  '/leads/contact',
  leadLimiter,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = {
      name: req.body?.name || '',
      email: normalizeEmail(req.body?.email),
      message: req.body?.message || '',
      plan: req.body?.plan || '',
      createdAt: utcnow(),
    };
    const result = await db.collection('leads').insertOne(doc);
    return res.json({ ok: true, id: String(result.insertedId) });
  })
);

module.exports = router;
