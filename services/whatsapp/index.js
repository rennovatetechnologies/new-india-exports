const config = require('../../config');
const { getDb, requireDb } = require('../../db');
const { utcnow, normalizeEmail } = require('../helpers');
const { writeAudit } = require('../audit');
const { renderWhatsApp, otpTemplateComponents } = require('./templates');
const { normalizePhone } = require('./phone');
const {
  mergePrefs,
  isOpsTemplate,
  isOpsRecipient,
  templateTopic,
  topicAllowed,
  whatsappChannelEnabled,
} = require('../notify/prefs');

function graphUrl(path) {
  return `${config.whatsapp.graphBase}/${config.whatsapp.apiVersion}/${path.replace(/^\//, '')}`;
}

function whatsappReady() {
  return Boolean(config.whatsapp.isConfigured);
}

async function resolvePhoneForEmail(email, hintPhone) {
  const hinted = normalizePhone(hintPhone);
  if (hinted.digits) return hinted;
  const db = getDb();
  if (!db) return { e164: '', digits: '', display: '' };
  const emailN = normalizeEmail(email);
  const user = await db.collection('users').findOne({ email: emailN });
  if (user?.phone) {
    const n = normalizePhone(user.phone);
    if (n.digits) return n;
  }
  const draft = await db.collection('signup_drafts').findOne({ email: emailN });
  if (draft?.phone) {
    const n = normalizePhone(draft.phone);
    if (n.digits) return n;
  }
  const staff = await db
    .collection('staff_requests')
    .find({ email: emailN })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  if (staff[0]?.phone) return normalizePhone(staff[0].phone);
  return { e164: '', digits: '', display: '' };
}

function skipReason({ template, phone, prefs, force }) {
  if (force) {
    if (!whatsappReady()) return 'whatsapp_not_configured';
    if (!phone?.digits) return 'no_phone';
    return null;
  }
  if (isOpsTemplate(template)) return 'ops_template';
  if (!whatsappChannelEnabled(template)) {
    if (String(template) === 'auth.otp') {
      return config.whatsappOtpEnabled ? 'whatsapp_not_configured' : 'whatsapp_otp_disabled';
    }
    return config.whatsappNotificationsEnabled
      ? 'whatsapp_not_configured'
      : 'whatsapp_notifications_disabled';
  }
  if (!phone?.digits) return 'no_phone';
  const topic = templateTopic(template);
  if (!topicAllowed(prefs, topic)) return 'topic_opt_out';
  if (template !== 'auth.otp' && mergePrefs(prefs).whatsapp === false) return 'channel_opt_out';
  return null;
}

function buildGraphPayload({ template, vars, phone, rendered }) {
  const to = phone.digits;
  if (template === 'auth.otp' && config.whatsapp.otpTemplate) {
    const buttonMode = config.whatsapp.otpButton === 'none' ? 'none' : 'copy_code';
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: config.whatsapp.otpTemplate,
        language: { code: config.whatsapp.otpTemplateLang || 'en' },
        components: otpTemplateComponents(vars.otpCode, vars.expiresMinutes, buttonMode),
      },
    };
  }
  if (config.whatsapp.notifyTemplate) {
    const name = rendered.preview || firstNameSafe(vars);
    const body = rendered.text.slice(0, 1000);
    const cta = vars.ctaUrl || config.frontendUrl;
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: config.whatsapp.notifyTemplate,
        language: { code: config.whatsapp.notifyTemplateLang || 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: String(name || 'there').slice(0, 60) },
              { type: 'text', text: String(body || 'You have an update from VIRASTRA by New India Export.').slice(0, 1024) },
              { type: 'text', text: String(cta || config.frontendUrl).slice(0, 200) },
            ],
          },
        ],
      },
    };
  }
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: true, body: rendered.text.slice(0, 4096) },
  };
}

function firstNameSafe(vars) {
  const raw = vars?.customerName || vars?.name || '';
  const name = String(raw).trim();
  if (!name || name.includes('@')) return 'there';
  return name.split(/\s+/)[0];
}

async function postGraph(payload) {
  const url = graphUrl(`${config.whatsapp.phoneNumberId}/messages`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `WhatsApp Graph ${res.status}`;
    const err = new Error(msg);
    err.code = data?.error?.code;
    err.details = data?.error;
    throw err;
  }
  return data;
}

/**
 * Queue a WhatsApp message. Never blocks HTTP >2s — send runs in background.
 */
async function enqueueWhatsApp({
  toEmail,
  phone,
  template,
  vars = {},
  actor,
  force = false,
  prefs,
}) {
  const db = requireDb();
  const emailN = normalizeEmail(toEmail);
  const resolved = phone?.digits ? phone : await resolvePhoneForEmail(emailN, phone);
  const rendered = renderWhatsApp(template, {
    ...vars,
    customerEmail: vars.customerEmail || emailN,
  });
  const reason = skipReason({ template, phone: resolved, prefs, force });
  const doc = {
    status: reason ? 'skipped' : 'queued',
    template,
    toEmail: emailN,
    to: resolved.digits || '',
    toE164: resolved.e164 || '',
    text: rendered.text,
    vars,
    skipReason: reason,
    attempts: 0,
    providerMessageId: null,
    lastError: reason,
    createdAt: utcnow(),
    updatedAt: utcnow(),
    sentAt: null,
  };
  const result = await db.collection('whatsapp_outbox').insertOne(doc);
  const outboxId = String(result.insertedId);

  if (reason) {
    if (!config.isProduction) {
      console.info(
        `[DEV WHATSAPP skipped:${reason}] to=${resolved.e164 || emailN} template=${template}\n${rendered.text}`
      );
    }
    return { outboxId, status: 'skipped', skipReason: reason, phone: resolved };
  }

  setImmediate(() => {
    sendOutbox(outboxId, actor).catch((e) => {
      console.warn('whatsapp send failed:', e.message);
    });
  });
  return { outboxId, status: 'queued', phone: resolved };
}

