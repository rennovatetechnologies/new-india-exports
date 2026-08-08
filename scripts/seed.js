const { getDb, ensureIndexes } = require('../db');
const { utcnow } = require('../services/helpers');

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
    featured: false,
    features: ['IEC + AD code', 'Core KYC pack', 'Email support', 'Formation workflow'],
    kycDocs: BASIC_KYC,
    workflowStages: BASIC_STAGES,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 43999,
    discountPercent: 0,
    tagline: 'Most exporters pick this',
    featured: true,
    features: [
      'Everything in Basic',
      'RCMC + DGFT advisory',
      'GST & board resolution in KYC',
      'Priority ops support',
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
    featured: false,
    features: [
      'Everything in Standard',
      'Dedicated operations owner',
      'Priority event seating support',
      'Extended documentation pack',
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
    date: '22 Jun 2026',
    city: 'Mumbai, India',
    img: '/event.png',
    seats: '120 delegates',
    capacity: 120,
    priceInr: 4999,
    desc: 'Curated meet between Indian exporters and 40+ international buyers across spices, organic food and fresh produce.',
  },
  {
    id: 'e2',
    title: 'New India Export Summit',
    date: '14 Aug 2026',
    city: 'Dubai, UAE',
    img: '/event2.webp',
    seats: '200 delegates',
    capacity: 200,
    priceInr: 0,
    desc: 'Two-day summit on MENA market access, halal certification and trade finance for Indian exporters.',
  },
];

const DEFAULT_OPS_ROSTER = [
  { email: 'ramakrishnamnit@gmail.com', name: 'Ramakrishna' },
];

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
    // ensure kycDocs/workflowStages exist on older seeds
    for (const plan of DEFAULT_PLANS) {
      const existing = await db.collection('plans').findOne({ id: plan.id });
      if (existing && (!existing.kycDocs || !existing.workflowStages)) {
        await db.collection('plans').updateOne(
          { id: plan.id },
          {
            $set: {
              kycDocs: plan.kycDocs,
              workflowStages: plan.workflowStages,
              features: plan.features,
              tagline: plan.tagline,
              featured: plan.featured,
              discountPercent: existing.discountPercent ?? 0,
            },
          }
        );
      }
    }
  }

  if ((await db.collection('events').countDocuments({})) === 0) {
    await db.collection('events').insertMany(DEFAULT_EVENTS.map((e) => ({ ...e, createdAt: utcnow() })));
    console.log('Seeded events');
  } else {
    for (const ev of DEFAULT_EVENTS) {
      await db.collection('events').updateOne(
        { id: ev.id, priceInr: { $exists: false } },
        { $set: { priceInr: ev.priceInr } }
      );
    }
  }

  await db.collection('config').updateOne(
    { key: 'ops_roster' },
    { $set: { value: DEFAULT_OPS_ROSTER, updatedAt: utcnow() } },
    { upsert: true }
  );
  console.log(`Seeded ops roster: ${DEFAULT_OPS_ROSTER.map((r) => r.email).join(', ')}`);

  // Brochure metadata (static site paths for gallery photos / bundled PDFs — not Drive uploads).
  if ((await db.collection('brochures').countDocuments({})) === 0) {
    const gallery = Array.from({ length: 17 }, (_, i) => ({
      id: `gallery-b${i + 1}`,
      title: `Brochure ${i + 1}`,
      name: `Brochure ${i + 1}`,
      kind: 'gallery',
      path: `/brochure/B${i + 1}.jpg`,
      showInNav: false,
      sortOrder: 100 + i,
      createdAt: utcnow(),
      updatedAt: utcnow(),
      deletedAt: null,
    }));
    const pdfs = [
      {
        id: 'pdf-workshop-flyer',
        title: 'Workshop Flyer',
        name: 'Workshop Flyer',
        kind: 'pdf',
        path: '/new india (4).pdf',
        showInNav: true,
        sortOrder: 10,
      },
      {
        id: 'pdf-workshop-brochure',
        title: 'Workshop Brochure',
        name: 'Workshop Brochure',
        kind: 'pdf',
        path: '/BrochureFinal.pdf',
        showInNav: true,
        sortOrder: 20,
      },
      {
        id: 'pdf-nie-virtual',
        title: 'NIE X Virtual Workshop Brochure',
        name: 'NIE X Virtual Workshop Brochure',
        kind: 'pdf',
        path: '/brochure/NIE X VIRTUAL SHIPMENT WORKSHOP (5 DAYS) BROCHURE.pdf',
        showInNav: true,
        sortOrder: 30,
      },
    ].map((b) => ({ ...b, createdAt: utcnow(), updatedAt: utcnow(), deletedAt: null }));
    await db.collection('brochures').insertMany([...pdfs, ...gallery]);
    console.log('Seeded brochures catalog');
  }

  // Do NOT seed legacy VST shipment cases for the production product surface.
}

module.exports = { seedIfEmpty, DEFAULT_PLANS, DEFAULT_EVENTS };

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
