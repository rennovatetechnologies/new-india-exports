const express = require('express');
const { ObjectId } = require('mongodb');
const { requireDb, getFs } = require('../db');
const { requireRoles } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { uploadDoc } = require('../utils/uploads');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
const DOC_KEYS = ['pan', 'aadhaar', 'bankStatement', 'photo', 'electricity'];

async function ensureProfile(db, email) {
  let doc = await db.collection('kyc_profiles').findOne({ email });
  if (!doc) {
    doc = {
      email,
      status: 'incomplete',
      business: {},
      identity: {},
      documents: {},
      createdAt: utcnow(),
      updatedAt: utcnow(),
    };
    await db.collection('kyc_profiles').insertOne(doc);
  }
  return doc;
}

function cleanProfile(doc) {
  const out = cleanDoc(doc);
  const docs = {};
  for (const [k, v] of Object.entries(out.documents || {})) {
    docs[k] = {
      key: k,
      filename: v.filename,
      size: v.size,
      uploadedAt: v.uploadedAt,
    };
  }
  out.documents = docs;
  return out;
}

router.get(
  '/me',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    return res.json(cleanProfile(await ensureProfile(db, email)));
  })
);

router.put(
  '/me/business',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    await ensureProfile(db, email);
    await db.collection('kyc_profiles').updateOne(
      { email },
      {
        $set: {
          business: {
            legalEntityName: req.body?.legalEntityName || '',
            entityType: req.body?.entityType || '',
            dateOfIncorporation: req.body?.dateOfIncorporation || '',
            annualTurnover: req.body?.annualTurnover || '',
            registeredAddress: req.body?.registeredAddress || '',
            operatingCity: req.body?.operatingCity || '',
          },
          updatedAt: utcnow(),
        },
      }
    );
    return res.json({ ok: true });
  })
);

router.put(
  '/me/identity',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    await ensureProfile(db, email);
    await db.collection('kyc_profiles').updateOne(
      { email },
      {
        $set: {
          identity: {
            fullName: req.body?.fullName || '',
            designation: req.body?.designation || '',
            pan: req.body?.pan || '',
            aadhaarLast4: req.body?.aadhaarLast4 || '',
          },
          updatedAt: utcnow(),
        },
      }
    );
    return res.json({ ok: true });
  })
);

router.post(
  '/me/documents/:docKey',
  requireRoles('customer'),
  uploadDoc.single('file'),
  asyncHandler(async (req, res) => {
    const docKey = req.params.docKey;
    if (!DOC_KEYS.includes(docKey)) {
      return res.status(400).json({ success: false, message: 'Invalid document key' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    await ensureProfile(db, email);
    const fs = getFs('kyc_files');
    const existing = await db.collection('kyc_profiles').findOne({ email });
    const old = (existing.documents || {})[docKey];
    if (old?.gridfsId) {
      try {
        await fs.delete(new ObjectId(String(old.gridfsId)));
      } catch (_) {
        /* ignore */
      }
    }
    const uploadStream = fs.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { email, docKey },
    });
    await new Promise((resolve, reject) => {
      uploadStream.end(req.file.buffer);
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });
    const meta = {
      filename: req.file.originalname,
      size: req.file.size,
      uploadedAt: utcnow().toISOString(),
      gridfsId: uploadStream.id,
      contentType: req.file.mimetype,
    };
    await db.collection('kyc_profiles').updateOne(
      { email },
      { $set: { [`documents.${docKey}`]: meta, updatedAt: utcnow() } }
    );
    return res.json({
      key: docKey,
      filename: req.file.originalname,
      size: req.file.size,
      uploadedAt: meta.uploadedAt,
    });
  })
);

router.delete(
  '/me/documents/:docKey',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const profile = await ensureProfile(db, email);
    const doc = (profile.documents || {})[req.params.docKey];
    if (doc?.gridfsId) {
      try {
        await getFs('kyc_files').delete(new ObjectId(String(doc.gridfsId)));
      } catch (_) {
        /* ignore */
      }
    }
    await db.collection('kyc_profiles').updateOne(
      { email },
      { $unset: { [`documents.${req.params.docKey}`]: '' } }
    );
    return res.json({ ok: true });
  })
);

router.post(
  '/me/submit',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const profile = await ensureProfile(db, email);
    const docs = profile.documents || {};
    const missing = DOC_KEYS.filter((k) => !docs[k]);
    if (missing.length) {
      return res.status(400).json({ success: false, message: 'Missing documents', missing });
    }
    await db.collection('kyc_profiles').updateOne(
      { email },
      { $set: { status: 'pending', submittedAt: utcnow(), updatedAt: utcnow() } }
    );
    await db.collection('users').updateOne({ email }, { $set: { kycComplete: true } });
    await writeAudit(email, 'kyc_submit', { tone: 'info' });
    return res.json({ status: 'pending', submittedAt: utcnow().toISOString() });
  })
);

router.get(
  '/queue',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const query = req.query.status
      ? { status: req.query.status }
      : { status: { $in: ['pending', 'verified', 'rejected'] } };
    let rows = (await db.collection('kyc_profiles').find(query).sort({ submittedAt: -1 }).toArray()).map(
      cleanProfile
    );
    const q = String(req.query.q || '').toLowerCase();
    if (q) rows = rows.filter((r) => (r.email || '').toLowerCase().includes(q));
    return res.json(rows);
  })
);

router.post(
  '/:customerId/approve',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.params.customerId);
    const result = await db.collection('kyc_profiles').updateOne(
      { email },
      { $set: { status: 'verified', opsNote: req.body?.note || '', updatedAt: utcnow() } }
    );
    if (!result.matchedCount) return res.status(404).json({ success: false, message: 'KYC profile not found' });
    await db.collection('users').updateOne({ email }, { $set: { kycComplete: true } });
    await writeAudit(req.user.email || '', 'kyc_approve', { meta: { customer: email }, tone: 'success' });
    return res.json({ status: 'verified' });
  })
);

router.post(
  '/:customerId/reject',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.params.customerId);
    const result = await db.collection('kyc_profiles').updateOne(
      { email },
      {
        $set: {
          status: 'rejected',
          opsNote: req.body?.reason || req.body?.note || '',
          updatedAt: utcnow(),
        },
      }
    );
    if (!result.matchedCount) return res.status(404).json({ success: false, message: 'KYC profile not found' });
    await db.collection('users').updateOne({ email }, { $set: { kycComplete: false } });
    await writeAudit(req.user.email || '', 'kyc_reject', { meta: { customer: email }, tone: 'warn' });
    return res.json({ status: 'rejected' });
  })
);

router.get(
  '/:customerId/documents/:docKey',
  requireRoles('operations', 'admin', 'customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.params.customerId);
    if (req.user.role === 'customer' && normalizeEmail(req.user.email) !== email) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const profile = await db.collection('kyc_profiles').findOne({ email });
    if (!profile) return res.status(404).json({ success: false, message: 'Not found' });
    const doc = (profile.documents || {})[req.params.docKey];
    if (!doc?.gridfsId) return res.status(404).json({ success: false, message: 'Document missing' });
    const fs = getFs('kyc_files');
    const download = fs.openDownloadStream(new ObjectId(String(doc.gridfsId)));
    await writeAudit(req.user.email || '', 'kyc_doc_download', {
      meta: { customer: email, doc: req.params.docKey },
    });
    res.setHeader('Content-Type', doc.contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${doc.filename || req.params.docKey}"`
    );
    download.pipe(res);
  })
);

module.exports = router;
