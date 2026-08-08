const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../../config');
const { requireDb, getDb } = require('../../db');
const { utcnow, normalizeEmail } = require('../helpers');
const { newPaymentId } = require('../ids');
const { effectivePrice, computeGst, fromInclusiveTotal, inrToPaise } = require('../gst');
const { writeAudit } = require('../audit');
const { enqueueEmail } = require('../mail');
const { issueInvoiceForPayment } = require('../invoices');
const cases = require('../cases');

function getRazorpayClient() {
  if (!config.razorpayKeyId || !config.razorpayKeySecret || config.razorpayKeyId === 'YOUR_KEY_ID') {
    throw Object.assign(new Error('Razorpay keys missing'), { status: 503 });
  }
  return new Razorpay({
    key_id: config.razorpayKeyId,
    key_secret: config.razorpayKeySecret,
  });
}

function verifyPaymentSignature(orderId, paymentId, signature) {
  const keySecret = config.razorpayKeySecret || '';
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature || ''));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = config.razorpayWebhookSecret;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch (_) {
    return false;
  }
}

async function loadPlan(planId) {
  const db = requireDb();
  const plan = await db.collection('plans').findOne({ id: planId });
  if (!plan || plan.deletedAt) return null;
  return plan;
}

/**
 * Server-side price resolution. Returns { purpose, sku, description, amounts, caseId, meta, customerEmail }
 * amounts are GST breakdown in INR rupees; razorpay uses amounts.total * 100
 */
async function resolvePricing(body, user) {
  const db = getDb();
  const purpose = String(body.purpose || body.sku || '').toLowerCase();
  const planId = body.planId || (purpose === 'plan' || purpose === 'plan_upgrade' ? body.sku : null);
  const eventId = body.eventId || (purpose === 'event' ? body.sku : null);
  const customerEmail = normalizeEmail(
    user?.email || body.customerDetails?.email || body.email || ''
  );

  // Plan purchase / upgrade (skip when caller explicitly asked for an event)
  if (
    purpose !== 'event' &&
    purpose !== 'workshop' &&
    purpose !== 'booking' &&
    (planId || purpose === 'plan' || purpose === 'plan_upgrade')
  ) {
    const plan = await loadPlan(planId || body.sku);
    if (!plan) {
      throw Object.assign(new Error('Plan not found'), { status: 404 });
    }
    let caseDoc = customerEmail ? await cases.getCaseByEmail(customerEmail) : null;
    if (!caseDoc && customerEmail) {
      caseDoc = await cases.getOrCreateCaseForEmail(customerEmail, user?.sub);
    }
    const entitlementActive = cases.isPlanEntitlementActive(caseDoc);
    if (entitlementActive && caseDoc?.paidPlanId === plan.id) {
      throw Object.assign(new Error('This plan is already active until its expiry date'), {
        status: 400,
        code: 'PLAN_ALREADY_ACTIVE',
      });
    }
    const isUpgrade =
      entitlementActive && caseDoc?.paidPlanId && caseDoc.paidPlanId !== plan.id;

    let taxable = effectivePrice(plan.price, plan.discountPercent);
    if (isUpgrade && caseDoc?.paidPlanId) {
      const prev = await loadPlan(caseDoc.paidPlanId);
      const prevEff = prev ? effectivePrice(prev.price, prev.discountPercent) : 0;
      const nextEff = effectivePrice(plan.price, plan.discountPercent);
      taxable = Math.max(0, nextEff - prevEff);
      if (taxable === 0) {
        throw Object.assign(new Error('No upgrade amount due'), { status: 400 });
      }
    }
    const amounts = computeGst(taxable);
    return {
      purpose: isUpgrade ? 'plan_upgrade' : 'plan',
      sku: plan.id,
      description: `${plan.name} plan${isUpgrade ? ' upgrade' : ''}`,
      amounts,
      caseId: caseDoc?.id || null,
      planId: plan.id,
      planName: plan.name,
      customerEmail,
      listPrice: plan.price,
      discountPercent: plan.discountPercent || 0,
      meta: body.meta || {},
    };
  }

  if (purpose === 'workshop' || body.sku === 'workshop') {
    const amounts = fromInclusiveTotal(config.workshopInr);
    return {
      purpose: 'workshop',
      sku: 'workshop',
      description: 'Virtual shipment workshop',
      amounts,
      caseId: null,
      customerEmail,
      meta: body.meta || body.bookingDetails || {},
    };
  }

  if (purpose === 'booking' || body.sku === 'booking') {
    const amounts = fromInclusiveTotal(config.bookingInr);
    return {
      purpose: 'booking',
      sku: 'booking',
      description: 'Shipment booking token',
      amounts,
      caseId: null,
      customerEmail,
      meta: body.meta || body.bookingDetails || {},
    };
  }

  if (eventId || purpose === 'event') {
    const event = db ? await db.collection('events').findOne({ id: eventId || body.sku }) : null;
    const priceInr = Math.round(Number(event?.priceInr ?? event?.price ?? 0) || 0);
    if (priceInr <= 0) {
      return {
        purpose: 'event',
        sku: event?.id || eventId || 'event',
        description: event?.title || 'Event registration',
        amounts: computeGst(0),
        free: true,
        caseId: null,
        customerEmail,
        eventId: event?.id || eventId,
        meta: body.meta || {},
      };
    }
    const amounts = computeGst(priceInr);
    return {
      purpose: 'event',
      sku: event?.id || eventId,
      description: event?.title || 'Event registration',
      amounts,
      caseId: null,
      customerEmail,
      eventId: event?.id || eventId,
      meta: body.meta || {},
    };
  }

  // Fallback: treat client amount as paise only for unknown guest SKUs (min ₹1)
  const raw = Number(body.amount);
  if (!Number.isFinite(raw) || raw < 100) {
    throw Object.assign(new Error('Unable to resolve amount for order'), { status: 400 });
  }
  // If amount looks like INR rupees (< 100000 and not divisible oddly) — FE sends paise for plans historically
  // Contract: never trust client for known SKUs; for unknown, interpret as paise if >= 100
  const totalInr = Math.round(raw / 100);
  const amounts = fromInclusiveTotal(totalInr);
  return {
    purpose: purpose || 'other',
    sku: body.sku || 'custom',
    description: body.description || 'Payment',
    amounts,
    caseId: null,
    customerEmail,
    meta: body.meta || {},
  };
}

