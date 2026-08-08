const nodemailer = require('nodemailer');
const config = require('../../config');
const { getDb, requireDb } = require('../../db');
const { utcnow } = require('../helpers');
const { writeAudit } = require('../audit');
const { renderTemplate } = require('./templates');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.user || !config.smtp.pass) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

/**
 * Enqueue email. Never blocks HTTP >2s — fires send in background.
 * @returns {{ outboxId: string, status: string }}
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
}) {
  const db = requireDb();
  const rendered = renderTemplate(template, vars);
  const doc = {
    status: 'queued',
    template,
    to: Array.isArray(to) ? to : [to],
    bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [],
    subject: subject || rendered.subject,
    html: rendered.html,
    text: rendered.text,
    vars,
    attachments: (attachments || []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType || 'application/pdf',
      // store path or base64 marker; buffer kept only for immediate send
      driveFileId: a.driveFileId || null,
      size: a.content ? a.content.length : a.size || 0,
    })),
    attempts: 0,
    providerMessageId: null,
    lastError: null,
    createdAt: utcnow(),
    updatedAt: utcnow(),
    sentAt: null,
  };

  const result = await db.collection('email_outbox').insertOne(doc);
  const outboxId = String(result.insertedId);

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
  if (!doc || doc.status === 'sent') return;

  await db.collection('email_outbox').updateOne(
    { _id },
    { $inc: { attempts: 1 }, $set: { updatedAt: utcnow() } }
  );

  const tx = getTransporter();
  if (!tx) {
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
          lastError: 'SMTP not configured',
          updatedAt: utcnow(),
        },
      }
    );
    await writeAudit(actor || { email: 'system', role: 'system' }, 'email.failed', {
      meta: { outboxId, template: doc.template, error: 'SMTP not configured' },
      tone: 'danger',
      success: false,
    });
    return;
  }

  try {
    const info = await tx.sendMail({
      from: config.mailFrom,
      to: doc.to.join(', '),
      bcc: doc.bcc?.length ? doc.bcc.join(', ') : undefined,
      replyTo: config.mailReplyTo,
      subject: doc.subject,
      html: doc.html,
      text: doc.text,
      attachments,
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

module.exports = { enqueueEmail, sendOutbox, retryFailed, getTransporter };
