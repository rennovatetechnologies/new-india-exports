const express = require('express');
const { requireDb } = require('../db');
const { requireRoles } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimit');
const { idempotency } = require('../middleware/idempotency');
const { validateBody, validateParams } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { uploadDoc } = require('../utils/uploads');
const { actorFromReq, writeAudit } = require('../services/audit');
const { normalizeEmail, utcnow } = require('../services/helpers');
const { enqueueEmail } = require('../services/mail');
const config = require('../config');
const cases = require('../services/cases');
const drive = require('../services/drive');
const {
  kycProfileSchema,
  kycNeedsMoreSchema,
  kycDocReviewSchema,
  emptyBodySchema,
  idParamSchema,
  caseDocParamsSchema,
} = require('../schemas');

const router = express.Router();

const DOC_REVIEW = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

function mapProfile(body = {}) {
  return {
    legalName: body.legalName || body.legalEntityName || '',
    entityType: body.entityType || 'Private Limited',
    incorporationDate: body.incorporationDate || body.dateOfIncorporation || '',
    turnover: body.turnover || body.annualTurnover || '',
    registeredAddress: body.registeredAddress || '',
    operatingCity: body.operatingCity || '',
    signatoryName: body.signatoryName || body.fullName || '',
    designation: body.designation || '',
    panNumber: body.panNumber || body.pan || '',
    aadhaarLast4: body.aadhaarLast4 || '',
  };
}

async function resolveCase(caseIdOrEmail) {
  let c = await cases.getCaseById(caseIdOrEmail);
  if (!c) c = await cases.getCaseByEmail(caseIdOrEmail);
  return c;
}

async function planKycDocs(caseDoc) {
  const db = requireDb();
  const plan = await db.collection('plans').findOne({ id: caseDoc.paidPlanId || caseDoc.planId });
  return plan?.kycDocs || [];
}

function labelForDoc(kycDocs, docId) {
  const hit = (kycDocs || []).find((d) => d.id === docId);
  return hit?.label || docId;
}

function checklistHtml(items = []) {
  if (!items.length) return '';
  const lis = items
    .map((it) => {
      const note = it.note ? ` — <em>${escapeLite(it.note)}</em>` : '';
      return `<li style="margin:0 0 6px"><strong>${escapeLite(it.label)}</strong>${note}</li>`;
    })
    .join('');
  return `<ul style="margin:8px 0 0;padding-left:18px;color:#1C1917">${lis}</ul>`;
}

function checklistText(items = []) {
  if (!items.length) return '';
  return items.map((it) => `- ${it.label}${it.note ? `: ${it.note}` : ''}`).join('\n');
}

function escapeLite(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMissingItems(kycDocs, missingDocIds, docNotes, uploads) {
  return (missingDocIds || []).map((id) => ({
    id,
    label: labelForDoc(kycDocs, id),
    note: (docNotes && docNotes[id]) || uploads?.[id]?.reviewNote || '',
  }));
}

router.get(
  '/me',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const c = await cases.getOrCreateCaseForEmail(req.user.email, req.user.sub);
    return res.json({
      success: true,
      data: {
        email: c.customerEmail,
        status: c.kycStatus,
        profile: c.kycProfile,
        kycProfile: c.kycProfile,
        uploads: c.kycUploads,
        documents: c.kycUploads,
        caseId: c.id,
        missingDocIds: c.kycMissingDocIds || [],
        rejectReason: c.kycRejectReason || null,
      },
      email: c.customerEmail,
      status: c.kycStatus,
      kycProfile: c.kycProfile,
      documents: Object.fromEntries(
        Object.entries(c.kycUploads || {}).map(([k, v]) => [
          k,
          {
            key: k,
            filename: v.name,
            size: v.size,
            uploadedAt: v.uploadedAt,
            reviewStatus: v.reviewStatus || DOC_REVIEW.PENDING,
            reviewNote: v.reviewNote || null,
          },
        ])
      ),
    });
  })
);

async function saveProfile(req, res) {
  const c = await cases.getOrCreateCaseForEmail(req.user.email, req.user.sub);
  const profile = { ...(c.kycProfile || {}), ...mapProfile(req.body) };
  let kycStatus = c.kycStatus;
  if (kycStatus !== cases.KYC_STATUS.APPROVED && kycStatus !== cases.KYC_STATUS.SUBMITTED) {
    kycStatus = cases.KYC_STATUS.INCOMPLETE;
  }
  const doc = await cases.updateCase(
    c.id,
    { kycProfile: profile, kycStatus },
    { actor: actorFromReq(req) }
  );
  return res.json({ success: true, data: doc.kycProfile, kycProfile: doc.kycProfile });
}

