const crypto = require('crypto');

const secret = 'db06cca0-838b-4e01-8b20-6ac446ffb6bd'.trim();

// The response body we received
const responseBody = {
    "responseCode": "P1006",
    "responseDescription": "Invalid request: Secure hash does not match"
};

// The secureHash the bank sent back in the response
const bankHash = "744e3cd69b".toLowerCase(); // This matches the start I saw in logs

const check = (minified, name) => {
    const hmac256 = crypto.createHmac('sha256', secret).update(minified).digest('hex');
    const hmac512 = crypto.createHmac('sha512', secret).update(minified).digest('hex');
    const sha256 = crypto.createHash('sha256').update(minified + secret).digest('hex');
    const sha512 = crypto.createHash('sha512').update(minified + secret).digest('hex');

    if (hmac256.startsWith(bankHash)) console.log(`MATCH FOUND: HMAC SHA256 (${name})`);
    if (hmac512.startsWith(bankHash)) console.log(`MATCH FOUND: HMAC SHA512 (${name})`);
    if (sha256.startsWith(bankHash)) console.log(`MATCH FOUND: SHA256 (${name})`);
    if (sha512.startsWith(bankHash)) console.log(`MATCH FOUND: SHA512 (${name})`);

    console.log(`Rules for ${name}:`);
    console.log('HMAC256:', hmac256.slice(0, 20));
    console.log('SHA256:', sha256.slice(0, 20));
};

console.log('--- REVERSE ENGINEERING ---');
console.log('Target Bank Hash Starts With:', bankHash);

// Try minified JSON (Insertion order vs Alphabetical)
check(JSON.stringify(responseBody), "JSON INSERTION");

const sorted = Object.keys(responseBody).sort().reduce((acc, k) => ({ ...acc, [k]: responseBody[k] }), {});
check(JSON.stringify(sorted), "JSON ALPHABETICAL");

// Try pipe separated values
const values = Object.values(responseBody).join('|');
check(values, "PIPE JOINED");

const sortedValues = Object.keys(responseBody).sort().map(k => responseBody[k]).join('|');
check(sortedValues, "PIPE JOINED ALPHABETICAL");
