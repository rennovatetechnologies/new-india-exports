const express = require('express');
const { requireDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { utcnow, cleanDoc } = require('../services/helpers');
const { asyncHandler } = require('../utils/asyncHandler');
const { retryFailed } = require('../services/mail');
const {
  emailOutboxRetrySchema,
  auditQuerySchema,
  emailOutboxQuerySchema,
} = require('../schemas');

const router = express.Router();

router.get(
  '/analytics/overview',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const customers = await db.collection('users').countDocuments({ role: 'customer' });
    const activeCases = await db.collection('customer_cases').countDocuments({
      status: { $in: ['active', 'kyc_pending', 'kyc_incomplete', 'unpaid'] },
    });
    const paid = await db.collection('payments').countDocuments({ status: 'paid' });
    const pendingStaff = await db
      .collection('staff_requests')
      .countDocuments({ status: 'Pending Approval' });
    const revenue = await db
      .collection('payments')
      .aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amounts.total' } } },
      ])
      .toArray();
    return res.json({
      success: true,
      data: {
        mrr: revenue[0]?.total || 0,
        activeCustomers: customers,
        workflowsLive: activeCases,
        paidOrders: paid,
        riskEvents: pendingStaff,
      },
      mrr: revenue[0]?.total || 0,
      activeCustomers: customers,
      workflowsLive: activeCases,
      riskEvents: pendingStaff,
      deltas: { mrr: 0, activeCustomers: 0, workflowsLive: 0, riskEvents: 0 },
    });
  })
);

router.get(
  '/analytics/summary',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const customers = await db.collection('users').countDocuments({ role: 'customer' });
    const cases = await db.collection('customer_cases').countDocuments({});
    const pendingStaff = await db
      .collection('staff_requests')
      .countDocuments({ status: 'Pending Approval' });
    return res.json({
      mrr: 0,
      activeCustomers: customers,
      workflowsLive: cases,
      riskEvents: pendingStaff,
      deltas: { mrr: 0, activeCustomers: 0, workflowsLive: 0, riskEvents: 0 },
    });
  })
);

router.get('/analytics/detail', requireAdmin, (req, res) => {
  res.json({ series: [], generatedAt: utcnow().toISOString() });
});

router.get(
  '/audit',
  requireAdmin,
  validateQuery(auditQuerySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const limit = req.query.limit;
    const query = {};
    if (req.query.action) query.action = String(req.query.action);
    if (req.query.actor) query['actor.email'] = String(req.query.actor).toLowerCase();
    if (req.query.resourceId) query['resource.id'] = String(req.query.resourceId);
    const rows = await db
      .collection('audit_logs')
      .find(query)
      .sort({ at: -1, createdAt: -1 })
      .limit(limit)
      .toArray();
    return res.json({
      success: true,
      data: rows.map((r) => ({
        who: r.who || r.actor?.email,
        what: r.what || r.action,
        when: r.at || r.createdAt,
        tone: r.tone,
        meta: r.meta,
        actor: r.actor,
        action: r.action,
        resource: r.resource,
      })),
      items: rows.map(cleanDoc),
    });
  })
);

router.get(
  '/email-outbox',
  requireAdmin,
  validateQuery(emailOutboxQuerySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const status = req.query.status;
    const query = status ? { status } : {};
    const rows = await db
      .collection('email_outbox')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: String(r._id),
        status: r.status,
        template: r.template,
        to: r.to,
        subject: r.subject,
        attempts: r.attempts,
        lastError: r.lastError,
        createdAt: r.createdAt,
        sentAt: r.sentAt,
      })),
    });
  })
);

router.post(
  '/email-outbox/retry',
  requireAdmin,
  validateBody(emailOutboxRetrySchema),
  asyncHandler(async (req, res) => {
    const n = await retryFailed(Number(req.body.limit || 20));
    return res.json({ success: true, retried: n });
  })
);

router.get(
  '/pending-counts',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const kyc = await db.collection('customer_cases').countDocuments({ kycStatus: 'submitted' });
    const staff = await db
      .collection('staff_requests')
      .countDocuments({ status: 'Pending Approval' });
    return res.json({ kyc, staff, total: kyc + staff });
  })
);

module.exports = router;
