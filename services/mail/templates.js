const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { LOGO_CID } = require('../../assets');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

/**
 * Which templates expect file attachments when enqueueing.
 * Callers should pass `attachments: [{ filename, content, contentType }]` to enqueueEmail.
 */
const TEMPLATE_ATTACHMENTS = {
  'payment.invoice': {
    required: true,
    kinds: ['gst_invoice_pdf'],
    note: 'Attach the GST tax invoice PDF (required).',
  },
  'payment.receipt': {
    required: false,
    kinds: ['payment_receipt_pdf'],
    note: 'Optionally attach a payment receipt PDF; invoice is sent separately.',
  },
  'plan.upgraded': {
    required: false,
    kinds: ['gst_invoice_pdf'],
    note: 'Invoice is usually sent via payment.invoice; optional upgrade summary PDF.',
  },
  'doc.delivered_customer': {
    required: false,
    kinds: ['workspace_document'],
    note: 'Attach the delivered file when under size limit; otherwise link via ctaUrl.',
  },
  'doc.requested': {
    required: false,
    kinds: ['sample_or_checklist'],
    note: 'Optional sample / checklist PDF to help the customer upload correctly.',
  },
  'kyc.needs_more': {
    required: false,
    kinds: ['checklist_pdf'],
    note: 'Optional missing-documents checklist PDF.',
  },
  'kyc.approved': {
    required: false,
    kinds: ['approval_letter_pdf'],
    note: 'Optional KYC approval confirmation PDF.',
  },
  'event.registered': {
    required: false,
    kinds: ['calendar_ics', 'ticket_pdf'],
    note: 'Optional calendar invite (.ics) and/or ticket PDF.',
  },
  'booking.received_customer': {
    required: false,
    kinds: ['enquiry_summary_pdf'],
    note: 'Optional enquiry summary PDF.',
  },
};

const SUBJECTS = {
  'auth.otp': 'Your VIRASTRA by New India Export verification code',
  'staff.access_submitted': 'We received your staff access request',
  'staff.access_approved': 'Welcome aboard — your staff access is active',
  'staff.access_rejected': 'Update on your staff access request',
  'staff.access_suspended': 'Your VIRASTRA by New India Export staff access has been suspended',
  'payment.receipt': 'Payment confirmed — {{planName}}',
  'payment.invoice': 'Tax Invoice {{invoiceNumber}} — New India Export',
  'payment.failed': 'We could not complete your payment',
  'payment.ops_alert': 'New paid customer: {{customer}} · {{planName}}',
  'payment.installment_schedule': 'Installment {{installmentNumber}} of {{installmentCount}} received — {{title}}',
  'payment.reminder': 'Payment reminder: installment {{installmentNumber}} of {{installmentCount}} — {{title}}',
  'payment.overdue': 'Overdue installment {{installmentNumber}} of {{installmentCount}} — {{title}}',
  'kyc.submitted_customer': 'KYC received — we are reviewing your details',
  'kyc.submitted_ops': 'KYC ready for review: {{legalName}}',
  'kyc.approved': 'Great news — your KYC is approved',
  'kyc.needs_more': 'Action needed on your KYC documents',
  'stage.advanced': 'Milestone complete: {{stageLabel}}',
  'stage.rejected': 'A quick update needed: {{stageLabel}}',
  'doc.requested': 'Please upload: {{label}}',
  'doc.uploaded_ops': 'Customer uploaded a document — {{caseId}}',
  'doc.delivered_customer': 'A new document is ready in your workspace',
  'message.customer_to_ops': 'New message from {{name}}',
  'message.ops_to_customer': 'Message from your VIRASTRA by New India Export desk',
  'event.registered': 'You are registered: {{title}}',
  'event.cancelled': 'Registration cancelled: {{title}}',
  'event.rescheduled': 'Event update: {{title}} has been rescheduled',
  'event.followup': 'Follow-up: {{title}}',
  'event.update': 'Update about {{title}}',
  'booking.received_customer': 'We received your shipment enquiry',
  'booking.received_ops': 'New booking lead from {{customerName}}',
  'support.ticket_created': 'Support ticket {{id}} — we are on it',
  'plan.upgraded': 'Your plan is now {{planName}}',
};

const cache = new Map();

function fill(str, vars) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) =>
    vars[k] != null && vars[k] !== '' ? String(vars[k]) : ''
  );
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return `₹${num.toLocaleString('en-IN')}`;
}

function greetingName(vars) {
  const raw = vars.customerName || vars.name || vars.legalName || '';
  const name = String(raw).trim();
  if (!name || name.includes('@')) return 'there';
  return escapeHtml(name.split(/\s+/)[0]);
}

function attachmentBanner(template, vars) {
  const meta = TEMPLATE_ATTACHMENTS[template];
  if (!meta) return { html: '', text: '' };
  if (vars.hasAttachment === false) return { html: '', text: '' };
  const show =
    vars.hasAttachment === true ||
    meta.required ||
    vars.attachmentNote ||
    (Array.isArray(vars.attachmentNames) && vars.attachmentNames.length);
  if (!show && !meta.required) return { html: '', text: '' };

  const names = Array.isArray(vars.attachmentNames)
    ? vars.attachmentNames.filter(Boolean)
    : [];
  const label =
    vars.attachmentNote ||
    (names.length
      ? `Attached: ${names.join(', ')}`
      : meta.required
        ? 'A document is attached to this email for your records.'
        : 'Check the attachments on this email for supporting documents.');

  return {
    html: `<div style="margin:20px 0;padding:14px 16px;background:#F7F3EA;border:1px solid #E6DCC8;border-radius:6px;font-size:14px;color:#44403C;line-height:1.5">
      <strong style="color:#1C1917">Attachment</strong><br/>${escapeHtml(label)}
    </div>`,
    text: `\n${label}\n`,
  };
}

