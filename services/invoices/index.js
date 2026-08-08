const PDFDocument = require('pdfkit');
const config = require('../../config');
const { requireDb } = require('../../db');
const { utcnow, normalizeEmail } = require('../helpers');
const { newInvoiceId, newInvoiceNumber } = require('../ids');
const { writeAudit } = require('../audit');
const { enqueueEmail } = require('../mail');

function renderInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const seller = invoice.seller || config.seller;
    const amounts = invoice.amounts || {};
    const customer = invoice.customer || {};

    doc.fontSize(16).text(seller.legalName || 'New India Export', { align: 'left' });
    doc.fontSize(10).fillColor('#444').text(seller.brandName || '');
    doc.text(`GSTIN: ${seller.gstin || ''}`);
    (seller.addressLines || []).forEach((line) => doc.text(line));
    doc.moveDown();
    doc.fillColor('#000').fontSize(14).text('TAX INVOICE', { align: 'right' });
    doc.fontSize(10).text(`Invoice No: ${invoice.invoiceNumber}`, { align: 'right' });
    doc.text(`Date: ${new Date(invoice.issuedAt || Date.now()).toISOString().slice(0, 10)}`, {
      align: 'right',
    });
    doc.moveDown();
    doc.fontSize(11).text('Bill To');
    doc.fontSize(10).text(customer.name || '');
    if (customer.company) doc.text(customer.company);
    if (customer.email) doc.text(customer.email);
    if (customer.address) doc.text(customer.address);
    if (customer.gstin) doc.text(`GSTIN: ${customer.gstin}`);
    doc.moveDown();
    doc.text(`Description: ${invoice.description || ''}`);
    (invoice.lineItems || []).forEach((li) => {
      doc.text(`${li.description}  ×${li.quantity || 1}  ₹${li.unitAmount}`);
    });
    doc.moveDown();
    doc.text(`Taxable: ₹${amounts.taxable}`);
    doc.text(`CGST (${amounts.cgstRate || 9}%): ₹${amounts.cgst ?? 0}`);
    doc.text(`SGST (${amounts.sgstRate || 9}%): ₹${amounts.sgst ?? 0}`);
    doc.text(`GST: ₹${amounts.gst}`);
    doc.fontSize(12).text(`Grand Total: ₹${amounts.total}`, { underline: true });
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#666').text('This is a computer-generated tax invoice.');
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
  const fileName = `NIE-${year}-${invoiceNumber.split('/').pop()}.pdf`;
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

  const emailVars = {
    invoiceNumber,
    invoiceId: id,
    paymentId: payment.id,
    customerName: invoice.customer.name || invoice.customer.email,
    customerEmail: invoice.customer.email,
    customerCompany: invoice.customer.company,
    customerAddress: invoice.customer.address,
    customerGstin: invoice.customer.gstin,
    sellerLegalName: config.seller.legalName,
    sellerGstin: config.seller.gstin,
    sellerAddress: (config.seller.addressLines || []).join(', '),
    description: invoice.description,
    taxableAmount: invoice.amounts.taxable,
    cgst: invoice.amounts.cgst,
    sgst: invoice.amounts.sgst,
    igst: invoice.amounts.igst,
    gstTotal: invoice.amounts.gst,
    grandTotal: invoice.amounts.total,
    taxMode: invoice.amounts.taxMode,
    issuedAt: invoice.issuedAt.toISOString?.() || String(invoice.issuedAt),
    pdfUrl: `${config.frontendUrl}/dashboard/billing`,
    ctaUrl: `${config.frontendUrl}/dashboard/billing`,
    hasAttachment: Boolean(pdfBuffer),
    attachmentNames: pdfBuffer
      ? [invoice.pdf.fileName || `${invoiceNumber.replace(/\//g, '-')}.pdf`]
      : [],
    attachmentNote: pdfBuffer
      ? `Tax invoice PDF (${invoiceNumber}) is attached for your records.`
      : 'Download your invoice anytime from your billing page.',
  };

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
    vars: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      paymentId: invoice.paymentId,
      customerName: invoice.customer.name,
      customerEmail: invoice.customer.email,
      customerCompany: invoice.customer.company,
      sellerLegalName: config.seller.legalName,
      sellerGstin: config.seller.gstin,
      description: invoice.description,
      taxableAmount: invoice.amounts.taxable,
      cgst: invoice.amounts.cgst,
      sgst: invoice.amounts.sgst,
      igst: invoice.amounts.igst,
      gstTotal: invoice.amounts.gst,
      grandTotal: invoice.amounts.total,
      taxMode: invoice.amounts.taxMode,
      ctaUrl: `${config.frontendUrl}/dashboard/billing`,
      hasAttachment: Boolean(pdfBuffer),
      attachmentNames: pdfBuffer
        ? [invoice.pdf?.fileName || `${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`]
        : [],
      attachmentNote: pdfBuffer
        ? `Tax invoice PDF (${invoice.invoiceNumber}) is attached for your records.`
        : 'Download your invoice anytime from your billing page.',
    },
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
