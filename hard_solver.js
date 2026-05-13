const crypto = require('crypto');

const secret = 'db06cca0-838b-4e01-8b20-6ac446ffb6bd'.trim();
const bankHash = '18196f1e877fc1517c60ef995b55de4b0e857844913e23258a3ce61db2dc5782';
const bankBodyStr = '{"responseCode":"P1006","responseDescription":"Invalid request: Secure hash does not match"}';

const solve = (body, name) => {
    const methods = [
        { name: 'HMAC-SHA256', h: crypto.createHmac('sha256', secret).update(body).digest('hex').toLowerCase() },
        { name: 'SHA256(body+secret)', h: crypto.createHash('sha256').update(body + secret).digest('hex').toLowerCase() },
        { name: 'SHA256(secret+body)', h: crypto.createHash('sha256').update(secret + body).digest('hex').toLowerCase() },
        { name: 'HMAC-SHA512', h: crypto.createHmac('sha512', secret).update(body).digest('hex').toLowerCase() },
        { name: 'SHA512(body+secret)', h: crypto.createHash('sha512').update(body + secret).digest('hex').toLowerCase() }
    ];

    for (const m of methods) {
        if (m.h === bankHash) {
            console.log(`MATCH FOUND: ${m.name}`);
            return true;
        }
        console.log(`${m.name}: ${m.h.slice(0, 20)}...`);
    }
    return false;
};

console.log('Target:', bankHash);
if (!solve(bankBodyStr, "DIRECT")) {
    console.log("No direct match.");

    // Try alphabetical
    const obj = JSON.parse(bankBodyStr);
    const sortedBody = JSON.stringify(Object.keys(obj).sort().reduce((a, k) => ({ ...a, [k]: obj[k] }), {}));
    if (!solve(sortedBody, "ALPHABETICAL")) {
        console.log("No alphabetical match.");
    }
}
