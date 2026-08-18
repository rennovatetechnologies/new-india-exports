const config = require('../../config');
const { normalizeEmail } = require('../helpers');

const DEFAULT_PREFS = {
  workflow: true,
  billing: true,
  weekly: false,
  marketing: false,
  email: true,
  whatsapp: true,
};

const OPS_TEMPLATES = new Set([
  'payment.ops_alert',
  'kyc.submitted_ops',
  'doc.uploaded_ops',
  'message.customer_to_ops',
  'booking.received_ops',
]);

function mergePrefs(raw) {
  return { ...DEFAULT_PREFS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

function isOpsTemplate(template) {
  const t = String(template || '');
  return OPS_TEMPLATES.has(t) || t.endsWith('_ops') || t.includes('.ops_');
}

function isOpsRecipient(to) {
  const email = normalizeEmail(Array.isArray(to) ? to[0] : to);
  if (!email) return false;
  const ops = new Set(
    [config.opsInbox, config.adminInbox, config.supportEmail]
      .flatMap((v) => String(v || '').split(','))
      .map((s) => normalizeEmail(s))
      .filter(Boolean)
  );
  return ops.has(email);
}

function templateTopic(template) {
  const t = String(template || '');
  if (t === 'auth.otp') return 'otp';
  if (t.startsWith('payment.') || t === 'plan.upgraded') return 'billing';
  if (t.startsWith('event.') || t === 'support.ticket_created') return 'workflow';
  return 'workflow';
}

function topicAllowed(prefs, topic) {
  if (topic === 'otp') return true;
  const p = mergePrefs(prefs);
  if (topic === 'billing') return p.billing !== false;
  if (topic === 'marketing') return Boolean(p.marketing);
  if (topic === 'weekly') return Boolean(p.weekly);
  return p.workflow !== false;
}

function publicChannelFlags() {
  const configured = Boolean(config.whatsapp.isConfigured);
  return {
    emailNotifications: Boolean(config.emailNotificationsEnabled),
    emailOtp: Boolean(config.emailOtpEnabled),
    whatsappNotifications: Boolean(config.whatsappNotificationsEnabled) && configured,
    whatsappOtp: Boolean(config.whatsappOtpEnabled) && configured,
    whatsappReady: configured,
  };
}

function emailChannelEnabled(template) {
  if (String(template) === 'auth.otp') return Boolean(config.emailOtpEnabled);
  return Boolean(config.emailNotificationsEnabled);
}

function whatsappChannelEnabled(template) {
  if (!config.whatsapp.isConfigured) return false;
  if (String(template) === 'auth.otp') return Boolean(config.whatsappOtpEnabled);
  return Boolean(config.whatsappNotificationsEnabled);
}

module.exports = {
  DEFAULT_PREFS,
  mergePrefs,
  isOpsTemplate,
  isOpsRecipient,
  templateTopic,
  topicAllowed,
  publicChannelFlags,
  emailChannelEnabled,
  whatsappChannelEnabled,
};
