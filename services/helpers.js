function utcnow() {
  return new Date();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(doc) {
  return {
    email: doc.email,
    name: doc.name || '',
    phone: doc.phone || '',
    role: doc.role || 'customer',
    status: doc.status || 'Active',
    kycComplete: Boolean(doc.kycComplete),
    company: doc.company || '',
  };
}

function cleanDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

module.exports = { utcnow, normalizeEmail, publicUser, cleanDoc };
