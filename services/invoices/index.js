const PDFDocument = require('pdfkit');
const config = require('../../config');
const { requireDb } = require('../../db');
const { utcnow, normalizeEmail } = require('../helpers');
const { newInvoiceId, newInvoiceNumber } = require('../ids');
const { writeAudit } = require('../audit');
const { enqueueEmail } = require('../mail');
const { getLogoPath, LOGO_ASPECT } = require('../../assets');

const NAVY = '#0B2A4A';
const GOLD = '#C9A227';
const ROW_ALT = '#EAF2F8';
const TAN = '#E8D5B5';
const MUTED = '#4A5568';

function formatInr(amount) {
  const n = Math.round(Number(amount) || 0);
  try {
    return `₹ ${new Intl.NumberFormat('en-IN').format(n)}`;
  } catch {
    return `₹ ${n}`;
  }
}

function formatInvoiceDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function formatInvoiceDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function sellerDisplayName(seller) {
  return (
    seller?.tradeName ||
    seller?.brandName ||
    seller?.legalName ||
    config.seller.tradeName ||
    'VIRASTRA INTERNATIONAL EXPORT'
  );
}

function buildInvoiceEmailVars(invoice, pdfBuffer) {
  const seller = invoice.seller || config.seller;
  const customer = invoice.customer || {};
  const amounts = invoice.amounts || {};
  const issuedAt = invoice.issuedAt || Date.now();
  const invoiceNumber = invoice.invoiceNumber || '';
  const fileName =
    invoice.pdf?.fileName ||
    (invoiceNumber ? `${String(invoiceNumber).replace(/\//g, '-')}.pdf` : 'invoice.pdf');
  const hsn = (invoice.lineItems && invoice.lineItems[0]?.hsnSac) || '998599';
  const receiptNo =
    invoice.meta?.razorpayPaymentId || invoice.paymentId || invoice.id || '';
  const lineOfBusiness =
    seller.lineOfBusiness || config.seller.lineOfBusiness || 'Virastra by New India Export';
  const serviceReference =
    seller.serviceReference ||
    config.seller.serviceReference ||
    'Invoice for Virastra Platform Services (Subscription / Recharge)';
  const paymentSuccessMessage =
    seller.paymentSuccessMessage ||
    config.seller.paymentSuccessMessage ||
    'Your payment for Virastra by New India Export has been received successfully.';
  const terms = Array.isArray(seller.terms) && seller.terms.length
    ? seller.terms
    : config.seller.terms || [];

  return {
    invoiceNumber,
    invoiceId: invoice.id,
    paymentId: invoice.paymentId,
    orderId: invoice.orderId || '',
    receiptNo,
    customerName: customer.name || customer.email || '',
    customerEmail: customer.email || '',
    customerPhone: customer.phone || '',
    customerCompany: customer.company || '',
    customerAddress: customer.address || '',
    customerGstin: customer.gstin || '',
    sellerLegalName: seller.legalName || config.seller.legalName,
    sellerTradeName: seller.tradeName || config.seller.tradeName,
    sellerBrandName: seller.brandName || config.seller.brandName,
    sellerGstin: seller.gstin || config.seller.gstin,
    sellerAddress: (seller.addressLines || config.seller.addressLines || []).join(', '),
    placeOfSupply: seller.placeOfSupply || config.seller.placeOfSupply,
    lineOfBusiness,
    serviceReference,
    paymentSuccessMessage,
    paymentType: 'Bill Payment | Subscription',
    paymentMode: invoice.meta?.paymentMode || invoice.paymentMode || 'Online',
    paymentDateTime: formatInvoiceDateTime(issuedAt),
    invoiceDate: formatInvoiceDate(issuedAt),
    dueDate: formatInvoiceDate(issuedAt),
    hsnSac: hsn,
    description: invoice.description || serviceReference,
    taxableAmount: amounts.taxable,
    cgst: amounts.cgst,
    sgst: amounts.sgst,
    igst: amounts.igst,
    cgstRate: amounts.cgstRate ?? 9,
    sgstRate: amounts.sgstRate ?? 9,
    gstTotal: amounts.gst,
    grandTotal: amounts.total,
    taxMode: amounts.taxMode,
    terms,
    issuedAt: issuedAt.toISOString?.() || String(issuedAt),
    pdfUrl: `${config.frontendUrl}/dashboard/billing`,
    ctaUrl: `${config.frontendUrl}/dashboard/billing`,
    hasAttachment: Boolean(pdfBuffer),
    attachmentNames: pdfBuffer ? [fileName] : [],
    attachmentNote: pdfBuffer
      ? `Tax invoice PDF (${invoiceNumber}) is attached for your records.`
      : 'Download your invoice anytime from your billing page.',
  };
}

