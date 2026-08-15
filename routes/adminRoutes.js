const express = require('express');
const { requireDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { utcnow, cleanDoc } = require('../services/helpers');
const { asyncHandler } = require('../utils/asyncHandler');
const { retryFailed } = require('../services/mail');
const {
  emailOutboxRetrySchema,
  auditQuerySchema,
  adminPaymentsQuerySchema,
  emailOutboxQuerySchema,
  transcriptsQuerySchema,
} = require('../schemas');

const router = express.Router();

function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfPrevUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

function daysAgo(n, d = new Date()) {
  return new Date(d.getTime() - n * 24 * 60 * 60 * 1000);
}

async function sumPaidRevenue(db, since = null, until = null) {
  const match = { status: 'paid' };
  const dateConds = [];
  if (since) dateConds.push({ $gte: [{ $ifNull: ['$paidAt', '$createdAt'] }, since] });
  if (until) dateConds.push({ $lt: [{ $ifNull: ['$paidAt', '$createdAt'] }, until] });
  if (dateConds.length) match.$expr = dateConds.length === 1 ? dateConds[0] : { $and: dateConds };

  const rows = await db
    .collection('payments')
    .aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amounts.total' } } },
    ])
    .toArray();
  return Number(rows[0]?.total || 0);
}

function momPercent(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

async function buildAnalyticsOverview(db) {
  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  const prevMonthStart = startOfPrevUtcMonth(now);
  const weekStart = daysAgo(7, now);

  const [
    customers,
    activeCases,
    paid,
    pendingStaff,
    totalRevenue,
    revenueThisMonth,
    revenueLastMonth,
    customersThisMonth,
    casesThisWeek,
  ] = await Promise.all([
    db.collection('users').countDocuments({ role: 'customer' }),
    db.collection('customer_cases').countDocuments({
      status: { $in: ['active', 'kyc_pending', 'kyc_incomplete', 'unpaid'] },
    }),
    db.collection('payments').countDocuments({ status: 'paid' }),
    db.collection('staff_requests').countDocuments({ status: 'Pending Approval' }),
    sumPaidRevenue(db),
    sumPaidRevenue(db, monthStart),
    sumPaidRevenue(db, prevMonthStart, monthStart),
    db.collection('users').countDocuments({
      role: 'customer',
      createdAt: { $gte: monthStart },
    }),
    db.collection('customer_cases').countDocuments({
      status: { $in: ['active', 'kyc_pending', 'kyc_incomplete', 'unpaid'] },
      createdAt: { $gte: weekStart },
    }),
  ]);

  const deltas = {
    mrr: momPercent(revenueThisMonth, revenueLastMonth),
    activeCustomers: customersThisMonth,
    workflowsLive: casesThisWeek,
    riskEvents: pendingStaff,
  };

  return {
    mrr: totalRevenue,
    revenue: totalRevenue,
    revenueThisMonth,
    revenueLastMonth,
    activeCustomers: customers,
    workflowsLive: activeCases,
    paidOrders: paid,
    riskEvents: pendingStaff,
    deltas,
  };
}

router.get(
  '/analytics/overview',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const overview = await buildAnalyticsOverview(requireDb());
    return res.json({
      success: true,
      data: overview,
      ...overview,
    });
  })
);

router.get(
  '/analytics/summary',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const overview = await buildAnalyticsOverview(requireDb());
    return res.json({
      success: true,
      data: overview,
      ...overview,
    });
  })
);

router.get('/analytics/detail', requireAdmin, (req, res) => {
  res.json({ series: [], generatedAt: utcnow().toISOString() });
});

/**
 * Admin payments ledger — week / month / all, optional status + search.
 */
