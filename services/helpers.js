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
};
