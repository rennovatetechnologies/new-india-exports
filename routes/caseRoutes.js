const express = require('express');
const { requireDb } = require('../db');
const { protect, requireRoles } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
const STAGE_TOTAL = 8;

function canAccessCase(user, caseDoc) {
  if (user.role === 'operations' || user.role === 'admin') return true;
  return normalizeEmail(caseDoc.accountEmail) === normalizeEmail(user.email);
}

router.get(
  '/cases',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const query = {};
    if (req.user.role === 'customer') query.accountEmail = normalizeEmail(req.user.email);
    let rows = (await db.collection('cases').find(query).toArray()).map(cleanDoc);
    const preset = req.query.preset;
    if (preset === 'attention') rows = rows.filter((r) => r.sla === 'Due today' || r.sla === 'Breached');
    else if (preset === 'active') rows = rows.filter((r) => Number(r.stage || 0) < STAGE_TOTAL);
    else if (preset === 'complete') rows = rows.filter((r) => Number(r.stage || 0) >= STAGE_TOTAL);

    const q = String(req.query.q || '').toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        if (q.startsWith('sla:') && (r.sla || '').toLowerCase().includes(q.slice(4).trim())) return true;
        if (q.startsWith('owner:') && (r.opsOwner || '').toLowerCase().includes(q.slice(6).trim())) return true;
        if (q.startsWith('stage:') && String(r.stage) === q.slice(6).trim()) return true;
        const blob = [r.id, r.title, r.buyer, r.accountName, r.accountCompany, r.opsOwner, r.sla]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }

    const sort = req.query.sort;
    if (sort === 'caseId') rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    else if (sort === 'stage') rows.sort((a, b) => Number(a.stage || 0) - Number(b.stage || 0));
    else {
      const order = { Breached: 0, 'Due today': 1, 'On track': 2 };
      rows.sort(
        (a, b) =>
          (order[a.sla] ?? 9) - (order[b.sla] ?? 9) || Number(b.stage || 0) - Number(a.stage || 0)
      );
    }
    return res.json(rows);
  })
);

router.post(
  '/cases',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    let caseId = `VST-${Math.floor(2000 + Math.random() * 8000)}`;
    while (await db.collection('cases').findOne({ id: caseId })) {
      caseId = `VST-${Math.floor(2000 + Math.random() * 8000)}`;
    }
    const doc = {
      id: caseId,
      title: req.body?.title || '',
      buyer: req.body?.buyer || '',
      value: req.body?.value || '',
      stage: Number(req.body?.stage || 0),
      accountName: req.body?.accountName || '',
      accountCompany: req.body?.accountCompany || '',
      accountEmail: normalizeEmail(req.body?.accountEmail),
      sla: req.body?.sla || 'On track',
      opsOwner: req.body?.opsOwner || req.user.name || req.user.email,
      createdAt: utcnow(),
      updatedAt: utcnow(),
    };
    await db.collection('cases').insertOne(doc);
    await writeAudit(req.user.email || '', 'case_create', { meta: { id: caseId } });
    return res.json(cleanDoc(doc));
  })
);

