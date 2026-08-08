const express = require('express');
const { requireDb } = require('../db');
const { optionalAuth, requireRoles } = require('../middleware/auth');
const { leadLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { newTicketId } = require('../services/ids');
const { enqueueEmail } = require('../services/mail');
const { actorFromReq, writeAudit } = require('../services/audit');
const config = require('../config');
const {
  supportTicketSchema,
  leadContactSchema,
  conciergeBookSchema,
} = require('../schemas');

const router = express.Router();

router.get('/support/faqs', (req, res) => {
  res.json([
    { q: 'How do I start?', a: 'Sign up, choose a plan, pay, then complete KYC.' },
    { q: 'How are invoices sent?', a: 'A GST tax invoice PDF is emailed after every successful payment.' },
  ]);
});

router.get('/support/articles', (req, res) => {
  res.json([
    { id: 'a1', title: 'Getting started with export KYC', body: 'Complete the wizard and upload documents.' },
  ]);
});

router.post(
  '/support/tickets',
  optionalAuth,
  leadLimiter,
  validateBody(supportTicketSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const id = await newTicketId();
    const email = normalizeEmail(req.body.email || req.user?.email || '');
    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Valid email required',
      });
    }
    const doc = {
      id,
      email,
      name: req.body.name || req.user?.name || '',
      subject: req.body.subject || 'Support request',
      body: req.body.body || '',
      status: 'open',
      createdAt: utcnow(),
    };
    await db.collection('support_tickets').insertOne(doc);
    try {
      if (email) {
        await enqueueEmail({
          to: email,
          template: 'support.ticket_created',
          vars: { id },
          actor: actorFromReq(req),
        });
      }
      await enqueueEmail({
        to: config.supportEmail,
        template: 'support.ticket_created',
        vars: { id, message: doc.body },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    await writeAudit(actorFromReq(req), 'support.ticket_created', {
      resource: { type: 'support_ticket', id },
    });
    return res.json({ success: true, data: cleanDoc(doc), id });
  })
);

router.get(
  '/support/tickets',
  requireRoles('admin', 'operations'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db.collection('support_tickets').find({}).sort({ createdAt: -1 }).limit(100).toArray();
    return res.json({ success: true, data: rows.map(cleanDoc), items: rows.map(cleanDoc) });
  })
);

router.post(
  '/leads/contact',
  leadLimiter,
  validateBody(leadContactSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = {
      email: req.body.email,
      name: req.body.name,
      phone: req.body.phone || '',
      company: req.body.company || '',
      message: req.body.message,
      source: req.body.source || 'contact',
      createdAt: utcnow(),
    };
    await db.collection('leads').insertOne(doc);
    return res.json({ success: true, ok: true });
  })
);

router.post(
  '/support/concierge/book',
  leadLimiter,
  validateBody(conciergeBookSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    await db.collection('concierge_bookings').insertOne({
      email: req.body.email,
      name: req.body.name,
      phone: req.body.phone || '',
      company: req.body.company || '',
      preferredSlot: req.body.preferredSlot || '',
      message: req.body.message || '',
      createdAt: utcnow(),
    });
    return res.json({ success: true, ok: true });
  })
);

module.exports = router;