function drawInvoiceBanner(doc, pageW, y) {
  const barH = 22;
  const barW = 140;
  const x = (pageW - barW) / 2;
  doc.save();
  doc.fillColor(NAVY).rect(x, y, barW, barH).fill();
  doc
    .moveTo(x - 14, y + barH / 2)
    .lineTo(x, y)
    .lineTo(x, y + barH)
    .fillColor(GOLD)
    .fill();
  doc
    .moveTo(x + barW + 14, y + barH / 2)
    .lineTo(x + barW, y)
    .lineTo(x + barW, y + barH)
    .fillColor(GOLD)
    .fill();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12);
  doc.text('INVOICE', x, y + 5, { width: barW, align: 'center', lineBreak: false });
  doc.restore();
  return y + barH + 12;
}

function drawParticularsTable(doc, rows, margin, right, startY) {
  const labelW = 168;
  const valueX = margin + labelW + 8;
  const valueW = right - valueX - 6;
  const rowH = 15;
  let y = startY;

  doc.fillColor(NAVY).rect(margin, y, right - margin, 18).fill();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
  doc.text('Particulars', margin + 8, y + 5, { lineBreak: false });
  doc.text('Details', valueX, y + 5, { lineBreak: false });
  y += 18;

  rows.forEach((row, idx) => {
    const bg = row.highlight ? TAN : idx % 2 === 0 ? ROW_ALT : '#FFFFFF';
    const h = row.highlight ? 17 : rowH;
    doc.fillColor(bg).rect(margin, y, right - margin, h).fill();
    doc
      .fillColor(NAVY)
      .font(row.highlight ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8);
    doc.text(row.label, margin + 8, y + (h - 8) / 2, {
      width: labelW,
      lineBreak: false,
    });
    doc
      .fillColor('#111111')
      .font(row.highlight ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8);
    doc.text(String(row.value ?? '—'), valueX, y + (h - 8) / 2, {
      width: valueW,
      lineBreak: false,
      ellipsis: true,
    });
    y += h;
  });

  doc.strokeColor('#D0D7DE').lineWidth(0.5).rect(margin, startY, right - margin, y - startY).stroke();
  return y + 10;
}

function renderInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    // Single-page tax invoice — keep layout compact; block PDFKit auto page-breaks.
    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    // Invoices must stay on one A4 page (format requirement).
    doc.addPage = () => doc;

    const seller = invoice.seller || config.seller;
    const amounts = invoice.amounts || {};
    const customer = invoice.customer || {};
    const margin = 28;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const right = pageW - margin;
    const footerH = 40;
    const contentBottom = pageH - footerH - 8;
    const logoPath = getLogoPath();
    let y = 24;

    const textLine = (str, x, yy, opts = {}) => {
      doc.text(String(str ?? ''), x, yy, { lineBreak: false, ...opts });
    };

    if (logoPath) {
      const logoW = 72;
      const logoH = logoW * LOGO_ASPECT;
      doc.image(logoPath, margin, y, { width: logoW, height: logoH });
    } else {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11);
      textLine(seller.brandName || config.seller.brandName, margin, y);
    }

    const headerW = 220;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10);
    textLine(sellerDisplayName(seller), right - headerW, y, {
      width: headerW,
      align: 'right',
    });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7);
    textLine('Export | Import | Trade Solutions', right - headerW, y + 12, {
      width: headerW,
      align: 'right',
    });

    y = drawInvoiceBanner(doc, pageW, y + 52);

    const issuedAt = invoice.issuedAt || Date.now();
    const metaLeft = [
      ['Invoice No.', invoice.invoiceNumber || '—'],
      ['Invoice Date', formatInvoiceDate(issuedAt)],
      ['Due Date', formatInvoiceDate(issuedAt)],
    ];
    metaLeft.forEach(([label, value], i) => {
      const yy = y + i * 11;
      doc.fillColor(MUTED).font('Helvetica').fontSize(8);
      textLine(`${label}:`, margin, yy);
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8);
      textLine(value, margin + 70, yy);
    });

    const billTo = [customer.name, customer.phone ? `(${customer.phone})` : '']
      .filter(Boolean)
      .join(' ');
    doc.fillColor(MUTED).font('Helvetica').fontSize(8);
    textLine('Bill To:', right - 200, y);
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8);
    textLine(billTo || 'Customer', right - 160, y, { width: 160, align: 'right' });

    y += 40;

    doc.fillColor(MUTED).font('Helvetica').fontSize(7);
    textLine(
      `${seller.legalName || config.seller.legalName} · GSTIN ${seller.gstin || config.seller.gstin}`,
      margin,
      y
    );
    y += 10;
    const address = (seller.addressLines || config.seller.addressLines || []).join(', ');
    doc.text(address, margin, y, { width: right - margin, lineGap: 1 });
    y = doc.y + 8;

    const lineOfBusiness =
      seller.lineOfBusiness || config.seller.lineOfBusiness || 'Virastra by New India Export';
    const serviceReference =
      seller.serviceReference ||
      config.seller.serviceReference ||
      'Invoice for Virastra Platform Services (Subscription / Recharge)';
    const paymentSuccessMessage =
      seller.paymentSuccessMessage ||
      config.seller.paymentSuccessMessage ||
      'Your payment for Virastra by New India Export has been received successfully.';
    const hsn = (invoice.lineItems && invoice.lineItems[0]?.hsnSac) || '998599';
    const paymentMode = invoice.meta?.paymentMode || invoice.paymentMode || 'Online';
    const receiptNo =
      invoice.meta?.razorpayPaymentId || invoice.paymentId || invoice.id || '—';

    const rows = [
      { label: 'Receipt No.', value: receiptNo },
      { label: 'Customer Name', value: customer.name || '—' },
      { label: 'Customer Number', value: customer.phone || customer.email || '—' },
      { label: 'Customer Email', value: customer.email || '—' },
      { label: 'Order Number', value: invoice.orderId || invoice.paymentId || '—' },
      { label: 'Line of Business', value: lineOfBusiness },
      { label: 'Payment Type', value: 'Bill Payment | Subscription' },
      { label: 'Payment Date & Time', value: formatInvoiceDateTime(issuedAt) },
      { label: 'Payment Mode', value: paymentMode },
      { label: 'HSN / SAC', value: hsn },
      { label: 'Place of Supply', value: seller.placeOfSupply || config.seller.placeOfSupply },
      { label: 'Taxable Value', value: formatInr(amounts.taxable) },
      { label: `CGST @ ${amounts.cgstRate ?? 9}%`, value: formatInr(amounts.cgst) },
      { label: `SGST @ ${amounts.sgstRate ?? 9}%`, value: formatInr(amounts.sgst) },
      { label: 'Paid Amount', value: formatInr(amounts.total) },
      { label: 'Total Paid Amount', value: formatInr(amounts.total), highlight: true },
    ];

    y = drawParticularsTable(doc, rows, margin, right, y);

    doc.fillColor('#1B7A3D').font('Helvetica-Bold').fontSize(9);
    textLine('Payment Successful', margin, y);
    y += 11;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8);
    doc.text(paymentSuccessMessage, margin, y, {
      width: right - margin,
      lineBreak: false,
      ellipsis: true,
    });
    y += 14;

    doc.strokeColor(NAVY).lineWidth(1).roundedRect(margin, y, right - margin, 34, 3).stroke();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8);
    textLine('Virastra Subscription / Service', margin + 8, y + 7);
    doc.fillColor(MUTED).font('Helvetica').fontSize(7);
    textLine(`Reference: ${serviceReference}`, margin + 8, y + 19, {
      width: right - margin - 16,
    });
    y += 42;

    doc.fillColor(NAVY).rect(margin, y, right - margin, 16).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    textLine('Terms and Conditions', margin + 8, y + 4);
    y += 20;

    const terms = Array.isArray(seller.terms) && seller.terms.length
      ? seller.terms
      : config.seller.terms || [];
    doc.fillColor(MUTED).font('Helvetica').fontSize(7);
    terms.forEach((t, i) => {
      if (y > contentBottom - 12) return;
      const text = `${i + 1}. ${t}`;
      const h = Math.min(doc.heightOfString(text, { width: right - margin }), 18);
      doc.text(text, margin, y, { width: right - margin, height: h, ellipsis: true });
      y += h + 2;
    });

    // Fixed footer on page 1 only.
    const footerY = pageH - footerH;
    doc.fillColor(NAVY).rect(0, footerY, pageW, footerH).fill();
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(7);
    const site = String(config.frontendUrl || 'https://www.virastrainternationalexport.com')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    const phone = config.supportPhone ? `+91 ${config.supportPhone}` : '';
    textLine(
      `Website: ${site}    Email: ${config.supportEmail || ''}    Phone: ${phone}`,
      margin,
      footerY + 10,
      { width: right - margin, align: 'center' }
    );
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(7);
    textLine(
      `${seller.brandName || config.seller.brandName} — Digitizing Global Trade for Indian Businesses`,
      margin,
      footerY + 24,
      { width: right - margin, align: 'center' }
    );

    doc.end();
  });
}

