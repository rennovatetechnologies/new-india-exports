const express = require('express');
const config = require('../config');
const { requireDb } = require('../db');
const {
  createAccessToken,
  protect,
  sessionFromUser,
} = require('../middleware/auth');
const { otpLimiter, authVerifyLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { writeAudit } = require('../services/audit');
const { normalizeEmail, publicUser, utcnow, cleanDoc } = require('../services/helpers');
const { accountStatusError } = require('../services/auth/account');
const {
  createOtp,
  verifyOtp,
  markEmailVerifiedPending,
  consumeEmailVerified,
} = require('../services/otp');
const { asyncHandler } = require('../utils/asyncHandler');
const cases = require('../services/cases');
const { enqueueEmail } = require('../services/mail');
const {
  otpSendSchema,
  otpVerifySchema,
  customerLoginSchema,
  staffLoginSchema,
  customerSignupSchema,
  staffRegisterSchema,
} = require('../schemas/auth');

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
  if (!matches.length) return { kind: 'no_request', ok: false };

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
      const statusErr = accountStatusError(user);
      if (statusErr && user.status === 'Suspended') {
        return { kind: 'suspended', ok: false, request: cleanDoc(req), ...statusErr };
      }
      // Do not convert an existing customer into staff via ops login.
      if (user.role === 'customer') {
        return {
          kind: 'blocked',
          ok: false,
          request: cleanDoc(req),
          message:
            'This email is registered as a customer. Use a different email for staff access.',
        };
      }
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
  if (pending) return { kind: 'pending', ok: false, request: cleanDoc(pending) };
  const rejected = matches.find((r) => r.status === 'Rejected');
  if (rejected) return { kind: 'rejected', ok: false, request: cleanDoc(rejected) };
  const suspended = matches.find((r) => r.status === 'Suspended');
  if (suspended) return { kind: 'suspended', ok: false, request: cleanDoc(suspended) };
  return { kind: 'blocked', ok: false, request: cleanDoc(matches[0]) };
}

/**
 * Purpose-aware pre-checks before sending an OTP.
 * Ensures users exist / don't exist, accounts are active, and staff state is valid.
 */
async function assertOtpSendAllowed(email, purpose) {
  const db = requireDb();

  if (purpose === 'customer_signup') {
    const existing = await db.collection('users').findOne({ email });
    if (existing) {
      return {
        status: 409,
        body: {
          ok: false,
          success: false,
          code: 'already_registered',
          message: 'An account already exists for this email. Please sign in.',
        },
      };
    }
    return null;
  }

  if (purpose === 'customer_login') {
    const existing = await db.collection('users').findOne({ email, role: 'customer' });
    if (!existing) {
      return {
        status: 404,
        body: {
          ok: false,
          success: false,
          code: 'not_registered',
          message: 'No account for this email. Please sign up first.',
        },
      };
    }
    const statusErr = accountStatusError(existing);
    if (statusErr) {
      return {
        status: statusErr.status,
        body: { ok: false, success: false, code: statusErr.code, message: statusErr.message },
      };
    }
    return null;
  }

  if (purpose === 'staff_login') {
    const matches = await db
      .collection('staff_requests')
      .find({ email })
      .sort({ createdAt: -1 })
      .toArray();
    const staffUser = await db.collection('users').findOne({
      email,
      role: { $in: ['operations', 'admin'] },
    });

    if (staffUser) {
      const statusErr = accountStatusError(staffUser);
      if (statusErr) {
        return {
          status: statusErr.status,
          body: { ok: false, success: false, code: statusErr.code, message: statusErr.message },
        };
      }
      return null;
    }

    if (!matches.length) {
      return {
        status: 404,
        body: {
          ok: false,
          success: false,
          code: 'no_staff_request',
          message: 'No staff access request found. Please register for staff access first.',
        },
      };
    }

    const latest = matches[0];
    if (latest.status === 'Pending Approval') {
      return {
        status: 403,
        body: {
          ok: false,
          success: false,
          code: 'STAFF_PENDING',
          kind: 'pending',
          message: 'Your staff access request is pending approval.',
        },
      };
    }
    if (latest.status === 'Rejected') {
      return {
        status: 403,
        body: {
          ok: false,
          success: false,
          code: 'STAFF_REJECTED',
          kind: 'rejected',
          message: 'Your staff access request was rejected.',
        },
      };
    }
    if (latest.status === 'Suspended') {
      return {
        status: 403,
        body: {
          ok: false,
          success: false,
          code: 'ACCOUNT_SUSPENDED',
          kind: 'suspended',
          message: 'Your staff account is suspended.',
        },
      };
    }
    if (latest.status !== 'Approved' && latest.status !== 'Active') {
      return {
        status: 403,
        body: {
          ok: false,
          success: false,
          code: 'STAFF_INACTIVE',
          message: 'Staff access is not active for this email.',
        },
      };
    }
    return null;
  }

  if (purpose === 'staff_register') {
    const staffUser = await db.collection('users').findOne({
      email,
      role: { $in: ['operations', 'admin'] },
    });
    if (staffUser && (staffUser.status || 'Active') === 'Active') {
      return {
        status: 409,
        body: {
          ok: false,
          success: false,
          code: 'already_registered',
          message: 'Staff account already exists. Please sign in.',
        },
      };
    }
    const pending = await db.collection('staff_requests').findOne({
      email,
      status: 'Pending Approval',
    });
    if (pending) {
      return {
        status: 409,
        body: {
          ok: false,
          success: false,
          code: 'request_pending',
          message: 'A staff access request is already pending for this email.',
        },
      };
    }
    const approved = await db.collection('staff_requests').findOne({
      email,
      status: { $in: ['Approved', 'Active'] },
    });
    if (approved) {
      return {
        status: 409,
        body: {
          ok: false,
          success: false,
          code: 'already_registered',
          message: 'Staff access already approved. Please sign in.',
        },
      };
    }
    return null;
  }

  return null;
}

