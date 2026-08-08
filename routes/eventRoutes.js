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
  eventNotifySchema,
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

function publicRegistration(r) {
  if (!r) return null;
  return {
    id: r.id || `${r.eventId}:${r.email}`,
    eventId: r.eventId,
    email: r.email,
    name: r.name || '',
    company: r.company || '',
    status: r.status || 'registered',
    paymentId: r.paymentId || null,
    at: r.createdAt || r.updatedAt || null,
    createdAt: r.createdAt || null,
    updatedAt: r.updatedAt || null,
  };
}

function notifyTemplateForKind(kind) {
  if (kind === 'reschedule') return 'event.rescheduled';
  if (kind === 'followup') return 'event.followup';
  return 'event.update';
}

function eventFieldsChanged(prev, next) {
  const keys = ['title', 'date', 'city', 'desc', 'priceInr', 'capacity', 'seats'];
  for (const k of keys) {
    const a = prev?.[k] == null ? '' : String(prev[k]);
    const b = next?.[k] == null ? '' : String(next[k]);
    if (a !== b) return true;
  }
  return false;
}

function buildUpdateMessage(prev, next) {
  const lines = ['This event was updated:'];
  if (String(prev.title || '') !== String(next.title || '')) {
    lines.push(`• Title: ${prev.title || '—'} → ${next.title || '—'}`);
  }
  if (String(prev.date || '') !== String(next.date || '')) {
    lines.push(`• Date: ${prev.date || '—'} → ${next.date || '—'}`);
  }
  if (String(prev.city || '') !== String(next.city || '')) {
    lines.push(`• City: ${prev.city || '—'} → ${next.city || '—'}`);
  }
  if (String(prev.desc || '') !== String(next.desc || '')) {
    lines.push('• Description was updated.');
  }
  const prevPrice = Math.round(Number(prev.priceInr ?? 0) || 0);
  const nextPrice = Math.round(Number(next.priceInr ?? 0) || 0);
  if (prevPrice !== nextPrice) {
    lines.push(`• Price: ₹${prevPrice} → ₹${nextPrice}`);
  }
  if (lines.length === 1) lines.push('• Event details were refreshed.');
  return lines.join('\n');
}

async function resolveNotifyRecipients(db, { eventId, emails, notifyAllUsers }) {
  let recipients = await db
    .collection('event_registrations')
    .find({ eventId, status: { $ne: 'cancelled' } })
    .toArray();

  const subset = Array.isArray(emails)
    ? emails.map((e) => normalizeEmail(e)).filter(Boolean)
    : null;
  if (subset?.length) {
    const allow = new Set(subset);
    recipients = recipients.filter((r) => allow.has(normalizeEmail(r.email)));
  }

  if (notifyAllUsers) {
    const users = await db
      .collection('users')
      .find({
        role: 'customer',
        status: { $nin: ['Suspended', 'suspended', 'disabled'] },
      })
      .project({ email: 1, name: 1, fullName: 1 })
      .toArray();
    const byEmail = new Map();
    for (const r of recipients) {
      const email = normalizeEmail(r.email);
      if (!email) continue;
      byEmail.set(email, {
        email,
        name: r.name || '',
        company: r.company || '',
      });
    }
    for (const u of users) {
      const email = normalizeEmail(u.email);
      if (!email || byEmail.has(email)) continue;
      byEmail.set(email, {
        email,
        name: u.name || u.fullName || '',
        company: '',
      });
    }
    recipients = [...byEmail.values()];
  }

  return recipients;
}

