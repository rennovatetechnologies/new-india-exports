const express = require('express');
const { ObjectId } = require('mongodb');
const { requireDb, getFs } = require('../db');
const { protect, requireRoles } = require('../middleware/auth');
const { normalizeEmail, utcnow } = require('../services/helpers');
const { uploadAvatar } = require('../utils/uploads');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/me/profile',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const u = (await db.collection('users').findOne({ email })) || {};
    return res.json({
      fullName: u.name || '',
      designation: u.designation || '',
      email,
      phone: u.phone || '',
      avatarUrl: u.avatarUrl || '',
    });
  })
);

router.put(
  '/me/profile',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const updates = {};
    const name = req.body?.fullName || req.body?.name;
    if (name != null) updates.name = name;
    if (req.body?.designation != null) updates.designation = req.body.designation;
    if (req.body?.phone != null) updates.phone = req.body.phone;
    if (Object.keys(updates).length) await db.collection('users').updateOne({ email }, { $set: updates });
    const u = (await db.collection('users').findOne({ email })) || {};
    return res.json({
      fullName: u.name || '',
      designation: u.designation || '',
      email,
      phone: u.phone || '',
      avatarUrl: u.avatarUrl || '',
    });
  })
);

router.post(
  '/me/avatar',
  protect,
  uploadAvatar.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'File required' });
    const email = normalizeEmail(req.user.email);
    const fs = getFs('avatars');
    const uploadStream = fs.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { email },
    });
    await new Promise((resolve, reject) => {
      uploadStream.end(req.file.buffer);
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });
    const url = '/api/me/avatar-file';
    await requireDb()
      .collection('users')
      .updateOne({ email }, { $set: { avatarUrl: url, avatarGridId: uploadStream.id } });
    return res.json({ avatarUrl: url });
  })
);

router.get(
  '/me/avatar-file',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const u = (await db.collection('users').findOne({ email })) || {};
    if (!u.avatarGridId) return res.status(404).json({ success: false, message: 'No avatar' });
    res.setHeader('Content-Type', 'image/png');
    getFs('avatars').openDownloadStream(new ObjectId(String(u.avatarGridId))).pipe(res);
  })
);

router.get(
  '/me/company',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const u = (await db.collection('users').findOne({ email })) || {};
    const c = u.companyProfile || {};
    return res.json({
      legalEntity: c.legalEntity || u.company || '',
      gstin: c.gstin || '',
      iec: c.iec || '',
      adCode: c.adCode || '',
      registeredAddress: c.registeredAddress || '',
    });
  })
);

router.put(
  '/me/company',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const companyProfile = {
      legalEntity: req.body?.legalEntity || '',
      gstin: req.body?.gstin || '',
      iec: req.body?.iec || '',
      adCode: req.body?.adCode || '',
      registeredAddress: req.body?.registeredAddress || '',
    };
    await db
      .collection('users')
      .updateOne({ email }, { $set: { companyProfile, company: companyProfile.legalEntity } });
    return res.json(companyProfile);
  })
);

router.get(
  '/me/team',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const u = (await db.collection('users').findOne({ email })) || {};
    return res.json(
      u.team || [{ id: 'self', name: u.name, email, role: 'Owner' }]
    );
  })
);

router.post(
  '/me/team/invites',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const u = (await db.collection('users').findOne({ email })) || {};
    const team = Array.isArray(u.team)
      ? [...u.team]
      : [{ id: 'self', name: u.name, email, role: 'Owner' }];
    const invite = {
      id: String(Math.random()).slice(2, 10),
      name: String(req.body?.email || '').split('@')[0],
      email: normalizeEmail(req.body?.email),
      role: req.body?.role || 'Viewer',
      status: 'invited',
    };
    team.push(invite);
    await db.collection('users').updateOne({ email }, { $set: { team } });
    return res.json(invite);
  })
);

router.delete(
  '/me/team/:memberId',
  requireRoles('customer'),
  asyncHandler(async (req, res) => {
    if (req.params.memberId === 'self') {
      return res.status(400).json({ success: false, message: 'Cannot remove owner' });
    }
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const u = (await db.collection('users').findOne({ email })) || {};
    const team = (u.team || []).filter((m) => m.id !== req.params.memberId);
    await db.collection('users').updateOne({ email }, { $set: { team } });
    return res.json({ ok: true });
  })
);

router.get(
  '/me/notifications',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const u = (await db.collection('users').findOne({ email })) || {};
    return res.json(
      u.notificationPrefs || { workflow: true, billing: true, weekly: false, marketing: false }
    );
  })
);

router.put(
  '/me/notifications',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const prefs = {
      workflow: Boolean(req.body?.workflow),
      billing: Boolean(req.body?.billing),
      weekly: Boolean(req.body?.weekly),
      marketing: Boolean(req.body?.marketing),
    };
    await db.collection('users').updateOne({ email }, { $set: { notificationPrefs: prefs } });
    return res.json(prefs);
  })
);

router.get(
  '/notifications',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const rows = await db
      .collection('notifications')
      .find({ email })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return res.json(
      rows.map((r) => ({
        id: String(r._id),
        title: r.title,
        read: Boolean(r.read),
        createdAt: r.createdAt,
      }))
    );
  })
);

router.post(
  '/notifications/:notifId/read',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    try {
      await db
        .collection('notifications')
        .updateOne({ _id: new ObjectId(req.params.notifId) }, { $set: { read: true } });
    } catch (_) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    return res.json({ ok: true });
  })
);

module.exports = router;
