const express = require('express');
const { requireDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { writeAudit, actorFromReq } = require('../services/audit');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { asyncHandler } = require('../utils/asyncHandler');
const { enqueueEmail } = require('../services/mail');
const config = require('../config');
const {
  staffAccessPatchSchema,
  staffUserPatchSchema,
  staffPermissionsSchema,
  staffAccessListQuerySchema,
} = require('../schemas');

const router = express.Router();
const rbacRouter = express.Router();

router.get(
  '/access-requests',
  requireAdmin,
  validateQuery(staffAccessListQuerySchema),
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
  validateBody(staffAccessPatchSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = await db.collection('staff_requests').findOne({ id: req.params.reqId });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    const status = req.body.status;
    if (status === 'Approved' && doc.emailVerified === false) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Cannot approve unverified email',
      });
    }
    const updates = { status };
    if (Array.isArray(req.body.permissions)) updates.permissions = req.body.permissions;
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
      try {
        await enqueueEmail({
          to: email,
          template: 'staff.access_approved',
          vars: { customerName: doc.name, ctaUrl: `${config.frontendUrl}/admin/login` },
          actor: actorFromReq(req),
        });
      } catch (_) {}
    } else if (status === 'Rejected') {
      try {
        await enqueueEmail({
          to: email,
          template: 'staff.access_rejected',
          vars: { reason: req.body?.reason || '' },
          actor: actorFromReq(req),
        });
      } catch (_) {}
    } else if (status === 'Suspended') {
      await db.collection('users').updateOne({ email }, { $set: { status: 'Suspended' } });
      try {
        await enqueueEmail({
          to: email,
          template: 'staff.access_suspended',
          vars: {},
          actor: actorFromReq(req),
        });
      } catch (_) {}
    }
    await writeAudit(actorFromReq(req), 'staff.access_updated', {
      meta: { id: req.params.reqId, status },
    });
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
  '/users/:email',
  requireAdmin,
  validateBody(staffUserPatchSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.params.email);
    const $set = {};
    if (req.body.role) $set.role = req.body.role;
    if (req.body.status) $set.status = req.body.status;
    if (Array.isArray(req.body.permissions)) $set.permissions = req.body.permissions;
    if (req.body.name) $set.name = req.body.name;
    const result = await db.collection('users').updateOne({ email }, { $set });
    if (!result.matchedCount) return res.status(404).json({ success: false, message: 'User not found' });
    await writeAudit(actorFromReq(req), 'staff.user_updated', { meta: { email, ...$set } });
    const user = await db.collection('users').findOne({ email });
    return res.json({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        permissions: user.permissions || [],
      },
    });
  })
);

router.patch(
  '/users/:email/permissions',
  requireAdmin,
  validateBody(staffPermissionsSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.params.email);
    const permissions = req.body.permissions;
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
