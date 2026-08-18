const { enqueueEmail } = require('../mail');
const { enqueueWhatsApp, resolvePhoneForEmail } = require('../whatsapp');
const { publicChannelFlags, mergePrefs } = require('./prefs');
const { maskEmail, maskPhone } = require('../whatsapp/phone');
const { normalizeEmail } = require('../helpers');
const { getDb } = require('../../db');

async function loadPrefs(email) {
  const db = getDb();
  if (!db) return mergePrefs(null);
  const user = await db.collection('users').findOne({ email: normalizeEmail(email) });
  return mergePrefs(user?.notificationPrefs);
}

/**
 * Fan out a customer-facing message to enabled channels.
 * OTP ignores user channel opt-outs (global ENABLE_*_OTP flags still apply).
 */
async function notify({
  to,
  phone,
  template,
  vars = {},
  attachments,
  bcc,
  actor,
  skipEmail = false,
  skipWhatsApp = false,
}) {
  const emailN = normalizeEmail(to);
  const prefs = await loadPrefs(emailN);
  const resolvedPhone = await resolvePhoneForEmail(emailN, phone || vars.phone);
  const sentVia = [];
  const skipped = [];
  const payload = {
    ...vars,
    customerEmail: vars.customerEmail || emailN,
    phone: resolvedPhone.e164 || vars.phone,
  };

  let emailResult = null;
  if (!skipEmail) {
    emailResult = await enqueueEmail({
      to: emailN,
      template,
      vars: payload,
      attachments,
      bcc,
      actor,
      skipWhatsApp: true,
    });
    if (emailResult?.status === 'queued' || emailResult?.status === 'sent') sentVia.push('email');
    else if (emailResult?.skipReason) skipped.push({ channel: 'email', reason: emailResult.skipReason });
  }

  let waResult = null;
  if (!skipWhatsApp) {
    waResult = await enqueueWhatsApp({
      toEmail: emailN,
      phone: resolvedPhone,
      template,
      vars: payload,
      actor,
      prefs,
    });
    if (waResult?.status === 'queued' || waResult?.status === 'sent') sentVia.push('whatsapp');
    else if (waResult?.skipReason) skipped.push({ channel: 'whatsapp', reason: waResult.skipReason });
  }

  return {
    sentVia,
    skipped,
    email: emailResult,
    whatsapp: waResult,
    phone: resolvedPhone,
    channels: publicChannelFlags(),
    masked: {
      email: maskEmail(emailN),
      phone: maskPhone(resolvedPhone),
    },
  };
}

module.exports = {
  notify,
  publicChannelFlags,
  mergePrefs,
};
