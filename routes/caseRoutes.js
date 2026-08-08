const express = require('express');
const { requireDb } = require('../db');
const { protect, requireRoles } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { actorFromReq, writeAudit } = require('../services/audit');
const { normalizeEmail, cleanDoc, utcnow } = require('../services/helpers');
const { enqueueEmail } = require('../services/mail');
const config = require('../config');
const cases = require('../services/cases');
const { newMessageId, newDocId } = require('../services/ids');
const drive = require('../services/drive');
const { uploadDoc } = require('../utils/uploads');
const { uploadLimiter } = require('../middleware/rateLimit');
const {
  selectPlanSchema,
  assignCaseSchema,
  stageNoteSchema,
  stageRejectSchema,
  caseNoteSchema,
  caseMessageSchema,
  docRequestSchema,
  opsRosterSchema,
  caseListQuerySchema,
} = require('../schemas');

const router = express.Router();

router.get(
  '/me/case',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const doc = await cases.getOrCreateCaseForEmail(req.user.email, req.user.sub);
    return res.json({ success: true, data: doc, ...doc });
  })
);

router.patch(
  '/me/case/plan',
  requireRoles('customer'),
  validateBody(selectPlanSchema),
  asyncHandler(async (req, res) => {
    const planId = req.body.planId;
    const doc = await cases.selectPlan(req.user.email, planId, { actor: actorFromReq(req) });
    await writeAudit(actorFromReq(req), 'plan.selected', {
      resource: { type: 'customer_case', id: doc.id },
      meta: { planId },
    });
    return res.json({ success: true, data: doc, ...doc });
  })
);

