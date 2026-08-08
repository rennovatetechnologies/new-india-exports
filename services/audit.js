const { requireDb, getDb } = require('../db');
const { utcnow, normalizeEmail } = require('./helpers');

/**
 * Structured audit writer (contract §4.2).
 * Back-compat: writeAudit(who, what, { meta, tone }) still works.
 */
async function writeAudit(actorOrWho, actionOrWhat, opts = {}) {
  const db = getDb();
  if (!db) return;

  let actor;
  let action;
  let resource = opts.resource || null;
  let before = opts.before;
  let after = opts.after;
  let meta = opts.meta || {};
  let tone = opts.tone || 'info';
  let success = opts.success !== false;
  let requestId = opts.requestId || null;

  if (typeof actorOrWho === 'string' && typeof actionOrWhat === 'string' && !opts.actor) {
    // legacy signature
    actor = {
      email: normalizeEmail(actorOrWho),
      role: opts.role || 'system',
      userId: opts.userId || null,
      ip: opts.ip || null,
      userAgent: opts.userAgent || null,
    };
    action = actionOrWhat.includes('.') ? actionOrWhat : actionOrWhat.replace(/_/g, '.');
  } else if (actorOrWho && typeof actorOrWho === 'object') {
    actor = {
      userId: actorOrWho.userId || actorOrWho.sub || null,
      email: normalizeEmail(actorOrWho.email || ''),
      role: actorOrWho.role || 'system',
      ip: actorOrWho.ip || opts.ip || null,
      userAgent: actorOrWho.userAgent || opts.userAgent || null,
    };
    action = String(actionOrWhat || opts.action || 'unknown');
  } else {
    actor = { email: '', role: 'system' };
    action = String(actionOrWhat || 'unknown');
  }

  try {
    await db.collection('audit_logs').insertOne({
      at: utcnow(),
      createdAt: utcnow(), // legacy admin UI
      who: actor.email,
      what: action,
      actor,
      action,
      resource,
      before: before || null,
      after: after || null,
      meta,
      requestId,
      tone,
      success,
    });
  } catch (e) {
    console.warn('audit write failed:', e.message);
  }
}

function actorFromReq(req) {
  const u = req.user || {};
  return {
    userId: u.sub || null,
    email: u.email || '',
    role: u.role || 'anonymous',
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

module.exports = { writeAudit, actorFromReq };
