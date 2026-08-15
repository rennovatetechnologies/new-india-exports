const fs = require('fs');
const path = require('path');
const { getDb, ensureIndexes } = require('../db');
const { utcnow } = require('../services/helpers');
const drive = require('../services/drive');

const SEED_ADMIN = {
  id: 'REQ-1042',
  name: 'Sanjay Rao',
  email: 'sanjay.r@newindiaexport.com',
  phone: '+91 98100 10001',
  role: 'admin',
  department: 'Platform governance',
  employeeId: 'VST-001',
  reason: 'Bootstrap platform admin',
  status: 'Approved',
  emailVerified: true,
  createdAt: '2025-04-01T08:00:00Z',
};

/** Active staff profiles to upsert by email (operations + admin). */
const SEED_STAFF = [
  {
    id: 'REQ-RAMA-ADMIN',
    name: 'Ramakrishna',
    email: 'ramakrishnamnit@gmail.com',
    phone: '',
    role: 'admin',
    department: 'Platform',
    employeeId: '',
    reason: 'Bootstrap platform admin',
    status: 'Approved',
    emailVerified: true,
    createdAt: '2026-03-08T08:00:00Z',
  },
];

const BASIC_KYC = [
  { id: 'pan', label: 'PAN card', required: true },
  { id: 'aadhaar', label: 'Aadhaar', required: true },
  { id: 'bankStatement', label: 'Bank statement (3 months)', required: true },
  { id: 'photo', label: 'Passport-size photo', required: true },
  { id: 'electricity', label: 'Electricity / address proof', required: true },
];

const BASIC_STAGES = [
  { id: 'kyc', label: 'KYC verified', description: 'Identity and business documents approved' },
  { id: 'entity', label: 'Company / entity setup', description: 'Registrations prepared with government portals' },
  { id: 'iec', label: 'IEC issued', description: 'Import Export Code from DGFT' },
  { id: 'adcode', label: 'AD code mapped', description: 'Bank AD code registration' },
  { id: 'docs_complete', label: 'Documentation complete', description: 'Core formation pack delivered' },
];

