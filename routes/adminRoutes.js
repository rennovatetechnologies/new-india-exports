const express = require('express');
const { requireDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { utcnow, cleanDoc } = require('../services/helpers');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/analytics/summary',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const customers = await db.collection('users').countDocuments({ role: 'customer' });
    const cases = await db.collection('cases').countDocuments({});
    const pendingStaff = await db.collection('staff_requests').countDocuments({ status: 'Pending Approval' });
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
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const rows = await db.collection('audit_logs').find({}).sort({ createdAt: -1 }).limit(limit).toArray();
    return res.json(
      rows.map((r) => ({
        who: r.who,
        what: r.what,
        when: r.createdAt,
        tone: r.tone,
        meta: r.meta,
      }))
    );
  })
);

router.get(
  '/workflow-templates',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db.collection('workflow_templates').find({}).toArray();
    if (!rows.length) {
      return res.json([
        { id: 'dgft', name: 'DGFT / IEC', stages: 8 },
        { id: 'icegate', name: 'ICEGATE filing', stages: 8 },
        { id: 'adcode', name: 'AD code mapping', stages: 8 },
      ]);
    }
    return res.json(rows.map(cleanDoc));
  })
);

router.put(
  '/workflow-templates/:templateId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = { id: req.params.templateId, ...req.body };
    await db.collection('workflow_templates').updateOne({ id: req.params.templateId }, { $set: doc }, { upsert: true });
    return res.json(doc);
  })
);

router.get(
  '/pending-counts',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    return res.json({
      adminRequests: await db.collection('staff_requests').countDocuments({ status: 'Pending Approval' }),
      kycEscalations: await db.collection('kyc_profiles').countDocuments({ status: 'pending' }),
    });
  })
);

module.exports = router;
