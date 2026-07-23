const express = require('express');
const config = require('../config');
const { requireDb } = require('../db');
const {
  createAccessToken,
  protect,
  sessionFromUser,
} = require('../middleware/auth');
const { otpLimiter } = require('../middleware/rateLimit');
const { writeAudit } = require('../services/audit');
const { normalizeEmail, publicUser, utcnow, cleanDoc } = require('../services/helpers');
const {
  VALID_PURPOSES,
  createOtp,
  verifyOtp,
  markEmailVerifiedPending,
  consumeEmailVerified,
} = require('../services/otp');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

function issueSession(userDoc) {
  const token = createAccessToken({
    sub: userDoc.email,
    email: userDoc.email,
    role: userDoc.role || 'customer',
    name: userDoc.name || '',
    status: userDoc.status || 'Active',
    kycComplete: Boolean(userDoc.kycComplete),
  });
  return sessionFromUser(userDoc, token);
}

async function staffLoginResult(email) {
  const db = requireDb();
  const emailN = normalizeEmail(email);
  const matches = await db
    .collection('staff_requests')
    .find({ email: emailN })
    .sort({ createdAt: -1 })
    .toArray();
  if (!matches.length) return { kind: 'no_request' };

  const approved = matches.filter((r) => r.status === 'Approved' || r.status === 'Active');
  if (approved.length) {
    const req = approved[0];
    const role = req.role === 'operations' || req.role === 'admin' ? req.role : 'operations';
    let user = await db.collection('users').findOne({ email: emailN });
    if (!user) {
      user = {
        email: emailN,
        name: req.name || emailN.split('@')[0],
        phone: req.phone || '',
        role,
        status: 'Active',
        kycComplete: true,
        company: '',
        createdAt: utcnow(),
      };
      await db.collection('users').insertOne(user);
    } else {
      await db.collection('users').updateOne(
        { email: emailN },
        { $set: { role, status: 'Active', name: req.name || user.name } }
      );
      user = await db.collection('users').findOne({ email: emailN });
    }
    const session = issueSession(user);
    await writeAudit(emailN, 'staff_login', { meta: { role }, tone: 'success' });
    return {
      ok: true,
      kind: 'ok',
      role,
      name: user.name,
      phone: user.phone,
      status: user.status,
      session,
      token: session.token,
      request: cleanDoc(req),
    };
  }

  const pending = matches.find((r) => r.status === 'Pending Approval');
  if (pending) return { kind: 'pending', request: cleanDoc(pending) };
  const rejected = matches.find((r) => r.status === 'Rejected');
  if (rejected) return { kind: 'rejected', request: cleanDoc(rejected) };
  const suspended = matches.find((r) => r.status === 'Suspended');
  if (suspended) return { kind: 'suspended', request: cleanDoc(suspended) };
  return { kind: 'blocked', request: cleanDoc(matches[0]) };
}

async function handleOtpSend(req, res) {
  const email = normalizeEmail(req.body?.email);
  const purpose = req.body?.purpose;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, message: 'Valid email required' });
  }
  if (!VALID_PURPOSES.has(purpose)) {
    return res.status(400).json({ ok: false, message: 'Invalid purpose' });
  }
  try {
    await createOtp(email, purpose);
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
  return res.json({ ok: true, expiresInSec: config.otpTtlMinutes * 60 });
}

router.post('/otp/send', otpLimiter, asyncHandler(handleOtpSend));
router.post('/otp/resend', otpLimiter, asyncHandler(handleOtpSend));

router.post(
  '/otp/verify',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const purpose = req.body?.purpose;
    const { ok, reason } = await verifyOtp(email, purpose, req.body?.code);
    if (!ok) return res.status(400).json({ ok: false, reason });

    await markEmailVerifiedPending(email, purpose);
    const db = requireDb();

    if (purpose === 'customer_login') {
      const user = await db.collection('users').findOne({ email, role: 'customer' });
      if (!user) {
        return res.json({ ok: true, email, purpose, needsSignup: true });
      }
      const session = issueSession(user);
      await writeAudit(email, 'customer_login', { tone: 'success' });
      return res.json({ ok: true, email, purpose, session, token: session.token });
    }

    if (purpose === 'staff_login') {
      return res.json(await staffLoginResult(email));
    }

    return res.json({ ok: true, email, purpose });
  })
);

router.post(
  '/customer/signup',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!(await consumeEmailVerified(email, 'customer_signup'))) {
      return res.status(400).json({ success: false, message: 'Email OTP verification required' });
    }
    const db = requireDb();
    const existing = await db.collection('users').findOne({ email });
    if (existing) {
      const session = issueSession(existing);
      return res.json({
        success: true,
        user: publicUser(existing),
        session,
        token: session.token,
      });
    }
    const doc = {
      email,
      name: String(req.body?.name || '').trim() || email.split('@')[0],
      phone: String(req.body?.phone || '').trim(),
      company: String(req.body?.company || '').trim(),
      role: 'customer',
      status: 'Active',
      kycComplete: false,
      createdAt: utcnow(),
    };
    await db.collection('users').insertOne(doc);
    const session = issueSession(doc);
    await writeAudit(email, 'customer_signup', { tone: 'success' });
    return res.json({
      success: true,
      user: publicUser(doc),
      session,
      token: session.token,
      kycComplete: false,
    });
  })
);

router.post(
  '/customer/login',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { ok, reason } = await verifyOtp(email, 'customer_login', req.body?.code);
    if (!ok) return res.status(400).json({ ok: false, reason });
    const db = requireDb();
    const user = await db.collection('users').findOne({ email, role: 'customer' });
    if (!user) {
      return res.status(404).json({ ok: false, message: 'Customer not found. Please sign up.' });
    }
    const session = issueSession(user);
    return res.json({ ok: true, session, token: session.token });
  })
);

router.post(
  '/staff/login',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { ok, reason } = await verifyOtp(email, 'staff_login', req.body?.code);
    if (!ok) return res.status(400).json({ ok: false, reason, kind: 'invalid' });
    return res.json(await staffLoginResult(email));
  })
);

router.post(
  '/staff/register',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!(await consumeEmailVerified(email, 'staff_register'))) {
      return res.status(400).json({ success: false, message: 'Email OTP verification required' });
    }
    const db = requireDb();
    const role = req.body?.role === 'admin' || req.body?.role === 'operations' ? req.body.role : 'operations';
    let reqId = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    while (await db.collection('staff_requests').findOne({ id: reqId })) {
      reqId = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const doc = {
      id: reqId,
      name: String(req.body?.name || '').trim(),
      email,
      phone: String(req.body?.phone || '').trim(),
      role,
      department: String(req.body?.department || '').trim(),
      employeeId: String(req.body?.employeeId || '').trim(),
      reason: String(req.body?.reason || '').trim(),
      status: 'Pending Approval',
      emailVerified: true,
      createdAt: utcnow().toISOString(),
    };
    await db.collection('staff_requests').insertOne(doc);
    await writeAudit(email, 'staff_register', { meta: { id: reqId } });
    return res.json(cleanDoc(doc));
  })
);

router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const email = normalizeEmail(req.user.email || req.user.sub);
    const doc = await db.collection('users').findOne({ email });
    if (!doc) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json(publicUser(doc));
  })
);

router.post(
  '/logout',
  protect,
  asyncHandler(async (req, res) => {
    await writeAudit(req.user.email || '', 'logout');
    return res.json({ ok: true });
  })
);

module.exports = router;
