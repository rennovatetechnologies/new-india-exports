const fs = require('fs');
const path = require('path');
const { getDb, ensureIndexes, getCatalogDbs } = require('../db');
const { utcnow } = require('../services/helpers');
const drive = require('../services/drive');
const { catalogUpdateOne } = require('../services/catalog');

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
  { id: 'kyc', label: 'KYC Verification', description: 'Identity and business documents approved' },
  { id: 'shop_act', label: 'Shop & Establishment Act Registration', description: 'Local shop act / establishment filing' },
  { id: 'msme', label: 'MSME Registration', description: 'Udyam / MSME certificate' },
  { id: 'iec', label: 'IEC Registration', description: 'Import Export Code from DGFT' },
  { id: 'gst', label: 'GST Registration', description: 'GSTIN issued for the export entity' },
  { id: 'bank', label: 'Current Bank Account Assistance', description: 'Current account opened for export receipts' },
  { id: 'adcode', label: 'AD Code Registration', description: 'Bank AD code registered' },
  { id: 'rcmc', label: 'RCMC Certificate', description: 'Registration-cum-Membership Certificate' },
  { id: 'phytosanitary', label: 'Phytosanitary Certificate Assistance', description: 'Plant health certificate support' },
  { id: 'dsc', label: 'DSC Class 3', description: 'Digital Signature Certificate (Class 3)' },
];

const STANDARD_STAGES = [
  ...BASIC_STAGES,
  { id: 'dgft', label: 'DGFT Registration & Integration', description: 'DGFT portal registration and integration' },
  { id: 'icegate', label: 'ICEGATE Registration & Integration', description: 'Customs ICEGATE registration and integration' },
  { id: 'adcode_approval', label: 'AD Code Registration & Approval', description: 'AD code mapped and approved with the bank' },
  { id: 'pfms', label: 'IFSC / PFMS Registration & Approval', description: 'IFSC and PFMS registration approved' },
];

const PREMIUM_STAGES = [
  ...STANDARD_STAGES,
  { id: 'company', label: 'Company Formation Assistance', description: 'Private Limited, LLP, or OPC formation' },
  { id: 'trademark', label: 'Trademark Application Assistance', description: 'Trademark filing support' },
  { id: 'virastra', label: 'VIRASTRA Digital Platform Assistance', description: 'Onboarding to VIRASTRA by New India Export' },
  { id: 'shipment', label: 'Pre & Post-Shipment Guidance', description: 'Shipment workflow, documentation flow, and cost analysis' },
];

const STANDARD_KYC = [
  ...BASIC_KYC,
  { id: 'gst', label: 'GST certificate', required: true },
  { id: 'boardResolution', label: 'Board resolution', required: true },
];

const PREMIUM_KYC = [
  ...STANDARD_KYC,
  { id: 'msme', label: 'MSME / Udyam certificate', required: false },
  { id: 'cancelledCheque', label: 'Cancelled cheque', required: true },
];

