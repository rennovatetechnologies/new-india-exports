const express = require('express');
const { protect } = require('../middleware/auth');
const { validateParams } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { requireDb } = require('../db');
const drive = require('../services/drive');
const cases = require('../services/cases');
const { normalizeEmail } = require('../services/helpers');
const { idParamSchema } = require('../schemas');

const router = express.Router();

async function authorizeFile(req, fileMeta) {
  if (!fileMeta) return false;
  if (req.user.role === 'admin') return true;
  const props = fileMeta.appProperties || {};
  if (props.uploadedBy && normalizeEmail(props.uploadedBy) === normalizeEmail(req.user.email)) {
    return true;
  }
  if (props.caseId) {
    const c = await cases.getCaseById(props.caseId);
    if (!c) return false;
    if (req.user.role === 'operations') return true;
    return cases.canAccessCase(req.user, c);
  }
  if (props.invoiceId) {
    const db = requireDb();
    const inv = await db.collection('invoices').findOne({ id: props.invoiceId });
    if (!inv) return false;
    if (req.user.role === 'operations') return true;
    return normalizeEmail(inv.customer?.email) === normalizeEmail(req.user.email);
  }
  if (props.kind === 'brochure') return true;
  return false;
}

router.get(
  '/files/:fileId/download',
  protect,
  validateParams(idParamSchema('fileId')),
  asyncHandler(async (req, res) => {
    const meta = await drive.getFileMeta(req.params.fileId);
    if (!meta) return res.status(404).json({ success: false, message: 'File not found' });
    const ok = await authorizeFile(req, meta);
    if (!ok) return res.status(403).json({ success: false, message: 'Forbidden' });
    const { stream, mimeType, fileName } = await drive.downloadStream(meta.id);
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    const inline = String(req.query.inline || '') === '1' || String(req.query.disposition || '') === 'inline';
    const safeName = String(fileName || 'download').replace(/"/g, '');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`
    );
    stream.pipe(res);
  })
);

module.exports = router;
