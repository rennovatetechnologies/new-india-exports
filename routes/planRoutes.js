const express = require('express');
const { requireDb } = require('../db');
const { requireAdmin, optionalAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { utcnow } = require('../services/helpers');
const { clampDiscount, effectivePrice } = require('../services/gst');
const { actorFromReq, writeAudit } = require('../services/audit');
const { planCreateSchema, planUpdateSchema } = require('../schemas');

const router = express.Router();

function publicPlan(p) {
  if (!p || p.deletedAt) return null;
  const discountPercent = clampDiscount(p.discountPercent);
  return {
    id: p.id,
    name: p.name,
    price: Math.round(Number(p.price) || 0),
    discountPercent,
    effectivePrice: effectivePrice(p.price, discountPercent),
    tagline: p.tagline || '',
    featured: Boolean(p.featured),
    features: Array.isArray(p.features) ? p.features : [],
    kycDocs: Array.isArray(p.kycDocs) ? p.kycDocs : [],
    workflowStages: Array.isArray(p.workflowStages) ? p.workflowStages : [],
  };
}

router.get(
  '/plans',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db
      .collection('plans')
      .find({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] })
      .toArray();
    const plans = rows.map(publicPlan).filter(Boolean);
    return res.json(plans);
  })
);

router.post(
  '/plans',
  requireAdmin,
  validateBody(planCreateSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const id = String(req.body.id || '').trim();
    const doc = {
      id,
      name: req.body.name || id,
      price: Math.round(Number(req.body.price) || 0),
      discountPercent: clampDiscount(req.body.discountPercent),
      tagline: req.body.tagline || '',
      featured: Boolean(req.body.featured),
      features: req.body.features || [],
      kycDocs: req.body.kycDocs || [],
      workflowStages: req.body.workflowStages || [],
      deletedAt: null,
      updatedAt: utcnow(),
      createdAt: utcnow(),
    };
    await db.collection('plans').updateOne({ id }, { $set: doc }, { upsert: true });
    await writeAudit(actorFromReq(req), 'plan.created', {
      resource: { type: 'plan', id },
      tone: 'success',
    });
    return res.json(publicPlan(doc));
  })
);

router.put(
  '/plans/:planId',
  requireAdmin,
  validateBody(planUpdateSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const id = req.params.planId;
    const prev = await db.collection('plans').findOne({ id });
    if (!prev) return res.status(404).json({ success: false, message: 'Not found' });
    const discountPercent =
      req.body.discountPercent != null
        ? clampDiscount(req.body.discountPercent)
        : clampDiscount(prev.discountPercent);
    const doc = {
      id,
      name: req.body.name != null ? req.body.name : prev.name,
      price: req.body.price != null ? Math.round(Number(req.body.price) || 0) : prev.price,
      discountPercent,
      tagline: req.body.tagline != null ? req.body.tagline : prev.tagline,
      featured: req.body.featured != null ? Boolean(req.body.featured) : prev.featured,
      features: req.body.features != null ? req.body.features : prev.features,
      kycDocs: req.body.kycDocs != null ? req.body.kycDocs : prev.kycDocs,
      workflowStages:
        req.body.workflowStages != null ? req.body.workflowStages : prev.workflowStages,
      updatedAt: utcnow(),
      deletedAt: null,
      createdAt: prev.createdAt || utcnow(),
    };
    await db.collection('plans').updateOne({ id }, { $set: doc });
    if (
      req.body.discountPercent != null &&
      clampDiscount(prev.discountPercent) !== discountPercent
    ) {
      await writeAudit(actorFromReq(req), 'plan.discount_updated', {
        resource: { type: 'plan', id },
        before: { discountPercent: prev.discountPercent },
        after: { discountPercent },
      });
    } else {
      await writeAudit(actorFromReq(req), 'plan.updated', { resource: { type: 'plan', id } });
    }
    return res.json(publicPlan(doc));
  })
);

router.delete(
  '/plans/:planId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    await db
      .collection('plans')
      .updateOne({ id: req.params.planId }, { $set: { deletedAt: utcnow() } });
    await writeAudit(actorFromReq(req), 'plan.deleted', {
      resource: { type: 'plan', id: req.params.planId },
    });
    return res.json({ success: true, ok: true });
  })
);

module.exports = router;
