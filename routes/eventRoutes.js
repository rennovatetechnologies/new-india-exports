const express = require('express');
const { requireDb } = require('../db');
const { requireAdmin, requireRoles, protect, optionalAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { utcnow, cleanDoc, normalizeEmail } = require('../services/helpers');
const { newEventId } = require('../services/ids');
const { uploadEventImage, uploadDoc } = require('../utils/uploads');
const drive = require('../services/drive');
const { actorFromReq, writeAudit } = require('../services/audit');
const { enqueueEmail } = require('../services/mail');
const config = require('../config');
const {
  eventUpsertSchema,
  eventUpdateSchema,
  brochureUpsertSchema,
  brochureUpdateSchema,
  emptyBodySchema,
} = require('../schemas');

const router = express.Router();

function publicEvent(e) {
  if (!e || e.deletedAt) return null;
  const priceInr = Math.round(Number(e.priceInr ?? e.price ?? 0) || 0);
  return {
    id: e.id,
    title: e.title,
    date: e.date || '',
    city: e.city || '',
    img: e.img || '/event.png',
    seats: e.seats || '',
    capacity: e.capacity || e.seats || '',
    desc: e.desc || '',
    priceInr,
  };
}

router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db
      .collection('events')
      .find({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] })
      .toArray();
    return res.json(rows.map(publicEvent).filter(Boolean));
  })
);

router.post(
  '/events',
  requireAdmin,
  validateBody(eventUpsertSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const id = req.body.id || (await newEventId());
    const doc = {
      id,
      title: req.body.title,
      date: req.body.date || '',
      city: req.body.city || '',
      img: req.body.img || '/event.png',
      seats: req.body.seats || '',
      capacity: req.body.capacity || req.body.seats || '',
      desc: req.body.desc || '',
      priceInr: Math.round(Number(req.body.priceInr ?? req.body.price ?? 0) || 0),
      deletedAt: null,
      updatedAt: utcnow(),
      createdAt: utcnow(),
    };
    await db.collection('events').updateOne({ id }, { $set: doc }, { upsert: true });
    return res.json(publicEvent(doc));
  })
);

router.put(
  '/events/:eventId',
  requireAdmin,
  validateBody(eventUpdateSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const id = req.params.eventId;
    const prev = await db.collection('events').findOne({ id });
    if (!prev) return res.status(404).json({ success: false, message: 'Not found' });
    const doc = {
      id,
      title: req.body.title != null ? req.body.title : prev.title,
      date: req.body.date != null ? req.body.date : prev.date,
      city: req.body.city != null ? req.body.city : prev.city,
      img: req.body.img != null ? req.body.img : prev.img,
      seats: req.body.seats != null ? req.body.seats : prev.seats,
      capacity:
        req.body.capacity != null
          ? req.body.capacity
          : req.body.seats != null
            ? req.body.seats
            : prev.capacity || prev.seats,
      desc: req.body.desc != null ? req.body.desc : prev.desc,
      priceInr: Math.round(
        Number(req.body.priceInr ?? req.body.price ?? prev.priceInr ?? 0) || 0
      ),
      deletedAt: prev.deletedAt || null,
      createdAt: prev.createdAt || utcnow(),
      updatedAt: utcnow(),
    };
    await db.collection('events').updateOne({ id }, { $set: doc });
    return res.json(publicEvent(doc));
  })
);

router.delete(
  '/events/:eventId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    await db
      .collection('events')
      .updateOne({ id: req.params.eventId }, { $set: { deletedAt: utcnow() } });
    return res.json({ success: true, ok: true });
  })
);

router.post(
  '/events/:eventId/image',
  requireAdmin,
  uploadEventImage.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const folderId = await drive.ensureBrochureFolder();
    const uploaded = await drive.upload({
      folderId,
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      appProperties: { kind: 'event_image', eventId: req.params.eventId },
    });
    const db = requireDb();
    const img = `/api/files/${uploaded.fileId}/download`;
    await db.collection('events').updateOne(
      { id: req.params.eventId },
      { $set: { img, imageFileId: uploaded.fileId, updatedAt: utcnow() } }
    );
    return res.json({ success: true, img, fileId: uploaded.fileId });
  })
);

