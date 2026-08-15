const config = require('../../config');
const { requireDb, getDb } = require('../../db');
const { utcnow, normalizeEmail, cleanDoc, isEventExpired } = require('../helpers');
const { newInstallmentPlanId } = require('../ids');
const { computeGst, fromInclusiveTotal } = require('../gst');
const { writeAudit } = require('../audit');
const { enqueueEmail } = require('../mail');

const THRESHOLD_INR = Number(config.installmentThresholdInr) || 100000;
const INSTALLMENT_COUNT = Number(config.installmentCount) || 3;
const GAP_DAYS = Number(config.installmentGapDays) || 10;
const WINDOW_DAYS = Number(config.installmentWindowDays) || 30;
const UPCOMING_DAYS = 2;
const OVERDUE_REPEAT_DAYS = 3;
const FIRST_DUE_GRACE_MS = 30 * 60 * 1000;

let reminderTimer = null;
let reminderRunning = false;

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d;
}

function formatIstDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function money(n) {
  const num = Math.round(Number(n) || 0);
  return `₹${num.toLocaleString('en-IN')}`;
}

function isEligible(payableTotalInr) {
  return Math.round(Number(payableTotalInr) || 0) >= THRESHOLD_INR;
}

function splitInclusive(totalInr, count = INSTALLMENT_COUNT) {
  const total = Math.max(0, Math.round(Number(totalInr) || 0));
  const n = Math.max(1, Number(count) || 3);
  const base = Math.floor(total / n);
  const parts = [];
  let allocated = 0;
  for (let i = 0; i < n; i += 1) {
    const isLast = i === n - 1;
    const share = isLast ? total - allocated : base;
    parts.push(fromInclusiveTotal(share));
    allocated += share;
  }
  return parts;
}

function previewForPrice(priceInr) {
  const taxable = Math.max(0, Math.round(Number(priceInr) || 0));
  const amounts = computeGst(taxable);
  const eligible = isEligible(amounts.total);
  const parts = eligible ? splitInclusive(amounts.total) : [];
  return {
    eligible,
    thresholdInr: THRESHOLD_INR,
    count: INSTALLMENT_COUNT,
    gapDays: GAP_DAYS,
    windowDays: WINDOW_DAYS,
    payableTotalInr: amounts.total,
    taxableInr: amounts.taxable,
    gstInr: amounts.gst,
    parts: parts.map((p, i) => ({
      number: i + 1,
      dueOffsetDays: i * GAP_DAYS,
      amounts: p,
      totalInr: p.total,
    })),
  };
}