router.get(
  '/payments',
  requireAdmin,
  validateQuery(adminPaymentsQuerySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const limit = Number(req.query.limit) || 100;
    const period = req.query.period || 'month';
    const status = req.query.status || 'all';
    const q = String(req.query.q || '').trim().toLowerCase();
    const now = new Date();

    const query = {};
    if (status !== 'all') query.status = status;
    if (period === 'week' || period === 'month') {
      const since = daysAgo(period === 'week' ? 7 : 30, now);
      query.$expr = {
        $gte: [{ $ifNull: ['$paidAt', '$createdAt'] }, since],
      };
    }

    const rows = await db
      .collection('payments')
      .find(query)
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(Math.min(limit * 3, 500))
      .toArray();

    const items = [];
    let paidTotal = 0;
    let paidCount = 0;
    for (const p of rows) {
      const email = String(p.customerEmail || '').toLowerCase();
      const hay = [
        p.id,
        email,
        p.purpose,
        p.sku,
        p.description,
        p.status,
        p.invoiceId,
        p.caseId,
        p.razorpayPaymentId,
        p.razorpayOrderId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (q && !hay.includes(q)) continue;

      const total = Number(p.amounts?.total || 0) || 0;
      if (p.status === 'paid') {
        paidCount += 1;
        paidTotal += total;
      }

      items.push({
        id: p.id,
        status: p.status,
        purpose: p.purpose || null,
        sku: p.sku || null,
        description: p.description || '',
        customerEmail: p.customerEmail || '',
        caseId: p.caseId || null,
        invoiceId: p.invoiceId || null,
        amounts: p.amounts || null,
        currency: p.currency || 'INR',
        razorpayOrderId: p.razorpayOrderId || null,
        razorpayPaymentId: p.razorpayPaymentId || null,
        installmentPlanId: p.installmentPlanId || null,
        installmentNumber: p.installmentNumber || null,
        at: p.paidAt || p.createdAt || null,
        paidAt: p.paidAt || null,
        createdAt: p.createdAt || null,
      });
      if (items.length >= limit) break;
    }

    return res.json({
      success: true,
      data: items,
      items,
      period,
      status,
      summary: {
        count: items.length,
        paidCount,
        paidTotal,
      },
    });
  })
);

router.get(
  '/audit',
  requireAdmin,
  validateQuery(auditQuerySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const limit = req.query.limit;
    const query = {};
    if (req.query.action) {
      const action = String(req.query.action);
      if (action.endsWith('.*') || action.endsWith('*')) {
        const prefix = action.replace(/\.\*$/, '').replace(/\*$/, '');
        query.action = { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
      } else {
        query.action = action;
      }
    }
    if (req.query.actor) query['actor.email'] = String(req.query.actor).toLowerCase();
    if (req.query.resourceId) query['resource.id'] = String(req.query.resourceId);
    if (req.query.resourceType) query['resource.type'] = String(req.query.resourceType);
    if (req.query.q) {
      const q = String(req.query.q).trim();
      query.$or = [
        { action: { $regex: q, $options: 'i' } },
        { what: { $regex: q, $options: 'i' } },
        { 'actor.email': { $regex: q, $options: 'i' } },
        { who: { $regex: q, $options: 'i' } },
        { 'resource.id': { $regex: q, $options: 'i' } },
      ];
    }
    const rows = await db
      .collection('audit_logs')
      .find(query)
      .sort({ at: -1, createdAt: -1 })
      .limit(limit)
      .toArray();
    return res.json({
      success: true,
      data: rows.map((r) => ({
        who: r.who || r.actor?.email,
        what: r.what || r.action,
        when: r.at || r.createdAt,
        tone: r.tone,
        meta: r.meta,
        actor: r.actor,
        action: r.action,
        resource: r.resource,
      })),
      items: rows.map(cleanDoc),
    });
  })
);

/**
 * Admin activity + transcripts hub:
 * - audit: system/action trail (plans, events, payments…)
 * - messages: case conversation transcripts
 * - events: cohort emails (reschedule / follow-up)
 */
