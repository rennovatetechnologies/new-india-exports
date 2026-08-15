const { requireDb } = require('../db');
const { utcnow } = require('./helpers');

async function nextSeq(name) {
  const db = requireDb();
  const doc = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 }, $setOnInsert: { createdAt: utcnow() } },
    { upsert: true, returnDocument: 'after' }
  );
  const value = doc && doc.value !== undefined ? doc.value : doc;
  return Number(value?.seq || 1);
}

function pad(n, width = 6) {
  return String(n).padStart(width, '0');
}

async function newCaseId(emailHint = '') {
  const seq = await nextSeq('case');
  const hint = String(emailHint || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase() || 'CUST';
  return `CASE-${hint}-${pad(seq, 6)}`;
}

async function newPaymentId() {
  const seq = await nextSeq('payment');
  return `PAY-${pad(seq, 8)}`;
}

async function newInvoiceId() {
  const seq = await nextSeq('invoice');
  return `INV-${pad(seq, 8)}`;
}

async function newInvoiceNumber() {
  const year = new Date().getUTCFullYear();
  const seq = await nextSeq(`invoice_num_${year}`);
  return `NIE/${year}/${pad(seq, 6)}`;
}

async function newMessageId() {
  const seq = await nextSeq('message');
  return `MSG-${pad(seq, 8)}`;
}

async function newDocId() {
  const seq = await nextSeq('document');
  return `DOC-${pad(seq, 8)}`;
}

async function newFileId() {
  const seq = await nextSeq('file');
  return `FILE-${pad(seq, 10)}`;
}

async function newEventId() {
  const seq = await nextSeq('event');
  return `EVT-${pad(seq, 6)}`;
}

async function newInstallmentPlanId() {
  const seq = await nextSeq('installment_plan');
  return `IPL-${pad(seq, 8)}`;
}

async function newTicketId() {
  const seq = await nextSeq('ticket');
  return `TKT-${pad(seq, 6)}`;
}

async function newStaffRequestId() {
  const seq = await nextSeq('staff_req');
  return `REQ-${pad(seq, 4)}`;
}

module.exports = {
  nextSeq,
  newCaseId,
  newPaymentId,
  newInvoiceId,
  newInvoiceNumber,
  newMessageId,
  newDocId,
  newFileId,
  newEventId,
  newInstallmentPlanId,
  newTicketId,
  newStaffRequestId,
};