async function createOrder(body, user, { actor } = {}) {
  const pricing = await resolvePricing(body, user);
  if (pricing.free) {
    return { free: true, pricing };
  }
  const paise = inrToPaise(pricing.amounts.total);
  if (paise < 100) {
    throw Object.assign(new Error('Order amount too small'), { status: 400 });
  }

  const client = getRazorpayClient();
  const receipt = body.receipt || `rcpt_${Date.now()}`;
  const razorpayOrder = await client.orders.create({
    amount: paise,
    currency: 'INR',
    receipt,
    notes: {
      purpose: pricing.purpose,
      sku: pricing.sku,
      caseId: pricing.caseId || '',
      email: pricing.customerEmail || '',
    },
  });

  const db = requireDb();
  const paymentId = await newPaymentId();
  const payment = {
    id: paymentId,
    razorpayOrderId: razorpayOrder.id,
    // Omit razorpayPaymentId until capture — unique index must not see multiple nulls
    status: 'created',
    purpose: pricing.purpose,
    sku: pricing.sku,
    customerEmail: pricing.customerEmail || null,
    customerName: body.customerDetails?.name || user?.name || '',
    customerPhone: body.customerDetails?.phone || '',
    customerCompany: body.customerDetails?.company || '',
    customerState: body.customerDetails?.state || '',
    caseId: pricing.caseId || null,
    amounts: pricing.amounts,
    currency: 'INR',
    description: pricing.description,
    planId: pricing.planId || null,
    eventId: pricing.eventId || null,
    listPrice: pricing.listPrice,
    discountPercent: pricing.discountPercent,
    meta: pricing.meta || {},
    createdAt: utcnow(),
    updatedAt: utcnow(),
  };
  await db.collection('payments').insertOne(payment);
  // legacy orders collection for compatibility
  await db.collection('orders').updateOne(
    { razorpayOrderId: razorpayOrder.id },
    {
      $set: {
        razorpayOrderId: razorpayOrder.id,
        paymentId,
        amount: paise,
        amountInr: pricing.amounts.total,
        currency: 'INR',
        status: 'created',
        sku: pricing.sku,
        purpose: pricing.purpose,
        planId: pricing.planId || null,
        email: pricing.customerEmail,
        createdAt: utcnow(),
      },
    },
    { upsert: true }
  );

  await writeAudit(actor || { email: pricing.customerEmail || '', role: user?.role || 'anonymous' }, 'payment.created', {
    resource: { type: 'payment', id: paymentId },
    meta: { orderId: razorpayOrder.id, total: pricing.amounts.total, purpose: pricing.purpose },
    tone: 'info',
  });

  return {
    free: false,
    payment,
    order: razorpayOrder,
    id: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: 'INR',
  };
}