function publicPlan(plan) {
  if (!plan) return null;
  const installments = Array.isArray(plan.installments) ? plan.installments : [];
  const paid = installments.filter((i) => i.status === 'paid');
  const next = installments.find((i) => i.status !== 'paid') || null;
  return {
    id: plan.id,
    purpose: plan.purpose || 'event',
    eventId: plan.eventId || null,
    eventTitle: plan.eventTitle || '',
    customerEmail: plan.customerEmail,
    status: plan.status,
    installmentCount: plan.installmentCount || INSTALLMENT_COUNT,
    gapDays: plan.gapDays || GAP_DAYS,
    windowDays: plan.windowDays || WINDOW_DAYS,
    startedAt: plan.startedAt,
    dueBy: plan.dueBy,
    fullAmounts: plan.fullAmounts || null,
    paidCount: paid.length,
    paidTotalInr: paid.reduce((s, i) => s + (Number(i.amounts?.total) || 0), 0),
    next: next
      ? {
          number: next.number,
          dueAt: next.dueAt,
          amounts: next.amounts,
          status: next.status,
        }
      : null,
    installments: installments.map((i) => ({
      number: i.number,
      dueAt: i.dueAt,
      amounts: i.amounts,
      status: i.status,
      paidAt: i.paidAt || null,
      paymentId: i.paymentId || null,
    })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function nextUnpaid(plan, requestedNumber) {
  const list = Array.isArray(plan?.installments) ? plan.installments : [];
  if (requestedNumber) {
    const inst = list.find((i) => i.number === Number(requestedNumber));
    if (!inst) {
      throw Object.assign(new Error('Installment not found'), { status: 404 });
    }
    if (inst.status === 'paid') {
      throw Object.assign(new Error('This installment is already paid'), { status: 400 });
    }
    const previousUnpaid = list.find((i) => i.number < inst.number && i.status !== 'paid');
    if (previousUnpaid) {
      throw Object.assign(
        new Error(`Pay installment ${previousUnpaid.number} before installment ${inst.number}`),
        { status: 400 }
      );
    }
    return inst;
  }
  const inst = list.find((i) => i.status !== 'paid');
  if (!inst) {
    throw Object.assign(new Error('All installments are already paid'), { status: 400 });
  }
  return inst;
}

async function findActivePlan({ eventId, email }) {
  const db = requireDb();
  return db.collection('installment_plans').findOne({
    eventId,
    customerEmail: normalizeEmail(email),
    status: { $in: ['active', 'overdue'] },
  });
}

async function createPlan({ event, pricing, user, body }) {
  const db = requireDb();
  const now = utcnow();
  const email = normalizeEmail(
    user?.email || body?.customerDetails?.email || body?.email || pricing.customerEmail || ''
  );
  if (!email) {
    throw Object.assign(new Error('Email required for installment plan'), { status: 400 });
  }
  const parts = splitInclusive(pricing.amounts.total);
  const installments = parts.map((amounts, i) => ({
    number: i + 1,
    dueAt: addDays(now, i * GAP_DAYS),
    amounts,
    status: 'pending',
    paymentId: null,
    paidAt: null,
    reminders: { upcomingAt: null, dueAt: null, overdueAt: null },
  }));
  const plan = {
    id: await newInstallmentPlanId(),
    purpose: 'event',
    eventId: event.id,
    eventTitle: event.title || pricing.description || 'Event',
    customerEmail: email,
    customerName: body?.customerDetails?.name || user?.name || '',
    customerPhone: body?.customerDetails?.phone || user?.phone || '',
    status: 'active',
    installmentCount: INSTALLMENT_COUNT,
    gapDays: GAP_DAYS,
    windowDays: WINDOW_DAYS,
    startedAt: now,
    dueBy: addDays(now, WINDOW_DAYS),
    fullAmounts: pricing.amounts,
    installments,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection('installment_plans').insertOne(plan);
  await writeAudit(
    { email, role: user?.role || 'customer' },
    'installment.created',
    {
      resource: { type: 'installment_plan', id: plan.id },
      meta: {
        eventId: event.id,
        total: pricing.amounts.total,
        count: INSTALLMENT_COUNT,
      },
    }
  );
  return plan;
}

/**
 * Resolve which installment to charge for an event order.
 * Creates a plan when the customer opts into 3-part payment.
 */
async function prepareForOrder({ pricing, body, user }) {
  if (pricing.purpose !== 'event' || pricing.free) return null;

  const db = requireDb();
  const email = normalizeEmail(
    user?.email || body?.customerDetails?.email || body?.email || pricing.customerEmail || ''
  );
  const eventId = pricing.eventId || body?.eventId || body?.sku;
  const event = eventId ? await db.collection('events').findOne({ id: eventId }) : null;
  if (!event || event.deletedAt) {
    if (body?.payInInstallments || body?.installmentPlanId) {
      throw Object.assign(new Error('Event not found'), { status: 404 });
    }
    return null;
  }
  if (isEventExpired(event) && !body?.installmentPlanId) {
    throw Object.assign(new Error('This event has ended'), {
      status: 410,
      code: 'EVENT_EXPIRED',
    });
  }

  const existing = await findActivePlan({ eventId: event.id, email });
  const hasPaidInstallment = (existing?.installments || []).some((i) => i.status === 'paid');
  const wantsPlan = Boolean(body?.payInInstallments || body?.installmentPlanId);

  if (!wantsPlan) {
    if (existing && hasPaidInstallment) {
      const installment = nextUnpaid(existing);
      return { plan: existing, installment };
    }
    if (existing && !hasPaidInstallment) {
      await db.collection('installment_plans').updateOne(
        { id: existing.id },
        { $set: { status: 'cancelled', cancelledAt: utcnow(), updatedAt: utcnow() } }
      );
    }
    return null;
  }

  let plan = null;
  if (body.installmentPlanId) {
    plan = await db.collection('installment_plans').findOne({ id: String(body.installmentPlanId) });
    if (!plan) {
      throw Object.assign(new Error('Installment plan not found'), { status: 404 });
    }
    if (normalizeEmail(plan.customerEmail) !== email) {
      throw Object.assign(new Error('Installment plan does not belong to this account'), {
        status: 403,
      });
    }
    if (plan.eventId !== event.id) {
      throw Object.assign(new Error('Installment plan is for a different event'), { status: 400 });
    }
    if (plan.status === 'completed') {
      throw Object.assign(new Error('This installment plan is already complete'), { status: 400 });
    }
    if (plan.status === 'cancelled') {
      throw Object.assign(new Error('This installment plan was cancelled'), { status: 400 });
    }
  } else {
    plan = existing;
    if (!plan) {
      if (!isEligible(pricing.amounts.total)) {
        throw Object.assign(
          new Error(
            `Installments are available when the event total is ₹${THRESHOLD_INR.toLocaleString('en-IN')} or more`
          ),
          { status: 400 }
        );
      }
      plan = await createPlan({ event, pricing, user, body });
    }
  }

  const installment = nextUnpaid(plan, body.installmentNumber);
  return { plan, installment };
}

async function markInstallmentPaid(payment, { actor } = {}) {
  const db = requireDb();
  const planId = payment.installmentPlanId;
  const number = Number(payment.installmentNumber);
  if (!planId || !number) return null;

  const plan = await db.collection('installment_plans').findOne({ id: planId });
  if (!plan) return null;

  const inst = (plan.installments || []).find((i) => i.number === number);
  if (!inst) return plan;
  if (inst.status === 'paid') return plan;

  const now = utcnow();
  await db.collection('installment_plans').updateOne(
    { id: planId, 'installments.number': number },
    {
      $set: {
        'installments.$.status': 'paid',
        'installments.$.paymentId': payment.id,
        'installments.$.paidAt': now,
        updatedAt: now,
      },
    }
  );

  const updated = await db.collection('installment_plans').findOne({ id: planId });
  const paidCount = (updated.installments || []).filter((i) => i.status === 'paid').length;
  const allPaid = paidCount === (updated.installmentCount || INSTALLMENT_COUNT);
  if (allPaid) {
    await db.collection('installment_plans').updateOne(
      { id: planId },
      { $set: { status: 'completed', completedAt: now, updatedAt: now } }
    );
  } else if (updated.status === 'overdue') {
    const stillOverdue = (updated.installments || []).some(
      (i) => i.status !== 'paid' && new Date(i.dueAt) < now
    );
    if (!stillOverdue) {
      await db
        .collection('installment_plans')
        .updateOne({ id: planId }, { $set: { status: 'active', updatedAt: now } });
    }
  }

  const email = normalizeEmail(updated.customerEmail || payment.customerEmail);
  const event = updated.eventId
    ? await db.collection('events').findOne({ id: updated.eventId })
    : null;

  await db.collection('event_registrations').updateOne(
    { eventId: updated.eventId, email },
    {
      $set: {
        eventId: updated.eventId,
        email,
        name: payment.customerName || updated.customerName || '',
        paymentId: payment.id,
        installmentPlanId: updated.id,
        status: allPaid ? 'registered' : 'partial',
        paidInstallments: paidCount,
        installmentCount: updated.installmentCount || INSTALLMENT_COUNT,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  const remaining = (updated.installments || []).filter((i) => i.status !== 'paid');
  const scheduleText = (updated.installments || [])
    .map(
      (i) =>
        `${i.number}. ${money(i.amounts?.total)} · due ${formatIstDate(i.dueAt)}${
          i.status === 'paid' ? ' (paid)' : ''
        }`
    )
    .join('\n');

  try {
    await enqueueEmail({
      to: email,
      template: 'payment.receipt',
      vars: {
        customerName: payment.customerName || updated.customerName || email,
        planName: `${updated.eventTitle} · installment ${number} of ${updated.installmentCount}`,
        amountInr: payment.amounts?.total,
        paymentId: payment.id,
        ctaUrl: `${config.frontendUrl}/dashboard/events`,
      },
      actor,
    });
    if (allPaid) {
      await enqueueEmail({
        to: email,
        template: 'event.registered',
        vars: {
          name: payment.customerName || updated.customerName || '',
          title: event?.title || updated.eventTitle,
          date: event?.date || '',
          city: event?.city || '',
        },
        actor,
      });
    } else {
      const next = remaining[0];
      await enqueueEmail({
        to: email,
        template: 'payment.installment_schedule',
        vars: {
          customerName: payment.customerName || updated.customerName || email,
          title: updated.eventTitle,
          installmentNumber: number,
          installmentCount: updated.installmentCount,
          amountInr: payment.amounts?.total,
          remainingCount: remaining.length,
          nextDueDate: formatIstDate(next?.dueAt),
          nextAmountInr: next?.amounts?.total,
          dueBy: formatIstDate(updated.dueBy),
          schedule: scheduleText,
          ctaUrl: `${config.frontendUrl}/dashboard/events`,
        },
        actor,
      });
    }
  } catch (_) {}

  await writeAudit(actor || { email, role: 'system' }, 'installment.paid', {
    resource: { type: 'installment_plan', id: updated.id },
    meta: { installmentNumber: number, paymentId: payment.id, completed: allPaid },
    tone: 'success',
  });

  return db.collection('installment_plans').findOne({ id: planId });
}

async function cancelOpenPlan({ eventId, email, actor } = {}) {
  const db = requireDb();
  const plan = await findActivePlan({ eventId, email });
  if (!plan) return null;
  const hasPaid = (plan.installments || []).some((i) => i.status === 'paid');
  if (hasPaid) {
    throw Object.assign(
      new Error(
        'Paid installment seats cannot be cancelled from the dashboard. Please contact support.'
      ),
      { status: 400 }
    );
  }
  await db.collection('installment_plans').updateOne(
    { id: plan.id },
    { $set: { status: 'cancelled', cancelledAt: utcnow(), updatedAt: utcnow() } }
  );
  await writeAudit(actor || { email, role: 'customer' }, 'installment.cancelled', {
    resource: { type: 'installment_plan', id: plan.id },
    meta: { eventId },
  });
  return plan;
}

async function listPlansForEmail(email) {
  const db = requireDb();
  const rows = await db
    .collection('installment_plans')
    .find({
      customerEmail: normalizeEmail(email),
      status: { $in: ['active', 'overdue'] },
    })
    .sort({ createdAt: -1 })
    .toArray();
  return rows.map(publicPlan);
}

async function insertNotification({ email, title, body, href, kind, meta }) {
  const db = getDb();
  if (!db || !email) return;
  await db.collection('notifications').insertOne({
    email: normalizeEmail(email),
    title,
    body: body || '',
    type: 'payment_reminder',
    kind: kind || 'due',
    href: href || '/dashboard/events',
    read: false,
    createdAt: utcnow(),
    meta: meta || {},
  });
}

async function sendReminder(plan, inst, kind) {
  const email = normalizeEmail(plan.customerEmail);
  const dueLabel = formatIstDate(inst.dueAt);
  const amount = money(inst.amounts?.total);
  const titles = {
    upcoming: `Payment reminder: installment ${inst.number} of ${plan.installmentCount}`,
    due: `Payment due today: installment ${inst.number} of ${plan.installmentCount}`,
    overdue: `Overdue payment: installment ${inst.number} of ${plan.installmentCount}`,
  };
  const messages = {
    upcoming: `Installment ${inst.number} of ${plan.installmentCount} for ${plan.eventTitle} (${amount}) is due on ${dueLabel}. Please pay within the 30-day window.`,
    due: `Installment ${inst.number} of ${plan.installmentCount} for ${plan.eventTitle} (${amount}) is due today.`,
    overdue: `Installment ${inst.number} of ${plan.installmentCount} for ${plan.eventTitle} (${amount}) was due on ${dueLabel}. Please complete payment within 30 days of starting the plan.`,
  };
  const template = kind === 'overdue' ? 'payment.overdue' : 'payment.reminder';
  try {
    await enqueueEmail({
      to: email,
      template,
      vars: {
        customerName: plan.customerName || email,
        title: plan.eventTitle,
        installmentNumber: inst.number,
        installmentCount: plan.installmentCount,
        amountInr: inst.amounts?.total,
        dueDate: dueLabel,
        dueBy: formatIstDate(plan.dueBy),
        kind,
        message: messages[kind],
        ctaUrl: `${config.frontendUrl}/dashboard/events`,
        ctaLabel: 'Pay installment',
      },
      actor: { email: 'system', role: 'system' },
    });
  } catch (_) {}

  await insertNotification({
    email,
    title: titles[kind],
    body: messages[kind],
    href: '/dashboard/events',
    kind,
    meta: {
      installmentPlanId: plan.id,
      installmentNumber: inst.number,
      eventId: plan.eventId,
    },
  });

  const field =
    kind === 'upcoming'
      ? 'installments.$.reminders.upcomingAt'
      : kind === 'overdue'
        ? 'installments.$.reminders.overdueAt'
        : 'installments.$.reminders.dueAt';
  const db = requireDb();
  await db.collection('installment_plans').updateOne(
    { id: plan.id, 'installments.number': inst.number },
    { $set: { [field]: utcnow(), updatedAt: utcnow() } }
  );
}

async function sendDueReminders() {
  const db = getDb();
  if (!db) return { sent: 0 };
  const now = new Date();
  const plans = await db
    .collection('installment_plans')
    .find({ status: { $in: ['active', 'overdue'] } })
    .toArray();

  let sent = 0;
  for (const plan of plans) {
    let anyOverdue = false;
    for (const inst of plan.installments || []) {
      if (inst.status === 'paid') continue;
      const due = new Date(inst.dueAt);
      if (Number.isNaN(due.getTime())) continue;
      const msUntil = due.getTime() - now.getTime();
      const daysUntil = msUntil / 86400000;
      const createdAgo = now.getTime() - new Date(plan.createdAt || plan.startedAt || 0).getTime();

      if (
        daysUntil > 0 &&
        daysUntil <= UPCOMING_DAYS + 0.5 &&
        !inst.reminders?.upcomingAt
      ) {
        await sendReminder(plan, inst, 'upcoming');
        sent += 1;
      }

      const skipFreshFirst =
        inst.number === 1 && createdAgo < FIRST_DUE_GRACE_MS && !inst.reminders?.dueAt;
      if (now >= due && !inst.reminders?.dueAt && !skipFreshFirst) {
        await sendReminder(plan, inst, 'due');
        sent += 1;
      }

      if (now.getTime() - due.getTime() > 86400000) {
        anyOverdue = true;
        const last = inst.reminders?.overdueAt ? new Date(inst.reminders.overdueAt) : null;
        if (!last || now.getTime() - last.getTime() > OVERDUE_REPEAT_DAYS * 86400000) {
          await sendReminder(plan, inst, 'overdue');
          sent += 1;
        }
      }
    }
    if (anyOverdue && plan.status !== 'overdue') {
      await db
        .collection('installment_plans')
        .updateOne({ id: plan.id }, { $set: { status: 'overdue', updatedAt: utcnow() } });
    }
  }
  return { sent };
}

function startReminderJob() {
  if (reminderTimer) return;
  const tick = async () => {
    if (reminderRunning) return;
    reminderRunning = true;
    try {
      const result = await sendDueReminders();
      if (result.sent) {
        console.log(`Installment reminders sent: ${result.sent}`);
      }
    } catch (e) {
      console.warn('Installment reminder job failed:', e.message);
    } finally {
      reminderRunning = false;
    }
  };
  setTimeout(tick, 12 * 1000);
  reminderTimer = setInterval(tick, 15 * 60 * 1000);
  if (typeof reminderTimer.unref === 'function') reminderTimer.unref();
}

module.exports = {
  THRESHOLD_INR,
  INSTALLMENT_COUNT,
  GAP_DAYS,
  WINDOW_DAYS,
  isEligible,
  splitInclusive,
  previewForPrice,
  publicPlan,
  prepareForOrder,
  markInstallmentPaid,
  cancelOpenPlan,
  findActivePlan,
  listPlansForEmail,
  sendDueReminders,
  startReminderJob,
  cleanDoc,
};
