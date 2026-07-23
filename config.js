require('dotenv').config();

function splitOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

const config = {
  appEnv: process.env.APP_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || null,
  mongodbDbName: process.env.MONGODB_DB_NAME || 'new_india_exports',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-in-production',
  jwtExpireHours: parseInt(process.env.JWT_EXPIRE_HOURS || '24', 10),
  corsOrigins: splitOrigins(
    process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'
  ),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || null,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null,
  port: parseInt(process.env.PORT || '5001', 10),
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES || '10', 10),
  otpRateLimit: parseInt(process.env.OTP_RATE_LIMIT || '5', 10),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(5 * 1024 * 1024), 10),
  workshopAmountPaise: parseInt(process.env.WORKSHOP_AMOUNT_PAISE || '639900', 10),
  bookingAmountPaise: parseInt(process.env.BOOKING_AMOUNT_PAISE || '100', 10),
  get isProduction() {
    return this.appEnv === 'production';
  },
};

module.exports = config;