router.post('/me/profile', requireRoles('customer'), validateBody(kycProfileSchema), asyncHandler(saveProfile));
router.put('/me/profile', requireRoles('customer'), validateBody(kycProfileSchema), asyncHandler(saveProfile));
router.put('/me/business', requireRoles('customer'), validateBody(kycProfileSchema), asyncHandler(saveProfile));
router.put('/me/identity', requireRoles('customer'), validateBody(kycProfileSchema), asyncHandler(saveProfile));

router.post(
  '/me/documents/:docId',
  requireRoles('customer'),
  validateParams(idParamSchema('docId')),
  uploadLimiter,
  uploadDoc.single('file'),
  asyncHandler(async (req, res) => {
    const docId = req.params.docId;
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const c = await cases.getOrCreateCaseForEmail(req.user.email, req.user.sub);
    const folders = await drive.ensureCaseFolders(c.customerEmail, c.id);
    const uploaded = await drive.upload({
      folderId: folders.kycId,
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      appProperties: { kind: 'kyc', docId, caseId: c.id, uploadedBy: req.user.email },
    });
    const meta = {
      fileId: uploaded.fileId,
      driveFileId: uploaded.driveFileId,
      name: req.file.originalname,
      size: uploaded.size,
      mimeType: req.file.mimetype,
      uploadedAt: utcnow().toISOString(),
      reviewStatus: DOC_REVIEW.PENDING,
      reviewNote: null,
      reviewedAt: null,
      reviewedBy: null,
    };
    const kycUploads = { ...(c.kycUploads || {}), [docId]: meta };
    let kycStatus = c.kycStatus;
    if (kycStatus !== cases.KYC_STATUS.APPROVED && kycStatus !== cases.KYC_STATUS.SUBMITTED) {
      kycStatus = cases.KYC_STATUS.INCOMPLETE;
    }
    // Drop this doc from the "still needed" list once the customer replaces it
    const kycMissingDocIds = (c.kycMissingDocIds || []).filter((id) => id !== docId);
    await cases.updateCase(
      c.id,
      { kycUploads, kycStatus, kycMissingDocIds },
      { actor: actorFromReq(req) }
    );
    await writeAudit(actorFromReq(req), 'kyc.document_uploaded', {
      resource: { type: 'customer_case', id: c.id },
      meta: { docId, fileId: uploaded.fileId },
    });
    return res.json({ success: true, data: meta, docId, ...meta });
  })
);

router.delete(
  '/me/documents/:docId',
  requireRoles('customer'),
  validateParams(idParamSchema('docId')),
  asyncHandler(async (req, res) => {
    const docId = req.params.docId;
    const c = await cases.getOrCreateCaseForEmail(req.user.email, req.user.sub);
    const prev = c.kycUploads?.[docId];
    if (prev?.fileId || prev?.driveFileId) {
      try {
        await drive.trash(prev.fileId || prev.driveFileId);
      } catch (_) {}
    }
    const kycUploads = { ...(c.kycUploads || {}) };
    delete kycUploads[docId];
    await cases.updateCase(c.id, { kycUploads }, { actor: actorFromReq(req) });
    return res.json({ success: true, ok: true });
  })
);

