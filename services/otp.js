const config = require('../config');
const { requireDb } = require('../db');
const { normalizeEmail, utcnow } = require('./helpers');
const { notify, publicChannelFlags } = require('./notify');
const { resolvePhoneForEmail } = require('./whatsapp');

const VALID_PURPOSES = new Set([
  'customer_login',
  'customer_signup',
  'staff_login',
  'staff_register',
]);

async function createOtp(email, purpose, { phone, name } = {}) {
  if (!VALID_PURPOSES.has(purpose)) throw new Error('Invalid OTP purpose');
  const db = requireDb();
  const emailN = normalizeEmail(email);
  const flags = publicChannelFlags();
  if (!flags.emailOtp && !flags.whatsappOtp) {
    const err = new Error('Sign-in codes are temporarily unavailable. Please try again shortly.');
    err.code = 'OTP_CHANNELS_DISABLED';
    throw err;
  }

  const resolvedPhone = await resolvePhoneForEmail(emailN, phone);
  if (!flags.emailOtp && flags.whatsappOtp && !resolvedPhone.digits) {
    const err = new Error(
      'We could not send a WhatsApp code because this account has no mobile number. Add a number in Settings or contact support.'
    );
    err.code = 'OTP_PHONE_REQUIRED';
    throw err;
  }

  if (!name) {
    const existing = await db.collection('users').findOne({ email: emailN });
    name = existing?.name || '';
    if (!name && purpose === 'customer_signup') {
      const draft = await db.collection('signup_drafts').findOne({ email: emailN });
      name = draft?.name || '';
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60 * 1000);
  await db.collection('otps').deleteMany({ email: emailN, purpose });
  await db.collection('otps').insertOne({
    email: emailN,
    purpose,
    code,
    phone: resolvedPhone.e164 || '',
    expiresAt,
    createdAt: utcnow(),
  });
  if (!config.isProduction) {
    console.info(`[DEV OTP] ${emailN} (${purpose}): ${code}`);
  }

  let delivery;
  try {
    delivery = await notify({
      to: emailN,
      phone: resolvedPhone,
      template: 'auth.otp',
      vars: {
        otpCode: code,
        expiresMinutes: config.otpTtlMinutes,
        customerEmail: emailN,
        customerName: name || '',
        purpose,
      },
    });
  } catch (e) {
    console.warn('OTP notify failed:', e.message);
    delivery = { sentVia: [], skipped: [{ channel: 'notify', reason: e.message }], phone: resolvedPhone };
  }

  if (config.isProduction && !(delivery.sentVia || []).length) {
    const err = new Error('We could not send a verification code. Please try again shortly.');
    err.code = 'OTP_DELIVERY_FAILED';
    throw err;
  }

  return {
    code,
    sentVia: delivery.sentVia || [],
    masked: delivery.masked,
    phone: resolvedPhone,
    channels: flags,
    expiresInSec: config.otpTtlMinutes * 60,
  };
}

async function verifyOtp(email, purpose, code) {
  const db = requireDb();
  const emailN = normalizeEmail(email);
  const entered = String(code || '').replace(/\D/g, '');
  if (entered.length !== 6) return { ok: false, reason: 'invalid' };
  const doc = await db.collection('otps').findOne({ email: emailN, purpose });
  if (!doc) return { ok: false, reason: 'no_pending' };
  if (!doc.expiresAt || new Date(doc.expiresAt) < new Date()) {
    return { ok: false, reason: 'expired' };
  }
  if (String(doc.code) !== entered) return { ok: false, reason: 'invalid' };
  await db.collection('otps').deleteMany({ email: emailN, purpose });
  return { ok: true, reason: 'ok' };
}

async function markEmailVerifiedPending(email, purpose) {
  const db = requireDb();
  const emailN = normalizeEmail(email);
  await db.collection('otp_verified').updateOne(
    { email: emailN, purpose },
    {
      $set: {
        email: emailN,
        purpose,
        verifiedAt: utcnow(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    },
    { upsert: true }
  );
}

async function consumeEmailVerified(email, purpose) {
  const db = requireDb();
  const emailN = normalizeEmail(email);
  const result = await db.collection('otp_verified').findOneAndDelete({ email: emailN, purpose });
  const value = result && result.value !== undefined ? result.value : result;
  if (!value || !value.email) return false;
  if (value.expiresAt && new Date(value.expiresAt) < new Date()) return false;
  return true;
}

module.exports = {
  VALID_PURPOSES,
  createOtp,
  verifyOtp,
  markEmailVerifiedPending,
  consumeEmailVerified,
};