router.get(
  '/cases',
  requireRoles('operations', 'admin'),
  validateQuery(caseListQuerySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const query = {};
    if (req.user.role === 'operations') {
      query.$or = [
        { opsEmail: normalizeEmail(req.user.email) },
        { opsEmail: null },
        { opsEmail: '' },
      ];
    }
    if (req.query.status) query.status = String(req.query.status);
    if (req.query.kycStatus) query.kycStatus = String(req.query.kycStatus);
    if (req.query.opsEmail) query.opsEmail = req.query.opsEmail;
    const q = String(req.query.q || '').trim().toLowerCase();
    let rows = await db.collection('customer_cases').find(query).sort({ updatedAt: -1 }).toArray();
    rows = await Promise.all(rows.map((r) => cases.withWorkflowStages(r)));
    if (q) {
      rows = rows.filter((r) =>
        [r.id, r.customerEmail, r.opsEmail, r.opsName, r.planId, r.kycProfile?.legalName]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    return res.json(rows);
  })
);

router.get(
  '/cases/:caseId',
  protect,
  asyncHandler(async (req, res) => {
    const doc = await cases.getCaseById(req.params.caseId);
    if (!doc) return res.status(404).json({ success: false, message: 'Case not found' });
    if (!cases.canAccessCase(req.user, doc) && req.user.role !== 'admin' && req.user.role !== 'operations') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    // operations can view all for queue; tighten only if assigned filter needed — admin all, ops all for v1
    if (req.user.role === 'customer' && !cases.canAccessCase(req.user, doc)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return res.json({ success: true, data: doc, ...doc });
  })
);

router.patch(
  '/cases/:caseId/assign',
  requireRoles('operations', 'admin'),
  validateBody(assignCaseSchema),
  asyncHandler(async (req, res) => {
    const opsEmail = req.body.opsEmail;
    const roster = await cases.getOpsRoster();
    const hit = roster.find((o) => o.email === opsEmail);
    const doc = await cases.updateCase(
      req.params.caseId,
      { opsEmail, opsName: req.body.opsName || hit?.name || opsEmail },
      { actor: actorFromReq(req) }
    );
    return res.json({ success: true, data: doc });
  })
);

router.post(
  '/cases/:caseId/stage/approve',
  requireRoles('operations', 'admin'),
  validateBody(stageNoteSchema),
  asyncHandler(async (req, res) => {
    const cur = await cases.getCaseById(req.params.caseId);
    if (!cur) return res.status(404).json({ success: false, message: 'Not found' });
    const prevIndex = Math.max(0, Number(cur.stageIndex || 0));
    const nextIndex = prevIndex + 1;
    const notes = { ...(cur.stageNotes || {}) };
    if (req.body.note) {
      notes[prevIndex] = { text: String(req.body.note), at: utcnow().toISOString() };
    }
    const doc = await cases.updateCase(
      cur.id,
      { stageIndex: nextIndex, stageNotes: notes },
      { actor: actorFromReq(req) }
    );
    let stageLabel = `Stage ${nextIndex}`;
    const stages = Array.isArray(doc?.workflowStages) ? doc.workflowStages : [];
    stageLabel = stages[prevIndex]?.label || stages[nextIndex]?.label || stageLabel;
    try {
      await enqueueEmail({
        to: cur.customerEmail,
        template: 'stage.advanced',
        vars: {
          caseId: cur.id,
          stageLabel,
          customerName: cur.kycProfile?.legalName || cur.customerEmail,
          ctaUrl: `${config.frontendUrl}/dashboard/workflow`,
        },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    return res.json({ success: true, data: doc, ...doc });
  })
);

router.post(
  '/cases/:caseId/stage/reject',
  requireRoles('operations', 'admin'),
  validateBody(stageRejectSchema),
  asyncHandler(async (req, res) => {
    const cur = await cases.getCaseById(req.params.caseId);
    if (!cur) return res.status(404).json({ success: false, message: 'Not found' });
    const reason = String(req.body.reason || 'Update required');
    const notes = { ...(cur.stageNotes || {}) };
    notes[cur.stageIndex || 0] = { text: reason, at: utcnow().toISOString(), rejected: true };
    const doc = await cases.updateCase(cur.id, { stageNotes: notes }, { actor: actorFromReq(req) });
    try {
      await enqueueEmail({
        to: cur.customerEmail,
        template: 'stage.rejected',
        vars: {
          caseId: cur.id,
          stageLabel: `Stage ${cur.stageIndex || 0}`,
          reason,
          ctaUrl: `${config.frontendUrl}/dashboard`,
        },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    return res.json({ success: true, data: doc, ...doc });
  })
);

router.post(
  '/cases/:caseId/notes',
  requireRoles('operations', 'admin'),
  validateBody(caseNoteSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const note = {
      id: `NOTE-${Date.now()}`,
      body: String(req.body.body || ''),
      authorEmail: normalizeEmail(req.user.email),
      authorName: req.user.name || '',
      createdAt: utcnow(),
    };
    await db.collection('customer_cases').updateOne(
      { id: req.params.caseId },
      { $push: { internalNotes: note }, $set: { updatedAt: utcnow() } }
    );
    await writeAudit(actorFromReq(req), 'case.note', {
      resource: { type: 'customer_case', id: req.params.caseId },
      meta: { noteId: note.id },
    });
    return res.json({ success: true, data: note });
  })
);

router.get(
  '/ops/roster',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    return res.json({ success: true, data: await cases.getOpsRoster() });
  })
);

router.put(
  '/ops/roster',
  requireRoles('admin'),
  validateBody(opsRosterSchema),
  asyncHandler(async (req, res) => {
    const list = await cases.saveOpsRoster(req.body.roster || []);
    await writeAudit(actorFromReq(req), 'ops.roster_updated', { meta: { count: list.length } });
    return res.json({ success: true, data: list });
  })
);

// Messages
router.get(
  '/cases/:caseId/messages',
  protect,
  asyncHandler(async (req, res) => {
    const caseDoc = await cases.getCaseById(req.params.caseId);
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role === 'customer' && !cases.canAccessCase(req.user, caseDoc)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const db = requireDb();
    const items = await db
      .collection('case_messages')
      .find({ caseId: caseDoc.id })
      .sort({ createdAt: 1 })
      .toArray();
    return res.json({ success: true, data: items.map(cleanDoc), items: items.map(cleanDoc) });
  })
);

router.post(
  '/cases/:caseId/messages',
  protect,
  validateBody(caseMessageSchema),
  asyncHandler(async (req, res) => {
    const caseDoc = await cases.getCaseById(req.params.caseId);
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role === 'customer' && !cases.canAccessCase(req.user, caseDoc)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ success: false, message: 'body required' });
    const db = requireDb();
    const msg = {
      id: await newMessageId(),
      caseId: caseDoc.id,
      body,
      fromEmail: normalizeEmail(req.user.email),
      fromRole: req.user.role,
      fromName: req.user.name || '',
      createdAt: utcnow(),
      readAt: null,
    };
    await db.collection('case_messages').insertOne(msg);
    const toOps = req.user.role === 'customer';
    try {
      await enqueueEmail({
        to: toOps ? caseDoc.opsEmail || config.opsInbox : caseDoc.customerEmail,
        template: toOps ? 'message.customer_to_ops' : 'message.ops_to_customer',
        vars: {
          name: msg.fromName || msg.fromEmail,
          body,
          caseId: caseDoc.id,
          ctaUrl: `${config.frontendUrl}/dashboard/messages`,
        },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    await writeAudit(actorFromReq(req), 'message.sent', {
      resource: { type: 'customer_case', id: caseDoc.id },
      meta: { messageId: msg.id },
    });
    return res.json({ success: true, data: cleanDoc(msg) });
  })
);

router.get(
  '/me/messages/unread-count',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    let caseIds = [];
    if (req.user.role === 'customer') {
      const c = await cases.getCaseByEmail(email);
      if (c) caseIds = [c.id];
    } else {
      const rows = await db
        .collection('customer_cases')
        .find(req.user.role === 'admin' ? {} : { opsEmail: email })
        .project({ id: 1 })
        .toArray();
      caseIds = rows.map((r) => r.id);
    }
    const count = caseIds.length
      ? await db.collection('case_messages').countDocuments({
          caseId: { $in: caseIds },
          fromEmail: { $ne: email },
          readAt: null,
        })
      : 0;
    return res.json({ success: true, data: { count }, count });
  })
);

// Documents
router.get(
  '/cases/:caseId/documents',
  protect,
  asyncHandler(async (req, res) => {
    const caseDoc = await cases.getCaseById(req.params.caseId);
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role === 'customer' && !cases.canAccessCase(req.user, caseDoc)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const db = requireDb();
    const items = await db
      .collection('case_documents')
      .find({ caseId: caseDoc.id, deletedAt: null })
      .sort({ uploadedAt: -1 })
      .toArray();
    return res.json({ success: true, data: items.map(cleanDoc), items: items.map(cleanDoc) });
  })
);

router.post(
  '/cases/:caseId/documents',
  protect,
  uploadLimiter,
  uploadDoc.single('file'),
  asyncHandler(async (req, res) => {
    const caseDoc = await cases.getCaseById(req.params.caseId);
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role === 'customer' && !cases.canAccessCase(req.user, caseDoc)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const from = req.user.role === 'customer' ? 'customer' : 'ops';
    const labelRaw = String(req.body?.label || req.body?.title || '').trim();
    const noteRaw = String(req.body?.note || req.body?.description || '').trim();
    if (from === 'ops' && !labelRaw) {
      return res.status(400).json({
        success: false,
        message: 'Please enter what this document is (e.g. IEC certificate)',
      });
    }
    const label = labelRaw || req.file.originalname;
    const folders = await drive.ensureCaseFolders(caseDoc.customerEmail, caseDoc.id);
    const folderId = from === 'ops' ? folders.fromOpsId : folders.fromCustomerId;
    const uploaded = await drive.upload({
      folderId,
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      appProperties: { caseId: caseDoc.id, uploadedBy: req.user.email, role: req.user.role },
    });
    const db = requireDb();
    const doc = {
      id: await newDocId(),
      caseId: caseDoc.id,
      name: req.file.originalname,
      label,
      note: noteRaw || null,
      from,
      status: 'ready',
      fileId: uploaded.fileId,
      driveFileId: uploaded.driveFileId,
      size: uploaded.size,
      mimeType: req.file.mimetype,
      stageId: req.body?.stageId || null,
      requestId: req.body?.requestId || null,
      uploadedAt: utcnow(),
      uploadedBy: normalizeEmail(req.user.email),
      deletedAt: null,
    };
    await db.collection('case_documents').insertOne(doc);
    await db.collection('customer_cases').updateOne(
      { id: caseDoc.id },
      {
        $push: {
          documents: {
            id: doc.id,
            name: doc.name,
            label: doc.label,
            note: doc.note,
            from: doc.from,
            status: doc.status,
            uploadedAt: doc.uploadedAt,
            fileId: doc.fileId,
          },
        },
        $set: { updatedAt: utcnow() },
      }
    );
    try {
      if (from === 'customer' && caseDoc.opsEmail) {
        await enqueueEmail({
          to: caseDoc.opsEmail,
          template: 'doc.uploaded_ops',
          vars: {
            caseId: caseDoc.id,
            label: doc.label || doc.name,
            customerName: caseDoc.kycProfile?.legalName || caseDoc.customerEmail,
            customerEmail: caseDoc.customerEmail,
            ctaUrl: `${config.frontendUrl}/admin/workflow/${encodeURIComponent(caseDoc.id)}`,
          },
          actor: actorFromReq(req),
        });
      } else if (from === 'ops') {
        // Attach file when small enough for email; otherwise dashboard link only
        const maxAttach = 8 * 1024 * 1024;
        const canAttach = req.file.buffer && req.file.buffer.length <= maxAttach;
        const displayLabel = doc.label || doc.name;
        await enqueueEmail({
          to: caseDoc.customerEmail,
          template: 'doc.delivered_customer',
          vars: {
            caseId: caseDoc.id,
            label: displayLabel,
            note: doc.note || '',
            customerName: caseDoc.kycProfile?.legalName || caseDoc.customerEmail,
            hasAttachment: canAttach,
            attachmentNames: canAttach ? [doc.name] : [],
            attachmentNote: canAttach
              ? `${displayLabel} (${doc.name}) is attached. You can also download it from your workspace.`
              : 'The file is available in your workspace (too large to attach here).',
            ctaUrl: `${config.frontendUrl}/dashboard/documents`,
          },
          attachments: canAttach
            ? [
                {
                  filename: doc.name,
                  content: req.file.buffer,
                  contentType: req.file.mimetype || 'application/octet-stream',
                },
              ]
            : [],
          actor: actorFromReq(req),
        });
      }
    } catch (_) {}
    return res.json({ success: true, data: cleanDoc(doc) });
  })
);

router.post(
  '/cases/:caseId/doc-requests',
  requireRoles('operations', 'admin'),
  validateBody(docRequestSchema),
  asyncHandler(async (req, res) => {
    const caseDoc = await cases.getCaseById(req.params.caseId);
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Not found' });
    const db = requireDb();
    const reqDoc = {
      id: `DREQ-${Date.now().toString(36).toUpperCase()}`,
      caseId: caseDoc.id,
      label: String(req.body.label || 'Document'),
      reason: String(req.body.reason || ''),
      status: 'open',
      createdAt: utcnow(),
      createdBy: normalizeEmail(req.user.email),
    };
    await db.collection('doc_requests').insertOne(reqDoc);
    await db.collection('customer_cases').updateOne(
      { id: caseDoc.id },
      { $push: { docRequests: reqDoc }, $set: { updatedAt: utcnow() } }
    );
    try {
      await enqueueEmail({
        to: caseDoc.customerEmail,
        template: 'doc.requested',
        vars: {
          label: reqDoc.label,
          reason: reqDoc.reason,
          caseId: caseDoc.id,
          ctaUrl: `${config.frontendUrl}/dashboard/documents`,
        },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    return res.json({ success: true, data: cleanDoc(reqDoc) });
  })
);

router.post(
  '/cases/:caseId/doc-requests/:reqId/fulfill',
  requireRoles('customer'),
  uploadLimiter,
  uploadDoc.single('file'),
  asyncHandler(async (req, res) => {
    const caseDoc = await cases.getCaseById(req.params.caseId);
    if (!caseDoc || !cases.canAccessCase(req.user, caseDoc)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    req.body = req.body || {};
    req.body.requestId = req.params.reqId;
    // reuse upload path logic by calling folders + insert
    const folders = await drive.ensureCaseFolders(caseDoc.customerEmail, caseDoc.id);
    const uploaded = await drive.upload({
      folderId: folders.fromCustomerId,
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      appProperties: { caseId: caseDoc.id, requestId: req.params.reqId, uploadedBy: req.user.email },
    });
    const db = requireDb();
    const doc = {
      id: await newDocId(),
      caseId: caseDoc.id,
      name: req.file.originalname,
      from: 'customer',
      status: 'ready',
      fileId: uploaded.fileId,
      driveFileId: uploaded.driveFileId,
      size: uploaded.size,
      mimeType: req.file.mimetype,
      requestId: req.params.reqId,
      uploadedAt: utcnow(),
      uploadedBy: normalizeEmail(req.user.email),
      deletedAt: null,
    };
    await db.collection('case_documents').insertOne(doc);
    await db.collection('doc_requests').updateOne(
      { id: req.params.reqId },
      { $set: { status: 'fulfilled', fulfilledAt: utcnow(), documentId: doc.id } }
    );
    await db.collection('customer_cases').updateOne(
      { id: caseDoc.id, 'docRequests.id': req.params.reqId },
      {
        $set: {
          'docRequests.$.status': 'fulfilled',
          updatedAt: utcnow(),
        },
      }
    );
    return res.json({ success: true, data: cleanDoc(doc) });
  })
);

module.exports = router;