async function applySideEffects(payment, { actor } = {}) {
  const db = requireDb();
  const email = normalizeEmail(payment.customerEmail || '');

  if (payment.purpose === 'plan' || payment.purpose === 'plan_upgrade') {
    let caseDoc = payment.caseId
      ? await cases.getCaseById(payment.caseId)
      : email
        ? await cases.getOrCreateCaseForEmail(email)
        : null;
    if (caseDoc) {
      await cases.markPlanPaid(
        caseDoc,
        {
          planId: payment.planId || payment.sku,
          amountPaid: payment.amounts?.taxable || 0,
          paymentId: payment.id,
          purpose: payment.purpose,
        },
        { actor }
      );
      caseDoc = await cases.getCaseById(caseDoc.id);
    }

    try {
      await enqueueEmail({
        to: email,
        template: payment.purpose === 'plan_upgrade' ? 'plan.upgraded' : 'payment.receipt',
        vars: {
          customerName: payment.customerName || email,
          planName: payment.description,
          amountInr: payment.amounts?.total,
          paymentId: payment.id,
          caseId: caseDoc?.id,
          ctaUrl: `${config.frontendUrl}/dashboard`,
        },
        actor,
      });
      await enqueueEmail({
        to: config.opsInbox,
        template: 'payment.ops_alert',
        vars: {
          customer: payment.customerName || email,
          customerName: payment.customerName || email,
          planName: payment.description,
          amountInr: payment.amounts?.total,
          caseId: caseDoc?.id,
        },
        actor,
      });
    } catch (_) {}
  }

  if (payment.purpose === 'workshop') {
    await db.collection('workshop_registrations').updateOne(
      { razorpayPaymentId: payment.razorpayPaymentId },
      {
        $set: {
          email,
          name: payment.customerName,
          paymentId: payment.id,
          razorpayPaymentId: payment.razorpayPaymentId,
          meta: payment.meta || {},
          createdAt: utcnow(),
        },
      },
      { upsert: true }
    );
  }

  if (payment.purpose === 'event' && payment.eventId) {
    await db.collection('event_registrations').updateOne(
      { eventId: payment.eventId, email },
      {
        $set: {
          eventId: payment.eventId,
          email,
          name: payment.customerName,
          paymentId: payment.id,
          status: 'registered',
          updatedAt: utcnow(),
        },
        $setOnInsert: { createdAt: utcnow() },
      },
      { upsert: true }
    );
  }

  if (payment.purpose === 'booking') {
    await db.collection('bookings').insertOne({
      email,
      name: payment.customerName,
      paymentId: payment.id,
      razorpayPaymentId: payment.razorpayPaymentId,
      status: 'received',
      ...(payment.meta || {}),
      createdAt: utcnow(),
    });
    try {
      await enqueueEmail({
        to: email,
        template: 'booking.received_customer',
        vars: { customerName: payment.customerName, customerEmail: email },
        actor,
      });
      await enqueueEmail({
        to: config.opsInbox,
        template: 'booking.received_ops',
        vars: { customerName: payment.customerName, customerEmail: email },
        actor,
      });
    } catch (_) {}
  }
}