router.post(
  '/me/submit',
  requireRoles('customer'),
  validateBody(emptyBodySchema),
  idempotency({ required: false }),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const c = await cases.getOrCreateCaseForEmail(req.user.email, req.user.sub);
    if (!cases.isPlanEntitlementActive(c)) {
      return res.status(400).json({
        success: false,
        code: cases.isPlanExpired(c) ? 'PLAN_EXPIRED' : 'PAYMENT_REQUIRED',
        message: cases.isPlanExpired(c)
          ? 'Your plan has expired. Purchase a plan again to continue.'
          : 'Plan payment required before KYC submit',
      });
    }
    const plan = await db.collection('plans').findOne({ id: c.paidPlanId });
    const required = (plan?.kycDocs || []).filter((d) => d.required !== false).map((d) => d.id);
    const uploads = c.kycUploads || {};
    const missing = required.filter((id) => !uploads[id]);
    if (missing.length) {
      return res.status(400).json({
        success: false,
        code: 'KYC_INCOMPLETE',
        message: 'Required KYC documents missing',
        details: missing,
      });
    }
    // Docs that were rejected / requested must be replaced (pending) before resubmit
    const stillRejected = (c.kycMissingDocIds || []).filter(
      (id) => !uploads[id] || uploads[id].reviewStatus === DOC_REVIEW.REJECTED
    );
    const rejectedUploads = Object.entries(uploads)
      .filter(([, meta]) => meta?.reviewStatus === DOC_REVIEW.REJECTED)
      .map(([id]) => id);
    const blocked = [...new Set([...stillRejected, ...rejectedUploads])];
    if (blocked.length) {
      return res.status(400).json({
        success: false,
        code: 'KYC_DOCS_NEED_REPLACE',
        message: 'Please replace the documents that need attention before resubmitting',
        details: blocked,
      });
    }

    // Keep previously approved docs; mark others pending for this review cycle
    const kycUploads = Object.fromEntries(
      Object.entries(uploads).map(([id, meta]) => [
        id,
        {
          ...meta,
          reviewStatus:
            meta.reviewStatus === DOC_REVIEW.APPROVED ? DOC_REVIEW.APPROVED : DOC_REVIEW.PENDING,
          reviewNote: meta.reviewStatus === DOC_REVIEW.APPROVED ? meta.reviewNote : null,
        },
      ])
    );

    const doc = await cases.updateCase(
      c.id,
      {
        kycStatus: cases.KYC_STATUS.SUBMITTED,
        kycSubmittedAt: utcnow(),
        status: cases.CASE_STATUS.KYC_PENDING,
        kycRejectReason: null,
        kycMissingDocIds: [],
        kycUploads,
      },
      { actor: actorFromReq(req) }
    );
    try {
      await enqueueEmail({
        to: c.customerEmail,
        template: 'kyc.submitted_customer',
        vars: { caseId: c.id, customerName: c.kycProfile?.legalName || c.customerEmail },
        actor: actorFromReq(req),
      });
      await enqueueEmail({
        to: c.opsEmail || config.opsInbox,
        template: 'kyc.submitted_ops',
        vars: {
          legalName: c.kycProfile?.legalName || '',
          customerEmail: c.customerEmail,
          caseId: c.id,
        },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    await writeAudit(actorFromReq(req), 'kyc.submitted', {
      resource: { type: 'customer_case', id: c.id },
      tone: 'success',
    });
    return res.json({ success: true, data: doc, message: 'KYC submitted' });
  })
);

router.get(
  '/queue',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db
      .collection('customer_cases')
      .find({ kycStatus: cases.KYC_STATUS.SUBMITTED })
      .sort({ kycSubmittedAt: 1 })
      .toArray();
    return res.json({
      success: true,
      data: rows.map(cases.publicCase),
      items: rows.map(cases.publicCase),
    });
  })
);

/** Per-file approve / reject while pack is under review. */
router.post(
  '/:caseId/documents/:docId/review',
  requireRoles('operations', 'admin'),
  validateParams(caseDocParamsSchema),
  validateBody(kycDocReviewSchema),
  asyncHandler(async (req, res) => {
    const c = await resolveCase(req.params.caseId);
    if (!c) return res.status(404).json({ success: false, message: 'Case not found' });
    const docId = req.params.docId;
    const upload = c.kycUploads?.[docId];
    if (!upload) {
      return res.status(404).json({ success: false, message: 'Document not uploaded' });
    }
    const status = req.body.status;
    const note = String(req.body.note || '').trim() || null;
    if (status === DOC_REVIEW.REJECTED && !note) {
      return res.status(400).json({
        success: false,
        message: 'A short note helps the customer know what to fix',
      });
    }
    const actor = actorFromReq(req);
    const kycUploads = {
      ...(c.kycUploads || {}),
      [docId]: {
        ...upload,
        reviewStatus: status,
        reviewNote: status === DOC_REVIEW.REJECTED ? note : null,
        reviewedAt: utcnow().toISOString(),
        reviewedBy: actor.email || actor.userId || null,
      },
    };
    let kycMissingDocIds = [...(c.kycMissingDocIds || [])];
    if (status === DOC_REVIEW.REJECTED) {
      if (!kycMissingDocIds.includes(docId)) kycMissingDocIds.push(docId);
    } else {
      kycMissingDocIds = kycMissingDocIds.filter((id) => id !== docId);
    }
    const doc = await cases.updateCase(
      c.id,
      { kycUploads, kycMissingDocIds },
      { actor }
    );
    await writeAudit(actor, 'kyc.document_reviewed', {
      resource: { type: 'customer_case', id: c.id },
      meta: { docId, status, note },
      tone: status === DOC_REVIEW.REJECTED ? 'warning' : 'success',
    });
    return res.json({ success: true, data: doc, upload: doc.kycUploads?.[docId] });
  })
);

