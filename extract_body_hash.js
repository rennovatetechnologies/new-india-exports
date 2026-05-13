const https = require('https');
const crypto = require('crypto');

const secret = 'db06cca0-838b-4e01-8b20-6ac446ffb6bd'.trim();
const payload = {
    "merchantId": "100000000007164",
    "aggregatorID": "A100000000007164",
    "merchantTxnNo": "TXN" + Date.now(),
    "amount": "1.00",
    "currencyCode": "356",
    "payType": "0",
    "transactionType": "SALE",
    "customerEmailID": "test@gmail.com",
    "customerMobileNo": "9999999999",
    "customerName": "Test User",
    "returnURL": "http://localhost:5001/api/payment/response",
    "txnDate": new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
};

const minified = JSON.stringify(payload);
const hash = crypto.createHmac('sha256', secret).update(minified).digest('hex').toLowerCase();

const options = {
    hostname: 'pgpayuat.icicibank.com',
    port: 443,
    path: '/tsp/pg/api/v2/initiateSale',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'securehash': hash,
        'Content-Length': Buffer.byteLength(minified)
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const body = JSON.parse(data);
            console.log('FULL_EXPECTED_HASH:', body.secureHash);
            console.log('FULL_RESPONSE_BODY:', data);
        } catch (e) {
            console.log('RAW_BODY:', data);
        }
    });
});

req.on('error', (e) => {
    console.error('ERROR:', e.message);
});

req.write(minified);
req.end();
