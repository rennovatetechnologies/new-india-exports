require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const config = require('./config');
const { connectDb } = require('./db');
const { seedIfEmpty } = require('./scripts/seed');
const { verifyWebhookSignature } = require('./services/razorpay');

const authRoutes = require('./routes/authRoutes');
const { staffRouter, rbacRouter } = require('./routes/staffRoutes');
const kycRoutes = require('./routes/kycRoutes');
const caseRoutes = require('./routes/caseRoutes');
const vaultRoutes = require('./routes/vaultRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const planRoutes = require('./routes/planRoutes');
const eventRoutes = require('./routes/eventRoutes');
const meRoutes = require('./routes/meRoutes');
const adminRoutes = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const { mountSwagger } = require('./middleware/swagger');

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);

app.use(morgan(config.isProduction ? 'combined' : 'dev'));

// Razorpay webhook needs raw body BEFORE json parser
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const sig = req.headers['x-razorpay-signature'];
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyWebhookSignature(raw, sig)) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'New India Export Backend Running' });
});

mountSwagger(app);

app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRouter);
app.use('/api/rbac', rbacRouter);
app.use('/api/kyc', kycRoutes);
app.use('/api', caseRoutes);
app.use('/api/cases', vaultRoutes);
app.use('/api', paymentRoutes);
app.use('/api', planRoutes);
app.use('/api', eventRoutes);
app.use('/api', meRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', supportRoutes);

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

async function start() {
  try {
    await connectDb();
    await seedIfEmpty();
  } catch (e) {
    console.error('Startup DB/seed error:', e.message);
  }
  app.listen(config.port, () => {
    console.log(`Express server running on port ${config.port} (${config.appEnv})`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