/**
 * Idempotent capture path used by verify-payment and webhook.
 */
async function capturePayment({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  source = 'verify',
  actor,
}) {
  const db = requireDb();

  let payment = await db.collection('payments').findOne({
    $or: [
      { razorpayPaymentId },
      { razorpayOrderId },
    ],
  });

  if (payment?.status === 'paid' && payment.invoiceId) {
    const invoice = await db.collection('invoices').findOne({ id: payment.invoiceId });
    return { payment, invoice, alreadyProcessed: true };
  }

  if (!payment) {
    // create minimal payment from order notes
    const order = await db.collection('orders').findOne({ razorpayOrderId });
    const paymentId = await newPaymentId();
    payment = {
      id: paymentId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: razorpaySignature || null,
      status: 'paid',
      purpose: order?.purpose || 'other',
      sku: order?.sku || 'custom',
      customerEmail: order?.email || null,
      caseId: order?.caseId || null,
      amounts: order?.amounts || fromInclusiveTotal(Math.round((order?.amount || 0) / 100)),
      invoiceId: null,
      currency: 'INR',
      description: order?.description || 'Payment',
      planId: order?.planId || null,
      createdAt: utcnow(),
      updatedAt: utcnow(),
      paidAt: utcnow(),
    };
    await db.collection('payments').insertOne(payment);
  }

  await db.collection('payments').updateOne(
    { id: payment.id },
    {
      $set: {
        status: 'paid',
        razorpayPaymentId,
        razorpaySignature: razorpaySignature || payment.razorpaySignature,
        paidAt: payment.paidAt || utcnow(),
        updatedAt: utcnow(),
        captureSource: source,
      },
    }
  );
  payment = await db.collection('payments').findOne({ id: payment.id });

  await db.collection('orders').updateOne(
    { razorpayOrderId },
    { $set: { status: 'paid', razorpayPaymentId, updatedAt: utcnow() } }
  );

  // side effects only once
  if (!payment.sideEffectsApplied) {
    await applySideEffects(payment, { actor });
    await db.collection('payments').updateOne(
      { id: payment.id },
      { $set: { sideEffectsApplied: true, updatedAt: utcnow() } }
    );
  }

  const invoice = await issueInvoiceForPayment(payment, { actor });
  payment = await db.collection('payments').findOne({ id: payment.id });

  await writeAudit(actor || { email: payment.customerEmail || '', role: 'system' }, 'payment.captured', {
    resource: { type: 'payment', id: payment.id },
    meta: { razorpayPaymentId, source, invoiceId: invoice?.id },
    tone: 'success',
  });

  return { payment, invoice, alreadyProcessed: false };
}

async function markPaymentFailed({ razorpayOrderId, reason, actor }) {
  const db = requireDb();
  const payment = await db.collection('payments').findOne({ razorpayOrderId });
  if (!payment) return null;
  if (payment.status === 'paid') return payment;
  await db.collection('payments').updateOne(
    { id: payment.id },
    { $set: { status: 'failed', failReason: reason || '', updatedAt: utcnow() } }
  );
  if (payment.customerEmail) {
    try {
      await enqueueEmail({
        to: payment.customerEmail,
        template: 'payment.failed',
        vars: {
          customerName: payment.customerName || payment.customerEmail,
          planName: payment.description,
          ctaUrl: `${config.frontendUrl}/dashboard/billing`,
        },
        actor,
      });
    } catch (_) {}
  }
  await writeAudit(actor || { email: 'system', role: 'system' }, 'payment.failed', {
    resource: { type: 'payment', id: payment.id },
    meta: { reason },
    tone: 'danger',
    success: false,
  });
  return db.collection('payments').findOne({ id: payment.id });
}

module.exports = {
  getRazorpayClient,
  verifyPaymentSignature,
  verifyWebhookSignature,
  resolvePricing,
  createOrder,
  capturePayment,
  markPaymentFailed,
  applySideEffects,
};
