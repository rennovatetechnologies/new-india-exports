const express = require('express');
const { optionalAuth, protect, requireAdmin } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { actorFromReq } = require('../services/audit');
const community = require('../services/community');
const {
  communitySettingsSchema,
  communityPostSchema,
  communityPostUpdateSchema,
} = require('../schemas');

const router = express.Router();

router.get(
  '/community/access',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const settings = community.publicSettings(await community.getSettings());
    if (!req.user || req.user.role !== 'customer') {
      return res.json({
        success: true,
        data: {
          settings,
          active: req.user?.role === 'admin' || req.user?.role === 'operations',
          required: settings.required && req.user?.role === 'customer',
          source: req.user ? 'staff' : 'none',
        },
        settings,
      });
    }
    const access = await community.getAccessForEmail(req.user.email);
    return res.json({
      success: true,
      data: access,
      ...access,
    });
  })
);

router.put(
  '/community/settings',
  requireAdmin,
  validateBody(communitySettingsSchema),
  asyncHandler(async (req, res) => {
    const settings = await community.saveSettings(req.body, { actor: actorFromReq(req) });
    return res.json({ success: true, data: settings, settings });
  })
);

router.get(
  '/community/posts',
  protect,
  asyncHandler(async (req, res) => {
    const isStaff = req.user.role === 'admin' || req.user.role === 'operations';
    if (!isStaff) {
      const ok = await community.requireCustomerCommunity(req, res);
      if (!ok) return;
    }
    const kind = req.query.kind === 'upcoming' || req.query.kind === 'update' ? req.query.kind : undefined;
    const items = await community.listPosts({
      includeUnpublished: isStaff,
      kind,
    });
    return res.json({ success: true, data: items, items });
  })
);

router.post(
  '/community/posts',
  requireAdmin,
  validateBody(communityPostSchema),
  asyncHandler(async (req, res) => {
    const doc = await community.createPost(req.body, { actor: actorFromReq(req) });
    return res.status(201).json({ success: true, data: doc });
  })
);

router.put(
  '/community/posts/:id',
  requireAdmin,
  validateBody(communityPostUpdateSchema),
  asyncHandler(async (req, res) => {
    const doc = await community.updatePost(req.params.id, req.body, { actor: actorFromReq(req) });
    return res.json({ success: true, data: doc });
  })
);

router.delete(
  '/community/posts/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const doc = await community.deletePost(req.params.id, { actor: actorFromReq(req) });
    return res.json({ success: true, data: doc });
  })
);

module.exports = router;
