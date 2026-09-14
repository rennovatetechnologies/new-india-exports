const { requireDb, getDb } = require('../../db');
const { utcnow, normalizeEmail, cleanDoc } = require('../helpers');
const { computeGst } = require('../gst');
const { writeAudit } = require('../audit');
const { newUpdateId } = require('../ids');

const CONFIG_KEY = 'community_access';

const DEFAULT_BENEFITS = [
  'Chat with the VIRASTRA desk',
  'Register for free events',
  'Product and policy updates',
  'Upcoming features as they launch',
];

const DEFAULT_SETTINGS = {
  enabled: true,
  title: 'Community access',
  tagline: 'Chat, free events, updates, and upcoming features — no documentation plan required.',
  priceInr: 129,
  validityDays: 365,
  benefits: DEFAULT_BENEFITS,
};

function clampInt(raw, min, max, fallback) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const benefits = Array.isArray(src.benefits)
    ? src.benefits.map((b) => String(b || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  return {
    enabled: src.enabled !== false,
    title: String(src.title || DEFAULT_SETTINGS.title).trim() || DEFAULT_SETTINGS.title,
    tagline: String(src.tagline || DEFAULT_SETTINGS.tagline).trim() || DEFAULT_SETTINGS.tagline,
    priceInr: clampInt(src.priceInr, 0, 1_000_000, DEFAULT_SETTINGS.priceInr),
    validityDays: clampInt(src.validityDays, 1, 3650, DEFAULT_SETTINGS.validityDays),
    benefits: benefits.length ? benefits : [...DEFAULT_BENEFITS],
  };
}

function publicSettings(settings) {
  const s = normalizeSettings(settings);
  const amounts = computeGst(s.priceInr);
  return {
    ...s,
    amounts,
    totalInr: amounts.total,
    required: s.enabled && s.priceInr > 0,
  };
}

async function getSettings() {
  const db = getDb();
  if (!db) return normalizeSettings(DEFAULT_SETTINGS);
  const row = await db.collection('config').findOne({ key: CONFIG_KEY });
  return normalizeSettings(row?.value || DEFAULT_SETTINGS);
}

async function saveSettings(patch, { actor } = {}) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...(patch || {}) });
  const db = requireDb();
  await db.collection('config').updateOne(
    { key: CONFIG_KEY },
    { $set: { key: CONFIG_KEY, value: next, updatedAt: utcnow() } },
    { upsert: true }
  );
  if (actor) {
    await writeAudit(actor, 'community.settings_updated', {
      resource: { type: 'config', id: CONFIG_KEY },
      meta: { priceInr: next.priceInr, enabled: next.enabled, validityDays: next.validityDays },
    });
  }
  return publicSettings(next);
}

function planEntitlementActive(caseDoc, at = utcnow()) {
  if (!caseDoc || caseDoc.paymentStatus !== 'paid' || !caseDoc.paidPlanId) return false;
  if (!caseDoc.planExpiresAt) return true;
  const expires = new Date(caseDoc.planExpiresAt);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() > new Date(at).getTime();
}

function communityPassActive(userDoc, at = utcnow()) {
  const expires = userDoc?.communityAccessExpiresAt;
  if (!expires) return false;
  const d = new Date(expires);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > new Date(at).getTime();
}

async function loadUser(email) {
  const db = getDb();
  if (!db) return null;
  return db.collection('users').findOne({ email: normalizeEmail(email) });
}

/**
 * Resolve whether a customer can use community surfaces (chat, free events, updates).
 * Documentation plans include community access for the plan year.
 * If the admin disables the fee or sets ₹0, every signed-in customer is entitled.
 */
async function resolveAccess({ email, caseDoc, userDoc, settings } = {}) {
  const s = publicSettings(settings || (await getSettings()));
  const user = userDoc || (email ? await loadUser(email) : null);
  const now = utcnow();
  const passActive = communityPassActive(user, now);
  const planActive = planEntitlementActive(caseDoc, now);
  const freeForAll = !s.required;
  const active = Boolean(freeForAll || passActive || planActive);

  let source = 'none';
  let expiresAt = null;
  if (planActive) {
    source = 'plan';
    expiresAt = caseDoc?.planExpiresAt || null;
  }
  if (passActive) {
    const passExp = user.communityAccessExpiresAt;
    if (!expiresAt || new Date(passExp).getTime() > new Date(expiresAt).getTime()) {
      source = planActive ? 'plan' : 'community';
      expiresAt = passExp;
    }
  }
  if (freeForAll && !passActive && !planActive) {
    source = s.enabled ? 'complimentary' : 'disabled';
    expiresAt = null;
  }

  return {
    active,
    required: s.required && !active,
    source,
    paidAt: user?.communityAccessPaidAt || null,
    expiresAt,
    paymentId: user?.communityAccessPaymentId || null,
    settings: s,
  };
}