async function sendEventNotifications({
  db,
  event,
  kind = 'update',
  message,
  subject,
  newDate = '',
  newCity = '',
  emails,
  notifyAllUsers = false,
  actor,
}) {
  const recipients = await resolveNotifyRecipients(db, {
    eventId: event.id,
    emails,
    notifyAllUsers,
  });

  if (!recipients.length) {
    return { ok: false, code: 'NO_RECIPIENTS', recipientCount: 0 };
  }

  const template = notifyTemplateForKind(kind);
  const subjectOverride = String(subject || '').trim();
  const msg = String(message || '').trim();
  const queued = [];

  for (const r of recipients) {
    try {
      const result = await enqueueEmail({
        to: r.email,
        template,
        subject: subjectOverride || undefined,
        vars: {
          name: r.name || '',
          title: event.title,
          date: event.date || '',
          city: event.city || '',
          newDate: newDate || event.date || '',
          newCity: newCity || event.city || '',
          message: msg,
          kind,
        },
        actor,
      });
      queued.push({ email: r.email, outboxId: result?.outboxId });
    } catch (_) {
      queued.push({ email: r.email, outboxId: null, error: true });
    }
  }

  const commId = `EC-${Date.now().toString(36).toUpperCase()}`;
  const communication = {
    id: commId,
    eventId: event.id,
    kind,
    template,
    subject: subjectOverride || null,
    message: msg,
    newDate: newDate || null,
    newCity: newCity || null,
    notifyAllUsers: Boolean(notifyAllUsers),
    recipientCount: recipients.length,
    recipients: recipients.map((r) => ({
      email: r.email,
      name: r.name || '',
    })),
    sentBy: {
      email: actor?.email || '',
      role: actor?.role || '',
    },
    createdAt: utcnow(),
  };
  await db.collection('event_communications').insertOne(communication);
  await writeAudit(actor, 'event.notified', {
    resource: { type: 'event', id: event.id },
    meta: {
      kind,
      communicationId: commId,
      recipientCount: recipients.length,
      notifyAllUsers: Boolean(notifyAllUsers),
    },
  });

  return {
    ok: true,
    id: commId,
    kind,
    recipientCount: recipients.length,
    queued: queued.length,
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
    await writeAudit(actorFromReq(req), 'event.upserted', {
      resource: { type: 'event', id },
      meta: { title: doc.title },
    });
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
    await writeAudit(actorFromReq(req), 'event.updated', {
      resource: { type: 'event', id },
      before: { title: prev.title, date: prev.date, city: prev.city },
      after: { title: doc.title, date: doc.date, city: doc.city },
    });

    let notified = null;
    if (eventFieldsChanged(prev, doc)) {
      const dateChanged = String(prev.date || '') !== String(doc.date || '');
      const cityChanged = String(prev.city || '') !== String(doc.city || '');
      const kind = dateChanged || cityChanged ? 'reschedule' : 'update';
      try {
        notified = await sendEventNotifications({
          db,
          event: doc,
          kind,
          message: buildUpdateMessage(prev, doc),
          newDate: dateChanged ? doc.date || '' : '',
          newCity: cityChanged ? doc.city || '' : '',
          notifyAllUsers: false,
          actor: actorFromReq(req),
        });
      } catch (_) {
        notified = { ok: false };
      }
    }

    return res.json({
      ...publicEvent(doc),
      notified:
        notified?.ok
          ? { recipientCount: notified.recipientCount, communicationId: notified.id }
          : null,
    });
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
    await writeAudit(actorFromReq(req), 'event.deleted', {
      resource: { type: 'event', id: req.params.eventId },
    });
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
          company: req.body?.company || '',
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
        vars: {
          title: event.title,
          date: event.date || '',
          city: event.city || '',
          name: req.user.name || '',
        },
        actor: actorFromReq(req),
      });
    } catch (_) {}
    await writeAudit(actorFromReq(req), 'event.registered', {
      resource: { type: 'event', id: event.id },
      meta: { email },
    });
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
    await writeAudit(actorFromReq(req), 'event.unregistered', {
      resource: { type: 'event', id: req.params.id },
      meta: { email },
    });
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
    const mapped = items.map(publicRegistration).filter(Boolean);
    return res.json({ success: true, data: mapped, items: mapped });
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
    return res.json(items.map(publicRegistration).filter(Boolean));
  })
);

/** Staff: registration counts for catalog cards */
router.get(
  '/events/registration-counts',
  requireRoles('admin', 'operations'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const rows = await db
      .collection('event_registrations')
      .aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: '$eventId', count: { $sum: 1 } } },
      ])
      .toArray();
    const counts = {};
    for (const row of rows) {
      if (row._id) counts[row._id] = row.count;
    }
    return res.json({ success: true, data: counts, counts });
  })
);

/** Staff: list all registrants for an event */
router.get(
  '/events/:id/registrations',
  requireRoles('admin', 'operations'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const event = await db.collection('events').findOne({ id: req.params.id });
    if (!event || event.deletedAt) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const items = await db
      .collection('event_registrations')
      .find({ eventId: req.params.id, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .toArray();
    const mapped = items.map(publicRegistration).filter(Boolean);
    return res.json({
      success: true,
      data: mapped,
      items: mapped,
      count: mapped.length,
      event: publicEvent(event),
    });
  })
);

/** Staff: email registrants (and optionally all customers) */
router.post(
  '/events/:id/notify',
  requireRoles('admin', 'operations'),
  validateBody(eventNotifySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const event = await db.collection('events').findOne({ id: req.params.id });
    if (!event || event.deletedAt) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const kind = req.body.kind || 'update';
    const message = String(req.body.message || '').trim();
    const newDate = String(req.body.newDate || '').trim();
    const newCity = String(req.body.newCity || '').trim();
    const subjectOverride = String(req.body.subject || '').trim();
    const notifyAllUsers = Boolean(req.body.notifyAllUsers);

    if (kind === 'reschedule' && (newDate || newCity)) {
      const updates = { updatedAt: utcnow() };
      if (newDate) updates.date = newDate;
      if (newCity) updates.city = newCity;
      await db.collection('events').updateOne({ id: event.id }, { $set: updates });
      if (newDate) event.date = newDate;
      if (newCity) event.city = newCity;
    }

    const result = await sendEventNotifications({
      db,
      event,
      kind,
      message,
      subject: subjectOverride,
      newDate,
      newCity,
      emails: req.body.emails,
      notifyAllUsers,
      actor: actorFromReq(req),
    });

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: notifyAllUsers
          ? 'No users to notify'
          : 'No matching registrants to notify',
      });
    }

    return res.json({
      success: true,
      data: {
        id: result.id,
        kind: result.kind,
        recipientCount: result.recipientCount,
        queued: result.queued,
        notifyAllUsers,
      },
    });
  })
);

/** Staff: past communications for an event */
router.get(
  '/events/:id/communications',
  requireRoles('admin', 'operations'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const items = await db
      .collection('event_communications')
      .find({ eventId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return res.json({
      success: true,
      data: items.map(cleanDoc),
      items: items.map(cleanDoc),
    });
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
