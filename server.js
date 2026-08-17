require('dotenv').config();
const dns = require('dns');
// Railway has no outbound IPv6. Prefer A records so SMTP/GCS do not hit ENETUNREACH.
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const config = require('./config');
const { connectDb, getDb } = require('./db');
const { seedIfEmpty } = require('./scripts/seed');
const { verifyWebhookSignature, capturePayment, markPaymentFailed } = require('./services/payments');
const { startReminderJob } = require('./services/installments');
const { requestIdMiddleware } = require('./middleware/auth');
const drive = require('./services/drive');

const authRoutes = require('./routes/authRoutes');
const { staffRouter, rbacRouter } = require('./routes/staffRoutes');
const kycRoutes = require('./routes/kycRoutes');
const caseRoutes = require('./routes/caseRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const planRoutes = require('./routes/planRoutes');
const eventRoutes = require('./routes/eventRoutes');
const meRoutes = require('./routes/meRoutes');
const adminRoutes = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const fileRoutes = require('./routes/fileRoutes');
const { mountSwagger } = require('./middleware/swagger');

const app = express();

app.set('trust proxy', 1);
app.use(requestIdMiddleware);

app.use(
  cors({
    origin(origin, cb) {
      if (config.corsOriginAllowed(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

app.use(
  morgan(config.isProduction ? 'combined' : 'dev', {
    skip: (req) => req.path === '/health',
  })
);

// Razorpay webhook needs raw body BEFORE json parser
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['x-razorpay-signature'];
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyWebhookSignature(raw, sig)) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }
    const payload = JSON.parse(raw.toString('utf8') || '{}');
    const event = payload.event;
    const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity || {};

    if (event === 'payment.captured' || event === 'order.paid') {
      const orderId = entity.order_id || payload.payload?.order?.entity?.id;
      const paymentId = entity.id || payload.payload?.payment?.entity?.id;
      if (orderId && paymentId) {
        await capturePayment({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          source: 'webhook',
          actor: { email: 'razorpay', role: 'system' },
        });
      }
    } else if (event === 'payment.failed') {
      const orderId = entity.order_id;
      if (orderId) {
        await markPaymentFailed({
          razorpayOrderId: orderId,
          reason: entity.error_description || 'payment.failed',
          actor: { email: 'razorpay', role: 'system' },
        });
      }
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('webhook error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (!config.isProduction && req.path !== '/health') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

app.get('/', (req, res) => {
  res.json({
    status: 'New India Export Backend Running',
    version: '2.3.0-production',
    env: config.appEnv,
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    env: config.appEnv,
    mongoUri: Boolean(config.mongodbUri),
    db: Boolean(getDb()),
  });
});

if (config.enableDocs) {
  mountSwagger(app);
}

app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRouter);
app.use('/api/rbac', rbacRouter);
app.use('/api/kyc', kycRoutes);
app.use('/api', caseRoutes);
app.use('/api', paymentRoutes);
app.use('/api', invoiceRoutes);
app.use('/api', planRoutes);
app.use('/api', eventRoutes);
app.use('/api', meRoutes);
app.use('/api', fileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', supportRoutes);

if (config.enableLegacyShipment) {
  try {
    const vaultRoutes = require('./routes/vaultRoutes');
    app.use('/api/cases', vaultRoutes);
    console.warn('ENABLE_LEGACY_SHIPMENT=true — vault/shipment routes mounted');
  } catch (e) {
    console.warn('Legacy vault routes unavailable:', e.message);
  }
}

app.use((err, req, res, next) => {
  console.error('GLOBAL ERROR:', err);
  if (err instanceof multer.MulterError || err.message === 'File type not allowed') {
    return res.status(400).json({ success: false, message: err.message });
  }
  const status = err.status || 500;
  const body = err.body || {
    success: false,
    message: config.isProduction ? 'Internal Server Error' : err.message || 'Internal Server Error',
  };
  if (!config.isProduction && status === 500) body.error = err.message;
  return res.status(status).json(body);
});

async function bootDb() {
  await connectDb();
  await seedIfEmpty();
  try {
    const tree = await drive.ensureRootTree();
    console.log(
      'File storage ready',
      tree.mode === 'gcs'
        ? `(GCS gs://${tree.bucket}/${tree.env})`
        : '(local fallback)'
    );
  } catch (e) {
    console.warn('Drive bootstrap warning:', e.message);
  }
  startReminderJob();
}

async function start() {
  try {
    await bootDb();
  } catch (e) {
    console.error('Startup DB/seed error:', e.message);
    console.error(
      'MongoDB Atlas is not reachable from this IP. Add 223.233.85.23 to Network Access, then wait — the API will retry.'
    );
    let retrying = false;
    const retry = setInterval(async () => {
      if (retrying) return;
      retrying = true;
      try {
        await bootDb();
        clearInterval(retry);
        console.log('MongoDB connected after retry');
      } catch (err) {
        console.error('DB retry failed:', err.message);
      } finally {
        retrying = false;
      }
    }, 15000);
  }
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Express server running on port ${config.port} (${config.appEnv})`);
    if (config.isProduction && config.razorpayIsTest) {
      console.warn(
        'Razorpay TEST keys (rzp_test_) are in use in production until live keys are confirmed.'
      );
    }
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