function caseFieldsFromAccess(access) {
  return {
    communityAccessActive: Boolean(access?.active),
    communityAccessRequired: Boolean(access?.required),
    communityAccessSource: access?.source || 'none',
    communityAccessPaidAt: access?.paidAt || null,
    communityAccessExpiresAt: access?.expiresAt || null,
  };
}

async function accessSnapshotForCase(caseDoc) {
  const access = await resolveAccess({
    email: caseDoc?.customerEmail,
    caseDoc,
  });
  return caseFieldsFromAccess(access);
}

async function getAccessForEmail(email, caseDoc) {
  let c = caseDoc;
  if (!c && email) {
    try {
      const cases = require('../cases');
      c = await cases.getCaseByEmail(email);
    } catch (_) {
      c = null;
    }
  }
  return resolveAccess({ email, caseDoc: c });
}

function addValidityDays(fromDate, days) {
  const d = new Date(fromDate);
  if (Number.isNaN(d.getTime())) {
    const fallback = utcnow();
    fallback.setUTCDate(fallback.getUTCDate() + Number(days || 365));
    return fallback;
  }
  d.setUTCDate(d.getUTCDate() + Number(days || 365));
  return d;
}

async function grantAccess(email, { paymentId, amountPaid, validityDays, expiresAt, source } = {}, { actor } = {}) {
  const emailN = normalizeEmail(email);
  if (!emailN) {
    const err = new Error('Customer email required');
    err.status = 400;
    throw err;
  }
  const settings = await getSettings();
  const db = requireDb();
  const user = await db.collection('users').findOne({ email: emailN });
  const now = utcnow();
  const days = Number(validityDays) || settings.validityDays;
  let start = now;
  if (communityPassActive(user, now) && user.communityAccessExpiresAt) {
    start = new Date(user.communityAccessExpiresAt);
  }
  let nextExpiry = expiresAt ? new Date(expiresAt) : addValidityDays(start, days);
  if (user?.communityAccessExpiresAt) {
    const existing = new Date(user.communityAccessExpiresAt);
    if (!Number.isNaN(existing.getTime()) && existing.getTime() > nextExpiry.getTime()) {
      nextExpiry = existing;
    }
  }
  const paidAt = user?.communityAccessPaidAt || now;

  await db.collection('users').updateOne(
    { email: emailN },
    {
      $set: {
        communityAccessPaidAt: paidAt,
        communityAccessExpiresAt: nextExpiry,
        communityAccessPaymentId: paymentId || user?.communityAccessPaymentId || null,
        communityAccessAmountPaid:
          (Number(user?.communityAccessAmountPaid) || 0) + (Number(amountPaid) || 0),
        communityAccessSource: source || 'community',
        updatedAt: now,
      },
    }
  );

  try {
    const cases = require('../cases');
    const caseDoc = await db.collection('customer_cases').findOne({
      customerEmail: emailN,
      status: { $ne: 'closed' },
    });
    if (caseDoc && !caseDoc.opsEmail) {
      const o = await cases.pickDefaultOps();
      await cases.updateCase(
        caseDoc.id,
        { opsEmail: o.email, opsName: o.name },
        { actor }
      );
    }
  } catch (_) {}

  if (actor) {
    await writeAudit(actor, 'community.access_granted', {
      resource: { type: 'user', id: emailN },
      meta: { paymentId, expiresAt: nextExpiry, source: source || 'community' },
      tone: 'success',
    });
  }

  return getAccessForEmail(emailN);
}

async function grantFromPlan(email, { expiresAt, paymentId } = {}, { actor } = {}) {
  return grantAccess(
    email,
    { paymentId, expiresAt, source: 'plan' },
    { actor }
  );
}

function denyCommunity(res, access, message) {
  const s = access?.settings || publicSettings(DEFAULT_SETTINGS);
  return res.status(402).json({
    success: false,
    code: 'COMMUNITY_ACCESS_REQUIRED',
    message: message || 'Community access is required for this feature',
    priceInr: s.priceInr,
    totalInr: s.totalInr,
    amounts: s.amounts,
    title: s.title,
    validityDays: s.validityDays,
  });
}

async function requireCustomerCommunity(req, res) {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Sign in required' });
    return false;
  }
  if (req.user.role === 'admin' || req.user.role === 'operations') return true;
  const access = await getAccessForEmail(req.user.email);
  if (access.active) return true;
  denyCommunity(res, access);
  return false;
}

