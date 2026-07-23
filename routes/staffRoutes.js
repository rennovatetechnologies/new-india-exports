const express = require('express');
const { requireDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
const rbacRouter = express.Router();

router.get(
  '/access-requests',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const query = {};
    if (req.query.status) query.status = req.query.status;
    let rows = await db.collection('staff_requests').find(query).sort({ createdAt: -1 }).toArray();
    rows = rows.map(cleanDoc);
    const q = String(req.query.q || '').toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.email || '').toLowerCase().includes(q) ||
          (r.name || '').toLowerCase().includes(q) ||
          (r.id || '').toLowerCase().includes(q)
      );
    }
    return res.json(rows);
  })
);

router.get(
  '/access-requests/:reqId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = await db.collection('staff_requests').findOne({ id: req.params.reqId });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json(cleanDoc(doc));
  })
);

router.patch(
  '/access-requests/:reqId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = await db.collection('staff_requests').findOne({ id: req.params.reqId });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const status = req.body?.status;
    if (status === 'Approved' && doc.emailVerified === false) {
      return res.status(400).json({ success: false, message: 'Cannot approve unverified email' });
    }
    const allowed = new Set(['Approved', 'Rejected', 'Suspended', 'Active', 'Pending Approval']);
    if (!allowed.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const updates = { status };
    if (Array.isArray(req.body?.permissions)) updates.permissions = req.body.permissions;
    await db.collection('staff_requests').updateOne({ id: req.params.reqId }, { $set: updates });
    const email = normalizeEmail(doc.email);
    if (status === 'Approved' || status === 'Active') {
      const role = doc.role === 'operations' || doc.role === 'admin' ? doc.role : 'operations';
      const existing = await db.collection('users').findOne({ email });
      if (existing) {
        await db.collection('users').updateOne(
          { email },
          { $set: { role, status: 'Active', name: doc.name, phone: doc.phone } }
        );
      } else {
        await db.collection('users').insertOne({
          email,
          name: doc.name || email.split('@')[0],
          phone: doc.phone || '',
          role,
          status: 'Active',
          kycComplete: true,
          company: '',
          permissions: req.body?.permissions || [],
          createdAt: utcnow(),
        });
      }
    } else if (status === 'Suspended') {
      await db.collection('users').updateOne({ email }, { $set: { status: 'Suspended' } });
    }
    await writeAudit(req.user.email || '', `staff_request_${status}`, { meta: { id: req.params.reqId } });
    const updated = await db.collection('staff_requests').findOne({ id: req.params.reqId });
    return res.json(cleanDoc(updated));
  })
);

router.get(
  '/users',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db
      .collection('users')
      .find({ role: { $in: ['operations', 'admin'] } })
      .toArray();
    return res.json(
      rows.map((r) => ({
        email: r.email,
        name: r.name,
        phone: r.phone,
        role: r.role,
        status: r.status,
        permissions: r.permissions || [],
      }))
    );
  })
);

router.patch(
  '/users/:email/permissions',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.params.email);
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const result = await db.collection('users').updateOne({ email }, { $set: { permissions } });
    if (!result.matchedCount) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ email, permissions });
  })
);

rbacRouter.get('/matrix', requireAdmin, (req, res) => {
  res.json({
    roles: ['customer', 'operations', 'admin'],
    permissions: ['Cases · read/write', 'KYC · approve', 'Pricing · view', 'Audit log · read'],
    ssoEnabled: false,
  });
});

module.exports = { staffRouter: router, rbacRouter };
