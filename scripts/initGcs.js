require('dotenv').config();
const fs = require('fs');
const config = require('../config');
const drive = require('../services/drive');

async function main() {
  if (!drive.gcsConfigured()) {
    console.error('GCS is not configured.');
    console.error('Set GCS_CREDENTIALS_JSON (Railway) or a local GCS_KEY_FILE.');
    console.error('Expected key file:', config.gcs.keyFile);
    console.error('Exists:', fs.existsSync(config.gcs.keyFile));
    console.error('Inline credentials:', Boolean(config.gcs.credentials));
    process.exit(1);
  }
  console.log(`Initializing gs://${config.gcs.bucket} with DEV/, PROD/, and SHARED/ trees…`);
  const tree = await drive.ensureRootTree();
  console.log('Ready:', tree);
  console.log('Uploads in this process will go under', tree.root);
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.code) console.error('code:', err.code);
  process.exit(1);
});