function publicPost(doc) {
  if (!doc) return null;
  const { _id, ...rest } = cleanDoc(doc);
  return rest;
}

async function listPosts({ includeUnpublished = false, kind } = {}) {
  const db = getDb();
  if (!db) return [];
  const query = {};
  if (!includeUnpublished) query.published = true;
  if (kind === 'update' || kind === 'upcoming') query.kind = kind;
  const rows = await db
    .collection('platform_posts')
    .find(query)
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(200)
    .toArray();
  return rows.map(publicPost);
}

function normalizePostInput(body, existing = {}) {
  const kind = body.kind === 'upcoming' ? 'upcoming' : 'update';
  const title = String(body.title || existing.title || '').trim();
  const content = String(body.body || body.content || existing.body || '').trim();
  const published = body.published != null ? Boolean(body.published) : existing.published !== false;
  if (!title) {
    const err = new Error('Title is required');
    err.status = 400;
    throw err;
  }
  if (!content) {
    const err = new Error('Write a short update');
    err.status = 400;
    throw err;
  }
  return {
    kind,
    title: title.slice(0, 200),
    body: content.slice(0, 8000),
    published,
  };
}

async function createPost(body, { actor } = {}) {
  const fields = normalizePostInput(body);
  const now = utcnow();
  const doc = {
    id: await newUpdateId(),
    ...fields,
    publishedAt: fields.published ? now : null,
    createdAt: now,
    updatedAt: now,
    createdBy: actor?.email || null,
  };
  await requireDb().collection('platform_posts').insertOne(doc);
  if (actor) {
    await writeAudit(actor, 'community.post_created', {
      resource: { type: 'platform_post', id: doc.id },
      meta: { kind: doc.kind, published: doc.published },
    });
  }
  return publicPost(doc);
}

async function updatePost(id, body, { actor } = {}) {
  const db = requireDb();
  const existing = await db.collection('platform_posts').findOne({ id: String(id) });
  if (!existing) {
    const err = new Error('Update not found');
    err.status = 404;
    throw err;
  }
  const fields = normalizePostInput({ ...existing, ...body }, existing);
  const now = utcnow();
  const publishedAt =
    fields.published && !existing.publishedAt ? now : fields.published ? existing.publishedAt : null;
  await db.collection('platform_posts').updateOne(
    { id: existing.id },
    { $set: { ...fields, publishedAt, updatedAt: now } }
  );
  if (actor) {
    await writeAudit(actor, 'community.post_updated', {
      resource: { type: 'platform_post', id: existing.id },
    });
  }
  return publicPost(await db.collection('platform_posts').findOne({ id: existing.id }));
}

async function deletePost(id, { actor } = {}) {
  const db = requireDb();
  const existing = await db.collection('platform_posts').findOne({ id: String(id) });
  if (!existing) {
    const err = new Error('Update not found');
    err.status = 404;
    throw err;
  }
  await db.collection('platform_posts').deleteOne({ id: existing.id });
  if (actor) {
    await writeAudit(actor, 'community.post_deleted', {
      resource: { type: 'platform_post', id: existing.id },
    });
  }
  return { id: existing.id };
}

async function seedDefaults() {
  const db = getDb();
  if (!db) return;
  await db.collection('config').updateOne(
    { key: CONFIG_KEY },
    {
      $setOnInsert: {
        key: CONFIG_KEY,
        value: DEFAULT_SETTINGS,
        updatedAt: utcnow(),
      },
    },
    { upsert: true }
  );
  const count = await db.collection('platform_posts').countDocuments();
  if (count > 0) return;
  const now = utcnow();
  await db.collection('platform_posts').insertMany([
    {
      id: await newUpdateId(),
      kind: 'update',
      title: 'Community access is live',
      body: 'You can now join VIRASTRA with a small community fee — chat with the desk, attend free events, and follow product updates without buying a documentation plan.',
      published: true,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
    },
    {
      id: await newUpdateId(),
      kind: 'upcoming',
      title: 'Buyer matching (coming soon)',
      body: 'We are building a buyer-matching desk so community members can be introduced to verified overseas buyers. Watch this space for the first cohort.',
      published: true,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
    },
  ]);
}

module.exports = {
  CONFIG_KEY,
  DEFAULT_SETTINGS,
  publicSettings,
  getSettings,
  saveSettings,
  resolveAccess,
  accessSnapshotForCase,
  getAccessForEmail,
  caseFieldsFromAccess,
  grantAccess,
  grantFromPlan,
  denyCommunity,
  requireCustomerCommunity,
  listPosts,
  createPost,
  updatePost,
  deletePost,
  seedDefaults,
};