router.get(
  '/transcripts',
  requireAdmin,
  validateQuery(transcriptsQuerySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const limit = Number(req.query.limit) || 50;
    const scope = req.query.scope || 'all';
    const q = String(req.query.q || '').trim().toLowerCase();
    const caseId = req.query.caseId ? String(req.query.caseId) : null;
    const eventId = req.query.eventId ? String(req.query.eventId) : null;

    const includeAudit = scope === 'all' || scope === 'audit' || scope === 'plans' || scope === 'events';
    const includeMessages = scope === 'all' || scope === 'messages' || scope === 'plans';
    const includeEventComms = scope === 'all' || scope === 'events';

    const items = [];

    if (includeAudit) {
      const auditQuery = {};
      if (scope === 'plans') {
        auditQuery.action = {
          $regex: '^(plan\\.|payment\\.|invoice\\.|kyc\\.|case\\.|stage\\.|doc\\.)',
        };
      } else if (scope === 'events') {
        auditQuery.action = { $regex: '^event\\.' };
      }
      if (eventId) auditQuery['resource.id'] = eventId;
      if (caseId) {
        auditQuery.$or = [
          { 'resource.id': caseId },
          { 'meta.caseId': caseId },
        ];
      }
      const audits = await db
        .collection('audit_logs')
        .find(auditQuery)
        .sort({ at: -1, createdAt: -1 })
        .limit(limit)
        .toArray();
      for (const r of audits) {
        const action = r.action || r.what || '';
        const who = r.who || r.actor?.email || '';
        const when = r.at || r.createdAt;
        const hay = `${action} ${who} ${r.resource?.id || ''} ${JSON.stringify(r.meta || {})}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        items.push({
          id: String(r._id),
          kind: 'audit',
          category: action.startsWith('event.')
            ? 'events'
            : action.startsWith('message.')
              ? 'messages'
              : 'plans',
          at: when,
          title: action,
          summary: [
            who,
            r.resource?.type && r.resource?.id ? `${r.resource.type}:${r.resource.id}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          body: r.meta?.note || r.meta?.reason || r.meta?.message || null,
          actor: who,
          resource: r.resource || null,
          meta: r.meta || {},
          tone: r.tone || 'info',
        });
      }
    }

    if (includeMessages) {
      const msgQuery = {};
      if (caseId) msgQuery.caseId = caseId;
      const messages = await db
        .collection('case_messages')
        .find(msgQuery)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      for (const m of messages) {
        const hay = `${m.body || ''} ${m.fromEmail || ''} ${m.caseId || ''}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        items.push({
          id: m.id || String(m._id),
          kind: 'message',
          category: 'messages',
          at: m.createdAt,
          title: `Case ${m.caseId}`,
          summary: `${m.fromName || m.fromEmail || 'Unknown'} (${m.fromRole || 'user'})`,
          body: m.body || '',
          actor: m.fromEmail || '',
          resource: { type: 'customer_case', id: m.caseId },
          meta: { messageId: m.id, fromRole: m.fromRole },
          tone: 'info',
        });
      }
    }

    if (includeEventComms) {
      const commQuery = {};
      if (eventId) commQuery.eventId = eventId;
      const comms = await db
        .collection('event_communications')
        .find(commQuery)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      for (const c of comms) {
        const hay = `${c.message || ''} ${c.kind || ''} ${c.eventId || ''} ${(c.recipients || [])
          .map((r) => r.email)
          .join(' ')}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        items.push({
          id: c.id || String(c._id),
          kind: 'event_communication',
          category: 'events',
          at: c.createdAt,
          title: `Event ${c.kind}: ${c.eventId}`,
          summary: `${c.recipientCount || 0} recipients · ${c.sentBy?.email || ''}`,
          body: c.message || '',
          actor: c.sentBy?.email || '',
          resource: { type: 'event', id: c.eventId },
          meta: {
            kind: c.kind,
            newDate: c.newDate,
            newCity: c.newCity,
            recipientCount: c.recipientCount,
            recipients: c.recipients || [],
          },
          tone: 'info',
        });
      }
    }

    items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    const sliced = items.slice(0, limit);
    return res.json({
      success: true,
      data: sliced,
      items: sliced,
      counts: {
        audit: sliced.filter((i) => i.kind === 'audit').length,
        messages: sliced.filter((i) => i.kind === 'message').length,
        events: sliced.filter((i) => i.kind === 'event_communication').length,
      },
    });
  })
);

router.get(
  '/email-outbox',
  requireAdmin,
  validateQuery(emailOutboxQuerySchema),
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const status = req.query.status;
    const query = status ? { status } : {};
    const rows = await db
      .collection('email_outbox')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: String(r._id),
        status: r.status,
        template: r.template,
        to: r.to,
        subject: r.subject,
        attempts: r.attempts,
        lastError: r.lastError,
        createdAt: r.createdAt,
        sentAt: r.sentAt,
      })),
    });
  })
);

router.post(
  '/email-outbox/retry',
  requireAdmin,
  validateBody(emailOutboxRetrySchema),
  asyncHandler(async (req, res) => {
    const n = await retryFailed(Number(req.body.limit || 20));
    return res.json({ success: true, retried: n });
  })
);

router.get(
  '/pending-counts',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = requireDb();
    const kyc = await db.collection('customer_cases').countDocuments({ kycStatus: 'submitted' });
    const staff = await db
      .collection('staff_requests')
      .countDocuments({ status: 'Pending Approval' });
    return res.json({ kyc, staff, total: kyc + staff });
  })
);

module.exports = router;
