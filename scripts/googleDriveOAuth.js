/**
 * One-time Google Drive OAuth consent.
 *
 * Easiest path (avoids redirect_uri_mismatch):
 * 1) Google Cloud Console → APIs & Services → Credentials → Create Credentials
 *    → OAuth client ID → Application type: Desktop app → Create → Download JSON
 * 2) Put the downloaded file in this project as client_secret_*.json (replace old web one)
 * 3) Run: npm run drive:oauth
 * 4) Sign in as the Google user who owns the Virastra Drive folders (newindexim@gmail.com)
 *
 * If you keep a Web client instead, you MUST add this under
 * "Authorized redirect URIs" (NOT JavaScript origins):
 *   http://localhost:5055/oauth2callback
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

function loadClient() {
  let clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || '';
  let clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || '';
  let clientType = 'web';
  let redirectUris = [];

  const hit = fs.readdirSync(ROOT).find((f) => f.startsWith('client_secret_') && f.endsWith('.json'));
  if (hit) {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, hit), 'utf8'));
    if (raw.installed) {
      clientType = 'installed';
      clientId = clientId || raw.installed.client_id || '';
      clientSecret = clientSecret || raw.installed.client_secret || '';
      redirectUris = raw.installed.redirect_uris || [];
    } else if (raw.web) {
      clientType = 'web';
      clientId = clientId || raw.web.client_id || '';
      clientSecret = clientSecret || raw.web.client_secret || '';
      redirectUris = raw.web.redirect_uris || [];
    }
    console.log(`Loaded OAuth client from ${hit} (type: ${clientType})`);
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing OAuth client. Download a Desktop OAuth client JSON into the project root, or set GOOGLE_DRIVE_OAUTH_CLIENT_ID / SECRET in .env.'
    );
  }
  return { clientId, clientSecret, clientType, redirectUris, secretFile: hit || null };
}

function upsertEnv(entries) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, line);
    else text = `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, text.endsWith('\n') ? text : `${text}\n`);
}

function listen(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

async function main() {
  const { clientId, clientSecret, clientType } = loadClient();

  let port = Number(process.env.GOOGLE_DRIVE_OAUTH_PORT || 0);
  let redirectUri =
    process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI ||
    (clientType === 'web' ? 'http://localhost:5055/oauth2callback' : null);

  let server;
  if (clientType === 'installed' && !process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI) {
    // Desktop / installed clients: Google allows loopback on an ephemeral port.
    server = await listen(0, '127.0.0.1');
    port = server.address().port;
    redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  } else {
    port = port || 5055;
    redirectUri = redirectUri || `http://localhost:${port}/oauth2callback`;
    server = await listen(port, '127.0.0.1');
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\n========== Google Drive OAuth ==========');
  console.log(`Client type: ${clientType}`);
  console.log(`Redirect URI used: ${redirectUri}`);
  if (clientType === 'web') {
    console.log(`
IMPORTANT (Web client):
1. Open https://console.cloud.google.com/apis/credentials
2. Click the OAuth client whose Client ID starts with: ${clientId.slice(0, 20)}...
3. Under "Authorized redirect URIs" (NOT JavaScript origins), click ADD URI
4. Paste EXACTLY:
   ${redirectUri}
5. Click SAVE, wait ~30 seconds, then open the URL below.
`);
  } else {
    console.log('\nDesktop client detected — open the URL below and approve access.\n');
  }
  console.log(authUrl);
  console.log('\nWaiting for browser callback...\n');

  await new Promise((resolve, reject) => {
    server.on('request', async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404).end('Not found');
          return;
        }
        const err = url.searchParams.get('error');
        if (err) throw new Error(`OAuth error: ${err}`);
        const code = url.searchParams.get('code');
        if (!code) throw new Error('No authorization code returned');

        const { tokens } = await oauth2.getToken(code);
        oauth2.setCredentials(tokens);
        const drive = google.drive({ version: 'v3', auth: oauth2 });
        const about = await drive.about.get({ fields: 'user(emailAddress,displayName)' });
        const email = about.data.user?.emailAddress || '(unknown)';

        if (!tokens.refresh_token) {
          throw new Error(
            'No refresh_token returned. Open https://myaccount.google.com/permissions , remove this app, then re-run npm run drive:oauth'
          );
        }

        upsertEnv({
          GOOGLE_DRIVE_OAUTH_CLIENT_ID: clientId,
          GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: clientSecret,
          GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN: tokens.refresh_token,
          GOOGLE_DRIVE_OAUTH_REDIRECT_URI: redirectUri,
        });

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<html><body style="font-family:sans-serif;padding:2rem">
            <h2>Google Drive connected</h2>
            <p>Signed in as <b>${email}</b>.</p>
            <p>Refresh token saved to <code>.env</code>. You can close this tab.</p>
          </body></html>`
        );

        console.log('Success. Signed in as:', email);
        console.log('Refresh token saved to .env');
        console.log('Restart the backend, then we can test a dummy Drive upload.\n');
        server.close();
        resolve();
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e.message || e));
        server.close();
        reject(e);
      }
    });
  });
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
