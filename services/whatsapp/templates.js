const config = require('../../config');
const { defaultCta, money } = require('../mail/templates');

function firstName(vars) {
  const raw = vars.customerName || vars.name || vars.legalName || '';
  const name = String(raw).trim();
  if (!name || name.includes('@')) return 'there';
  return name.split(/\s+/)[0];
}

function supportLine() {
  const s = config.supportEmail || config.mailReplyTo || 'support@virastrainternationalexport.com';
  const wa = config.supportWhatsAppDisplay || '+91 99670 84149';
  return `Need help? ${s} or WhatsApp ${wa}`;
}

function signOff() {
  return `— ${config.appName || 'VIRASTRA'} · New India Export`;
}

function otpIntent(purpose) {
  switch (String(purpose || '')) {
    case 'customer_signup':
      return 'create your VIRASTRA workspace';
    case 'staff_login':
      return 'sign in to the operations workspace';
    case 'staff_register':
      return 'confirm your staff access request';
    default:
      return 'sign in to VIRASTRA';
  }
}

function withCta(text, template, vars) {
  const url = vars.ctaUrl || defaultCta(template, vars);
  const label = vars.ctaLabel || 'Open workspace';
  if (!url) return `${text}\n\n${supportLine()}\n${signOff()}`;
  return `${text}\n\n${label}:\n${url}\n\n${supportLine()}\n${signOff()}`;
}

function listLines(items) {
  return (items || []).filter(Boolean).map((x) => `• ${x}`).join('\n');
}

