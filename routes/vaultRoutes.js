const express = require('express');
const { ObjectId } = require('mongodb');
const archiver = require('archiver');
const { requireDb, getFs } = require('../db');
const { protect, requireRoles } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { uploadDoc } = require('../utils/uploads');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router({ mergeParams: true });

function cleanVault(doc) {
  const out = cleanDoc(doc) || {};
  delete out.gridfsId;
  out.id = doc.docId;
  return out;
}

function canAccess(user, caseDoc) {
  if (user.role === 'operations' || user.role === 'admin') return true;
  return normalizeEmail(caseDoc.accountEmail) === normalizeEmail(user.email);
}

router.get(
  '/:caseId/documents',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const caseDoc = await db.collection('cases').findOne({ id: req.params.caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    if (!canAccess(req.user, caseDoc)) return res.status(403).json({ success: false, message: 'Access denied' });
    let rows = (await db.collection('case_documents').find({ caseId: req.params.caseId }).toArray()).map(
      cleanVault
    );
    const q = String(req.query.q || '').toLowerCase();
    if (q.startsWith('status:')) {
      const st = q.split(':')[1].trim();
      rows = rows.filter((r) => (r.status || '').toLowerCase() === st);
    } else if (q) {
      rows = rows.filter((r) => (r.name || '').toLowerCase().includes(q));
    }
    return res.json(rows);
  })
);

router.post(
  '/:caseId/documents/:docId/upload',
  protect,
  uploadDoc.single('file'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const { caseId, docId } = req.params;
    const caseDoc = await db.collection('cases').findOne({ id: caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    if (!canAccess(req.user, caseDoc)) return res.status(403).json({ success: false, message: 'Access denied' });
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const existing = await db.collection('case_documents').findOne({ caseId, docId });
    if (existing?.status === 'verified' && req.user.role === 'customer') {
      return res.status(400).json({ success: false, message: 'Verified document cannot be reuploaded' });
    }
    const fs = getFs('vault_files');
    if (existing?.gridfsId) {
      try {
        await fs.delete(new ObjectId(String(existing.gridfsId)));
      } catch (_) {
        /* ignore */
      }
    }
    const uploadStream = fs.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { caseId, docId },
    });
    await new Promise((resolve, reject) => {
      uploadStream.end(req.file.buffer);
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });
    const sizeKb = Math.max(1, Math.floor(req.file.size / 1024));
    const meta = {
      caseId,
      docId,
      name: req.file.originalname || existing?.name || docId,
      size: `${sizeKb} KB`,
      updated: utcnow().toLocaleString('en-GB', { day: '2-digit', month: 'short' }),
      status: 'review',
      gridfsId: uploadStream.id,
      contentType: req.file.mimetype,
    };
    await db.collection('case_documents').updateOne({ caseId, docId }, { $set: meta }, { upsert: true });
    const saved = await db.collection('case_documents').findOne({ caseId, docId });
    return res.json(cleanVault(saved));
  })
);

router.get(
  '/:caseId/documents/:docId/content',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const { caseId, docId } = req.params;
    const caseDoc = await db.collection('cases').findOne({ id: caseId });
    if (!caseDoc) return res.status(404).json({ success: false, message: 'Case not found' });
    if (!canAccess(req.user, caseDoc)) return res.status(403).json({ success: false, message: 'Access denied' });
    const doc = await db.collection('case_documents').findOne({ caseId, docId });
    if (!doc || doc.status === 'missing' || !doc.gridfsId) {
      return res.status(404).json({ success: false, message: 'Document missing' });
    }
    await writeAudit(req.user.email || '', 'vault_download', { meta: { caseId, docId } });
    res.setHeader('Content-Type', doc.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.name || docId}"`);
    getFs('vault_files').openDownloadStream(new ObjectId(String(doc.gridfsId))).pipe(res);
  })
);

router.post(
  '/:caseId/documents/:docId/approve',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const result = await db.collection('case_documents').updateOne(
      { caseId: req.params.caseId, docId: req.params.docId },
      {
        $set: {
          status: 'verified',
          updated: utcnow().toLocaleString('en-GB', { day: '2-digit', month: 'short' }),
        },
      }
    );
    if (!result.matchedCount) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ status: 'verified' });
  })
);

router.post(
  '/:caseId/documents/:docId/reject',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const reason = req.body?.reason || '';
    const result = await db.collection('case_documents').updateOne(
      { caseId: req.params.caseId, docId: req.params.docId },
      {
        $set: {
          status: 'rejected',
          opsComment: reason,
          updated: utcnow().toLocaleString('en-GB', { day: '2-digit', month: 'short' }),
        },
      }
    );
    if (!result.matchedCount) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ status: 'rejected', opsComment: reason });
  })
);

router.post(
  '/:caseId/documents/:docId/comment',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const text = req.body?.text || '';
    const result = await db.collection('case_documents').updateOne(
      { caseId: req.params.caseId, docId: req.params.docId },
      { $set: { opsComment: text } }
    );
    if (!result.matchedCount) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ opsComment: text });
  })
);

router.get(
  '/:caseId/documents/bundle',
  requireRoles('operations', 'admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const docs = await db
      .collection('case_documents')
      .find({ caseId: req.params.caseId, status: { $ne: 'missing' } })
      .toArray();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.caseId}-docs.zip"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);
    const fs = getFs('vault_files');
    for (const d of docs) {
      if (!d.gridfsId) continue;
      try {
        const stream = fs.openDownloadStream(new ObjectId(String(d.gridfsId)));
        archive.append(stream, { name: d.name || d.docId });
      } catch (_) {
        /* skip */
      }
    }
    await archive.finalize();
  })
);

router.put(
  '/:caseId/document-checklist',
  requireRoles('admin'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const body = Array.isArray(req.body) ? req.body : [];
    for (let i = 0; i < body.length; i += 1) {
      const item = body[i];
      const docId = String(item.id || item.docId || `doc-${i}`);
      await db.collection('case_documents').updateOne(
        { caseId: req.params.caseId, docId },
        {
          $setOnInsert: {
            caseId: req.params.caseId,
            docId,
            status: item.status || 'missing',
            size: item.size || '—',
            updated: item.updated || '—',
          },
          $set: { name: item.name || docId },
        },
        { upsert: true }
      );
    }
    const rows = await db.collection('case_documents').find({ caseId: req.params.caseId }).toArray();
    return res.json(rows.map(cleanVault));
  })
);

module.exports = router;
