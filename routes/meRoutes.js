const express = require('express');
const { ObjectId } = require('mongodb');
const { requireDb, getFs } = require('../db');
const { protect, requireRoles } = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validate');
const { normalizeEmail, utcnow } = require('../services/helpers');
const { uploadAvatar } = require('../utils/uploads');
const { asyncHandler } = require('../utils/asyncHandler');
const drive = require('../services/drive');
const {
  profileUpdateSchema,
  companyUpdateSchema,
  teamInviteSchema,
  notificationPrefsSchema,
  objectIdParamSchema,
} = require('../schemas');

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
  validateBody(profileUpdateSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const updates = {};
    const name = req.body.fullName || req.body.name;
    if (name != null) updates.name = name;
    if (req.body.designation != null) updates.designation = req.body.designation;
    if (req.body.phone != null) updates.phone = req.body.phone;
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
    const folderId = await drive.ensureProfileFolder(email);
    const uploaded = await drive.upload({
      folderId,
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      appProperties: { kind: 'avatar', uploadedBy: email, role: req.user.role },
    });
    const url = '/api/me/avatar-file';
    const db = requireDb();
    const prev = await db.collection('users').findOne({ email });
    if (prev?.avatarFileId) {
      try {
        await drive.trash(prev.avatarFileId);
      } catch (_) {}
    }
    await db.collection('users').updateOne(
      { email },
      { $set: { avatarUrl: url, avatarFileId: uploaded.fileId }, $unset: { avatarGridId: '' } }
    );
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
    if (u.avatarFileId) {
      const { stream, mimeType } = await drive.downloadStream(u.avatarFileId);
      res.setHeader('Content-Type', mimeType || 'image/png');
      stream.pipe(res);
      return;
    }
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
  validateBody(companyUpdateSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const companyProfile = {
      legalEntity: req.body.legalEntity || '',
      gstin: req.body.gstin || '',
      iec: req.body.iec || '',
      adCode: req.body.adCode || '',
      registeredAddress: req.body.registeredAddress || '',
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
  validateBody(teamInviteSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const u = (await db.collection('users').findOne({ email })) || {};
    const team = Array.isArray(u.team)
      ? [...u.team]
      : [{ id: 'self', name: u.name, email, role: 'Owner' }];
    const inviteEmail = req.body.email;
    if (team.some((m) => normalizeEmail(m.email) === inviteEmail)) {
      return res.status(409).json({
        success: false,
        code: 'already_invited',
        message: 'This email is already on the team',
      });
    }
    const invite = {
      id: String(Math.random()).slice(2, 10),
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      role: req.body.role || 'Viewer',
      status: 'invited',
      invitedAt: utcnow(),
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
    const { mergePrefs, publicChannelFlags } = require('../services/notify/prefs');
    return res.json({
      ...mergePrefs(u.notificationPrefs),
      channels: publicChannelFlags(),
      phone: u.phone || '',
    });
  })
);

router.put(
  '/me/notifications',
  protect,
  validateBody(notificationPrefsSchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email);
    const { mergePrefs, publicChannelFlags } = require('../services/notify/prefs');
    const current = (await db.collection('users').findOne({ email })) || {};
    const patch = {};
    for (const key of ['workflow', 'billing', 'weekly', 'marketing', 'email', 'whatsapp']) {
      if (typeof req.body[key] === 'boolean') patch[key] = req.body[key];
    }
    const prefs = mergePrefs({
      ...current.notificationPrefs,
      ...patch,
    });
    await db.collection('users').updateOne({ email }, { $set: { notificationPrefs: prefs } });
    return res.json({ ...prefs, channels: publicChannelFlags(), phone: current.phone || '' });
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
        body: r.body || '',
        type: r.type || '',
        kind: r.kind || '',
        href: r.href || '/dashboard/events',
        read: Boolean(r.read),
        createdAt: r.createdAt,
      }))
    );
  })
);

router.post(
  '/notifications/:notifId/read',
  protect,
  validateParams(objectIdParamSchema('notifId')),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    await db
      .collection('notifications')
      .updateOne({ _id: new ObjectId(req.params.notifId) }, { $set: { read: true } });
    return res.json({ ok: true });
  })
);

module.exports = router;
