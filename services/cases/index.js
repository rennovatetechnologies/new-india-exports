const { requireDb, getDb } = require('../../db');
const { utcnow, normalizeEmail } = require('../helpers');
const { newCaseId } = require('../ids');
const { writeAudit } = require('../audit');

const CASE_STATUS = {
  NO_PLAN: 'no_plan',
  UNPAID: 'unpaid',
  KYC_INCOMPLETE: 'kyc_incomplete',
  KYC_PENDING: 'kyc_pending',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CLOSED: 'closed',
};

/** Every paid plan is valid for this many calendar years from purchase/upgrade. */
const PLAN_VALIDITY_YEARS = 1;

const KYC_STATUS = {
  NONE: 'none',
  INCOMPLETE: 'incomplete',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  NEEDS_MORE: 'needs_more',
};

const DEFAULT_OPS_ROSTER = [
  { email: 'ramakrishnamnit@gmail.com', name: 'Ramakrishna' },
];

function emptyCaseDoc(email, userId, caseId) {
  const now = utcnow();
  return {
    id: caseId,
    customerEmail: normalizeEmail(email),
    customerUserId: userId || null,
    planId: null,
    previousPlanIds: [],
    paidPlanId: null,
    paymentStatus: 'none',
    amountPaid: 0,
    currency: 'INR',
    lastPaymentId: null,
    planPaidAt: null,
    planExpiresAt: null,
    kycStatus: KYC_STATUS.NONE,
    kycProfile: {
      legalName: '',
      entityType: 'Private Limited',
      incorporationDate: '',
      turnover: '₹0 - 1 Cr',
      registeredAddress: '',
      operatingCity: '',
      signatoryName: '',
      designation: '',
      panNumber: '',
      aadhaarLast4: '',
    },
    kycUploads: {},
    kycSubmittedAt: null,
    kycApprovedAt: null,
    kycRejectReason: null,
    /** Doc ids ops asked the customer to fix/re-upload (labels resolved from plan). */
    kycMissingDocIds: [],
    stageIndex: 0,
    stageNotes: {},
    documents: [],
    docRequests: [],
    opsEmail: null,
    opsName: null,
    status: CASE_STATUS.NO_PLAN,
    createdAt: now,
    updatedAt: now,
  };
}

function addPlanValidity(fromDate = utcnow()) {
  const d = new Date(fromDate);
  if (Number.isNaN(d.getTime())) {
    const fallback = utcnow();
    fallback.setUTCFullYear(fallback.getUTCFullYear() + PLAN_VALIDITY_YEARS);
    return fallback;
  }
  d.setUTCFullYear(d.getUTCFullYear() + PLAN_VALIDITY_YEARS);
  return d;
}

/** True when the customer has a paid plan that has not yet reached planExpiresAt. */
function isPlanEntitlementActive(c, at = utcnow()) {
  if (!c || c.paymentStatus !== 'paid' || !c.paidPlanId) return false;
  if (!c.planExpiresAt) return true; // legacy rows without expiry stay active until next purchase
  const expires = new Date(c.planExpiresAt);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() > new Date(at).getTime();
}

function isPlanExpired(c, at = utcnow()) {
  if (!c || c.paymentStatus !== 'paid' || !c.paidPlanId) return false;
  if (!c.planExpiresAt) return false;
  const expires = new Date(c.planExpiresAt);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() <= new Date(at).getTime();
}

function deriveStatus(c) {
  if (c.status === CASE_STATUS.CLOSED) return CASE_STATUS.CLOSED;
  if (c.paymentStatus !== 'paid' || !c.paidPlanId) {
    return c.planId ? CASE_STATUS.UNPAID : CASE_STATUS.NO_PLAN;
  }
  if (isPlanExpired(c)) return CASE_STATUS.EXPIRED;
  if (c.kycStatus === KYC_STATUS.APPROVED) return CASE_STATUS.ACTIVE;
  if (c.kycStatus === KYC_STATUS.SUBMITTED) return CASE_STATUS.KYC_PENDING;
  return CASE_STATUS.KYC_INCOMPLETE;
}

function publicCase(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return {
    ...rest,
    status: deriveStatus(doc),
    planEntitlementActive: isPlanEntitlementActive(doc),
  };
}

async function getOpsRoster() {
  const db = getDb();
  if (!db) return DEFAULT_OPS_ROSTER.map((x) => ({ ...x }));
  const cfg = await db.collection('config').findOne({ key: 'ops_roster' });
  if (cfg?.value && Array.isArray(cfg.value) && cfg.value.length) {
    return cfg.value.map((o) => ({
      email: normalizeEmail(o.email),
      name: String(o.name || '').trim() || normalizeEmail(o.email),
    }));
  }
  return DEFAULT_OPS_ROSTER.map((x) => ({ ...x }));
}

async function saveOpsRoster(list) {
  const db = requireDb();
  const value = (list || [])
    .map((o) => ({
      email: normalizeEmail(o.email),
      name: String(o.name || '').trim() || normalizeEmail(o.email),
    }))
    .filter((o) => o.email);
  await db.collection('config').updateOne(
    { key: 'ops_roster' },
    { $set: { key: 'ops_roster', value, updatedAt: utcnow() } },
    { upsert: true }
  );
  return value;
}

async function pickDefaultOps() {
  const roster = await getOpsRoster();
  return roster[0] || DEFAULT_OPS_ROSTER[0];
}

