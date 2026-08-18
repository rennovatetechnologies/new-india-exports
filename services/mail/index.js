const { Resend } = require('resend');
const config = require('../../config');
const { getDb, requireDb } = require('../../db');
const { utcnow, normalizeEmail } = require('../helpers');
const { writeAudit } = require('../audit');
const { renderTemplate } = require('./templates');
const { logoInlineAttachment } = require('../../assets');
const {
  emailChannelEnabled,
  isOpsRecipient,
  mergePrefs,
  templateTopic,
  topicAllowed,
} = require('../notify/prefs');

let resendClient = null;

function mailConfigured() {
  return Boolean(config.resendApiKey);
}

function getResend() {
  if (!config.resendApiKey) return null;
  if (!resendClient) resendClient = new Resend(config.resendApiKey);
  return resendClient;
}

function asAddressList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((s) => String(s).trim()).filter(Boolean);
}

function fromDomain(from) {
  const raw = String(from || '');
  const angle = raw.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : raw).trim();
  const at = addr.lastIndexOf('@');
  return at >= 0 ? addr.slice(at + 1).toLowerCase() : '';
}

const CONSUMER_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
]);

function assertSendableFrom(from) {
  const domain = fromDomain(from);
  if (!domain) {
    const err = new Error('MAIL_FROM is missing or invalid');
    err.code = 'MAIL_FROM_INVALID';
    throw err;
  }
  if (CONSUMER_MAIL_DOMAINS.has(domain)) {
    const err = new Error(
      `MAIL_FROM must use a Resend-verified domain, not ${domain}. Use VIRASTRA <noreply@virastrainternationalexport.com>`
    );
    err.code = 'MAIL_FROM_UNVERIFIED';
    throw err;
  }
}

function toResendAttachments(list) {
  return (list || [])
    .filter((a) => a && a.filename && a.content)
    .map((a) => {
      const att = { filename: a.filename };
      att.content = Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content;
      if (a.contentType) att.contentType = a.contentType;
      if (a.cid) att.contentId = a.cid;
      return att;
    });
}

async function sendViaResend(mail) {
  const resend = getResend();
  if (!resend) {
    const err = new Error('Resend not configured');
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }
  const payload = {
    from: mail.from,
    to: asAddressList(mail.to),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  };
  const bcc = asAddressList(mail.bcc);
  if (bcc.length) payload.bcc = bcc;
  if (mail.replyTo) payload.replyTo = mail.replyTo;
  const attachments = toResendAttachments(mail.attachments);
  if (attachments.length) payload.attachments = attachments;

  assertSendableFrom(payload.from);

  const { data, error } = await resend.emails.send(payload);
  if (error) {
    const err = new Error(error.message || 'Resend send failed');
    err.code = error.name || 'RESEND_ERROR';
    err.status = error.statusCode;
    throw err;
  }
  return { messageId: data?.id || null };
}

async function verifyMail() {
  if (!mailConfigured()) {
    console.warn('Resend not configured (RESEND_API_KEY missing)');
    return false;
  }
  const resend = getResend();
  try {
    const { data, error } = await resend.domains.list();
    if (error) {
      console.warn(`Resend verify failed: ${error.message}`);
      return false;
    }
    const verified = (data?.data || data || []).filter(
      (d) => d && ['verified', 'live'].includes(String(d.status || '').toLowerCase())
    );
    console.info(`Resend ok as ${config.mailFrom}`);
    try {
      assertSendableFrom(config.mailFrom);
    } catch (e) {
      console.warn(e.message);
    }
    const fromHost = fromDomain(config.mailFrom);
    const names = verified.map((d) => String(d.name || '').toLowerCase());
    if (fromHost && names.length && !names.includes(fromHost)) {
      console.warn(
        `MAIL_FROM domain ${fromHost} is not verified in Resend (${names.join(', ') || 'none'}).`
      );
    }
    if (!verified.length) {
      console.warn(
        'Resend has no verified domain. Add virastrainternationalexport.com at https://resend.com/domains.'
      );
    }
    return true;
  } catch (e) {
    console.warn(`Resend verify skipped: ${e.message}`);
    return false;
  }
}

async function emailSkipReason(template, to) {
  if (!mailConfigured() && config.isProduction) {
    return 'resend_not_configured';
  }
  if (!emailChannelEnabled(template)) {
    return String(template) === 'auth.otp' ? 'email_otp_disabled' : 'email_notifications_disabled';
  }
  if (String(template) === 'auth.otp' || isOpsRecipient(to)) return null;
  const db = getDb();
  const emailN = normalizeEmail(Array.isArray(to) ? to[0] : to);
  if (!db || !emailN) return null;
  const user = await db.collection('users').findOne({ email: emailN });
  const prefs = mergePrefs(user?.notificationPrefs);
  if (prefs.email === false) return 'channel_opt_out';
  if (!topicAllowed(prefs, templateTopic(template))) return 'topic_opt_out';
  return null;
}

/**
 * Enqueue email. Never blocks HTTP >2s — fires send in background.
 * @returns {{ outboxId: string, status: string, skipReason?: string }}
 */