router.post(
  '/:caseId/approve',
  requireRoles('operations', 'admin'),
  validateParams(idParamSchema('caseId')),
  validateBody(emptyBodySchema),
  asyncHandler(async (req, res) => {
    const c = await resolveCase(req.params.caseId);
    if (!c) return res.status(404).json({ success: false, message: 'Case not found' });
    const actor = actorFromReq(req);
    const nowIso = utcnow().toISOString();
    const kycUploads = Object.fromEntries(
      Object.entries(c.kycUploads || {}).map(([id, meta]) => [
        id,
        {
          ...meta,
          reviewStatus: DOC_REVIEW.APPROVED,
          reviewNote: null,
          reviewedAt: meta.reviewedAt || nowIso,
          reviewedBy: meta.reviewedBy || actor.email || null,
        },
      ])
    );
    const doc = await cases.updateCase(
      c.id,
      {
        kycStatus: cases.KYC_STATUS.APPROVED,
        kycApprovedAt: utcnow(),
        kycRejectReason: null,
        kycMissingDocIds: [],
        kycUploads,
        stageIndex: Math.max(c.stageIndex || 0, 1),
        status: cases.CASE_STATUS.ACTIVE,
      },
      { actor }
    );
    const db = requireDb();
    await db.collection('users').updateOne(
      { email: normalizeEmail(c.customerEmail) },
      { $set: { kycComplete: true } }
    );
    try {
      await enqueueEmail({
        to: c.customerEmail,
        template: 'kyc.approved',
        vars: {
          caseId: c.id,
          customerName: c.kycProfile?.legalName || c.customerEmail,
          ctaUrl: `${config.frontendUrl}/dashboard`,
        },
        actor,
      });
    } catch (_) {}
    await writeAudit(actor, 'kyc.approved', {
      resource: { type: 'customer_case', id: c.id },
      tone: 'success',
    });
    return res.json({ success: true, data: doc });
  })
);

async function applyNeedsMore(req, res) {
  const c = await resolveCase(req.params.caseId);
  if (!c) return res.status(404).json({ success: false, message: 'Case not found' });
  const reason = String(req.body.reason || 'Additional documents required').trim();
  const kycDocs = await planKycDocs(c);
  const uploads = { ...(c.kycUploads || {}) };

  // Prefer explicit selection; else any docs already marked rejected; else all required
  let missingDocIds = Array.isArray(req.body.missingDocIds)
    ? req.body.missingDocIds.filter(Boolean)
    : [];
  const docNotes = req.body.docNotes && typeof req.body.docNotes === 'object' ? req.body.docNotes : {};

  if (!missingDocIds.length) {
    missingDocIds = Object.entries(uploads)
      .filter(([, meta]) => meta?.reviewStatus === DOC_REVIEW.REJECTED)
      .map(([id]) => id);
  }
  if (!missingDocIds.length) {
    missingDocIds = (kycDocs || []).filter((d) => d.required !== false).map((d) => d.id);
  }

  const actor = actorFromReq(req);
  const nowIso = utcnow().toISOString();
  for (const id of missingDocIds) {
    if (uploads[id]) {
      uploads[id] = {
        ...uploads[id],
        reviewStatus: DOC_REVIEW.REJECTED,
        reviewNote: String(docNotes[id] || uploads[id].reviewNote || reason).trim() || reason,
        reviewedAt: nowIso,
        reviewedBy: actor.email || null,
      };
    }
  }

  const items = buildMissingItems(kycDocs, missingDocIds, docNotes, uploads);
  const labels = items.map((i) => i.label);

  const doc = await cases.updateCase(
    c.id,
    {
      kycStatus: cases.KYC_STATUS.NEEDS_MORE,
      kycRejectReason: reason,
      kycMissingDocIds: missingDocIds,
      kycUploads: uploads,
      status: cases.CASE_STATUS.KYC_INCOMPLETE,
    },
    { actor }
  );

  try {
    await enqueueEmail({
      to: c.customerEmail,
      template: 'kyc.needs_more',
      vars: {
        reason,
        caseId: c.id,
        customerName: c.kycProfile?.legalName || c.customerEmail,
        missingDocIds,
        missingDocLabels: labels,
        missingDocsHtml: checklistHtml(items),
        missingDocsText: checklistText(items),
        ctaUrl: `${config.frontendUrl}/dashboard/kyc`,
      },
      actor,
    });
  } catch (_) {}

  await writeAudit(actor, 'kyc.needs_more', {
    resource: { type: 'customer_case', id: c.id },
    meta: { reason, missingDocIds },
    tone: 'warning',
  });
  return res.json({ success: true, data: doc });
}

router.post(
  '/:caseId/needs-more',
  requireRoles('operations', 'admin'),
  validateParams(idParamSchema('caseId')),
  validateBody(kycNeedsMoreSchema),
  asyncHandler(applyNeedsMore)
);

// legacy reject alias — now also emails the customer with the same checklist
router.post(
  '/:caseId/reject',
  requireRoles('operations', 'admin'),
  validateParams(idParamSchema('caseId')),
  validateBody(kycNeedsMoreSchema),
  asyncHandler(applyNeedsMore)
);

module.exports = router;
