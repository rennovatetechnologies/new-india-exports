const rateLimit = require('express-rate-limit');
const config = require('../config');

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return (req.ip || req.connection?.remoteAddress || 'unknown').replace('::ffff:', '');
}

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.otpRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `otp:${clientIp(req)}:${email}`;
  },
  message: { success: false, message: 'Too many requests. Try again later.' },
});

const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `lead:${clientIp(req)}`,
  message: { success: false, message: 'Too many requests. Try again later.' },
});

module.exports = { otpLimiter, leadLimiter, clientIp };