function detailRows(rows) {
  const filtered = rows.filter((r) => r.value != null && String(r.value).trim() !== '');
  if (!filtered.length) return '';
  const htmlRows = filtered
    .map(
      (r) => `<tr>
      <td style="padding:8px 0;color:#78716C;font-size:13px;width:42%;vertical-align:top">${escapeHtml(r.label)}</td>
      <td style="padding:8px 0;color:#1C1917;font-size:14px;text-align:right;vertical-align:top">${r.rawHtml ? r.value : escapeHtml(r.value)}</td>
    </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:8px 0 4px">${htmlRows}</table>`;
}

function textDetails(rows) {
  return rows
    .filter((r) => r.value != null && String(r.value).trim() !== '' && !r.rawHtml)
    .map((r) => `${r.label}: ${r.value}`)
    .join('\n');
}

function layout({ title, preheader, bodyHtml, ctaUrl, ctaLabel, attachmentHtml }) {
  const brand = escapeHtml(config.appName);
  const support = escapeHtml(config.supportEmail || config.mailReplyTo || '');
  const year = new Date().getUTCFullYear();
  const cta =
    ctaUrl && ctaLabel
      ? `<p style="margin:28px 0 8px">
          <a href="${escapeHtml(ctaUrl)}" style="background:#1A2E28;color:#F7F3EA;padding:13px 22px;text-decoration:none;border-radius:6px;display:inline-block;font-size:14px;font-weight:600;letter-spacing:0.02em">${escapeHtml(ctaLabel)}</a>
        </p>
        <p style="margin:0 0 8px;font-size:12px;color:#A8A29E;word-break:break-all">Or open: ${escapeHtml(ctaUrl)}</p>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#EDE8DF;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1917">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader || title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EDE8DF;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:580px;background:#FFFcf7;border:1px solid #E7DFD2;border-radius:10px;overflow:hidden">
        <tr>
          <td style="padding:22px 28px 18px;border-bottom:1px solid #EFE8DC;background:linear-gradient(180deg,#FFFcf7 0%,#F9F4EA 100%)">
            <img src="cid:${LOGO_CID}" alt="${brand}" width="200" height="70" style="display:block;width:200px;height:auto;max-width:200px;border:0;outline:none;text-decoration:none"/>
          </td>
        </tr>
        <tr>
          <td style="padding:28px">
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1C1917;font-weight:700">${escapeHtml(title)}</h1>
            <div style="font-size:15px;line-height:1.65;color:#44403C">${bodyHtml}</div>
            ${attachmentHtml || ''}
            ${cta}
            <p style="margin:28px 0 0;font-size:13px;line-height:1.55;color:#78716C">
              Need help? Write to us at
              <a href="mailto:${support}" style="color:#1A2E28;text-decoration:underline">${support}</a>
              or WhatsApp
              <a href="https://wa.me/${escapeHtml(config.supportWhatsAppE164)}" style="color:#1A2E28;text-decoration:underline">${escapeHtml(config.supportWhatsAppDisplay)}</a>
              — we are happy to assist.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#F5F0E6;border-top:1px solid #E7DFD2;font-size:11px;line-height:1.5;color:#A8A29E">
            © ${year} ${brand}<br/>
            This email was sent regarding your VIRASTRA by New India Export account. Please do not share OTPs or payment links with anyone.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function loadFileTemplate(template, ext) {
  const key = `${template}.${ext}`;
  if (cache.has(key)) return cache.get(key);
  const filePath = path.join(TEMPLATES_DIR, key);
  if (!fs.existsSync(filePath)) {
    cache.set(key, null);
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  cache.set(key, content);
  return content;
}

function builtInBodies(template, v) {
  const hi = greetingName(v);
  const caseLine = v.caseId ? `Case reference: <strong>${escapeHtml(v.caseId)}</strong>` : '';
  const support = escapeHtml(config.supportEmail || 'support@virastrainternationalexport.com');

  switch (template) {
    case 'auth.otp':
      return {
        title: 'Your verification code',
        preheader: `Use code ${v.otpCode || ''} to continue. Expires in ${v.expiresMinutes || 10} minutes.`,
        ctaUrl: null,
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Use this one-time code to sign in securely to VIRASTRA by New India Export. It expires in <strong>${escapeHtml(v.expiresMinutes || 10)} minutes</strong>.</p>
          <div style="margin:22px 0;padding:18px;text-align:center;background:#1A2E28;border-radius:8px">
            <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#D6C59A;margin-bottom:8px">Verification code</div>
            <div style="font-size:32px;letter-spacing:0.28em;font-weight:700;color:#FFFcf7">${escapeHtml(v.otpCode || '------')}</div>
          </div>
          <p style="margin:0;font-size:13px;color:#78716C">If you did not request this code, you can safely ignore this email. Never share this code with anyone.</p>`,
        text: `Hi ${hi},\n\nYour VIRASTRA by New India Export verification code is ${v.otpCode || '------'}.\nIt is valid for ${v.expiresMinutes || 10} minutes.\n\nIf you did not request this, ignore this email.`,
      };

    case 'staff.access_submitted':
      return {
        title: v.message ? 'New staff access request' : 'We received your request',
        preheader: 'Your staff access request is with our admin team.',
        ctaLabel: v.message ? 'Review requests' : 'Check status',
        html: v.message
          ? `<p style="margin:0 0 14px">A new staff access request needs review.</p>
             <p style="margin:0 0 14px"><strong>${escapeHtml(v.customerName || v.name || 'Applicant')}</strong> has requested access.</p>
             <p style="margin:0;color:#78716C">${escapeHtml(v.message)}</p>`
          : `<p style="margin:0 0 14px">Hi ${hi},</p>
             <p style="margin:0 0 14px">Thank you for applying for VIRASTRA by New India Export staff access. Our admin team has received your request and will review it shortly.</p>
             <p style="margin:0">You will get another email as soon as a decision is made. No further action is needed right now.</p>`,
        text: v.message
          ? `New staff access request from ${v.customerName || v.name || 'applicant'}. ${v.message}`
          : `Hi ${hi},\n\nWe received your staff access request. An admin will review it shortly. You will hear from us by email.`,
      };

    case 'staff.access_approved':
      return {
        title: 'Your staff access is active',
        preheader: 'You can now sign in with email OTP.',
        ctaLabel: 'Sign in to staff workspace',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Good news — your staff access request has been approved. You can sign in anytime using your work email and a one-time verification code (no password needed).</p>
          <p style="margin:0">If anything looks incorrect on your profile, reply to this email and we will help.</p>`,
        text: `Hi ${hi},\n\nYour staff access is active. Sign in with email OTP at your staff workspace.\n\nNeed help? ${support}`,
      };

    case 'staff.access_rejected':
      return {
        title: 'Update on your access request',
        preheader: 'Your staff access request was not approved.',
        ctaUrl: null,
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Thank you for your interest in joining the VIRASTRA by New India Export team. After review, we are unable to approve your access request at this time.</p>
          ${v.reason ? `<p style="margin:0 0 14px"><strong>Note from admin:</strong> ${escapeHtml(v.reason)}</p>` : ''}
          <p style="margin:0">If you believe this is a mistake, contact us at ${support}.</p>`,
        text: `Hi ${hi},\n\nYour staff access request was not approved.${v.reason ? `\nNote: ${v.reason}` : ''}\n\nContact ${support} if you need clarity.`,
      };

    case 'staff.access_suspended':
      return {
        title: 'Your staff access has been suspended',
        preheader: 'You will not be able to sign in until access is restored.',
        ctaUrl: null,
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Your VIRASTRA by New India Export staff access has been suspended. You will not be able to sign in until an administrator restores it.</p>
          ${v.reason ? `<p style="margin:0 0 14px"><strong>Reason:</strong> ${escapeHtml(v.reason)}</p>` : ''}
          <p style="margin:0">Questions? Reach ${support}.</p>`,
        text: `Hi ${hi},\n\nYour staff access has been suspended.${v.reason ? `\nReason: ${v.reason}` : ''}\n\nContact ${support}.`,
      };

    case 'payment.receipt':
      return {
        title: 'Payment confirmed',
        preheader: `We received ₹${v.amountInr ?? ''} for ${v.planName || 'your purchase'}.`,
        ctaLabel: 'View dashboard',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Thank you — your payment was successful. We have started preparing the next steps for your onboarding.</p>
          ${detailRows([
            { label: 'Purchase', value: v.planName },
            { label: 'Amount paid', value: money(v.amountInr) },
            { label: 'Payment ID', value: v.paymentId },
            { label: 'Case', value: v.caseId },
          ])}
          <p style="margin:16px 0 0">Your official GST tax invoice is sent separately (or attached when available). Keep it for your accounts team.</p>`,
        text: `Hi ${hi},\n\nPayment confirmed for ${v.planName || 'your purchase'}.\nAmount: ${money(v.amountInr)}\nPayment ID: ${v.paymentId || ''}\nCase: ${v.caseId || ''}\n\nYour GST invoice is sent separately.`,
      };

    case 'payment.installment_schedule':
      return {
        title: `Installment ${v.installmentNumber || ''} of ${v.installmentCount || 3} received`,
        preheader: `Next payment for ${v.title || 'your event'} is due ${v.nextDueDate || 'soon'}.`,
        ctaLabel: 'Pay next installment',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">We received installment <strong>${escapeHtml(v.installmentNumber || '')} of ${escapeHtml(v.installmentCount || 3)}</strong> for <strong>${escapeHtml(v.title || 'your event')}</strong>. Your seat is held while you complete the remaining payments within 30 days.</p>
          ${detailRows([
            { label: 'Amount received', value: money(v.amountInr) },
            { label: 'Remaining installments', value: v.remainingCount },
            { label: 'Next due', value: v.nextDueDate },
            { label: 'Next amount', value: money(v.nextAmountInr) },
            { label: 'Complete by', value: v.dueBy },
          ])}
          ${
            v.schedule
              ? `<div style="margin:16px 0;padding:14px 16px;background:#F5F5F4;border-radius:6px;color:#1C1917;white-space:pre-wrap">${escapeHtml(v.schedule)}</div>`
              : ''
          }
          <p style="margin:16px 0 0">Pay each installment 10 days apart. You may pay the next installment early from your dashboard.</p>`,
        text: `Hi ${hi},\n\nInstallment ${v.installmentNumber || ''} of ${v.installmentCount || 3} received for ${v.title || 'your event'}.\nAmount: ${money(v.amountInr)}\nNext due: ${v.nextDueDate || ''} (${money(v.nextAmountInr)})\nComplete all payments by ${v.dueBy || ''}.\n\n${v.schedule || ''}`,
      };

    case 'payment.reminder':
      return {
        title: v.kind === 'due' ? 'Payment due today' : 'Upcoming payment reminder',
        preheader: `Installment ${v.installmentNumber || ''} for ${v.title || 'your event'} is ${v.kind === 'due' ? 'due today' : 'coming up'}.`,
        ctaLabel: 'Pay installment',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">${escapeHtml(v.message || `Installment ${v.installmentNumber || ''} of ${v.installmentCount || 3} for ${v.title || 'your event'} is due on ${v.dueDate || ''}.`)}</p>
          ${detailRows([
            { label: 'Event', value: v.title },
            { label: 'Installment', value: `${v.installmentNumber || ''} of ${v.installmentCount || 3}` },
            { label: 'Amount', value: money(v.amountInr) },
            { label: 'Due date', value: v.dueDate },
            { label: 'Complete plan by', value: v.dueBy },
          ])}
          <p style="margin:16px 0 0">Pay securely from your dashboard. All three installments must be completed within 30 days.</p>`,
        text: `Hi ${hi},\n\n${v.message || `Installment ${v.installmentNumber || ''} of ${v.installmentCount || 3} is due on ${v.dueDate || ''}.`}\nAmount: ${money(v.amountInr)}\nPay from your dashboard.`,
      };

    case 'payment.overdue':
      return {
        title: 'Overdue installment',
        preheader: `Installment ${v.installmentNumber || ''} for ${v.title || 'your event'} is overdue.`,
        ctaLabel: 'Pay now',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">${escapeHtml(v.message || `Installment ${v.installmentNumber || ''} of ${v.installmentCount || 3} for ${v.title || 'your event'} is overdue.`)}</p>
          ${detailRows([
            { label: 'Event', value: v.title },
            { label: 'Installment', value: `${v.installmentNumber || ''} of ${v.installmentCount || 3}` },
            { label: 'Amount due', value: money(v.amountInr) },
            { label: 'Was due', value: v.dueDate },
            { label: 'Complete plan by', value: v.dueBy },
          ])}
          <p style="margin:16px 0 0">Please complete this payment as soon as possible so your event seat stays reserved.</p>`,
        text: `Hi ${hi},\n\n${v.message || `Installment ${v.installmentNumber || ''} is overdue.`}\nAmount: ${money(v.amountInr)}\nWas due: ${v.dueDate || ''}\nPay from your dashboard.`,
      };

    case 'payment.invoice': {
      const taxMode = v.taxMode || (Number(v.igst) > 0 ? 'igst' : 'cgst_sgst');
      const taxRows =
        taxMode === 'igst'
          ? [{ label: 'IGST', value: money(v.igst) }]
          : [
              { label: 'CGST', value: money(v.cgst) },
              { label: 'SGST', value: money(v.sgst) },
            ];
      return {
        title: `Tax invoice ${v.invoiceNumber || ''}`.trim(),
        preheader: `Invoice ${v.invoiceNumber || ''} · Total ${money(v.grandTotal)}`,
        ctaLabel: 'View invoices',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Please find your tax invoice from <strong>${escapeHtml(v.sellerLegalName || config.seller.legalName)}</strong> (GSTIN ${escapeHtml(v.sellerGstin || config.seller.gstin)}).</p>
          ${detailRows([
            { label: 'Invoice number', value: v.invoiceNumber },
            { label: 'Description', value: v.description },
            { label: 'Company', value: v.customerCompany },
            { label: 'Taxable amount', value: money(v.taxableAmount) },
            ...taxRows,
            { label: 'GST total', value: money(v.gstTotal) },
            { label: 'Grand total', value: `<strong>${money(v.grandTotal)}</strong>`, rawHtml: true },
          ])}
          <p style="margin:16px 0 0">The PDF invoice is attached for your books. You can also download it anytime from your account.</p>`,
        text: `Hi ${hi},\n\nTax Invoice ${v.invoiceNumber || ''}\nSeller: ${v.sellerLegalName || config.seller.legalName} (${v.sellerGstin || config.seller.gstin})\nDescription: ${v.description || ''}\nTaxable: ${money(v.taxableAmount)}\nGST: ${money(v.gstTotal)}\nGrand total: ${money(v.grandTotal)}\n\nPDF attached.`,
      };
    }

    case 'payment.failed':
      return {
        title: 'Payment unsuccessful',
        preheader: 'No amount was captured. You can try again anytime.',
        ctaLabel: 'Try payment again',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">We could not complete your payment${v.planName ? ` for <strong>${escapeHtml(v.planName)}</strong>` : ''}. No amount has been captured for this attempt.</p>
          ${v.reason ? `<p style="margin:0 0 14px"><strong>Details:</strong> ${escapeHtml(v.reason)}</p>` : ''}
          <p style="margin:0">You can retry securely from your dashboard. If money was deducted by your bank but the plan is still unpaid, reply to this email with your payment reference and we will help reconcile it.</p>`,
        text: `Hi ${hi},\n\nYour payment was unsuccessful${v.planName ? ` for ${v.planName}` : ''}. No amount was captured.\n${v.reason ? `Details: ${v.reason}\n` : ''}\nRetry from your dashboard or contact ${support}.`,
      };

    case 'payment.ops_alert':
      return {
        title: 'New paid customer',
        preheader: `${v.customer || v.customerName || ''} paid for ${v.planName || 'a plan'}`,
        ctaLabel: 'Open case',
        html: `
          <p style="margin:0 0 14px">A customer payment was captured successfully.</p>
          ${detailRows([
            { label: 'Customer', value: v.customer || v.customerName },
            { label: 'Email', value: v.customerEmail },
            { label: 'Plan / item', value: v.planName },
            { label: 'Amount', value: money(v.amountInr) },
            { label: 'Case', value: v.caseId },
            { label: 'Payment ID', value: v.paymentId },
          ])}
          <p style="margin:16px 0 0">Please confirm ops assignment and begin onboarding follow-up.</p>`,
        text: `New paid customer\nCustomer: ${v.customer || v.customerName || ''}\nPlan: ${v.planName || ''}\nAmount: ${money(v.amountInr)}\nCase: ${v.caseId || ''}`,
      };

    case 'kyc.submitted_customer':
      return {
        title: 'KYC received',
        preheader: 'Our operations desk is reviewing your documents.',
        ctaLabel: 'Track your case',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Thank you — we have received your KYC submission${v.caseId ? ` for case <strong>${escapeHtml(v.caseId)}</strong>` : ''}.</p>
          <p style="margin:0 0 14px">Our operations desk will review your details and documents. Most reviews complete within 1–2 business days. You will get an email when there is an update.</p>
          <p style="margin:0">No further action is needed unless we ask for clarifications.</p>`,
        text: `Hi ${hi},\n\nWe received your KYC${v.caseId ? ` for ${v.caseId}` : ''}. Our desk will review it shortly. You will hear from us by email.`,
      };

    case 'kyc.submitted_ops':
      return {
        title: 'KYC ready for review',
        preheader: `${v.legalName || v.customerEmail || 'Customer'} submitted KYC`,
        ctaLabel: 'Open KYC queue',
        html: `
          <p style="margin:0 0 14px">A customer has submitted KYC for review.</p>
          ${detailRows([
            { label: 'Legal name', value: v.legalName },
            { label: 'Email', value: v.customerEmail },
            { label: 'Case', value: v.caseId },
          ])}
          <p style="margin:16px 0 0">Please review documents and approve or request more information.</p>`,
        text: `KYC queue\nLegal name: ${v.legalName || ''}\nEmail: ${v.customerEmail || ''}\nCase: ${v.caseId || ''}`,
      };

    case 'kyc.approved':
      return {
        title: 'Your KYC is approved',
        preheader: 'You can continue onboarding in your dashboard.',
        ctaLabel: 'Continue onboarding',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Great news — your KYC has been approved${caseLine ? `. ${caseLine}` : ''}.</p>
          <p style="margin:0">Your workspace is unlocked for the next onboarding steps. Sign in to see your milestones and any documents from our team.</p>`,
        text: `Hi ${hi},\n\nYour KYC is approved${v.caseId ? ` (${v.caseId})` : ''}. Continue onboarding from your dashboard.`,
      };

    case 'kyc.needs_more': {
      const labels = Array.isArray(v.missingDocLabels)
        ? v.missingDocLabels
        : Array.isArray(v.missingDocIds)
          ? v.missingDocIds
          : [];
      const listHtml =
        v.missingDocsHtml ||
        (labels.length
          ? `<ul style="margin:8px 0 0;padding-left:18px;color:#1C1917">${labels
              .map((l) => `<li style="margin:0 0 6px"><strong>${escapeHtml(l)}</strong></li>`)
              .join('')}</ul>`
          : '');
      const listText =
        v.missingDocsText ||
        (labels.length ? labels.map((l) => `- ${l}`).join('\n') : '');
      return {
        title: 'Action needed on your KYC',
        preheader: labels.length
          ? `Please update: ${labels.slice(0, 3).join(', ')}${labels.length > 3 ? '…' : ''}`
          : 'Please update the items below so we can finish your review.',
        ctaLabel: 'Update KYC documents',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">We reviewed your KYC${v.caseId ? ` for <strong>${escapeHtml(v.caseId)}</strong>` : ''} and need a few documents updated before we can approve it.</p>
          <div style="margin:16px 0;padding:14px 16px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:6px">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#9A3412;margin-bottom:6px">Documents to update</div>
            ${listHtml || `<div style="color:#1C1917">${escapeHtml(v.reason || 'Please update the missing or unclear documents in your KYC checklist.')}</div>`}
            ${v.reason && listHtml ? `<p style="margin:12px 0 0;font-size:13px;color:#78716C">${escapeHtml(v.reason)}</p>` : ''}
          </div>
          <p style="margin:0">Open your KYC checklist, replace the files listed above, and resubmit. Reply if you have questions — we are here to help.</p>`,
        text: `Hi ${hi},\n\nWe need more information on your KYC${v.caseId ? ` (${v.caseId})` : ''}.\n\nDocuments to update:\n${listText || v.reason || 'Please update missing documents.'}\n${v.reason && listText ? `\nNote: ${v.reason}\n` : ''}\nUpdate from your dashboard: ${v.ctaUrl || ''}`,
      };
    }

    case 'stage.advanced':
      return {
        title: 'Milestone complete',
        preheader: `${v.stageLabel || 'A milestone'} is done on your case.`,
        ctaLabel: 'See next steps',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Good progress — <strong>${escapeHtml(v.stageLabel || 'your latest milestone')}</strong> is complete${v.caseId ? ` on case <strong>${escapeHtml(v.caseId)}</strong>` : ''}.</p>
          ${v.notes ? `<p style="margin:0 0 14px">${escapeHtml(v.notes)}</p>` : ''}
          <p style="margin:0">Open your dashboard to see what comes next and any documents shared by your desk.</p>`,
        text: `Hi ${hi},\n\nMilestone complete: ${v.stageLabel || ''}${v.caseId ? ` (${v.caseId})` : ''}.\n${v.notes || ''}\n\nSee next steps in your dashboard.`,
      };

    case 'stage.rejected':
      return {
        title: 'A quick update is needed',
        preheader: `Please review feedback on ${v.stageLabel || 'your milestone'}.`,
        ctaLabel: 'Review and update',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Your operations desk needs a small update on <strong>${escapeHtml(v.stageLabel || 'your current milestone')}</strong>${v.caseId ? ` (${escapeHtml(v.caseId)})` : ''} before we can move ahead.</p>
          <div style="margin:16px 0;padding:14px 16px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:6px">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#9A3412;margin-bottom:6px">Feedback</div>
            <div style="color:#1C1917">${escapeHtml(v.reason || 'Please review the notes in your dashboard and resubmit.')}</div>
          </div>
          <p style="margin:0">Once updated, we will continue from where you left off.</p>`,
        text: `Hi ${hi},\n\nUpdate needed for ${v.stageLabel || 'your milestone'}${v.caseId ? ` (${v.caseId})` : ''}.\nFeedback: ${v.reason || ''}\n\nPlease update from your dashboard.`,
      };

    case 'doc.requested':
      return {
        title: 'Document requested',
        preheader: `Please upload: ${v.label || 'a document'}`,
        ctaLabel: 'Upload document',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Your VIRASTRA by New India Export desk has requested a document to keep your onboarding moving.</p>
          ${detailRows([
            { label: 'Document', value: v.label || 'Requested document' },
            { label: 'Case', value: v.caseId },
            { label: 'Why we need it', value: v.reason },
          ])}
          <p style="margin:16px 0 0">Please upload a clear scan or PDF from your workspace. If you are unsure what to share, reply to this email and we will guide you.</p>`,
        text: `Hi ${hi},\n\nPlease upload: ${v.label || 'Document'}\nCase: ${v.caseId || ''}\nReason: ${v.reason || ''}\n\nUpload from your workspace.`,
      };

    case 'doc.uploaded_ops':
      return {
        title: 'Customer document uploaded',
        preheader: `${v.label || 'A document'} was uploaded on ${v.caseId || 'a case'}`,
        ctaLabel: 'Review document',
        html: `
          <p style="margin:0 0 14px">A customer has uploaded a document for your review.</p>
          ${detailRows([
            { label: 'Document', value: v.label },
            { label: 'Case', value: v.caseId },
            { label: 'Customer', value: v.customerName || v.customerEmail },
          ])}
          <p style="margin:16px 0 0">Please review and approve, or request a clearer copy if needed.</p>`,
        text: `Document uploaded\nLabel: ${v.label || ''}\nCase: ${v.caseId || ''}\nCustomer: ${v.customerName || v.customerEmail || ''}`,
      };

    case 'doc.delivered_customer':
      return {
        title: 'New document in your workspace',
        preheader: v.label
          ? `Your desk shared: ${v.label}`
          : 'Your VIRASTRA by New India Export desk shared a file with you.',
        ctaLabel: 'Open documents',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Your VIRASTRA by New India Export desk has shared a new document with you${v.caseId ? ` on case <strong>${escapeHtml(v.caseId)}</strong>` : ''}.</p>
          ${detailRows([
            { label: 'Document', value: v.label || 'Document' },
            { label: 'Note from ops', value: v.note },
          ])}
          <p style="margin:16px 0 0">You can download it from your workspace${v.hasAttachment !== false ? '. If a copy is attached to this email, you can save that as well' : ''}.</p>`,
        text: `Hi ${hi},\n\nA new document is ready in your workspace${v.label ? `: ${v.label}` : ''}${v.caseId ? ` (${v.caseId})` : ''}${v.note ? `\nNote: ${v.note}` : ''}.\nOpen your dashboard to download it.`,
      };

    case 'message.customer_to_ops':
      return {
        title: 'New customer message',
        preheader: `${v.name || 'Customer'} sent a message`,
        ctaLabel: 'Reply in workspace',
        html: `
          <p style="margin:0 0 14px"><strong>${escapeHtml(v.name || 'Customer')}</strong> sent a message${v.caseId ? ` on case <strong>${escapeHtml(v.caseId)}</strong>` : ''}.</p>
          <div style="margin:16px 0;padding:14px 16px;background:#F5F5F4;border-radius:6px;color:#1C1917;white-space:pre-wrap">${escapeHtml(v.body || v.preview || '')}</div>
          <p style="margin:0;font-size:13px;color:#78716C">Please respond from the case workspace so the customer stays in the loop.</p>`,
        text: `New message from ${v.name || 'Customer'}${v.caseId ? ` (${v.caseId})` : ''}:\n\n${v.body || v.preview || ''}`,
      };

    case 'message.ops_to_customer':
      return {
        title: 'Message from your VIRASTRA by New India Export desk',
        preheader: 'You have a new update from operations.',
        ctaLabel: 'View conversation',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Your VIRASTRA by New India Export desk sent you a message${v.caseId ? ` regarding case <strong>${escapeHtml(v.caseId)}</strong>` : ''}.</p>
          <div style="margin:16px 0;padding:14px 16px;background:#F5F5F4;border-radius:6px;color:#1C1917;white-space:pre-wrap">${escapeHtml(v.body || v.preview || '')}</div>
          <p style="margin:0">You can reply anytime from your dashboard messaging panel.</p>`,
        text: `Hi ${hi},\n\nMessage from your VIRASTRA by New India Export desk${v.caseId ? ` (${v.caseId})` : ''}:\n\n${v.body || v.preview || ''}\n\nReply from your dashboard.`,
      };

    case 'event.registered':
      return {
        title: 'You are registered',
        preheader: `Seat confirmed for ${v.title || 'the event'}`,
        ctaLabel: 'View event details',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Your seat is confirmed for <strong>${escapeHtml(v.title || 'the event')}</strong>. We look forward to seeing you.</p>
          ${detailRows([
            { label: 'Event', value: v.title },
            { label: 'Date', value: v.date },
            { label: 'City / venue', value: v.city || v.venue },
            { label: 'Registration', value: v.registrationId },
          ])}
          <p style="margin:16px 0 0">If a calendar invite or ticket is attached, save it to your calendar. Reply if you need to change your details.</p>`,
        text: `Hi ${hi},\n\nSeat confirmed for ${v.title || 'the event'}.\nDate: ${v.date || ''}\nCity: ${v.city || v.venue || ''}\n\nSee you there.`,
      };

    case 'event.cancelled':
      return {
        title: 'Registration cancelled',
        preheader: `Your registration for ${v.title || 'the event'} was cancelled.`,
        ctaLabel: 'Browse events',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Your registration for <strong>${escapeHtml(v.title || 'the event')}</strong> has been cancelled as requested.</p>
          <p style="margin:0">If this was a paid seat and a refund applies, our team will follow up separately. You can register again anytime while seats remain.</p>`,
        text: `Hi ${hi},\n\nYour registration for ${v.title || 'the event'} has been cancelled.\nContact ${support} for refund questions.`,
      };

    case 'event.rescheduled':
      return {
        title: 'Event rescheduled',
        preheader: `${v.title || 'Your event'} has a new schedule.`,
        ctaLabel: 'View event details',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">We are writing because <strong>${escapeHtml(v.title || 'your event')}</strong> has been rescheduled.</p>
          ${detailRows([
            { label: 'Event', value: v.title },
            { label: 'New date', value: v.newDate || v.date },
            { label: 'Venue', value: v.newCity || v.city || v.venue },
          ])}
          ${
            v.message
              ? `<div style="margin:16px 0;padding:14px 16px;background:#F5F5F4;border-radius:6px;color:#1C1917;white-space:pre-wrap">${escapeHtml(v.message)}</div>`
              : ''
          }
          <p style="margin:16px 0 0">Your registration remains active. Reply if you can no longer attend.</p>`,
        text: `Hi ${hi},\n\n${v.title || 'Your event'} has been rescheduled.\nNew date: ${v.newDate || v.date || ''}\nVenue: ${v.newCity || v.city || ''}\n\n${v.message || ''}\n\nYour seat remains reserved.`,
      };

    case 'event.followup':
      return {
        title: 'Event follow-up',
        preheader: `A note about ${v.title || 'your event'}`,
        ctaLabel: 'Open dashboard',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">A quick follow-up regarding <strong>${escapeHtml(v.title || 'your event')}</strong>.</p>
          ${detailRows([
            { label: 'Event', value: v.title },
            { label: 'Date', value: v.date },
            { label: 'City / venue', value: v.city || v.venue },
          ])}
          <div style="margin:16px 0;padding:14px 16px;background:#F5F5F4;border-radius:6px;color:#1C1917;white-space:pre-wrap">${escapeHtml(v.message || '')}</div>
          <p style="margin:0">Reply to this email if you have questions.</p>`,
        text: `Hi ${hi},\n\nFollow-up about ${v.title || 'your event'}:\n\n${v.message || ''}\n\nDate: ${v.date || ''}\nCity: ${v.city || ''}`,
      };

    case 'event.update':
      return {
        title: 'Event update',
        preheader: `Update about ${v.title || 'your event'}`,
        ctaLabel: 'View event details',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">We have an update for registrants of <strong>${escapeHtml(v.title || 'the event')}</strong>.</p>
          ${detailRows([
            { label: 'Event', value: v.title },
            { label: 'Date', value: v.date },
            { label: 'City / venue', value: v.city || v.venue },
          ])}
          <div style="margin:16px 0;padding:14px 16px;background:#F5F5F4;border-radius:6px;color:#1C1917;white-space:pre-wrap">${escapeHtml(v.message || '')}</div>`,
        text: `Hi ${hi},\n\nUpdate about ${v.title || 'the event'}:\n\n${v.message || ''}`,
      };

    case 'booking.received_customer':
      return {
        title: 'We received your enquiry',
        preheader: 'Our team will get back to you shortly.',
        ctaLabel: 'Visit VIRASTRA by New India Export',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Thank you for sharing your shipment enquiry with VIRASTRA by New India Export. Our team has received it and will contact you shortly with next steps.</p>
          ${detailRows([
            { label: 'Reference', value: v.bookingId || v.paymentId },
            { label: 'Email', value: v.customerEmail },
          ])}
          <p style="margin:16px 0 0">If your enquiry is urgent, WhatsApp ${config.supportWhatsAppDisplay} or reply to this email with your preferred call time.</p>`,
        text: `Hi ${hi},\n\nWe received your shipment enquiry. Our team will contact you soon.\nReference: ${v.bookingId || v.paymentId || ''}`,
      };

    case 'booking.received_ops':
      return {
        title: 'New booking lead',
        preheader: `${v.customerName || v.customerEmail || 'A lead'} submitted a booking enquiry`,
        ctaLabel: 'Open leads',
        html: `
          <p style="margin:0 0 14px">A new shipment booking enquiry arrived.</p>
          ${detailRows([
            { label: 'Name', value: v.customerName },
            { label: 'Email', value: v.customerEmail },
            { label: 'Phone', value: v.phone },
            { label: 'Reference', value: v.bookingId || v.paymentId },
            { label: 'Notes', value: v.notes || v.message },
          ])}
          <p style="margin:16px 0 0">Please follow up promptly and capture requirements.</p>`,
        text: `New booking lead\nName: ${v.customerName || ''}\nEmail: ${v.customerEmail || ''}\nPhone: ${v.phone || ''}\nRef: ${v.bookingId || v.paymentId || ''}`,
      };

    case 'support.ticket_created':
      return {
        title: v.message && !v.customerName ? `Ticket ${v.id || ''}` : 'We got your support request',
        preheader: `Ticket ${v.id || ''} created`,
        ctaLabel: v.message && !v.customerFacing ? 'Open ticket queue' : 'Visit help centre',
        html: v.message && v.internal
          ? `<p style="margin:0 0 14px">New support ticket <strong>${escapeHtml(v.id || '')}</strong>.</p>
             <div style="margin:16px 0;padding:14px 16px;background:#F5F5F4;border-radius:6px;white-space:pre-wrap">${escapeHtml(v.message)}</div>`
          : `<p style="margin:0 0 14px">Hi ${hi},</p>
             <p style="margin:0 0 14px">Thanks for contacting us. We have created support ticket <strong>${escapeHtml(v.id || '')}</strong> and our team will respond as soon as possible.</p>
             ${v.message ? `<div style="margin:16px 0;padding:14px 16px;background:#F5F5F4;border-radius:6px;white-space:pre-wrap">${escapeHtml(v.message)}</div>` : ''}
             <p style="margin:0">Please keep this ticket number handy for follow-ups.</p>`,
        text: `Support ticket ${v.id || ''} created.\n${v.message || 'We will respond soon.'}`,
      };

    case 'plan.upgraded':
      return {
        title: 'Your plan has been upgraded',
        preheader: `You are now on ${v.planName || 'your new plan'}`,
        ctaLabel: 'View your plan',
        html: `
          <p style="margin:0 0 14px">Hi ${hi},</p>
          <p style="margin:0 0 14px">Your upgrade is complete. You are now on <strong>${escapeHtml(v.planName || 'your new plan')}</strong>.</p>
          ${detailRows([
            { label: 'New plan', value: v.planName },
            { label: 'Previous plan', value: v.previousPlanName },
            { label: 'Amount paid', value: money(v.amountInr) },
            { label: 'Case', value: v.caseId },
          ])}
          <p style="margin:16px 0 0">Your GST invoice for this upgrade is sent separately. New document requirements (if any) will appear in your KYC / workspace checklist.</p>`,
        text: `Hi ${hi},\n\nPlan upgraded to ${v.planName || ''}.\nAmount: ${money(v.amountInr)}\nCase: ${v.caseId || ''}\n\nInvoice sent separately.`,
      };

    default:
      return {
        title: fill(SUBJECTS[template] || 'Update from VIRASTRA by New India Export', v),
        preheader: v.message || 'You have an update from VIRASTRA by New India Export.',
        html: `<p style="margin:0 0 14px">Hi ${hi},</p><p style="margin:0">${escapeHtml(v.message || 'You have a new notification from VIRASTRA by New India Export.')}</p>`,
        text: `Hi ${hi},\n\n${v.message || 'You have a new notification from VIRASTRA by New India Export.'}`,
      };
  }
}

function defaultCta(template, vars) {
  const base = config.frontendUrl;
  const caseWorkflow = (id) =>
    id ? `${base}/admin/workflow/${encodeURIComponent(id)}` : `${base}/admin`;
  const map = {
    'staff.access_approved': `${base}/admin/login`,
    'staff.access_submitted': `${base}/admin/platform`,
    'payment.receipt': `${base}/dashboard`,
    'payment.invoice': `${base}/dashboard/billing`,
    'payment.failed': `${base}/dashboard/billing`,
    'payment.installment_schedule': `${base}/dashboard/events`,
    'payment.reminder': `${base}/dashboard/events`,
    'payment.overdue': `${base}/dashboard/events`,
    'payment.ops_alert': caseWorkflow(vars.caseId),
    'kyc.submitted_customer': `${base}/dashboard`,
    'kyc.submitted_ops': `${base}/admin?filter=pending_kyc`,
    'kyc.approved': `${base}/dashboard`,
    'kyc.needs_more': `${base}/dashboard/kyc`,
    'stage.advanced': `${base}/dashboard`,
    'stage.rejected': `${base}/dashboard`,
    'doc.requested': `${base}/dashboard/documents`,
    'doc.uploaded_ops': caseWorkflow(vars.caseId),
    'doc.delivered_customer': `${base}/dashboard/documents`,
    'message.customer_to_ops': caseWorkflow(vars.caseId),
    'message.ops_to_customer': `${base}/dashboard/messages`,
    'event.registered': `${base}/events`,
    'event.cancelled': `${base}/events`,
    'event.rescheduled': `${base}/dashboard/events`,
    'event.followup': `${base}/dashboard/events`,
    'event.update': `${base}/dashboard/events`,
    'booking.received_customer': base,
    'booking.received_ops': `${base}/dashboard/events`,
    'support.ticket_created': vars.internal ? `${base}/dashboard/support` : base,
    'plan.upgraded': `${base}/dashboard`,
  };
  return map[template] || base;
}

function renderTemplate(template, vars = {}) {
  const v = {
    year: new Date().getUTCFullYear(),
    supportEmail: config.supportEmail,
    supportWhatsApp: config.supportWhatsAppDisplay,
    supportWhatsAppE164: config.supportWhatsAppE164,
    appName: config.appName,
    ...vars,
  };

  // Auto-flag attachment copy for required templates unless caller opts out
  if (TEMPLATE_ATTACHMENTS[template]?.required && v.hasAttachment == null) {
    v.hasAttachment = true;
    if (!v.attachmentNote && template === 'payment.invoice') {
      v.attachmentNote = `Tax invoice PDF${v.invoiceNumber ? ` (${v.invoiceNumber})` : ''} is attached.`;
    }
  }

  const builtIn = builtInBodies(template, v);

  const title = builtIn.title;
  const subject = fill(SUBJECTS[template] || title, v);
  const ctaUrl =
    builtIn.ctaUrl === null ? null : v.ctaUrl || builtIn.ctaUrl || defaultCta(template, v);
  const ctaLabel = v.ctaLabel || builtIn.ctaLabel || 'Open workspace';

  // Rich built-in bodies are the runtime source of truth.
  // Optional override: set MAIL_TEMPLATE_SOURCE=files to use ./templates/*.html|*.txt twins.
  const useFiles = String(process.env.MAIL_TEMPLATE_SOURCE || '').toLowerCase() === 'files';
  const fileHtml = useFiles ? loadFileTemplate(template, 'html') : null;
  const fileText = useFiles ? loadFileTemplate(template, 'txt') : null;

  let bodyHtml = builtIn.html;
  let text = builtIn.text;
  if (fileHtml) {
    bodyHtml = fill(fileHtml, {
      ...v,
      customerName: escapeHtml(v.customerName || ''),
      greetingName: greetingName(v),
      amountInrFormatted: money(v.amountInr),
      taxableFormatted: money(v.taxableAmount),
      grandTotalFormatted: money(v.grandTotal),
      gstTotalFormatted: money(v.gstTotal),
      body: escapeHtml(v.body || ''),
      reason: escapeHtml(v.reason || ''),
      message: escapeHtml(v.message || ''),
      label: escapeHtml(v.label || ''),
      stageLabel: escapeHtml(v.stageLabel || ''),
      planName: escapeHtml(v.planName || ''),
      title: escapeHtml(v.title || ''),
      name: escapeHtml(v.name || ''),
    });
  }
  if (fileText) {
    text = fill(fileText, {
      ...v,
      greetingName: greetingName(v).replace(/&[^;]+;/g, ''),
      amountInrFormatted: money(v.amountInr),
      taxableFormatted: money(v.taxableAmount),
      grandTotalFormatted: money(v.grandTotal),
    });
  }

  const attach = attachmentBanner(template, v);
  if (attach.text) text = `${text}${attach.text}`;

  const html = layout({
    title,
    preheader: builtIn.preheader,
    bodyHtml,
    ctaUrl,
    ctaLabel,
    attachmentHtml: attach.html,
  });

  // Plain-text twin with CTA
  if (ctaUrl) {
    text = `${text}\n\n${ctaLabel}: ${ctaUrl}`;
  }
  text = `${text}\n\nNeed help? ${config.supportEmail || config.mailReplyTo} or WhatsApp ${config.supportWhatsAppDisplay}\n© ${v.year} ${config.appName || 'VIRASTRA by New India Export'}`;

  return { subject, html, text, attachmentsMeta: TEMPLATE_ATTACHMENTS[template] || null };
}

module.exports = {
  renderTemplate,
  SUBJECTS,
  TEMPLATE_ATTACHMENTS,
  escapeHtml,
  money,
  defaultCta,
  greetingName,
};
