const { randomUUID } = require('crypto');

function utcnow() {
  return new Date();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(doc) {
  if (!doc) return null;
  return {
    email: doc.email,
    name: doc.name || '',
    phone: doc.phone || '',
    company: doc.company || '',
    role: doc.role || 'customer',
    status: doc.status || 'Active',
    kycComplete: Boolean(doc.kycComplete),
  };
}

function cleanDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };
  delete out._id;
  return out;
}

function ok(res, data = {}, message, status = 200) {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(status).json(body);
}

function fail(res, status, message, code, details) {
  const body = { success: false, message: message || 'Request failed' };
  if (code) body.code = code;
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

function requestId(req) {
  return req.requestId || req.headers['x-request-id'] || randomUUID();
}

function safeCustomerKey(email) {
  return normalizeEmail(email)
    .replace(/[^a-z0-9@._+-]/g, '_')
    .slice(0, 80);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

/** Calendar date in India (YYYY-MM-DD). Events are date-only, not timed. */
function todayIso(timeZone = 'Asia/Kolkata') {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone });
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function toIsoDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function eventEndIso(event) {
  return (
    toIsoDate(event?.endDate) ||
    toIsoDate(event?.startDate) ||
    toIsoDate(event?.date) ||
    ''
  );
}

/** True when the event's last day is before today (India calendar). Undated events stay active. */
function isEventExpired(event, today = todayIso()) {
  const end = eventEndIso(event);
  if (!end) return false;
  return end < today;
}

module.exports = {
  utcnow,
  normalizeEmail,
  publicUser,
  cleanDoc,
  ok,
  fail,
  requestId,
  safeCustomerKey,
  pick,
  todayIso,
  toIsoDate,
  eventEndIso,
  isEventExpired,
};