const DEFAULT_PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 33999,
    discountPercent: 0,
    tagline: 'For first-time exporters',
    timeline: 'Liaisoning · 22 days',
    featured: false,
    features: ['IEC + AD code', 'Core KYC pack', 'Email support', 'Formation workflow'],
    marketingFeatures: [
      { label: 'Gumasta / Shop Act Registration', included: true },
      { label: 'MSME Registration', included: true },
      { label: 'IEC (Import Export Code)', included: true },
      { label: 'Bank Account Assistance', included: true },
      { label: 'GST Registration & LUT Filing', included: true },
      { label: 'AD Code Generation', included: true },
      { label: 'RCMC Certificate', included: true },
      { label: 'Phytosanitary / Fumigation', included: true },
      { label: 'DSC (Class 3)', included: true },
      { label: 'DGFT Registration', included: false },
      { label: 'ICEGATE Integration', included: false },
      { label: 'Company Formation', included: false },
    ],
    kycDocs: BASIC_KYC,
    workflowStages: BASIC_STAGES,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 43999,
    discountPercent: 0,
    tagline: 'Most exporters pick this',
    timeline: 'Liaisoning · 22 days',
    featured: true,
    features: [
      'Everything in Basic',
      'RCMC + DGFT advisory',
      'GST & board resolution in KYC',
      'Priority ops support',
    ],
    marketingFeatures: [
      { label: 'Everything in Basic', included: true },
      { label: 'DGFT Registration & Integration', included: true },
      { label: 'ICEGATE Registration & Integration', included: true },
      { label: 'AD Code Approval', included: true },
      { label: 'IFSC / PFMS Approval', included: true },
      { label: 'Company Formation', included: false },
      { label: 'Trademark Application', included: false },
      { label: 'Quality Assessment Support', included: false },
      { label: 'Pre & Post Shipment Docs', included: false },
      { label: 'Shipment Cost Analysis', included: false },
      { label: 'Expert Compliance Reviews', included: false },
      { label: 'Exhibition Networking', included: false },
    ],
    kycDocs: [
      ...BASIC_KYC,
      { id: 'gst', label: 'GST certificate', required: true },
      { id: 'boardResolution', label: 'Board resolution', required: true },
    ],
    workflowStages: [
      ...BASIC_STAGES.slice(0, 4),
      { id: 'rcmc', label: 'RCMC / APEDA', description: 'Commodity board registration' },
      BASIC_STAGES[4],
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 83999,
    discountPercent: 0,
    tagline: 'Full white-glove desk',
    timeline: 'Liaisoning · 45 days',
    featured: false,
    features: [
      'Everything in Standard',
      'Dedicated operations owner',
      'Priority event seating support',
      'Extended documentation pack',
    ],
    marketingFeatures: [
      { label: 'Everything in Standard', included: true },
      { label: 'Company Formation', included: true },
      { label: 'Trademark Application', included: true },
      { label: 'Digital Platform Assistance', included: true },
      { label: 'Quality Assessment Certification', included: true },
      { label: 'Pre & Post Shipment Documentation', included: true },
      { label: 'Shipment Cost Analysis & Statement', included: true },
      { label: 'Expert Reviews & Compliance', included: true },
      { label: 'Exhibition Exposure & Networking', included: true },
      { label: 'Dedicated success manager', included: true },
      { label: 'Priority operations queue', included: true },
      { label: 'Investor & buyer intros', included: true },
    ],
    kycDocs: [
      ...BASIC_KYC,
      { id: 'gst', label: 'GST certificate', required: true },
      { id: 'boardResolution', label: 'Board resolution', required: true },
      { id: 'msme', label: 'MSME / Udyam certificate', required: false },
      { id: 'cancelledCheque', label: 'Cancelled cheque', required: true },
    ],
    workflowStages: [
      ...BASIC_STAGES.slice(0, 4),
      { id: 'rcmc', label: 'RCMC / APEDA', description: 'Commodity board registration' },
      { id: 'dedicated', label: 'Dedicated desk onboarding', description: 'Success manager + ops handoff' },
      BASIC_STAGES[4],
    ],
  },
];

const DEFAULT_EVENTS = [
  {
    id: 'e1',
    title: 'Global Buyer-Seller Meet 2026',
    date: '2026-06-22',
    startDate: '2026-06-22',
    endDate: '2026-06-22',
    city: 'Mumbai, India',
    img: '/event.png',
    seats: '120 delegates',
    capacity: 120,
    priceInr: 4999,
    discountPercent: 0,
    desc: 'Curated meet between Indian exporters and 40+ international buyers across spices, organic food and fresh produce.',
  },
  {
    id: 'e2',
    title: 'New India Export Summit',
    date: '2026-08-14',
    startDate: '2026-08-14',
    endDate: '2026-08-15',
    city: 'Dubai, UAE',
    img: '/event2.webp',
    seats: '200 delegates',
    capacity: 200,
    priceInr: 0,
    discountPercent: 0,
    desc: 'Two-day summit on MENA market access, halal certification and trade finance for Indian exporters.',
  },
];

const DEFAULT_OPS_ROSTER = [
  { email: 'ramakrishnamnit@gmail.com', name: 'Ramakrishna' },
];

const MOCK_BROCHURE_IDS = Array.from({ length: 17 }, (_, i) => `gallery-b${i + 1}`);

const BROCHURE_ASSETS_DIR = path.join(__dirname, '../assets/brochures');
const FRONTEND_PUBLIC_DIR = path.join(__dirname, '../../india-exports-hub-53/public');

