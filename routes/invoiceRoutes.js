const express = require('express');
const { requireDb } = require('../db');
const { protect } = require('../middleware/auth');
const { idempotency } = require('../middleware/idempotency');
const { validateQuery, validateParams } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { actorFromReq } = require('../services/audit');
const { resendInvoiceEmail, invoiceListItem, renderInvoicePdf } = require('../services/invoices');
const { normalizeEmail, cleanDoc } = require('../services/helpers');
const { invoiceListQuerySchema, idParamSchema } = require('../schemas');

const router = express.Router();

router.get(
  '/invoices',
  protect,
  validateQuery(invoiceListQuerySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const page = req.query.page;
    const limit = req.query.limit;
    const query = {};
    if (req.user.role === 'customer') {
      query['customer.email'] = normalizeEmail(req.user.email);
    } else {
      if (req.query.email) query['customer.email'] = req.query.email;
      if (req.query.caseId) query.caseId = String(req.query.caseId);
      if (req.query.paymentId) query.paymentId = String(req.query.paymentId);
    }
    const total = await db.collection('invoices').countDocuments(query);
    const items = await db
      .collection('invoices')
      .find(query)
      .sort({ issuedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();
    return res.json({
      success: true,
      data: { items: items.map(invoiceListItem), page, limit, total },
      items: items.map(invoiceListItem),
      page,
      limit,
      total,
    });
  })
);

router.get(
  '/invoices/:invoiceId',
  protect,
  validateParams(idParamSchema('invoiceId')),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const inv = await db.collection('invoices').findOne({ id: req.params.invoiceId });
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    if (
      req.user.role === 'customer' &&
      normalizeEmail(inv.customer?.email) !== normalizeEmail(req.user.email)
    ) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return res.json({ success: true, data: cleanDoc(inv) });
  })
);

router.get(
  '/invoices/:invoiceId/pdf',
  protect,
  validateParams(idParamSchema('invoiceId')),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const inv = await db.collection('invoices').findOne({ id: req.params.invoiceId });
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    if (
      req.user.role === 'customer' &&
      normalizeEmail(inv.customer?.email) !== normalizeEmail(req.user.email)
    ) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const fileName = inv.pdf?.fileName || `${inv.invoiceNumber.replace(/\//g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // Always render on the fly — invoices are not stored on Drive.
    const buf = await renderInvoicePdf(inv);
    return res.send(buf);
  })
);

router.post(
  '/invoices/:invoiceId/email',
  protect,
  validateParams(idParamSchema('invoiceId')),
  idempotency({ required: false }),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const inv = await db.collection('invoices').findOne({ id: req.params.invoiceId });
    if (!inv) return res.status(404).json({ success: false, message: 'Not found' });
    if (
      req.user.role === 'customer' &&
      normalizeEmail(inv.customer?.email) !== normalizeEmail(req.user.email)
    ) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const result = await resendInvoiceEmail(inv.id, { actor: actorFromReq(req) });
    return res.json({ success: true, data: result, message: 'Invoice email queued' });
  })
);

module.exports = router;
