const path = require('path');
require('dotenv').config();

function splitOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`${name} is not valid JSON`);
    return null;
  }
}

/** Stable Railway production hosts (custom domain can override via env). */
const FRONTEND_PRODUCTION_URL = 'https://india-exports-hub-53-production.up.railway.app';
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN);

const seller = {
  legalName: 'New India Export',
  brandName: 'VIRASTRA INTERNATIONAL EXPORT',
  gstin: '27AXGPY3435Q1ZK',
  addressLines: [
    '1ST FLOOR SHOP NO M-02',
    'PREMIUM PLAZA COMMERCIAL COMPLEX',
    'MATA MANDIR ROAD NEAR CHHOTI LAHORI',
    'DHARAMPETH NAGPUR-440010',
  ],
  state: 'Maharashtra',
  stateCode: '27',
  placeOfSupply: 'Maharashtra',
};

const config = {
  appEnv: process.env.APP_ENV || (onRailway ? 'production' : 'development'),
  mongodbUri: process.env.MONGODB_URI || null,
  // Prefer explicit MONGODB_DB_NAME; else nonprod for development, prod for production.
  mongodbDbName:
    process.env.MONGODB_DB_NAME ||
    (process.env.APP_ENV === 'production'
      ? process.env.MONGODB_DB_NAME_PROD || 'virastra_prod'
      : process.env.MONGODB_DB_NAME_NONPROD || 'virastra_nonprod'),
  mongodbDbNameNonprod: process.env.MONGODB_DB_NAME_NONPROD || 'virastra_nonprod',
  mongodbDbNameProd: process.env.MONGODB_DB_NAME_PROD || 'virastra_prod',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-in-production',
  jwtExpireHours: parseInt(process.env.JWT_EXPIRE_HOURS || '2', 10),
  corsOrigins: splitOrigins(
    process.env.CORS_ORIGINS ||
      `http://localhost:5173,http://127.0.0.1:5173,${FRONTEND_PRODUCTION_URL}`
  ),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || null,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null,
  port: parseInt(process.env.PORT || '5001', 10),
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES || '10', 10),
  otpRateLimit: parseInt(process.env.OTP_RATE_LIMIT || '5', 10),
  // Off by default outside production (avoids 429s during local/dev testing).
  disableRateLimits: envBool('DISABLE_RATE_LIMITS', process.env.APP_ENV !== 'production'),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES || String(5 * 1024 * 1024), 10),
  maxCaseUploadBytes: parseInt(process.env.MAX_CASE_UPLOAD_BYTES || String(15 * 1024 * 1024), 10),
  maxBrochurePdfBytes: parseInt(process.env.MAX_BROCHURE_PDF_BYTES || String(20 * 1024 * 1024), 10),
  maxBrochureImageBytes: parseInt(process.env.MAX_BROCHURE_IMAGE_BYTES || String(8 * 1024 * 1024), 10),
  workshopAmountInr: parseInt(process.env.WORKSHOP_AMOUNT_INR || '6399', 10),
  bookingAmountInr: parseInt(process.env.BOOKING_AMOUNT_INR || '100', 10),
  // legacy paise env still supported
  workshopAmountPaise: parseInt(process.env.WORKSHOP_AMOUNT_PAISE || '639900', 10),
  bookingAmountPaise: parseInt(process.env.BOOKING_AMOUNT_PAISE || '10000', 10),
  gstRate: Number(process.env.GST_RATE || '0.18'),
  installmentThresholdInr: parseInt(process.env.INSTALLMENT_THRESHOLD_INR || '100000', 10),
  installmentCount: parseInt(process.env.INSTALLMENT_COUNT || '3', 10),
  installmentGapDays: parseInt(process.env.INSTALLMENT_GAP_DAYS || '10', 10),
  installmentWindowDays: parseInt(process.env.INSTALLMENT_WINDOW_DAYS || '30', 10),
  frontendUrl: (
    process.env.FRONTEND_URL ||
    (onRailway ? FRONTEND_PRODUCTION_URL : 'http://localhost:5173')
  ).replace(/\/$/, ''),
  enableDocs: envBool('ENABLE_DOCS', true),
  enableLegacyShipment: envBool('ENABLE_LEGACY_SHIPMENT', false),

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: envBool('SMTP_SECURE', true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  mailFrom: process.env.MAIL_FROM || 'VIRASTRA INTERNATIONAL EXPORT <noreply@newindiaexport.com>',
  mailReplyTo: process.env.MAIL_REPLY_TO || 'support@newindiaexport.com',
  opsInbox: process.env.OPS_INBOX || 'ops@newindiaexport.com',
  adminInbox: process.env.ADMIN_INBOX || 'admin@newindiaexport.com',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@newindiaexport.com',
  appName: process.env.APP_NAME || 'VIRASTRA INTERNATIONAL EXPORT',

  googleDrive: {
    // Legacy Drive settings (unused; files now go to GCS). Kept so old env files still parse.
    oauthClientId: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || '',
    oauthClientSecret: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || '',
    oauthRefreshToken: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN || '',
    oauthRedirectUri:
      process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || 'http://localhost:5055/oauth2callback',
    clientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL || '',
    privateKey: (process.env.GOOGLE_DRIVE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    rootFolderId:
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
      (process.env.APP_ENV === 'production'
        ? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID_PROD || ''
        : process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID_NONPROD || ''),
    rootFolderIdNonprod: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID_NONPROD || '',
    rootFolderIdProd: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID_PROD || '',
    sharedDriveId: process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || '',
  },

  gcs: {
    bucket: process.env.GCS_BUCKET || 'virastra',
    projectId: process.env.GCS_PROJECT_ID || 'virastra-504906',
    // Railway / GitHub: paste the service-account JSON into GCS_CREDENTIALS_JSON.
    credentials:
      parseJsonEnv('GCS_CREDENTIALS_JSON') ||
      parseJsonEnv('GOOGLE_APPLICATION_CREDENTIALS_JSON'),
    keyFile: (() => {
      const raw =
        process.env.GCS_KEY_FILE ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        'virastra-504906-2c957972de4c.json';
      return path.isAbsolute(raw) ? raw : path.join(__dirname, raw);
    })(),
    // APP_ENV=production → PROD/, otherwise DEV/
    envFolder: (
      process.env.GCS_ENV_FOLDER ||
      (process.env.APP_ENV === 'production' ? 'PROD' : 'DEV')
    )
      .toString()
      .trim()
      .toUpperCase(),
  },

  seller,
  localDriveRoot: process.env.LOCAL_DRIVE_ROOT || path.join(__dirname, '.data', 'drive'),

  get isProduction() {
    return this.appEnv === 'production';
  },
  get razorpayIsTest() {
    return String(this.razorpayKeyId || '').startsWith('rzp_test_');
  },
  corsOriginAllowed(origin) {
    if (!origin) return true;
    if (this.corsOrigins.includes('*')) return true;
    if (this.corsOrigins.includes(origin)) return true;
    try {
      const host = new URL(origin).hostname;
      if (host === 'localhost' || host === '127.0.0.1') return true;
      if (host.endsWith('.up.railway.app') || host.endsWith('.railway.app')) return true;
    } catch {
      return false;
    }
    return false;
  },
  get workshopInr() {
    if (process.env.WORKSHOP_AMOUNT_INR) return this.workshopAmountInr;
    return Math.round(this.workshopAmountPaise / 100);
  },
  get bookingInr() {
    if (process.env.BOOKING_AMOUNT_INR) return this.bookingAmountInr;
    // BOOKING_AMOUNT_PAISE historically was 100 (= ₹1); treat < 1000 as paise for token fee
    const p = this.bookingAmountPaise;
    return p >= 1000 ? Math.round(p / 100) : Math.max(1, p);
  },
};

module.exports = config;
