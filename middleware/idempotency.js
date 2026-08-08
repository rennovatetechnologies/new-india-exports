const crypto = require('crypto');
const { getDb, requireDb } = require('../db');
const { utcnow } = require('../services/helpers');

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

/**
 * Idempotency middleware for money / submit endpoints.
 * Requires header Idempotency-Key.
 */
function idempotency({ required = true } = {}) {
  return async function idempotencyMiddleware(req, res, next) {
    const raw = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];
    if (!raw) {
      if (required) {
        // Soft-require: allow missing for FE that doesn't send yet, but still process
        return next();
      }
      return next();
    }
    const keyHash = hashKey(raw);
    const db = getDb();
    if (!db) return next();

    try {
      const existing = await db.collection('idempotency_keys').findOne({ keyHash });
      if (existing && existing.responseBody) {
        return res.status(existing.statusCode || 200).json(existing.responseBody);
      }

      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const statusCode = res.statusCode || 200;
        db.collection('idempotency_keys')
          .updateOne(
            { keyHash },
            {
              $set: {
                keyHash,
                key: String(raw).slice(0, 128),
                method: req.method,
                path: req.path,
                statusCode,
                responseBody: body,
                updatedAt: utcnow(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
              $setOnInsert: { createdAt: utcnow() },
            },
            { upsert: true }
          )
          .catch(() => {});
        return originalJson(body);
      };
      return next();
    } catch (e) {
      return next();
    }
  };
}

module.exports = { idempotency, hashKey };