async function handleOtpSend(req, res) {
  const { email, purpose, name, company, phone } = req.body;
  const db = requireDb();

  const blocked = await assertOtpSendAllowed(email, purpose);
  if (blocked) return res.status(blocked.status).json(blocked.body);

  if (purpose === 'customer_signup') {
    await db.collection('signup_drafts').updateOne(
      { email },
      {
        $set: {
          email,
          name: String(name || '').trim(),
          company: String(company || '').trim(),
          phone: String(phone || '').trim(),
          purpose,
          updatedAt: utcnow(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
        $setOnInsert: { createdAt: utcnow() },
      },
      { upsert: true }
    );
  }

  let delivery;
  try {
    delivery = await createOtp(email, purpose, { phone, name });
  } catch (e) {
    const status = e.code === 'OTP_CHANNELS_DISABLED' || e.code === 'OTP_DELIVERY_FAILED' ? 503 : 400;
    return res.status(status).json({
      ok: false,
      success: false,
      code: e.code || 'OTP_SEND_FAILED',
      message: e.message,
    });
  }
  return res.json({
    ok: true,
    success: true,
    expiresInSec: delivery.expiresInSec || config.otpTtlMinutes * 60,
    sentVia: delivery.sentVia || [],
    channels: delivery.channels,
    masked: delivery.masked,
  });
}

router.post('/otp/send', otpLimiter, validateBody(otpSendSchema), asyncHandler(handleOtpSend));
router.post('/otp/resend', otpLimiter, validateBody(otpSendSchema), asyncHandler(handleOtpSend));

router.post(
  '/otp/verify',
  authVerifyLimiter,
  validateBody(otpVerifySchema),
  asyncHandler(async (req, res) => {
    const { email, purpose, code } = req.body;
    const { ok, reason } = await verifyOtp(email, purpose, code);
    if (!ok) return res.status(400).json({ ok: false, success: false, reason, code: reason });

    await markEmailVerifiedPending(email, purpose);
    const db = requireDb();

    if (purpose === 'customer_login') {
      const user = await db.collection('users').findOne({ email, role: 'customer' });
      if (!user) {
        return res.status(404).json({
          ok: false,
          success: false,
          code: 'not_registered',
          message: 'No account for this email. Please sign up first.',
          needsSignup: true,
        });
      }
      const statusErr = accountStatusError(user);
      if (statusErr) {
        return res.status(statusErr.status).json({
          ok: false,
          success: false,
          code: statusErr.code,
          message: statusErr.message,
        });
      }
      const session = issueSession(user);
      await writeAudit(email, 'customer_login', { tone: 'success' });
      return res.json({ ok: true, success: true, email, purpose, session, token: session.token });
    }

    if (purpose === 'staff_login') {
      const result = await staffLoginResult(email);
      if (!result.ok) {
        const status =
          result.kind === 'no_request'
            ? 404
            : result.kind === 'pending' || result.kind === 'rejected' || result.kind === 'suspended'
              ? 403
              : 403;
        return res.status(status).json({
          ...result,
          success: false,
          message:
            result.message ||
            (result.kind === 'pending'
              ? 'Staff access pending approval'
              : result.kind === 'rejected'
                ? 'Staff access rejected'
                : result.kind === 'suspended'
                  ? 'Staff account suspended'
                  : result.kind === 'no_request'
                    ? 'No staff access request found'
                    : 'Staff login not allowed'),
        });
      }
      return res.json({ ...result, success: true });
    }

    // signup / staff_register — email verified flag set; client continues to signup/register
    return res.json({
      ok: true,
      success: true,
      email,
      purpose,
      emailVerified: true,
    });
  })
);

router.post(
  '/customer/signup',
  authVerifyLimiter,
  validateBody(customerSignupSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email;
    if (!(await consumeEmailVerified(email, 'customer_signup'))) {
      return res.status(400).json({
        success: false,
        ok: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email OTP verification required before signup',
      });
    }
    const db = requireDb();
    const existing = await db.collection('users').findOne({ email });
    if (existing) {
      const statusErr = accountStatusError(existing);
      if (statusErr) {
        return res.status(statusErr.status).json({
          success: false,
          ok: false,
          code: statusErr.code,
          message: statusErr.message,
        });
      }
      const session = issueSession(existing);
      return res.json({
        success: true,
        user: publicUser(existing),
        session,
        token: session.token,
      });
    }

    const draft = await db.collection('signup_drafts').findOne({ email });
    const name =
      String(req.body?.name || '').trim() ||
      String(draft?.name || '').trim() ||
      email.split('@')[0];
    const phone = String(req.body?.phone || '').trim() || String(draft?.phone || '').trim();
    const company =
      String(req.body?.company || '').trim() || String(draft?.company || '').trim();

    if (!name || !company) {
      return res.status(400).json({
        success: false,
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Name and company are required to complete signup',
      });
    }

    const doc = {
      email,
      name,
      phone,
      company,
      role: 'customer',
      status: 'Active',
      emailVerified: true,
      kycComplete: false,
      createdAt: utcnow(),
    };
    await db.collection('users').insertOne(doc);
    await cases.getOrCreateCaseForEmail(email, doc._id ? String(doc._id) : null);
    await db.collection('signup_drafts').deleteOne({ email });
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
  authVerifyLimiter,
  validateBody(customerLoginSchema),
  asyncHandler(async (req, res) => {
    const { email, code } = req.body;
    const { ok, reason } = await verifyOtp(email, 'customer_login', code);
    if (!ok) {
      return res.status(400).json({ ok: false, success: false, reason, code: reason });
    }
    const db = requireDb();
    const user = await db.collection('users').findOne({ email, role: 'customer' });
    if (!user) {
      return res.status(404).json({
        ok: false,
        success: false,
        code: 'not_registered',
        message: 'Customer not found. Please sign up.',
      });
    }
    const statusErr = accountStatusError(user);
    if (statusErr) {
      return res.status(statusErr.status).json({
        ok: false,
        success: false,
        code: statusErr.code,
        message: statusErr.message,
      });
    }
    const session = issueSession(user);
    await writeAudit(email, 'customer_login', { tone: 'success' });
    return res.json({ ok: true, success: true, session, token: session.token });
  })
);

router.post(
  '/staff/login',
  authVerifyLimiter,
  validateBody(staffLoginSchema),
  asyncHandler(async (req, res) => {
    const { email, code } = req.body;
    const { ok, reason } = await verifyOtp(email, 'staff_login', code);
    if (!ok) {
      return res.status(400).json({
        ok: false,
        success: false,
        reason,
        code: reason,
        kind: 'invalid',
      });
    }
    const result = await staffLoginResult(email);
    if (!result.ok) {
      const status =
        result.kind === 'no_request'
          ? 404
          : 403;
      return res.status(status).json({
        ...result,
        success: false,
        message:
          result.message ||
          (result.kind === 'pending'
            ? 'Staff access pending approval'
            : result.kind === 'rejected'
              ? 'Staff access rejected'
              : result.kind === 'suspended'
                ? 'Staff account suspended'
                : result.kind === 'no_request'
                  ? 'No staff access request found'
                  : 'Staff login not allowed'),
      });
    }
    return res.json({ ...result, success: true });
  })
);

router.post(
  '/staff/register',
  authVerifyLimiter,
  validateBody(staffRegisterSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email;
    if (!(await consumeEmailVerified(email, 'staff_register'))) {
      return res.status(400).json({
        success: false,
        ok: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email OTP verification required before registration',
      });
    }
    const db = requireDb();

    const existingStaff = await db.collection('users').findOne({
      email,
      role: { $in: ['operations', 'admin'] },
    });
    if (existingStaff && (existingStaff.status || 'Active') === 'Active') {
      return res.status(409).json({
        success: false,
        ok: false,
        code: 'already_registered',
        message: 'Staff account already exists. Please sign in.',
      });
    }

    const pending = await db.collection('staff_requests').findOne({
      email,
      status: 'Pending Approval',
    });
    if (pending) {
      return res.status(409).json({
        success: false,
        ok: false,
        code: 'request_pending',
        message: 'A staff access request is already pending for this email.',
      });
    }

    // Self-registration may only request operations; admin is granted by an existing admin
    const role = 'operations';
    let reqId = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    while (await db.collection('staff_requests').findOne({ id: reqId })) {
      reqId = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const doc = {
      id: reqId,
      name: String(req.body.name || '').trim(),
      email,
      phone: String(req.body.phone || '').trim(),
      role,
      department: String(req.body.department || '').trim(),
      employeeId: String(req.body.employeeId || '').trim(),
      reason: String(req.body.reason || '').trim(),
      status: 'Pending Approval',
      emailVerified: true,
      createdAt: utcnow().toISOString(),
    };
    await db.collection('staff_requests').insertOne(doc);
    await writeAudit(email, 'staff_register', { meta: { id: reqId } });
    try {
      await enqueueEmail({
        to: email,
        template: 'staff.access_submitted',
        vars: { customerName: doc.name },
      });
      await enqueueEmail({
        to: config.adminInbox,
        template: 'staff.access_submitted',
        vars: { customerName: doc.name, message: `New staff request ${reqId} from ${email}` },
      });
    } catch (_) {}
    return res.json({ success: true, ...cleanDoc(doc) });
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
    return res.json({ ok: true, success: true });
  })
);

module.exports = router;