router.get(
  '/cases/:caseId',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const caseDoc = await db.collection('cases').findOne({ id: req.params.caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    if (!canAccessCase(req.user, caseDoc)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    return res.json(cleanDoc(caseDoc));
  })
);

router.patch(
  '/cases/:caseId',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const caseDoc = await db.collection('cases').findOne({ id: req.params.caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    const fields = [
      'title',
      'buyer',
      'value',
      'sla',
      'opsOwner',
      'accountName',
      'accountCompany',
      'accountEmail',
    ];
    const updates = {};
    for (const f of fields) {
      if (req.body?.[f] !== undefined) updates[f] = req.body[f];
    }
    if (updates.accountEmail) updates.accountEmail = normalizeEmail(updates.accountEmail);
    updates.updatedAt = utcnow();
    await db.collection('cases').updateOne({ id: req.params.caseId }, { $set: updates });
    const updated = await db.collection('cases').findOne({ id: req.params.caseId });
    return res.json(cleanDoc(updated));
  })
);

router.post(
  '/cases/:caseId/stage/approve',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const caseDoc = await db.collection('cases').findOne({ id: req.params.caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    const stage = Number(caseDoc.stage || 0);
    if (stage >= STAGE_TOTAL) return res.json({ stage });
    const newStage = stage + 1;
    await db
      .collection('cases')
      .updateOne({ id: req.params.caseId }, { $set: { stage: newStage, updatedAt: utcnow() } });
    await db.collection('case_activity').insertOne({
      caseId: req.params.caseId,
      who: req.user.name || req.user.email,
      text: `Approved stage → ${newStage}`,
      kind: 'approve',
      when: utcnow().toISOString(),
    });
    await writeAudit(req.user.email || '', 'stage_approve', {
      meta: { caseId: req.params.caseId, stage: newStage },
    });
    return res.json({ stage: newStage });
  })
);

router.post(
  '/cases/:caseId/stage/reject',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const caseDoc = await db.collection('cases').findOne({ id: req.params.caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    const stage = Number(caseDoc.stage || 0);
    const newStage = Math.max(0, stage - 1);
    await db
      .collection('cases')
      .updateOne({ id: req.params.caseId }, { $set: { stage: newStage, updatedAt: utcnow() } });
    await db.collection('case_activity').insertOne({
      caseId: req.params.caseId,
      who: req.user.name || req.user.email,
      text: req.body?.reason || 'Stage rejected',
      kind: 'reject',
      when: utcnow().toISOString(),
    });
    await writeAudit(req.user.email || '', 'stage_reject', {
      meta: { caseId: req.params.caseId, stage: newStage },
    });
    return res.json({ stage: newStage });
  })
);

router.get(
  '/cases/:caseId/activity',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const caseDoc = await db.collection('cases').findOne({ id: req.params.caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    if (!canAccessCase(req.user, caseDoc)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const rows = await db
      .collection('case_activity')
      .find({ caseId: req.params.caseId })
      .sort({ when: -1 })
      .toArray();
    return res.json(rows.map(cleanDoc));
  })
);

router.post(
  '/cases/:caseId/activity',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const caseDoc = await db.collection('cases').findOne({ id: req.params.caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    if (!canAccessCase(req.user, caseDoc)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const kind = ['comment', 'approve', 'reject'].includes(req.body?.kind) ? req.body.kind : 'comment';
    const entry = {
      caseId: req.params.caseId,
      who: req.user.name || req.user.email,
      text: req.body?.text || '',
      kind,
      when: utcnow().toISOString(),
    };
    await db.collection('case_activity').insertOne(entry);
    return res.json(cleanDoc(entry));
  })
);

router.get(
  '/workspace/search',
  protect,
  asyncHandler(async (req, res) => {
    req.query.q = req.query.q || '';
    // Reuse list logic by forwarding to cases handler path
    const db = requireDb();
    const query = {};
    if (req.user.role === 'customer') query.accountEmail = normalizeEmail(req.user.email);
    let rows = (await db.collection('cases').find(query).toArray()).map(cleanDoc);
    const q = String(req.query.q || '').toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const blob = [r.id, r.title, r.buyer, r.accountName, r.accountCompany, r.opsOwner, r.sla]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    return res.json(rows.slice(0, 20));
  })
);

router.get(
  '/dashboard/overview',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const cases = await db.collection('cases').find({ accountEmail: email }).toArray();
    const active = cases.filter((c) => Number(c.stage || 0) < STAGE_TOTAL);
    return res.json({
      plan: 'Standard',
      onboardingPct: cases.some((c) => Number(c.stage || 0) >= 2) ? 72 : 40,
      openCases: active.length,
      docsPending: 0,
      sla: 'On track',
      cases: cases.slice(0, 5).map(cleanDoc),
    });
  })
);

router.get(
  '/ops/stats',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const cases = await db.collection('cases').find({}).toArray();
    const customers = await db.collection('users').countDocuments({ role: 'customer' });
    return res.json({
      activeCustomers: customers,
      openCases: cases.filter((c) => Number(c.stage || 0) < STAGE_TOTAL).length,
      mtdRevenue: 0,
      slaBreaches: cases.filter((c) => c.sla === 'Breached').length,
    });
  })
);

module.exports = router;
