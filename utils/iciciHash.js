const crypto = require('crypto');

/**
 * Generates an HMAC SHA256 hash for ICICI PGPay v2.
 * Logic: Alphabetical Sort of Keys -> Concatenate Values -> HMAC-SHA256
 * @param {Object} payload - The JSON payload
 * @param {string} secret - The Merchant/Aggregator Secret Key
 */
const generateSecureHash = (payload, secret) => {
    // 1. Sort keys alphabetically
    const keys = Object.keys(payload).sort();

    // 2. Concatenate values
    // Note: Ensure values are strings. If null/undefined, use empty string?
    // Based on HashText example, values seem to be just concatenated.
    // We will cast to string to be safe.
    const valString = keys.map(k => {
        const val = payload[k];
        if (val === null || val === undefined) return "";
        return String(val);
    }).join("");

    // 3. HMAC-SHA256
    return crypto
        .createHmac('sha256', secret)
        .update(valString)
        .digest('hex')
        .toLowerCase();
};

/**
 * Verifies the incoming secureHash from ICICI.
 */
const verifySecureHash = (payload, receivedHash, secret) => {
    // Create a copy to avoid mutating original
    const p = { ...payload };
    // Remove secureHash from payload if present before calculating
    delete p.secureHash;

    const calculatedHash = generateSecureHash(p, secret);
    return calculatedHash === receivedHash.toLowerCase();
};

module.exports = {
    generateSecureHash,
    verifySecureHash
};