/** Real published PDFs — stored on Drive/local and listed by GET /api/brochures. */
const DEFAULT_BROCHURES = [
  {
    id: 'pdf-workshop-flyer',
    name: 'Workshop Flyer',
    fileName: 'workshop-flyer.pdf',
    mimeType: 'application/pdf',
    showInNav: true,
    sortOrder: 10,
    sources: [
      path.join(BROCHURE_ASSETS_DIR, 'workshop-flyer.pdf'),
      path.join(FRONTEND_PUBLIC_DIR, 'new india (4).pdf'),
    ],
  },
  {
    id: 'pdf-workshop-brochure',
    name: 'Workshop Brochure',
    fileName: 'workshop-brochure.pdf',
    mimeType: 'application/pdf',
    showInNav: true,
    sortOrder: 20,
    sources: [
      path.join(BROCHURE_ASSETS_DIR, 'workshop-brochure.pdf'),
      path.join(FRONTEND_PUBLIC_DIR, 'BrochureFinal.pdf'),
    ],
  },
  {
    id: 'pdf-nie-virtual',
    name: 'NIE X Virtual Workshop Brochure',
    fileName: 'nie-virtual-workshop.pdf',
    mimeType: 'application/pdf',
    showInNav: true,
    sortOrder: 30,
    sources: [
      path.join(BROCHURE_ASSETS_DIR, 'nie-virtual-workshop.pdf'),
      path.join(FRONTEND_PUBLIC_DIR, 'brochure/NIE X VIRTUAL SHIPMENT WORKSHOP (5 DAYS) BROCHURE.pdf'),
    ],
  },
];

