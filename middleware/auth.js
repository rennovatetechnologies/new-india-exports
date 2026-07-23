const jwt = require('jsonwebtoken');
const config = require('../config');

function createAccessToken(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.jwtExpireHours}h`,
  });
}

function bearerToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

function protect(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch (_) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
}

function optionalAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret);
  } catch (_) {
    req.user = null;
  }
  return next();
}

function requireRoles(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    protect(req, res, () => {
      const role = req.user && req.user.role;
      if (role === 'admin' && (allowed.has('admin') || allowed.has('operations'))) {
        return next();
      }
      if (allowed.has(role)) return next();
      return res.status(403).json({ success: false, message: 'Access denied for this role' });
    });
  };
}

function requireAdmin(req, res, next) {
  protect(req, res, () => {
    if (req.user && req.user.role === 'admin') return next();
    return res.status(403).json({ success: false, message: 'Access denied, Admin role required' });
  });
}

function sessionFromUser(userDoc, token) {
  const out = {
    email: userDoc.email,
    name: userDoc.name || '',
    phone: userDoc.phone || '',
    role: userDoc.role || 'customer',
    status: userDoc.status || 'Active',
    kycComplete: Boolean(userDoc.kycComplete),
    company: userDoc.company || '',
  };
  if (token) out.token = token;
  return out;
}

module.exports = {
  createAccessToken,
  protect,
  optionalAuth,
  requireRoles,
  requireAdmin,
  sessionFromUser,
};
