const config = require('../../config');

function digitsOnly(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Normalize a user-entered mobile to E.164 + Graph API digits (no plus).
 * Default country is India (91) unless WHATSAPP_DEFAULT_COUNTRY_CODE is set.
 */
function normalizePhone(raw, countryCode = config.whatsapp.defaultCountryCode) {
  const cc = String(countryCode || '91').replace(/\D/g, '') || '91';
  let s = String(raw || '').trim();
  if (!s) return { e164: '', digits: '', display: '' };
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;

  let digits = '';
  if (s.startsWith('+')) {
    digits = s.slice(1).replace(/\D/g, '');
  } else {
    digits = s.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 10) digits = `${cc}${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) {
    return { e164: '', digits: '', display: '' };
  }
  return {
    e164: `+${digits}`,
    digits,
    display: formatDisplay(digits),
  };
}

function formatDisplay(digits) {
  const d = digitsOnly(digits);
  if (d.startsWith('91') && d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length > 10) return `+${d.slice(0, d.length - 10)} ${d.slice(-10)}`;
  return d ? `+${d}` : '';
}

function maskPhone(raw) {
  const { digits } = typeof raw === 'object' && raw ? raw : normalizePhone(raw);
  if (!digits || digits.length < 8) return '';
  const cc = digits.slice(0, Math.max(1, digits.length - 10));
  const local = digits.slice(-10);
  return `+${cc} ${local.slice(0, 2)}*****${local.slice(-3)}`.trim();
}

function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at < 1) return s ? '***' : '';
  const user = s.slice(0, at);
  const domain = s.slice(at + 1);
  const keep = user.slice(0, Math.min(2, user.length));
  return `${keep}***@${domain}`;
}

module.exports = { normalizePhone, maskPhone, maskEmail, formatDisplay, digitsOnly };