const DEFAULT_PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 33999,
    discountPercent: 0,
    tagline: 'Documentation & Registration Services',
    description:
      'Essential registrations and documentation support required to start and operate an export business.',
    timeline: 'Liaisoning · 22 days',
    featured: false,
    features: [
      'KYC verification',
      'IEC, GST, MSME & Shop Act',
      'Current account + AD code',
      'RCMC, phytosanitary & DSC Class 3',
    ],
    marketingFeatures: [
      { label: 'KYC Verification', included: true },
      { label: 'Shop & Establishment Act Registration', included: true },
      { label: 'MSME Registration', included: true },
      { label: 'IEC (Import Export Code) Registration', included: true },
      { label: 'GST Registration', included: true },
      { label: 'Current Bank Account Assistance', included: true },
      { label: 'AD Code Registration', included: true },
      { label: 'RCMC Certificate', included: true },
      { label: 'Phytosanitary Certificate Assistance', included: true },
      { label: 'DSC – Digital Signature Certificate (Class 3)', included: true },
    ],
    kycDocs: BASIC_KYC,
    workflowStages: BASIC_STAGES,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 43999,
    discountPercent: 0,
    tagline: 'Documentation, Registration & Export Compliance',
    description:
      'Comprehensive support for business registrations, export documentation, government portal registrations, integrations, and required approvals.',
    timeline: 'Liaisoning · 22 days',
    featured: true,
    features: [
      'Core export registrations',
      'DGFT & ICEGATE integration',
      'AD code approval',
      'IFSC / PFMS registration & approval',
    ],
    marketingFeatures: [
      { label: 'Shop & Establishment Act Registration', included: true },
      { label: 'MSME Registration', included: true },
      { label: 'IEC – Import Export Code Registration', included: true },
      { label: 'Bank Account Assistance', included: true },
      { label: 'GST Registration', included: true },
      { label: 'AD Code Registration', included: true },
      { label: 'RCMC Registration', included: true },
      { label: 'Phytosanitary Certificate Assistance', included: true },
      { label: 'DSC – Digital Signature Certificate (Class 3)', included: true },
      { label: 'DGFT Registration & Integration', included: true },
      { label: 'ICEGATE Registration & Integration', included: true },
      { label: 'AD Code Registration & Approval', included: true },
      { label: 'IFSC/PFMS Registration & Approval', included: true },
    ],
    kycDocs: STANDARD_KYC,
    workflowStages: STANDARD_STAGES,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 83999,
    discountPercent: 0,
    tagline: 'Complete Business Formation, Export Documentation & Trade Support',
    description:
      'End-to-end export setup, including company formation, registrations, digital platform assistance, shipment support, expert guidance, and international trade networking.',
    timeline: 'Liaisoning · 45 days',
    featured: false,
    features: [
      'Company formation (Pvt Ltd / LLP / OPC)',
      'VIRASTRA digital platform assistance',
      'Shipment support & cost analysis (up to 3)',
      'Expert guidance & exhibition networking',
    ],
    marketingFeatures: [
      { group: 'Business Formation & Registrations', label: 'Shop & Establishment Act Registration', included: true },
      { group: 'Business Formation & Registrations', label: 'MSME Registration', included: true },
      { group: 'Business Formation & Registrations', label: 'IEC – Import Export Code Registration', included: true },
      { group: 'Business Formation & Registrations', label: 'Bank Account Assistance', included: true },
      { group: 'Business Formation & Registrations', label: 'GST Registration', included: true },
      { group: 'Business Formation & Registrations', label: 'AD Code Registration', included: true },
      { group: 'Business Formation & Registrations', label: 'RCMC Certificate', included: true },
      { group: 'Business Formation & Registrations', label: 'Phytosanitary Certificate Assistance', included: true },
      { group: 'Business Formation & Registrations', label: 'DSC – Digital Signature Certificate (Class 3)', included: true },
      { group: 'Government Portal & Compliance Support', label: 'DGFT Registration & Integration', included: true },
      { group: 'Government Portal & Compliance Support', label: 'ICEGATE Registration & Integration', included: true },
      { group: 'Government Portal & Compliance Support', label: 'AD Code Registration & Approval', included: true },
      { group: 'Government Portal & Compliance Support', label: 'IFSC / PFMS Registration & Approval', included: true },
      { group: 'Company Formation & Intellectual Property', label: 'Company Formation Assistance (Private Limited, LLP, OPC)', included: true },
      { group: 'Company Formation & Intellectual Property', label: 'Trademark Application Assistance', included: true },
      { group: 'Digital Export Platform', label: 'VIRASTRA by New India Export – Digital Platform Assistance', included: true },
      { group: 'Pre & Post-Shipment Support', label: 'Pre-Shipment & Post-Shipment Guidance', included: true },
      { group: 'Pre & Post-Shipment Support', label: 'Shipment Process Charts & Workflow', included: true },
      { group: 'Pre & Post-Shipment Support', label: 'Export Documentation Flow & Process Guidance', included: true },
      { group: 'Pre & Post-Shipment Support', label: 'Shipment Cost Analysis – Up to 3 Shipments', included: true },
      { group: 'Expert Business Support', label: 'Expert Reviews & Guidance', included: true },
      { group: 'Expert Business Support', label: 'Export Business Process Review', included: true },
      { group: 'Expert Business Support', label: 'Practical Guidance for Export Operations', included: true },
      { group: 'Exhibitions & Business Networking', label: 'Exhibition Exposure & Updates', included: true },
      { group: 'Exhibitions & Business Networking', label: 'International Trade Fair & Exhibition Networking Updates', included: true },
      { group: 'Exhibitions & Business Networking', label: 'Business Networking Opportunities & Relevant Trade Updates', included: true },
    ],
    kycDocs: PREMIUM_KYC,
    workflowStages: PREMIUM_STAGES,
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

