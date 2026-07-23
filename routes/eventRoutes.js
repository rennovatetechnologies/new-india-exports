const express = require('express');
const { requireDb, getFs } = require('../db');
const { requireAdmin, requireRoles } = require('../middleware/auth');
const { normalizeEmail, utcnow, cleanDoc } = require('../services/helpers');
const { uploadEventImage } = require('../utils/uploads');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const db = requireDb();
    return res.json((await db.collection('events').find({}).toArray()).map(cleanDoc));
  })
);

router.post(
  '/events',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const eid = req.body?.id || `e${Math.floor(100 + Math.random() * 900)}`;
    const doc = {
      id: eid,
      title: req.body?.title,
      date: req.body?.date || '',
      city: req.body?.city || '',
      img: req.body?.img || '/event.png',
      seats: req.body?.seats || '',
      desc: req.body?.desc || '',
    };
    await db.collection('events').updateOne({ id: eid }, { $set: doc }, { upsert: true });
    return res.json(doc);
  })
);

router.put(
  '/events/:eventId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const doc = {
      id: req.params.eventId,
      title: req.body?.title,
      date: req.body?.date || '',
      city: req.body?.city || '',
      img: req.body?.img || '/event.png',
      seats: req.body?.seats || '',
      desc: req.body?.desc || '',
    };
    await db.collection('events').updateOne({ id: req.params.eventId }, { $set: doc }, { upsert: true });
    return res.json(doc);
  })
);

router.delete(
  '/events/:eventId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const count = await db.collection('events').countDocuments({});
    if (count <= 1) return res.status(400).json({ success: false, message: 'Keep at least one event' });
    await db.collection('events').deleteOne({ id: req.params.eventId });
    return res.json({ ok: true });
  })
);

router.post(
  '/events/:eventId/image',
  requireAdmin,
  uploadEventImage.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const fs = getFs('event_images');
    const uploadStream = fs.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { eventId: req.params.eventId },
    });
    await new Promise((resolve, reject) => {
      uploadStream.end(req.file.buffer);
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });
    const img = `/api/events/${req.params.eventId}/image-file`;
    const db = requireDb();
    await db
      .collection('events')
      .updateOne({ id: req.params.eventId }, { $set: { img, gridfsId: uploadStream.id } });
    return res.json({ img });
  })
);

router.get(
  '/events/registrations/me',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const rows = await db.collection('event_registrations').find({ email }).toArray();
    return res.json(rows.map((r) => ({ eventId: r.eventId, reserved: true })));
  })
);

router.post(
  '/events/:eventId/register',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    if (!(await db.collection('events').findOne({ id: req.params.eventId }))) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    await db.collection('event_registrations').updateOne(
      { email, eventId: req.params.eventId },
      { $set: { email, eventId: req.params.eventId, reserved: true, createdAt: utcnow() } },
      { upsert: true }
    );
    return res.json({ reserved: true, registrationId: `${req.params.eventId}:${email}` });
  })
);

router.post(
  '/workshops/virtual-shipment/register',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    await db.collection('event_registrations').updateOne(
      { email, eventId: 'workshop-virtual-shipment' },
      {
        $set: {
          email,
          eventId: 'workshop-virtual-shipment',
          reserved: true,
          createdAt: utcnow(),
        },
      },
      { upsert: true }
    );
    return res.json({ reserved: true, registrationId: `workshop:${email}` });
  })
);

module.exports = router;
