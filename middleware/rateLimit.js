const rateLimit = require('express-rate-limit');
const config = require('../config');

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

const noop = (_req, _res, next) => next();

function makeLimiter(options) {
  if (config.disableRateLimits) return noop;
  return rateLimit(options);
}

const otpLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: config.otpRateLimit || 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${clientIp(req)}:${String(req.body?.email || '').toLowerCase()}`,
  message: { success: false, ok: false, message: 'Too many OTP requests. Try again later.' },
});

const authVerifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${clientIp(req)}:${String(req.body?.email || '').toLowerCase()}`,
  message: { success: false, ok: false, message: 'Too many verification attempts.' },
});

const uploadLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?.email || clientIp(req)}`,
  message: { success: false, message: 'Upload rate limit exceeded.' },
});

const createOrderLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { success: false, message: 'Too many payment attempts from this IP.' },
});

const leadLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { success: false, message: 'Too many requests. Try again later.' },
});

module.exports = {
  otpLimiter,
  authVerifyLimiter,
  uploadLimiter,
  createOrderLimiter,
  leadLimiter,
  clientIp,
};
