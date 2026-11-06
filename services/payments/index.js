const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../../config');
const { requireDb, getDb } = require('../../db');
const { utcnow, normalizeEmail, isEventExpired } = require('../helpers');
const { newPaymentId } = require('../ids');
const { effectivePrice, computeGst, fromInclusiveTotal, inrToPaise } = require('../gst');
const { writeAudit } = require('../audit');
const { enqueueEmail } = require('../mail');
const { enqueueWhatsApp } = require('../whatsapp');
const { issueInvoiceForPayment } = require('../invoices');
const cases = require('../cases');
const installments = require('../installments');

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

  if (purpose === 'community' || body.sku === 'community') {
    if (!customerEmail) {
      throw Object.assign(new Error('Sign in to buy community access'), { status: 401 });
    }
    const community = require('../community');
    const access = await community.getAccessForEmail(customerEmail);
    const settings = access.settings;
    if (!settings.enabled) {
      throw Object.assign(new Error('Community access is not required right now'), { status: 400 });
    }
    if (settings.priceInr <= 0) {
      return {
        purpose: 'community',
        sku: 'community',
        description: settings.title || 'Community access',
        amounts: computeGst(0),
        free: true,
        caseId: null,
        customerEmail,
        meta: body.meta || {},
      };
    }
    if (access.active && access.source !== 'complimentary' && access.source !== 'disabled') {
      throw Object.assign(new Error('Community access is already active'), {
        status: 400,
        code: 'COMMUNITY_ALREADY_ACTIVE',
      });
    }
    const amounts = computeGst(settings.priceInr);
    return {
      purpose: 'community',
      sku: 'community',
      description: settings.title || 'Community access',
      amounts,
      caseId: null,
      customerEmail,
      validityDays: settings.validityDays,
      listPrice: settings.priceInr,
      discountPercent: 0,
      meta: body.meta || {},
    };
  }

  // Plan purchase / upgrade (skip when caller explicitly asked for an event)
  if (
    purpose !== 'event' &&
    purpose !== 'workshop' &&
    purpose !== 'booking' &&
    purpose !== 'community' &&
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
    if (!event || event.deletedAt) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    if (isEventExpired(event) && !body.installmentPlanId) {
      throw Object.assign(new Error('This event has ended'), {
        status: 410,
        code: 'EVENT_EXPIRED',
      });
    }
    if (user?.role === 'customer' && customerEmail) {
      const community = require('../community');
      const access = await community.getAccessForEmail(customerEmail);
      if (!access.active) {
        throw Object.assign(new Error('Community access is required to register for events'), {
          status: 402,
          code: 'COMMUNITY_ACCESS_REQUIRED',
        });
      }
    }
    const listPrice = Math.round(Number(event?.priceInr ?? event?.price ?? 0) || 0);
    const discountPercent = event?.discountPercent ?? 0;
    const priceInr = effectivePrice(listPrice, discountPercent);
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

  let installmentCtx = null;
  installmentCtx = await installments.prepareForOrder({ pricing, body, user });
  if (installmentCtx) {
    const { plan, installment } = installmentCtx;
    pricing.amounts = installment.amounts;
    pricing.description = `${pricing.description} · installment ${installment.number} of ${plan.installmentCount}`;
    pricing.installmentPlanId = plan.id;
    pricing.installmentNumber = installment.number;
    pricing.installmentCount = plan.installmentCount;
    pricing.installmentDueAt = installment.dueAt;
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
      installmentPlanId: pricing.installmentPlanId || '',
      installmentNumber: String(pricing.installmentNumber || ''),
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
    installmentPlanId: pricing.installmentPlanId || null,
    installmentNumber: pricing.installmentNumber || null,
    installmentCount: pricing.installmentCount || null,
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
        eventId: pricing.eventId || null,
        installmentPlanId: pricing.installmentPlanId || null,
        installmentNumber: pricing.installmentNumber || null,
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
    installment: installmentCtx
      ? {
          planId: installmentCtx.plan.id,
          number: installmentCtx.installment.number,
          count: installmentCtx.plan.installmentCount,
          dueAt: installmentCtx.installment.dueAt,
          amounts: installmentCtx.installment.amounts,
        }
      : null,
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
    if (payment.installmentPlanId) {
      await installments.markInstallmentPaid(payment, { actor });
    } else {
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
      try {
        const event = await db.collection('events').findOne({ id: payment.eventId });
        await enqueueEmail({
          to: email,
          template: 'event.registered',
          vars: {
            name: payment.customerName || '',
            title: event?.title || payment.description,
            date: event?.date || '',
            city: event?.city || '',
          },
          actor,
        });
      } catch (_) {}
    }
  }

  if (payment.purpose === 'community') {
    try {
      const community = require('../community');
      const settings = await community.getSettings();
      await community.grantAccess(
        email,
        {
          paymentId: payment.id,
          amountPaid: payment.amounts?.taxable || 0,
          validityDays: settings.validityDays,
          source: 'community',
        },
        { actor }
      );
    } catch (e) {
      console.warn('community grant failed:', e.message);
    }
    try {
      await enqueueEmail({
        to: email,
        template: 'payment.receipt',
        vars: {
          customerName: payment.customerName || email,
          planName: payment.description || 'Community access',
          amountInr: payment.amounts?.total,
          paymentId: payment.id,
          ctaUrl: `${config.frontendUrl}/dashboard`,
        },
        actor,
      });
    } catch (_) {}
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
      eventId: order?.eventId || null,
      installmentPlanId: order?.installmentPlanId || null,
      installmentNumber: order?.installmentNumber ? Number(order.installmentNumber) : null,
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
  if (payment.status === 'paid' || payment.status === 'failed' || payment.status === 'refunded') {
    return payment;
  }
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

function paiseToInr(paise) {
  return Math.round(Number(paise) || 0) / 100;
}

function isoFromUnix(sec) {
  const n = Number(sec);
  if (!n) return null;
  return new Date(n * 1000).toISOString();
}

function mapGatewayRefund(refund) {
  const notes = refund?.notes && typeof refund.notes === 'object' && !Array.isArray(refund.notes)
    ? refund.notes
    : {};
  return {
    id: refund.id,
    amountInr: paiseToInr(refund.amount),
    currency: refund.currency || 'INR',
    status: refund.status || null,
    speed: refund.speed_processed || refund.speed_requested || null,
    reason: notes.refund_reason || notes.reason || null,
    createdAt: isoFromUnix(refund.created_at),
    creditRrn: refund.acquirer_data?.rrn || null,
  };
}

function mapGatewayPayment(payment, refunds) {
  return {
    id: payment.id,
    orderId: payment.order_id || null,
    status: payment.status || null,
    amountInr: paiseToInr(payment.amount),
    amountRefundedInr: paiseToInr(payment.amount_refunded),
    currency: payment.currency || 'INR',
    method: payment.method || null,
    captured: Boolean(payment.captured),
    refundStatus: payment.refund_status || null,
    description: payment.description || '',
    customerEmail: payment.email || null,
    customerContact: payment.contact || null,
    createdAt: isoFromUnix(payment.created_at),
    debitRrn: payment.acquirer_data?.rrn || null,
    errorDescription: payment.error_description || null,
    refunds,
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.body = { success: false, message };
  return err;
}

function gatewayLookupError(err) {
  const status = Number(err.statusCode || err.status || 0);
  if (status === 400 || status === 404) return httpError(404, 'No payment found for that id');
  const description = err.error?.description || 'Payment gateway lookup failed';
  return httpError(502, description);
}

async function fetchPaymentTrace(rawId) {
  const id = String(rawId || '').trim();
  if (!/^(pay|order|rfnd)_[A-Za-z0-9]+$/.test(id)) {
    throw httpError(400, 'Enter a payment, order, or refund id');
  }
  const client = getRazorpayClient();
  try {
    let paymentIds = [];
    if (id.startsWith('rfnd_')) {
      const refund = await client.refunds.fetch(id);
      if (!refund?.payment_id) throw httpError(404, 'No payment found for that id');
      paymentIds = [refund.payment_id];
    } else if (id.startsWith('order_')) {
      const listed = await client.orders.fetchPayments(id);
      paymentIds = (listed.items || []).map((item) => item.id).filter(Boolean).slice(0, 10);
      if (!paymentIds.length) throw httpError(404, 'That order has no payments yet');
    } else {
      paymentIds = [id];
    }

    const payments = [];
    for (const paymentId of paymentIds) {
      const payment = await client.payments.fetch(paymentId);
      let refunds = [];
      try {
        const listed = await client.payments.fetchMultipleRefund(payment.id, { count: 20 });
        refunds = (listed.items || []).map(mapGatewayRefund);
      } catch (err) {
        if (Number(err.statusCode) && Number(err.statusCode) >= 500) throw err;
      }
      payments.push(mapGatewayPayment(payment, refunds));
    }
    return payments;
  } catch (err) {
    if (err.status) throw err;
    throw gatewayLookupError(err);
  }
}

async function syncPaymentTrace(rawId, actor) {
  const traces = await fetchPaymentTrace(rawId);
  const db = requireDb();
  const results = [];

  for (const trace of traces) {
    const ors = [{ razorpayPaymentId: trace.id }];
    if (trace.orderId) ors.push({ razorpayOrderId: trace.orderId });
    const local = await db.collection('payments').findOne({ $or: ors });
    const fullyRefunded = trace.status === 'refunded' || trace.refundStatus === 'full';
    let syncedStatus = null;
    if (local && fullyRefunded && local.status !== 'refunded') {
      await markPaymentRefunded({
        razorpayPaymentId: trace.id,
        razorpayOrderId: local.razorpayOrderId || trace.orderId,
        reason: trace.refunds.find((refund) => refund.reason)?.reason || 'gateway refund',
        actor,
      });
      syncedStatus = 'refunded';
    }
    if (local) {
      await db.collection('payments').updateOne(
        { id: local.id },
        {
          $set: {
            gatewayTrace: trace,
            gatewaySyncedAt: utcnow(),
            updatedAt: utcnow(),
          },
        }
      );
    }
    await db.collection('payment_traces').updateOne(
      { razorpayPaymentId: trace.id },
      {
        $set: {
          razorpayPaymentId: trace.id,
          razorpayOrderId: trace.orderId,
          localPaymentId: local?.id || null,
          gateway: trace,
          updatedAt: utcnow(),
        },
        $setOnInsert: { createdAt: utcnow() },
      },
      { upsert: true }
    );
    results.push({
      trace,
      localPaymentId: local?.id || null,
      localStatus: syncedStatus || local?.status || null,
      inLedger: Boolean(local),
      syncedStatus,
    });
  }

  return results;
}

async function markPaymentRefunded({
  razorpayOrderId,
  razorpayPaymentId,
  reason,
  actor,
} = {}) {
  const db = requireDb();
  const ors = [];
  if (razorpayPaymentId) ors.push({ razorpayPaymentId });
  if (razorpayOrderId) ors.push({ razorpayOrderId });
  if (!ors.length) return null;

  const payment = await db.collection('payments').findOne(
    ors.length === 1 ? ors[0] : { $or: ors }
  );
  if (!payment) return null;
  if (payment.status === 'refunded') return payment;

  const patch = {
    status: 'refunded',
    refundReason: reason || '',
    refundedAt: utcnow(),
    updatedAt: utcnow(),
  };
  if (razorpayPaymentId && !payment.razorpayPaymentId) {
    patch.razorpayPaymentId = razorpayPaymentId;
  }

  await db.collection('payments').updateOne(
    { id: payment.id },
    { $set: patch }
  );
  await db.collection('orders').updateOne(
    { razorpayOrderId: payment.razorpayOrderId },
    { $set: { status: 'refunded', updatedAt: utcnow() } }
  );
  const customerReason = customerRefundReason(reason);
  if (payment.customerEmail) {
    const vars = {
      customerName: payment.customerName || payment.customerEmail,
      planName: payment.description,
      amountInr: payment.amounts?.total,
      reason: customerReason,
      paymentId: razorpayPaymentId || payment.razorpayPaymentId || payment.id,
      ctaUrl: `${config.frontendUrl}/dashboard/billing`,
    };
    try {
      await enqueueEmail({
        to: payment.customerEmail,
        template: 'payment.refunded',
        vars,
        actor,
      });
    } catch (_) {}
    try {
      await enqueueWhatsApp({
        toEmail: payment.customerEmail,
        template: 'payment.refunded',
        vars,
        actor,
      });
    } catch (_) {}
  }
  await writeAudit(actor || { email: 'system', role: 'system' }, 'payment.refunded', {
    resource: { type: 'payment', id: payment.id },
    meta: { reason, razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId },
    tone: 'warning',
  });
  return db.collection('payments').findOne({ id: payment.id });
}

function customerRefundReason(reason) {
  const text = String(reason || '').trim();
  if (!text || /^(refund|payment)\./i.test(text) || text === 'gateway refund') return '';
  return text;
}

function toCustomerPayment(payment) {
  const trace = payment.gatewayTrace || null;
  const refunds = Array.isArray(trace?.refunds) ? trace.refunds : [];
  return {
    id: payment.id,
    status: payment.status || 'created',
    purpose: payment.purpose || null,
    description: payment.description || '',
    amounts: payment.amounts || null,
    currency: payment.currency || 'INR',
    invoiceId: payment.invoiceId || null,
    razorpayOrderId: payment.razorpayOrderId || null,
    razorpayPaymentId: payment.razorpayPaymentId || null,
    paidAt: payment.paidAt || null,
    createdAt: payment.createdAt || null,
    refundedAt: payment.refundedAt || null,
    refundReason: payment.refundReason && customerRefundReason(payment.refundReason)
      ? payment.refundReason
      : refunds.find((refund) => refund.reason)?.reason || null,
    at: payment.paidAt || payment.refundedAt || payment.createdAt || null,
    gateway: trace
      ? {
          status: trace.status || null,
          captured: Boolean(trace.captured),
          amountInr: trace.amountInr ?? null,
          amountRefundedInr: trace.amountRefundedInr ?? null,
          method: trace.method || null,
          debitRrn: trace.debitRrn || null,
          refunds: refunds.map((refund) => ({
            id: refund.id,
            amountInr: refund.amountInr,
            status: refund.status,
            reason: refund.reason || null,
            createdAt: refund.createdAt || null,
            creditRrn: refund.creditRrn || null,
            speed: refund.speed || null,
          })),
        }
      : null,
  };
}

function needsGatewayRefresh(payment, now) {
  if (!payment.razorpayPaymentId) return false;
  const syncedAt = payment.gatewaySyncedAt ? new Date(payment.gatewaySyncedAt).getTime() : 0;
  if (!syncedAt) return true;
  const age = now - syncedAt;
  if (payment.status === 'paid' || payment.status === 'created') return age >= 2 * 60 * 1000;
  return age >= 6 * 60 * 60 * 1000;
}

async function listPaymentsForCustomer(email, { refresh = false, actor } = {}) {
  const db = requireDb();
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const load = () => db.collection('payments')
    .find({ customerEmail: normalized })
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(50)
    .toArray();

  let rows = await load();
  if (refresh) {
    const now = Date.now();
    const due = rows.filter((payment) => needsGatewayRefresh(payment, now)).slice(0, 12);
    for (const payment of due) {
      try {
        await syncPaymentTrace(payment.razorpayPaymentId, actor);
      } catch (_) {
        await db.collection('payments').updateOne(
          { id: payment.id },
          { $set: { gatewaySyncedAt: utcnow(), updatedAt: utcnow() } }
        );
      }
    }
    if (due.length) rows = await load();
  }
  return rows.map(toCustomerPayment);
}

async function checkoutStatusForCustomer({ email, razorpayOrderId, actor } = {}) {
  const db = requireDb();
  const normalized = normalizeEmail(email);
  const local = normalized
    ? await db.collection('payments').findOne({ razorpayOrderId, customerEmail: normalized })
    : null;
  if (!local) throw httpError(404, 'No payment found for that order');

  const summary = {
    status: local.status || 'created',
    paymentId: local.id,
    amountInr: local.amounts?.total ?? null,
    description: local.description || '',
    bankReversal: false,
  };
  if (local.status === 'paid') return { ...summary, status: 'paid' };
  if (local.status === 'refunded') return { ...summary, status: 'refunded', bankReversal: true };

  let items = [];
  try {
    const client = getRazorpayClient();
    const listed = await client.orders.fetchPayments(razorpayOrderId);
    items = listed.items || [];
  } catch (_) {
    if (local.status === 'failed') return { ...summary, status: 'failed', bankReversal: true };
    return { ...summary, status: 'pending' };
  }

  const captured = items.find((item) => item.status === 'captured' || item.captured);
  if (captured) {
    const result = await capturePayment({
      razorpayOrderId,
      razorpayPaymentId: captured.id,
      source: 'checkout-poll',
      actor,
    });
    return {
      status: 'paid',
      paymentId: result.payment?.id || local.id,
      amountInr: local.amounts?.total ?? null,
      description: local.description || '',
      bankReversal: false,
      razorpayPaymentId: captured.id,
    };
  }

  const failed = items.find((item) => item.status === 'failed' || item.status === 'refunded');
  if (failed) {
    if (failed.status === 'refunded' || Number(failed.amount_refunded) > 0) {
      await markPaymentRefunded({
        razorpayOrderId,
        razorpayPaymentId: failed.id,
        reason: failed.error_description || 'gateway refund',
        actor,
      });
      return { ...summary, status: 'refunded', bankReversal: true };
    }
    await markPaymentFailed({
      razorpayOrderId,
      reason: failed.error_description || 'payment.failed',
      actor,
    });
    return { ...summary, status: 'failed', bankReversal: true };
  }

  return { ...summary, status: 'pending' };
}

module.exports = {
  getRazorpayClient,
  verifyPaymentSignature,
  verifyWebhookSignature,
  resolvePricing,
  createOrder,
  capturePayment,
  markPaymentFailed,
  markPaymentRefunded,
  syncPaymentTrace,
  listPaymentsForCustomer,
  checkoutStatusForCustomer,
  applySideEffects,
};