function builtInText(template, v) {
  const hi = firstName(v);

  switch (template) {
    case 'auth.otp':
      return `Hi ${hi},

Your one-time code to ${otpIntent(v.purpose)} is:

*${v.otpCode || '------'}*

This code expires in *${v.expiresMinutes || 10} minutes*. Please don’t share it with anyone — VIRASTRA will never ask for it on a call or chat.

If you didn’t request this, you can ignore this message.

${supportLine()}
${signOff()}`;

    case 'staff.access_submitted':
      if (v.message) {
        return `New staff access request from *${v.customerName || v.name || 'an applicant'}*.\n\n${v.message}`;
      }
      return withCta(
        `Hi ${hi},\n\nWe’ve received your staff access request. An admin will review it shortly — you’ll get a WhatsApp as soon as there’s a decision.\n\nNo action needed from you right now.`,
        template,
        v
      );

    case 'staff.access_approved':
      return withCta(
        `Hi ${hi},\n\nGood news — your VIRASTRA staff access is *active*.\n\nYou can sign in anytime with your work email and a one-time code (no password).`,
        template,
        { ...v, ctaLabel: 'Sign in to staff workspace' }
      );

    case 'staff.access_rejected':
      return `Hi ${hi},

Thank you for applying to join the VIRASTRA team. After review, we are unable to approve access at this time.
${v.reason ? `\nNote from admin: ${v.reason}\n` : ''}
${supportLine()}
${signOff()}`;

    case 'staff.access_suspended':
      return `Hi ${hi},

Your VIRASTRA staff access has been *suspended*. You won’t be able to sign in until an administrator restores it.
${v.reason ? `\nReason: ${v.reason}\n` : ''}
${supportLine()}
${signOff()}`;

    case 'payment.receipt':
      return withCta(
        `Hi ${hi},\n\nThank you — we’ve received your payment.\n\n*${v.planName || 'Your purchase'}*\nAmount: ${money(v.amountInr)}\n${v.paymentId ? `Payment ID: ${v.paymentId}\n` : ''}${v.caseId ? `Case: ${v.caseId}\n` : ''}\nYour GST tax invoice is sent separately (or is already in your billing tab).`,
        template,
        { ...v, ctaLabel: 'View dashboard' }
      );

    case 'payment.invoice':
      return withCta(
        `Hi ${hi},\n\nYour tax invoice *${v.invoiceNumber || ''}* from ${v.sellerLegalName || config.seller.legalName} is ready.\n\n${v.description ? `${v.description}\n` : ''}Grand total: *${money(v.grandTotal)}*\n\nDownload the PDF anytime from billing.`,
        template,
        { ...v, ctaLabel: 'View invoices' }
      );

    case 'payment.failed':
      return withCta(
        `Hi ${hi},\n\nWe couldn’t complete your payment${v.planName ? ` for *${v.planName}*` : ''}. *No amount was captured* for this attempt.\n${v.reason ? `\nDetails: ${v.reason}\n` : ''}\nYou can retry securely from your dashboard. If your bank deducted money, reply with the payment reference and we’ll reconcile it.`,
        template,
        { ...v, ctaLabel: 'Try payment again' }
      );

    case 'payment.installment_schedule':
      return withCta(
        `Hi ${hi},\n\nWe’ve received installment *${v.installmentNumber || ''} of ${v.installmentCount || 3}* for *${v.title || 'your event'}*.\n\nAmount received: ${money(v.amountInr)}\nNext due: ${v.nextDueDate || 'soon'} (${money(v.nextAmountInr)})\nComplete all payments by ${v.dueBy || 'the plan deadline'}.\n\nYour seat stays reserved while you finish the remaining installments.`,
        template,
        { ...v, ctaLabel: 'Pay next installment' }
      );

    case 'payment.reminder':
      return withCta(
        `Hi ${hi},\n\n${v.message || `Installment ${v.installmentNumber || ''} of ${v.installmentCount || 3} for ${v.title || 'your event'} is due on ${v.dueDate || 'the due date'}.`}\n\nAmount: *${money(v.amountInr)}*\nComplete the plan by ${v.dueBy || 'the deadline'}.`,
        template,
        { ...v, ctaLabel: 'Pay installment' }
      );

    case 'payment.overdue':
      return withCta(
        `Hi ${hi},\n\n${v.message || `Installment ${v.installmentNumber || ''} of ${v.installmentCount || 3} for ${v.title || 'your event'} is overdue.`}\n\nAmount due: *${money(v.amountInr)}*\nWas due: ${v.dueDate || '—'}\n\nPlease pay as soon as you can so your seat stays reserved.`,
        template,
        { ...v, ctaLabel: 'Pay now' }
      );

    case 'kyc.submitted_customer':
      return withCta(
        `Hi ${hi},\n\nWe’ve received your KYC${v.caseId ? ` for case *${v.caseId}*` : ''}. Our operations desk will review it — most reviews finish in 1–2 business days.\n\nNo action needed unless we ask for a clarification.`,
        template,
        { ...v, ctaLabel: 'Track your case' }
      );

    case 'kyc.approved':
      return withCta(
        `Hi ${hi},\n\nGreat news — your KYC is *approved*${v.caseId ? ` (${v.caseId})` : ''}.\n\nYour workspace is unlocked for the next onboarding steps.`,
        template,
        { ...v, ctaLabel: 'Continue onboarding' }
      );

    case 'kyc.needs_more': {
      const labels = Array.isArray(v.missingDocLabels)
        ? v.missingDocLabels
        : Array.isArray(v.missingDocIds)
          ? v.missingDocIds
          : [];
      const list = listLines(labels) || v.reason || 'Please update the missing or unclear documents.';
      return withCta(
        `Hi ${hi},\n\nWe reviewed your KYC${v.caseId ? ` for *${v.caseId}*` : ''} and need a few documents updated:\n\n${list}${v.reason && labels.length ? `\n\nNote: ${v.reason}` : ''}\n\nReplace the files in your KYC checklist and resubmit. Reply here if you’re unsure what to share.`,
        template,
        { ...v, ctaLabel: 'Update KYC documents' }
      );
    }

    case 'stage.advanced':
      return withCta(
        `Hi ${hi},\n\nGood progress — *${v.stageLabel || 'your latest milestone'}* is complete${v.caseId ? ` on case ${v.caseId}` : ''}.${v.notes ? `\n\n${v.notes}` : ''}\n\nOpen your dashboard to see what comes next.`,
        template,
        { ...v, ctaLabel: 'See next steps' }
      );

    case 'stage.rejected':
      return withCta(
        `Hi ${hi},\n\nYour operations desk needs a small update on *${v.stageLabel || 'your current milestone'}*${v.caseId ? ` (${v.caseId})` : ''} before we can move ahead.\n\nFeedback:\n${v.reason || 'Please review the notes in your dashboard and resubmit.'}`,
        template,
        { ...v, ctaLabel: 'Review and update' }
      );

    case 'doc.requested':
      return withCta(
        `Hi ${hi},\n\nYour VIRASTRA desk has requested a document to keep onboarding moving.\n\n*${v.label || 'Requested document'}*${v.caseId ? `\nCase: ${v.caseId}` : ''}${v.reason ? `\nWhy: ${v.reason}` : ''}\n\nPlease upload a clear scan or PDF from your workspace.`,
        template,
        { ...v, ctaLabel: 'Upload document' }
      );

    case 'doc.delivered_customer':
      return withCta(
        `Hi ${hi},\n\nYour VIRASTRA desk shared a new document${v.label ? `: *${v.label}*` : ''}${v.caseId ? ` on case ${v.caseId}` : ''}.${v.note ? `\n\nNote: ${v.note}` : ''}\n\nYou can download it from your workspace.`,
        template,
        { ...v, ctaLabel: 'Open documents' }
      );

    case 'message.ops_to_customer':
      return withCta(
        `Hi ${hi},\n\nYour VIRASTRA desk sent you a message${v.caseId ? ` about case ${v.caseId}` : ''}:\n\n${v.body || v.preview || ''}\n\nYou can reply from your dashboard.`,
        template,
        { ...v, ctaLabel: 'View conversation' }
      );

    case 'event.registered':
      return withCta(
        `Hi ${hi},\n\nYour seat is confirmed for *${v.title || 'the event'}*. We look forward to seeing you.\n\n${v.date ? `Date: ${v.date}\n` : ''}${v.city || v.venue ? `Venue: ${v.city || v.venue}\n` : ''}${v.registrationId ? `Registration: ${v.registrationId}` : ''}`,
        template,
        { ...v, ctaLabel: 'View event details' }
      );

    case 'event.cancelled':
      return withCta(
        `Hi ${hi},\n\nYour registration for *${v.title || 'the event'}* has been cancelled as requested.\n\nIf a refund applies, our team will follow up separately.`,
        template,
        { ...v, ctaLabel: 'Browse events' }
      );

    case 'event.rescheduled':
      return withCta(
        `Hi ${hi},\n\n*${v.title || 'Your event'}* has been rescheduled.\n\nNew date: ${v.newDate || v.date || '—'}\nVenue: ${v.newCity || v.city || v.venue || '—'}${v.message ? `\n\n${v.message}` : ''}\n\nYour registration remains active. Reply if you can no longer attend.`,
        template,
        { ...v, ctaLabel: 'View event details' }
      );

    case 'event.followup':
      return withCta(
        `Hi ${hi},\n\nA quick follow-up about *${v.title || 'your event'}*.\n\n${v.message || ''}`,
        template,
        { ...v, ctaLabel: 'Open dashboard' }
      );

    case 'event.update':
      return withCta(
        `Hi ${hi},\n\nAn update for registrants of *${v.title || 'the event'}*.\n\n${v.message || ''}`,
        template,
        { ...v, ctaLabel: 'View event details' }
      );

    case 'booking.received_customer':
      return withCta(
        `Hi ${hi},\n\nThank you — we’ve received your shipment enquiry. Our team will contact you shortly with next steps.\n\n${v.bookingId || v.paymentId ? `Reference: ${v.bookingId || v.paymentId}` : ''}`,
        template,
        { ...v, ctaLabel: 'Visit VIRASTRA' }
      );

    case 'support.ticket_created':
      return withCta(
        `Hi ${hi},\n\nWe’ve created support ticket *${v.id || ''}*. Our team will respond as soon as possible.\n${v.message ? `\n“${v.message}”\n` : ''}\nPlease keep this ticket number handy.`,
        template,
        v
      );

    case 'plan.upgraded':
      return withCta(
        `Hi ${hi},\n\nYour upgrade is complete. You are now on *${v.planName || 'your new plan'}*.\n\n${v.amountInr != null ? `Amount paid: ${money(v.amountInr)}\n` : ''}${v.caseId ? `Case: ${v.caseId}\n` : ''}\nYour GST invoice is sent separately.`,
        template,
        { ...v, ctaLabel: 'View your plan' }
      );

    default:
      return withCta(
        `Hi ${hi},\n\n${v.message || 'You have a new update from VIRASTRA.'}`,
        template,
        v
      );
  }
}

function renderWhatsApp(template, vars = {}) {
  const v = {
    supportEmail: config.supportEmail,
    supportWhatsApp: config.supportWhatsAppDisplay,
    appName: config.appName,
    ...vars,
  };
  const text = String(builtInText(template, v) || '').trim();
  const preview = text.split('\n').filter(Boolean)[0] || 'VIRASTRA update';
  return { text, preview };
}

function otpTemplateComponents(code, expiresMinutes, buttonMode) {
  const otp = String(code || '').replace(/\D/g, '').slice(0, 6);
  const params = [{ type: 'text', text: otp }];
  if ((config.whatsapp.otpBodyParams || 1) >= 2) {
    params.push({ type: 'text', text: String(expiresMinutes || 10) });
  }
  const body = { type: 'body', parameters: params };
  if (buttonMode === 'none') return [body];
  return [
    body,
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: otp }],
    },
  ];
}

module.exports = {
  renderWhatsApp,
  firstName,
  otpIntent,
  otpTemplateComponents,
};