async function getOrCreateCaseForEmail(email, userId) {
  const db = requireDb();
  const emailN = normalizeEmail(email);
  let doc = await db.collection('customer_cases').findOne({
    customerEmail: emailN,
    status: { $ne: CASE_STATUS.CLOSED },
  });
  if (doc) return publicCase(doc);
  const caseId = await newCaseId(emailN);
  doc = emptyCaseDoc(emailN, userId, caseId);
  try {
    await db.collection('customer_cases').insertOne(doc);
  } catch (e) {
    if (e.code === 11000) {
      doc = await db.collection('customer_cases').findOne({ customerEmail: emailN });
      return publicCase(doc);
    }
    throw e;
  }
  return publicCase(doc);
}

async function getCaseById(caseId) {
  const db = requireDb();
  return publicCase(await db.collection('customer_cases').findOne({ id: caseId }));
}

async function getCaseByEmail(email) {
  const db = requireDb();
  return publicCase(
    await db.collection('customer_cases').findOne({
      customerEmail: normalizeEmail(email),
      status: { $ne: CASE_STATUS.CLOSED },
    })
  );
}

async function updateCase(caseId, patch, { actor } = {}) {
  const db = requireDb();
  const $set = { ...patch, updatedAt: utcnow() };
  if (
    patch.status == null &&
    (patch.paymentStatus != null ||
      patch.kycStatus != null ||
      patch.planId != null ||
      patch.planExpiresAt != null ||
      patch.paidPlanId != null)
  ) {
    const cur = await db.collection('customer_cases').findOne({ id: caseId });
    if (cur) $set.status = deriveStatus({ ...cur, ...patch });
  }
  await db.collection('customer_cases').updateOne({ id: caseId }, { $set });
  const next = await getCaseById(caseId);
  if (actor) {
    await writeAudit(actor, 'case.updated', {
      resource: { type: 'customer_case', id: caseId },
      after: { status: next.status, kycStatus: next.kycStatus, paymentStatus: next.paymentStatus },
    });
  }
  return next;
}

function planNotDeletedFilter(planId) {
  return {
    id: planId,
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  };
}

async function selectPlan(email, planId, { actor } = {}) {
  const db = requireDb();
  const c = await getOrCreateCaseForEmail(email);
  const plan = await db.collection('plans').findOne(planNotDeletedFilter(planId));
  if (!plan) {
    const err = new Error('Plan not found');
    err.status = 404;
    throw err;
  }
  const patch = {};
  if (isPlanEntitlementActive(c) && c.paidPlanId) {
    // Active entitlement: selecting another plan is for upgrade checkout only.
    patch.planId = plan.id;
  } else if (isPlanExpired(c)) {
    // Expired: keep KYC history; customer must repurchase (same or different plan).
    Object.assign(patch, {
      planId: plan.id,
      status: CASE_STATUS.EXPIRED,
    });
  } else {
    Object.assign(patch, {
      planId: plan.id,
      paymentStatus: 'none',
      paidPlanId: null,
      planPaidAt: null,
      planExpiresAt: null,
      kycStatus: KYC_STATUS.NONE,
      status: CASE_STATUS.UNPAID,
    });
  }
  return updateCase(c.id, patch, { actor });
}

async function markPlanPaid(caseDoc, { planId, amountPaid, paymentId, purpose }, { actor } = {}) {
  const db = requireDb();
  const plan = await db.collection('plans').findOne(planNotDeletedFilter(planId));
  if (!plan) {
    const err = new Error('Plan not found');
    err.status = 404;
    throw err;
  }
  const entitlementActive = isPlanEntitlementActive(caseDoc);
  const upgrading =
    entitlementActive && caseDoc.paidPlanId && caseDoc.paidPlanId !== plan.id;
  const renewing = !entitlementActive && Boolean(caseDoc.paidPlanId);
  const prevIds = upgrading
    ? [...new Set([...(caseDoc.previousPlanIds || []), caseDoc.paidPlanId])]
    : caseDoc.previousPlanIds || [];

  let opsEmail = caseDoc.opsEmail;
  let opsName = caseDoc.opsName;
  if (!opsEmail) {
    const o = await pickDefaultOps();
    opsEmail = o.email;
    opsName = o.name;
  }

  let kycStatus = caseDoc.kycStatus;
  // Fresh first purchase resets KYC; upgrades and renewals keep existing KYC progress.
  if (!upgrading && !renewing) kycStatus = KYC_STATUS.INCOMPLETE;

  const paidAt = utcnow();
  const expiresAt = addPlanValidity(paidAt);

  return updateCase(
    caseDoc.id,
    {
      planId: plan.id,
      paidPlanId: plan.id,
      previousPlanIds: prevIds,
      paymentStatus: 'paid',
      amountPaid: (Number(caseDoc.amountPaid) || 0) + (Number(amountPaid) || 0),
      lastPaymentId: paymentId || null,
      planPaidAt: paidAt,
      planExpiresAt: expiresAt,
      kycStatus,
      opsEmail,
      opsName,
      status: kycStatus === KYC_STATUS.APPROVED ? CASE_STATUS.ACTIVE : CASE_STATUS.KYC_INCOMPLETE,
    },
    { actor }
  );
}

function canAccessCase(user, caseDoc) {
  if (!user || !caseDoc) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'operations') {
    if (!caseDoc.opsEmail) return true;
    return normalizeEmail(caseDoc.opsEmail) === normalizeEmail(user.email);
  }
  return normalizeEmail(caseDoc.customerEmail) === normalizeEmail(user.email);
}

module.exports = {
  CASE_STATUS,
  KYC_STATUS,
  PLAN_VALIDITY_YEARS,
  DEFAULT_OPS_ROSTER,
  publicCase,
  deriveStatus,
  addPlanValidity,
  isPlanEntitlementActive,
  isPlanExpired,
  getOpsRoster,
  saveOpsRoster,
  pickDefaultOps,
  getOrCreateCaseForEmail,
  getCaseById,
  getCaseByEmail,
  updateCase,
  selectPlan,
  markPlanPaid,
  canAccessCase,
};