function isSharedGcsRef(ref) {
  return String(ref || '').startsWith('gcs:SHARED/');
}

function catalogTargets(fallbackDb) {
  const dbs = getCatalogDbs();
  return dbs.length ? dbs : fallbackDb ? [fallbackDb] : [];
}

async function findBrochureAcross(dbs, id) {
  for (const db of dbs) {
    const row = await db.collection('brochures').findOne({ id });
    if (row) return row;
  }
  return null;
}

/** Upload catalog PDFs into SHARED GCS (or local) and upsert both env DBs. */
async function seedDefaultBrochures(db) {
  const targets = catalogTargets(db);
  let uploaded = 0;
  let restored = 0;
  for (const item of DEFAULT_BROCHURES) {
    const existing = await findBrochureAcross(targets, item.id);
    const live = existing && !existing.deletedAt;
    const onSharedGcs = isSharedGcsRef(existing?.driveFileId);

    if (live && existing?.fileId && onSharedGcs) continue;

    if (existing?.deletedAt && existing?.fileId && onSharedGcs) {
      await catalogUpdateOne(
        'brochures',
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
    await catalogUpdateOne(
      'brochures',
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
      `Brochure PDFs ready: ${uploaded} uploaded, ${restored} restored (shared catalog)`
    );
  }
}

/** Soft-delete catalog rows that were inserted as demo placeholders. */
async function purgeSeededMarketingCatalog(db) {
  const live = { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };
  // Events stay per-environment — only purge mocks on the current DB.
  const events = await db.collection('events').updateMany(
    { id: { $in: DEFAULT_EVENTS.map((e) => e.id) }, ...live },
    { $set: { deletedAt: utcnow() } }
  );
  let brN = 0;
  for (const d of catalogTargets(db)) {
    const brochures = await d.collection('brochures').updateMany(
      { id: { $in: MOCK_BROCHURE_IDS }, ...live },
      { $set: { deletedAt: utcnow() } }
    );
    brN += brochures.modifiedCount || 0;
  }
  const evN = events.modifiedCount || 0;
  if (evN || brN) {
    console.log(`Removed seeded mock catalog: ${evN} events (this env), ${brN} brochures (shared)`);
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

  const planTargets = catalogTargets(db);
  let sourcePlans = [];
  for (const d of planTargets) {
    const rows = await d
      .collection('plans')
      .find({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] })
      .toArray();
    if (rows.length) {
      sourcePlans = rows;
      break;
    }
  }
  if (!sourcePlans.length) {
    sourcePlans = DEFAULT_PLANS.map((p) => ({ ...p, createdAt: utcnow() }));
    console.log('Seeded default plans into shared catalog');
  }
  for (const plan of sourcePlans) {
    const { _id, createdAt, ...doc } = plan;
    const id = doc.id;
    if (!id) continue;
    await catalogUpdateOne(
      'plans',
      { id },
      {
        $set: { ...doc, id, deletedAt: null, updatedAt: utcnow() },
        $setOnInsert: { createdAt: createdAt || utcnow() },
      },
      { upsert: true }
    );
  }
  // Keep official marketing copy in sync without clobbering admin price/discount/featured.
  for (const plan of DEFAULT_PLANS) {
    await catalogUpdateOne(
      'plans',
      { id: plan.id },
      {
        $set: {
          name: plan.name,
          tagline: plan.tagline,
          description: plan.description,
          timeline: plan.timeline,
          features: plan.features,
          marketingFeatures: plan.marketingFeatures,
          workflowStages: plan.workflowStages,
          kycDocs: plan.kycDocs,
          updatedAt: utcnow(),
        },
      }
    );
  }
  console.log(`Shared plan catalog ready (${sourcePlans.length} plans, both envs)`);

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