/**
 * Idempotent invoice issuance for a paid payment document.
 */
async function issueInvoiceForPayment(payment, { actor } = {}) {
  const db = requireDb();
  const existing = await db.collection('invoices').findOne({ paymentId: payment.id });
  if (existing) return existing;

  const byRzp = payment.razorpayPaymentId
    ? await db.collection('invoices').findOne({
        $or: [
          { 'meta.razorpayPaymentId': payment.razorpayPaymentId },
          { orderId: payment.razorpayOrderId },
        ],
      })
    : null;
  if (byRzp && byRzp.paymentId === payment.id) return byRzp;

  const id = await newInvoiceId();
  const invoiceNumber = await newInvoiceNumber();
  const year = new Date().getUTCFullYear();
  const amounts = payment.amounts || {};
  const customer = payment.customer || {
    name: payment.customerName || '',
    email: payment.customerEmail,
    phone: payment.customerPhone || '',
    company: payment.customerCompany || '',
    address: payment.customerAddress || '',
    gstin: payment.customerGstin || '',
    state: payment.customerState || '',
  };

  const invoice = {
    id,
    invoiceNumber,
    status: 'issued',
    currency: 'INR',
    issuedAt: utcnow(),
    paymentId: payment.id,
    orderId: payment.razorpayOrderId || null,
    caseId: payment.caseId || null,
    sku: payment.purpose || payment.sku || 'plan',
    description: payment.description || '',
    seller: { ...config.seller },
    customer: {
      name: customer.name || '',
      email: normalizeEmail(customer.email || payment.customerEmail),
      phone: customer.phone || '',
      company: customer.company || '',
      address: customer.address || '',
      gstin: customer.gstin || '',
      state: customer.state || '',
    },
    lineItems: payment.lineItems || [
      {
        description: payment.description || payment.sku || 'Service',
        hsnSac: '998599',
        quantity: 1,
        unitAmount: amounts.taxable || 0,
      },
    ],
    amounts: {
      taxable: amounts.taxable,
      cgstRate: amounts.cgstRate ?? 9,
      cgst: amounts.cgst ?? 0,
      sgstRate: amounts.sgstRate ?? 9,
      sgst: amounts.sgst ?? 0,
      igstRate: amounts.igstRate ?? 0,
      igst: amounts.igst ?? 0,
      gst: amounts.gst,
      total: amounts.total,
      gstRate: amounts.gstRate ?? config.gstRate,
      taxMode: amounts.taxMode || 'cgst_sgst',
    },
    pdf: { driveFileId: null, fileName: null, size: 0 },
    email: { status: 'queued', template: 'payment.invoice', outboxId: null, sentAt: null },
    meta: { razorpayPaymentId: payment.razorpayPaymentId || null },
    createdAt: utcnow(),
    updatedAt: utcnow(),
  };

  // unique insert — race safe
  try {
    await db.collection('invoices').insertOne(invoice);
  } catch (e) {
    if (String(e.message || '').includes('duplicate') || e.code === 11000) {
      return db.collection('invoices').findOne({ paymentId: payment.id });
    }
    throw e;
  }

  let pdfBuffer;
  const fileName = `VIR-${year}-${invoiceNumber.split('/').pop()}.pdf`;
  try {
    // Generate PDF in memory only — do not upload to Drive or any file store.
    pdfBuffer = await renderInvoicePdf(invoice);
    invoice.pdf = {
      driveFileId: null,
      fileId: null,
      fileName,
      size: pdfBuffer.length,
      generatedAt: utcnow(),
      stored: false,
    };
    await db.collection('invoices').updateOne(
      { id },
      { $set: { pdf: invoice.pdf, updatedAt: utcnow() } }
    );
  } catch (e) {
    console.warn('invoice PDF failed:', e.message);
  }

  const emailVars = buildInvoiceEmailVars(invoice, pdfBuffer);

  const attachments = pdfBuffer
    ? [
        {
          filename: invoice.pdf.fileName || `${invoiceNumber.replace(/\//g, '-')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ]
    : [];

  try {
    const queued = await enqueueEmail({
      to: invoice.customer.email,
      template: 'payment.invoice',
      vars: emailVars,
      attachments,
      actor,
    });
    await db.collection('invoices').updateOne(
      { id },
      {
        $set: {
          'email.status': 'queued',
          'email.outboxId': queued.outboxId,
          updatedAt: utcnow(),
        },
      }
    );
  } catch (e) {
    console.warn('invoice email enqueue failed:', e.message);
    await db.collection('invoices').updateOne(
      { id },
      { $set: { 'email.status': 'failed', updatedAt: utcnow() } }
    );
  }

  await db.collection('payments').updateOne(
    { id: payment.id },
    { $set: { invoiceId: id, updatedAt: utcnow() } }
  );

  await writeAudit(actor || { email: 'system', role: 'system' }, 'invoice.issued', {
    resource: { type: 'invoice', id },
    meta: { paymentId: payment.id, invoiceNumber },
    tone: 'success',
  });

  return db.collection('invoices').findOne({ id });
}

async function resendInvoiceEmail(invoiceId, { actor } = {}) {
  const db = requireDb();
  const invoice = await db.collection('invoices').findOne({ id: invoiceId });
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  // idempotent within 1h
  if (
    invoice.email?.sentAt &&
    Date.now() - new Date(invoice.email.sentAt).getTime() < 60 * 60 * 1000 &&
    invoice.email.status === 'sent'
  ) {
    return { ok: true, status: 'skipped', reason: 'recently_sent' };
  }

  let pdfBuffer = null;
  try {
    pdfBuffer = await renderInvoicePdf(invoice);
  } catch (e) {
    console.warn('invoice PDF regenerate failed:', e.message);
  }

  const queued = await enqueueEmail({
    to: invoice.customer.email,
    template: 'payment.invoice',
    vars: buildInvoiceEmailVars(invoice, pdfBuffer),
    attachments: pdfBuffer
      ? [
          {
            filename: invoice.pdf?.fileName || `${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ]
      : [],
    actor,
  });

  await db.collection('invoices').updateOne(
    { id: invoiceId },
    {
      $set: {
        'email.status': 'queued',
        'email.outboxId': queued.outboxId,
        updatedAt: utcnow(),
      },
    }
  );
  return { ok: true, status: 'queued', outboxId: queued.outboxId };
}

function invoiceListItem(inv) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    issuedAt: inv.issuedAt,
    status: inv.status || 'issued',
    sku: inv.sku,
    paymentId: inv.paymentId,
    description: inv.description || '',
    seller: inv.seller || null,
    customer: inv.customer || null,
    lineItems: inv.lineItems || [],
    amounts: {
      taxable: inv.amounts?.taxable,
      cgst: inv.amounts?.cgst,
      sgst: inv.amounts?.sgst,
      igst: inv.amounts?.igst,
      gst: inv.amounts?.gst,
      total: inv.amounts?.total,
      cgstRate: inv.amounts?.cgstRate,
      sgstRate: inv.amounts?.sgstRate,
      gstRate: inv.amounts?.gstRate,
      taxMode: inv.amounts?.taxMode,
    },
    emailStatus: inv.email?.status || 'queued',
    email: inv.email || null,
  };
}

module.exports = {
  renderInvoicePdf,
  issueInvoiceForPayment,
  resendInvoiceEmail,
  invoiceListItem,
};