function resolveBrochureSource(sources) {
  for (const filePath of sources) {
    if (filePath && fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function brochurePublicPath(id) {
  return `/api/brochures/${encodeURIComponent(id)}/file`;
}

/** Upload catalog PDFs into Drive/local and upsert Mongo rows (idempotent). */
async function seedDefaultBrochures(db) {
  let uploaded = 0;
  let restored = 0;
  for (const item of DEFAULT_BROCHURES) {
    const existing = await db.collection('brochures').findOne({ id: item.id });
    const hasFile = Boolean(existing?.fileId || existing?.driveFileId);
    const live = existing && !existing.deletedAt;

    if (live && hasFile) continue;

    if (existing?.deletedAt && hasFile) {
      await db.collection('brochures').updateOne(
        { id: item.id },
        { $set: { deletedAt: null, updatedAt: utcnow() } }
      );
      restored += 1;
      continue;
    }

    const filePath = resolveBrochureSource(item.sources);
    if (!filePath) {
      console.warn(`Brochure PDF missing for ${item.id} (${item.fileName})`);
      continue;
    }

    const folderId = await drive.ensureBrochureFolder();
    const buffer = fs.readFileSync(filePath);
    const stored = await drive.upload({
      folderId,
      buffer,
      fileName: item.fileName,
      mimeType: item.mimeType,
      appProperties: { kind: 'brochure', brochureId: item.id, seeded: 'true' },
    });
    const publicPath = brochurePublicPath(item.id);
    const now = utcnow();
    await db.collection('brochures').updateOne(
      { id: item.id },
      {
        $set: {
          id: item.id,
          name: item.name,
          title: item.name,
          kind: 'pdf',
          description: '',
          category: '',
          showInNav: item.showInNav !== false,
          sortOrder: item.sortOrder,
          fileId: stored.fileId,
          driveFileId: stored.driveFileId,
          fileUrl: publicPath,
          fileName: item.fileName,
          fileType: item.mimeType,
          fileSize: stored.size,
          path: publicPath,
          updatedAt: now,
          deletedAt: null,
        },
        $setOnInsert: { createdAt: existing?.createdAt || now },
      },
      { upsert: true }
    );
    uploaded += 1;
  }
  if (uploaded || restored) {
    console.log(
      `Brochure PDFs ready: ${uploaded} uploaded, ${restored} restored`
    );
  }
}

/** Soft-delete catalog rows that were inserted as demo placeholders. */
async function purgeSeededMarketingCatalog(db) {
  const live = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };
  const events = await db.collection('events').updateMany(
    { id: { $in: DEFAULT_EVENTS.map((e) => e.id) }, ...live },
    { $set: { deletedAt: utcnow() } }
  );
  const brochures = await db.collection('brochures').updateMany(
    { id: { $in: MOCK_BROCHURE_IDS }, ...live },
    { $set: { deletedAt: utcnow() } }
  );
  const evN = events.modifiedCount || 0;
  const brN = brochures.modifiedCount || 0;
  if (evN || brN) {
    console.log(`Removed seeded mock catalog: ${evN} events, ${brN} brochures`);
  }
}

async function seedIfEmpty() {
  const db = getDb();
  if (!db) {
    console.warn('No DB; skip seed');
    return;
  }
  await ensureIndexes();

  if ((await db.collection('staff_requests').countDocuments({})) === 0) {
    await db.collection('staff_requests').insertOne(SEED_ADMIN);
    console.log('Seeded bootstrap admin request');
  }

  if (!(await db.collection('users').findOne({ email: SEED_ADMIN.email }))) {
    await db.collection('users').insertOne({
      email: SEED_ADMIN.email,
      name: SEED_ADMIN.name,
      phone: SEED_ADMIN.phone,
      role: 'admin',
      status: 'Active',
      kycComplete: true,
      company: 'New India Export',
      createdAt: utcnow(),
    });
    console.log('Seeded bootstrap admin user');
  }

  for (const staff of SEED_STAFF) {
    await db.collection('staff_requests').updateOne(
      { email: staff.email },
      { $set: { ...staff } },
      { upsert: true }
    );
    const existingUser = await db.collection('users').findOne({ email: staff.email });
    // Never clobber an existing customer account into staff — same email can own a case.
    if (existingUser?.role === 'customer') {
      console.log(
        `Skip staff user seed for ${staff.email} — already a customer (staff_requests still upserted)`
      );
      continue;
    }
    await db.collection('users').updateOne(
      { email: staff.email },
      {
        $set: {
          email: staff.email,
          name: staff.name,
          phone: staff.phone,
          role: staff.role,
          status: 'Active',
          kycComplete: true,
          company: 'New India Export',
        },
        $setOnInsert: { createdAt: utcnow() },
      },
      { upsert: true }
    );
    console.log(`Seeded staff ${staff.role}: ${staff.email}`);
  }

  if ((await db.collection('plans').countDocuments({})) === 0) {
    await db.collection('plans').insertMany(DEFAULT_PLANS.map((p) => ({ ...p, createdAt: utcnow() })));
    console.log('Seeded plans');
  } else {
    // Backfill catalog fields on older seeds without overwriting admin edits.
    for (const plan of DEFAULT_PLANS) {
      const existing = await db.collection('plans').findOne({ id: plan.id });
      if (!existing) continue;
      const patch = {};
      if (!existing.kycDocs || !existing.workflowStages) {
        patch.kycDocs = existing.kycDocs || plan.kycDocs;
        patch.workflowStages = existing.workflowStages || plan.workflowStages;
        if (!existing.features) patch.features = plan.features;
        if (!existing.tagline) patch.tagline = plan.tagline;
        if (existing.featured == null) patch.featured = plan.featured;
        if (existing.discountPercent == null) patch.discountPercent = 0;
      }
      if (!existing.timeline) patch.timeline = plan.timeline;
      if (!Array.isArray(existing.marketingFeatures) || existing.marketingFeatures.length === 0) {
        patch.marketingFeatures = plan.marketingFeatures;
      }
      if (Object.keys(patch).length) {
        await db.collection('plans').updateOne({ id: plan.id }, { $set: patch });
      }
    }
  }

  // Placeholder gallery rows stay purged. Real PDF catalogues are stored on the backend.
  await purgeSeededMarketingCatalog(db);
  await seedDefaultBrochures(db);

  await db.collection('config').updateOne(
    { key: 'ops_roster' },
    { $set: { value: DEFAULT_OPS_ROSTER, updatedAt: utcnow() } },
    { upsert: true }
  );
  console.log(`Seeded ops roster: ${DEFAULT_OPS_ROSTER.map((r) => r.email).join(', ')}`);


  // Do NOT seed legacy VST shipment cases for the production product surface.
}

module.exports = { seedIfEmpty, DEFAULT_PLANS, DEFAULT_EVENTS, DEFAULT_BROCHURES };

if (require.main === module) {
  require('dotenv').config();
  const { connectDb } = require('../db');
  connectDb()
    .then(() => seedIfEmpty())
    .then(() => {
      console.log('Seed complete');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