async function enqueueEmail({
  to,
  template,
  vars = {},
  subject,
  attachments = [],
  bcc,
  replyTo,
  actor,
  skipWhatsApp = false,
}) {
  const db = requireDb();
  const rendered = renderTemplate(template, vars);
  const skipReason = await emailSkipReason(template, to);
  const doc = {
    status: skipReason ? 'skipped' : 'queued',
    template,
    to: Array.isArray(to) ? to : [to],
    bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [],
    replyTo: replyTo || config.mailReplyTo || null,
    subject: subject || rendered.subject,
    html: rendered.html,
    text: rendered.text,
    vars,
    skipReason: skipReason || null,
    attachments: (attachments || []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType || 'application/pdf',
      // store path or base64 marker; buffer kept only for immediate send
      driveFileId: a.driveFileId || null,
      size: a.content ? a.content.length : a.size || 0,
    })),
    attempts: 0,
    providerMessageId: null,
    lastError: skipReason || null,
    createdAt: utcnow(),
    updatedAt: utcnow(),
    sentAt: null,
  };

  const result = await db.collection('email_outbox').insertOne(doc);
  const outboxId = String(result.insertedId);

  if (!skipWhatsApp) {
    setImmediate(() => {
      try {
        const { maybeEnqueueWhatsAppForEmail } = require('../whatsapp');
        maybeEnqueueWhatsAppForEmail({ to, template, vars, actor }).catch((e) => {
          console.warn('whatsapp fan-out failed:', e.message);
        });
      } catch (e) {
        console.warn('whatsapp fan-out unavailable:', e.message);
      }
    });
  }

  if (skipReason) {
    if (!config.isProduction) {
      console.info(`[DEV MAIL skipped:${skipReason}] to=${doc.to.join(',')} template=${template}`);
    }
    return { outboxId, status: 'skipped', skipReason };
  }

  // Attach buffers only for this process send (not persisted as binary in mongo for size)
  const sendAttachments = (attachments || [])
    .filter((a) => a.content)
    .map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || 'application/pdf',
    }));

  setImmediate(() => {
    sendOutbox(outboxId, sendAttachments, actor).catch((e) => {
      console.warn('email send failed:', e.message);
    });
  });

  return { outboxId, status: 'queued' };
}

async function sendOutbox(outboxId, attachments = [], actor) {
  const db = getDb();
  if (!db) return;
  // Use mongoose ObjectId so it matches the driver that owns the connection
  // (top-level mongodb@7 ObjectId + mongoose/mongodb@6 throws BSON version errors).
  const mongoose = require('mongoose');
  const _id = mongoose.isValidObjectId(outboxId) ? new mongoose.Types.ObjectId(outboxId) : null;
  if (!_id) return;
  const doc = await db.collection('email_outbox').findOne({ _id });
  if (!doc || doc.status === 'sent' || doc.status === 'skipped') return;

  await db.collection('email_outbox').updateOne(
    { _id },
    { $inc: { attempts: 1 }, $set: { updatedAt: utcnow() } }
  );

  if (!mailConfigured()) {
    if (!config.isProduction) {
      console.info(`[DEV MAIL] to=${doc.to.join(',')} subject=${doc.subject} template=${doc.template}`);
      await db.collection('email_outbox').updateOne(
        { _id },
        {
          $set: {
            status: 'sent',
            providerMessageId: `dev-${Date.now()}`,
            sentAt: utcnow(),
            updatedAt: utcnow(),
          },
        }
      );
      await writeAudit(actor || { email: 'system', role: 'system' }, 'email.sent', {
        meta: { outboxId, template: doc.template, mode: 'dev-console' },
        tone: 'success',
      });
      return;
    }
    await db.collection('email_outbox').updateOne(
      { _id },
      {
        $set: {
          status: 'failed',
          lastError: 'Resend not configured',
          updatedAt: utcnow(),
        },
      }
    );
    await writeAudit(actor || { email: 'system', role: 'system' }, 'email.failed', {
      meta: { outboxId, template: doc.template, error: 'Resend not configured' },
      tone: 'danger',
      success: false,
    });
    return;
  }

  try {
    const logo = logoInlineAttachment();
    const mailAttachments = logo ? [logo, ...(attachments || [])] : attachments;
    const info = await sendViaResend({
      from: config.mailFrom,
      to: doc.to,
      bcc: doc.bcc,
      replyTo: doc.replyTo || config.mailReplyTo,
      subject: doc.subject,
      html: doc.html,
      text: doc.text,
      attachments: mailAttachments,
    });
    await db.collection('email_outbox').updateOne(
      { _id },
      {
        $set: {
          status: 'sent',
          providerMessageId: info.messageId || null,
          sentAt: utcnow(),
          updatedAt: utcnow(),
          lastError: null,
        },
      }
    );
    await writeAudit(actor || { email: 'system', role: 'system' }, 'email.sent', {
      meta: { outboxId, template: doc.template },
      tone: 'success',
    });
  } catch (e) {
    console.warn('email send failed:', e.message);
    await db.collection('email_outbox').updateOne(
      { _id },
      {
        $set: {
          status: 'failed',
          lastError: e.message,
          updatedAt: utcnow(),
        },
      }
    );
    await writeAudit(actor || { email: 'system', role: 'system' }, 'email.failed', {
      meta: { outboxId, template: doc.template, error: e.message },
      tone: 'danger',
      success: false,
    });
  }
}

async function retryFailed(limit = 20) {
  const db = requireDb();
  const rows = await db
    .collection('email_outbox')
    .find({ status: 'failed', attempts: { $lt: 5 } })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .toArray();
  for (const row of rows) {
    await db.collection('email_outbox').updateOne(
      { _id: row._id },
      { $set: { status: 'queued', updatedAt: utcnow() } }
    );
    setImmediate(() => sendOutbox(String(row._id)).catch(() => {}));
  }
  return rows.length;
}

module.exports = {
  enqueueEmail,
  sendOutbox,
  retryFailed,
  mailConfigured,
  verifyMail,
  verifySmtp: verifyMail,
};
