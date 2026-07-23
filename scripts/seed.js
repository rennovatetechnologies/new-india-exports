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

const DEFAULT_PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 33999,
    tagline: 'For first-time exporters',
    featured: false,
    features: ['IEC + AD code', '1 product category', 'Email support', 'Basic KYC review'],
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 43999,
    tagline: 'Most exporters pick this',
    featured: true,
    features: [
      'Everything in Basic',
      'RCMC + DGFT advisory',
      '5 product categories',
      'Priority ops support',
      'Quarterly compliance review',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 83999,
    tagline: 'Full white-glove desk',
    featured: false,
    features: [
      'Everything in Standard',
      'Dedicated success manager',
      'Unlimited categories',
      'Buyer matchmaking',
      'Trade finance intro',
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
    desc: 'Curated meet between Indian exporters and 40+ international buyers across spices, organic food and fresh produce.',
  },
  {
    id: 'e2',
    title: 'New India Export Summit',
    date: '14 Aug 2026',
    city: 'Dubai, UAE',
    img: '/event2.webp',
    seats: '200 delegates',
    desc: 'Two-day summit on MENA market access, halal certification and trade finance for Indian exporters.',
  },
];

const WORKFLOW_CASES = [
  { id: 'VST-2041', title: 'Spices · Nagpur → Rotterdam', buyer: 'EuroSpice BV', value: '$48,200', stage: 4, accountName: 'Anil Sharma', accountCompany: 'Sharma Spices Pvt Ltd', accountEmail: 'anil@sharmaspices.example', sla: 'On track', opsOwner: 'Riya M.' },
  { id: 'VST-2038', title: 'Pulses · Mumbai → Dubai', buyer: 'Al-Madar Trading', value: '$22,900', stage: 6, accountName: 'Meera Kulkarni', accountCompany: 'Konkan Pulse Exports', accountEmail: 'meera@konkan.example', sla: 'On track', opsOwner: 'Neha T.' },
  { id: 'VST-2034', title: 'Organic · Cochin → Hamburg', buyer: 'BioNord GmbH', value: '$31,400', stage: 2, accountName: 'Thomas George', accountCompany: 'Kerala Organic Coop', accountEmail: 'thomas@keralaorganic.example', sla: 'On track', opsOwner: 'Aman P.' },
  { id: 'VST-2039', title: 'Coastal Organics · ICEGATE filing', buyer: 'Gulf Retail LLC', value: '$18,200', stage: 3, accountName: 'Priya Nair', accountCompany: 'Coastal Organics', accountEmail: 'priya@coastal.example', sla: 'Due today', opsOwner: 'Karan S.' },
  { id: 'VST-2036', title: 'Verma Agro · IEC issuance', buyer: 'FreshMart EU', value: '$9,400', stage: 2, accountName: 'Mohit Verma', accountCompany: 'Verma Agro Exports', accountEmail: 'mohit@vermaagro.example', sla: 'Breached', opsOwner: 'Riya M.' },
  { id: 'VST-2033', title: 'Iyer Foods · RCMC / APEDA', buyer: 'Nordic Foods AB', value: '$12,100', stage: 2, accountName: 'Lakshmi Iyer', accountCompany: 'Iyer Foods', accountEmail: 'lakshmi@iyerfoods.example', sla: 'On track', opsOwner: 'Aman P.' },
  { id: 'VST-2030', title: 'Saffron Trade · KYC review', buyer: '—', value: '—', stage: 1, accountName: 'Rohan Gupta', accountCompany: 'Saffron Trade Co.', accountEmail: 'rohan@saffron.example', sla: 'On track', opsOwner: 'Karan S.' },
];

const VAULT_DOCS = {
  'VST-2041': [
    { docId: '0', name: 'Commercial Invoice VST-2041.pdf', size: '92 KB', updated: '08 Apr', status: 'verified' },
    { docId: '1', name: 'Packing List VST-2041.pdf', size: '144 KB', updated: '08 Apr', status: 'verified' },
    { docId: '2', name: 'BL Draft Rotterdam.pdf', size: '267 KB', updated: '07 Apr', status: 'missing' },
    { docId: '3', name: 'Phytosanitary Cert.jpg', size: '1.2 MB', updated: '06 Apr', status: 'review' },
    { docId: '4', name: 'Certificate of Origin.pdf', size: '201 KB', updated: '06 Apr', status: 'verified' },
    { docId: '5', name: 'Letter of Credit.pdf', size: '—', updated: '—', status: 'missing' },
  ],
  'VST-2038': [
    { docId: '0', name: 'Commercial Invoice VST-2038.pdf', size: '88 KB', updated: '02 May', status: 'verified' },
    { docId: '1', name: 'Packing List VST-2038.pdf', size: '120 KB', updated: '02 May', status: 'verified' },
    { docId: '2', name: 'Health Certificate (UAE).pdf', size: '—', updated: '—', status: 'missing' },
    { docId: '3', name: 'Insurance Cover Note.pdf', size: '340 KB', updated: '01 May', status: 'review' },
    { docId: '4', name: 'Container Load Plan.pdf', size: '56 KB', updated: '30 Apr', status: 'verified' },
  ],
};

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

  if ((await db.collection('plans').countDocuments({})) === 0) {
    await db.collection('plans').insertMany(DEFAULT_PLANS);
    console.log('Seeded plans');
  }

  if ((await db.collection('events').countDocuments({})) === 0) {
    await db.collection('events').insertMany(DEFAULT_EVENTS);
    console.log('Seeded events');
  }

  if ((await db.collection('cases').countDocuments({})) === 0) {
    const now = utcnow();
    await db.collection('cases').insertMany(WORKFLOW_CASES.map((c) => ({ ...c, createdAt: now, updatedAt: now })));
    console.log('Seeded cases');
  }

  if ((await db.collection('case_documents').countDocuments({})) === 0) {
    const docs = [];
    for (const [caseId, list] of Object.entries(VAULT_DOCS)) {
      for (const d of list) docs.push({ caseId, ...d });
    }
    for (const c of WORKFLOW_CASES) {
      if (VAULT_DOCS[c.id]) continue;
      docs.push({
        caseId: c.id,
        docId: '0',
        name: `Kickoff pack ${c.id}.pdf`,
        size: '—',
        updated: '—',
        status: 'missing',
      });
    }
    if (docs.length) await db.collection('case_documents').insertMany(docs);
    console.log('Seeded vault docs');
  }
}

module.exports = { seedIfEmpty };

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