router.post(
  '/events/:id/register',
  protect,
  validateBody(emptyBodySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const event = await db.collection('events').findOne({ id: req.params.id });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    const email = normalizeEmail(req.user.email);
    const priceInr = Math.round(Number(event.priceInr ?? 0) || 0);
    if (priceInr > 0) {
      return res.status(402).json({
        success: false,
        code: 'PAYMENT_REQUIRED',
        message: 'Pay via /api/create-order with purpose=event before registering',
        priceInr,
      });
    }
    await db.collection('event_registrations').updateOne(
      { eventId: event.id, email },
      {
        $set: {
          eventId: event.id,
          email,
          name: req.user.name || req.body?.name || '',
          status: 'registered',
          updatedAt: utcnow(),
        },
        $setOnInsert: { createdAt: utcnow() },
      },
      { upsert: true }
    );
    try {
      await enqueueEmail({
        to: email,
        template: 'event.registered',
        vars: { title: event.title },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    return res.json({ success: true, ok: true });
  })
);

router.delete(
  '/events/:id/register',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    await db.collection('event_registrations').deleteOne({ eventId: req.params.id, email });
    try {
      const event = await db.collection('events').findOne({ id: req.params.id });
      await enqueueEmail({
        to: email,
        template: 'event.cancelled',
        vars: { title: event?.title || '' },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    return res.json({ success: true, ok: true });
  })
);

router.get(
  '/me/event-registrations',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const items = await db
      .collection('event_registrations')
      .find({ email: normalizeEmail(req.user.email) })
      .toArray();
    return res.json({ success: true, data: items.map(cleanDoc), items: items.map(cleanDoc) });
  })
);

router.get(
  '/events/registrations/me',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const items = await db
      .collection('event_registrations')
      .find({ email: normalizeEmail(req.user.email) })
      .toArray();
    return res.json(items.map(cleanDoc));
  })
);

// Brochures
router.get(
  '/brochures',
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db
      .collection('brochures')
      .find({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json({
      success: true,
      data: rows.map(cleanDoc),
      items: rows.map(cleanDoc),
    });
  })
);

router.post(
  '/brochures',
  requireRoles('admin', 'operations'),
  uploadDoc.single('file'),
  validateBody(brochureUpsertSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const id = req.body.id || `BR-${Date.now().toString(36).toUpperCase()}`;
    let fileId = null;
    let driveFileId = null;
    if (req.file) {
      const folderId = await drive.ensureBrochureFolder();
      const uploaded = await drive.upload({
        folderId,
        buffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        appProperties: { kind: 'brochure', brochureId: id },
      });
      fileId = uploaded.fileId;
      driveFileId = uploaded.driveFileId;
    }
    const doc = {
      id,
      title: req.body.title || 'Brochure',
      description: req.body.description || '',
      category: req.body.category || '',
      fileId,
      driveFileId,
      fileUrl: fileId ? `/api/files/${fileId}/download` : null,
      createdAt: utcnow(),
      updatedAt: utcnow(),
      deletedAt: null,
    };
    await db.collection('brochures').updateOne({ id }, { $set: doc }, { upsert: true });
    await writeAudit(actorFromReq(req), 'brochure.created', {
      resource: { type: 'brochure', id },
    });
    return res.json({ success: true, data: cleanDoc(doc) });
  })
);

router.put(
  '/brochures/:id',
  requireRoles('admin', 'operations'),
  validateBody(brochureUpdateSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const id = req.params.id;
    const updates = { updatedAt: utcnow() };
    if (req.body.title != null) updates.title = req.body.title;
    if (req.body.description != null) updates.description = req.body.description;
    if (req.body.category != null) updates.category = req.body.category;
    if (req.body.fileUrl != null) updates.fileUrl = req.body.fileUrl;
    await db.collection('brochures').updateOne({ id }, { $set: updates });
    const doc = await db.collection('brochures').findOne({ id });
    return res.json({ success: true, data: cleanDoc(doc) });
  })
);

router.delete(
  '/brochures/:id',
  requireRoles('admin', 'operations'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    await db
      .collection('brochures')
      .updateOne({ id: req.params.id }, { $set: { deletedAt: utcnow() } });
    return res.json({ success: true, ok: true });
  })
);

router.get(
  '/brochures/:id/file',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = await db.collection('brochures').findOne({ id: req.params.id });
    if (!doc?.fileId && !doc?.driveFileId) {
      return res.status(404).json({ success: false, message: 'No file' });
    }
    const { stream, mimeType, fileName } = await drive.downloadStream(doc.fileId || doc.driveFileId);
    res.setHeader('Content-Type', mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName || 'brochure.pdf'}"`);
    stream.pipe(res);
  })
);

module.exports = router;
