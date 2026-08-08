/**
 * GST helpers — amounts always INR integer rupees.
 * Locked: every payment uses CGST 9% + SGST 9% (18% total). No IGST.
 */
const config = require('../config');

const CGST_RATE = 9;
const SGST_RATE = 9;
const GST_RATE = 0.18; // CGST + SGST

function clampDiscount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.round(n * 100) / 100;
}

function effectivePrice(listPrice, discountPercent = 0) {
  const price = Math.round(Number(listPrice) || 0);
  const d = clampDiscount(discountPercent);
  return Math.round(price * (1 - d / 100));
}

/**
 * Always CGST 9% + SGST 9% on taxable amount (any payment / any customer).
 * @param {number} taxableInr exclusive taxable amount
 */
function computeGst(taxableInr) {
  const taxable = Math.max(0, Math.round(Number(taxableInr) || 0));
  const rate = Number(config.gstRate) || GST_RATE;
  const gst = Math.round(taxable * rate);
  const cgst = Math.floor(gst / 2);
  const sgst = gst - cgst;
  return {
    taxable,
    cgstRate: CGST_RATE,
    cgst,
    sgstRate: SGST_RATE,
    sgst,
    igstRate: 0,
    igst: 0,
    gst,
    total: taxable + gst,
    gstRate: rate,
    taxMode: 'cgst_sgst',
  };
}

/** When catalog stores GST-inclusive total (workshop/booking token). */
function fromInclusiveTotal(totalInr) {
  const total = Math.max(0, Math.round(Number(totalInr) || 0));
  const rate = Number(config.gstRate) || GST_RATE;
  const taxable = Math.round(total / (1 + rate));
  const amounts = computeGst(taxable);
  // Adjust rounding so taxable + gst === total (prefer SGST for 1-rupee drift)
  const drift = total - amounts.total;
  if (drift !== 0) {
    amounts.gst += drift;
    amounts.sgst += drift;
    amounts.total = total;
  }
  amounts.taxable = taxable;
  amounts.taxMode = 'cgst_sgst';
  amounts.igst = 0;
  amounts.igstRate = 0;
  return amounts;
}

function inrToPaise(inr) {
  return Math.round(Number(inr) || 0) * 100;
}

module.exports = {
  CGST_RATE,
  SGST_RATE,
  GST_RATE,
  clampDiscount,
  effectivePrice,
  computeGst,
  fromInclusiveTotal,
  inrToPaise,
};