async function sendOutbox(outboxId, actor) {
  const db = getDb();
  if (!db) return;
  const mongoose = require('mongoose');
  const _id = mongoose.isValidObjectId(outboxId) ? new mongoose.Types.ObjectId(outboxId) : null;
  if (!_id) return;
  const doc = await db.collection('whatsapp_outbox').findOne({ _id });
  if (!doc || doc.status === 'sent' || doc.status === 'skipped') return;

  await db.collection('whatsapp_outbox').updateOne(
    { _id },
    { $inc: { attempts: 1 }, $set: { updatedAt: utcnow() } }
  );

  if (!whatsappReady()) {
    const mode = config.isProduction ? 'failed' : 'sent';
    if (!config.isProduction) {
      console.info(`[DEV WHATSAPP] to=${doc.toE164 || doc.to} template=${doc.template}\n${doc.text}`);
    }
    await db.collection('whatsapp_outbox').updateOne(
      { _id },
      {
        $set: {
          status: mode,
          providerMessageId: config.isProduction ? null : `dev-${Date.now()}`,
          lastError: config.isProduction ? 'WhatsApp not configured' : null,
          sentAt: mode === 'sent' ? utcnow() : null,
          updatedAt: utcnow(),
        },
      }
    );
    return;
  }

  const payloadType =
    doc.template === 'auth.otp' && config.whatsapp.otpTemplate
      ? 'template'
      : config.whatsapp.notifyTemplate
        ? 'template'
        : 'text';
  if (payloadType === 'text' && config.isProduction && !config.whatsapp.allowSessionText) {
    await db.collection('whatsapp_outbox').updateOne(
      { _id },
      {
        $set: {
          status: 'failed',
          lastError:
            'WhatsApp session text is disabled in production. Set WHATSAPP_OTP_TEMPLATE / WHATSAPP_NOTIFY_TEMPLATE.',
          updatedAt: utcnow(),
        },
      }
    );
    return;
  }

  try {
    const payload = buildGraphPayload({
      template: doc.template,
      vars: doc.vars || {},
      phone: { digits: doc.to },
      rendered: { text: doc.text, preview: String(doc.text || '').split('\n').filter(Boolean)[0] },
    });
    const info = await postGraph(payload);
    const providerMessageId = info?.messages?.[0]?.id || null;
    await db.collection('whatsapp_outbox').updateOne(
      { _id },
      {
        $set: {
          status: 'sent',
          providerMessageId,
          sentAt: utcnow(),
          updatedAt: utcnow(),
          lastError: null,
        },
      }
    );
    await writeAudit(actor || { email: 'system', role: 'system' }, 'whatsapp.sent', {
      meta: { outboxId, template: doc.template },
      tone: 'success',
    });
  } catch (e) {
    console.warn('whatsapp send failed:', e.message);
    await db.collection('whatsapp_outbox').updateOne(
      { _id },
      {
        $set: {
          status: 'failed',
          lastError: e.message,
          updatedAt: utcnow(),
        },
      }
    );
    await writeAudit(actor || { email: 'system', role: 'system' }, 'whatsapp.failed', {
      meta: { outboxId, template: doc.template, error: e.message },
      tone: 'danger',
      success: false,
    });
  }
}

async function maybeEnqueueWhatsAppForEmail({ to, template, vars = {}, actor }) {
  if (isOpsTemplate(template) || isOpsRecipient(to)) return null;
  const recipients = Array.isArray(to) ? to : [to];
  const db = getDb();
  const results = [];
  for (const email of recipients) {
    const emailN = normalizeEmail(email);
    if (!emailN || isOpsRecipient(emailN)) continue;
    let prefs;
    let phoneHint = vars.phone || vars.customerPhone;
    if (db) {
      const user = await db.collection('users').findOne({ email: emailN });
      prefs = user?.notificationPrefs;
      phoneHint = phoneHint || user?.phone;
    }
    results.push(
      await enqueueWhatsApp({
        toEmail: emailN,
        phone: phoneHint,
        template,
        vars: { ...vars, customerEmail: vars.customerEmail || emailN },
        actor,
        prefs,
      })
    );
  }
  return results;
}

async function retryFailed(limit = 20) {
  const db = requireDb();
  const rows = await db
    .collection('whatsapp_outbox')
    .find({ status: 'failed', attempts: { $lt: 5 } })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .toArray();
  for (const row of rows) {
    await db.collection('whatsapp_outbox').updateOne(
      { _id: row._id },
      { $set: { status: 'queued', updatedAt: utcnow() } }
    );
    setImmediate(() => sendOutbox(String(row._id)).catch(() => {}));
  }
  return rows.length;
}

function describeStatus() {
  const flags = {
    otp: Boolean(config.whatsappOtpEnabled),
    notifications: Boolean(config.whatsappNotificationsEnabled),
    configured: whatsappReady(),
  };
  if (!flags.otp && !flags.notifications) {
    return 'WhatsApp disabled (ENABLE_WHATSAPP_OTP / ENABLE_WHATSAPP_NOTIFICATIONS are off)';
  }
  if (!flags.configured) {
    return 'WhatsApp flagged on but not configured (set WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN)';
  }
  return `WhatsApp Cloud API ready (otp=${flags.otp} notifications=${flags.notifications})`;
}

module.exports = {
  enqueueWhatsApp,
  sendOutbox,
  retryFailed,
  maybeEnqueueWhatsAppForEmail,
  resolvePhoneForEmail,
  whatsappReady,
  describeStatus,
};
