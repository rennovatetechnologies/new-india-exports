#!/usr/bin/env node
/**
 * Push .env.production.local into GitHub Actions secrets (same names).
 * Railway does not read GitHub secrets itself — run the
 * "Sync GitHub secrets to Railway" workflow after this.
 *
 * Usage: node scripts/pushGithubSecrets.js
 * Needs: gh auth, or GH_TOKEN with repo scope.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.production.local');

const SKIP = new Set(['PORT']);

function parseEnv(raw) {
  const out = {};
  const lines = raw.replace(/^\uFEFF/, '').split(/\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1);
    if (val.trim().startsWith('{') && !val.trim().endsWith('}')) {
      const buf = [val];
      while (i < lines.length) {
        buf.push(lines[i]);
        i += 1;
        if (lines[i - 1].trim() === '}') break;
      }
      val = buf.join('\n');
    }
    val = val.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === 'GCS_CREDENTIALS_JSON' || val.startsWith('{')) {
      try {
        val = JSON.stringify(JSON.parse(val));
      } catch {
        /* keep raw */
      }
    }
    out[key] = val;
  }
  return out;
}

function gitHubToken() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
    return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  }
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const url = (remote.stdout || '').trim();
  try {
    const u = new URL(url);
    if (u.username && u.username !== 'git') return u.username;
    if (u.password) return u.password;
  } catch {
    /* ignore */
  }
  return '';
}

function repoSlug() {
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const url = (remote.stdout || '').trim().replace(/\.git$/, '');
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+)$/i);
  if (!m) throw new Error('Could not parse origin GitHub repo');
  return m[1];
}

function main() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`Missing ${ENV_FILE}`);
    process.exit(1);
  }
  const vars = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
  const token = gitHubToken();
  const repo = repoSlug();
  const env = { ...process.env };
  if (token) env.GH_TOKEN = token;
  env.GH_PROMPT_DISABLED = '1';

  let ok = 0;
  let skipped = 0;
  for (const [key, val] of Object.entries(vars)) {
    if (SKIP.has(key) || !String(val || '').trim()) {
      skipped += 1;
      continue;
    }
    const r = spawnSync(
      'gh',
      ['secret', 'set', key, '--repo', repo, '--body', val],
      { env, encoding: 'utf8' }
    );
    if (r.status !== 0) {
      const err = `${r.stderr || r.stdout || ''}`.trim() || `exit ${r.status}`;
      console.error(`FAIL ${key}: ${err}`);
      process.exit(r.status || 1);
    }
    console.log(`set ${key} (${val.length} chars)`);
    ok += 1;
  }
  console.log(`GitHub secrets updated on ${repo}: ${ok} set, ${skipped} skipped`);
  console.log(
    'Next: add RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID, then run workflow "Sync GitHub secrets to Railway".'
  );
}

main();
