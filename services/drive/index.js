const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');
const { requireDb, getDb } = require('../../db');
const { catalogUpsertFile } = require('../catalog');
const { utcnow, safeCustomerKey } = require('../helpers');
const { newFileId } = require('../ids');
const { writeAudit } = require('../audit');

const GCS_SCHEME = 'gcs:';

let gcsBucket = null;

function gcsConfigured() {
  const g = config.gcs || {};
  if (!g.bucket) return false;
  if (g.credentials && g.credentials.client_email) return true;
  return Boolean(g.keyFile && fs.existsSync(g.keyFile));
}

function driveConfigured() {
  return gcsConfigured();
}

function driveMode() {
  return gcsConfigured() ? 'gcs' : 'local';
}

function envRoot() {
  const folder = String(config.gcs?.envFolder || 'DEV').toUpperCase();
  return folder === 'PROD' ? 'PROD' : 'DEV';
}

function isGcsRef(id) {
  return String(id || '').startsWith(GCS_SCHEME);
}

function toGcsRef(objectPath) {
  return `${GCS_SCHEME}${String(objectPath).replace(/^\/+|\/+$/g, '')}`;
}

function fromGcsRef(ref) {
  return String(ref || '').startsWith(GCS_SCHEME) ? ref.slice(GCS_SCHEME.length) : String(ref || '');
}

function joinPrefix(...parts) {
  return parts
    .map((p) => String(p || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function safeFileName(fileName) {
  return String(fileName || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 180) || 'file';
}

function stringifyMeta(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || v === '') continue;
    out[String(k).slice(0, 128)] = String(v).slice(0, 256);
  }
  return out;
}

function md5Hex(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

async function getGcsBucket() {
  if (!gcsConfigured()) return null;
  if (gcsBucket) return gcsBucket;
  const { Storage } = require('@google-cloud/storage');
  const storageOpts = { projectId: config.gcs.projectId };
  if (config.gcs.credentials) storageOpts.credentials = config.gcs.credentials;
  else storageOpts.keyFilename = config.gcs.keyFile;
  const storage = new Storage(storageOpts);
  gcsBucket = storage.bucket(config.gcs.bucket);
  return gcsBucket;
}

async function ensureLocalDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/** GCS has no real folders — a zero-byte object with a trailing slash shows up in the console. */
async function ensurePrefix(objectPrefix) {
  const bucket = await getGcsBucket();
  const name = `${String(objectPrefix).replace(/\/+$/g, '')}/`;
  const file = bucket.file(name);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(Buffer.alloc(0), {
      resumable: false,
      contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
      metadata: { metadata: { folder: 'true' } },
    });
  }
  return toGcsRef(name.slice(0, -1));
}

async function writeLocalFile({ folderId, buffer, fileName }) {
  const dir = String(folderId).startsWith('local:')
    ? folderId.slice(6)
    : path.join(config.localDriveRoot, '_uploads');
  await ensureLocalDir(dir);
  const fileId = await newFileId();
  const safeName = `${fileId}_${safeFileName(fileName)}`;
  const full = path.join(dir, safeName);
  await fsp.writeFile(full, buffer);
  return { fileId, driveFileId: `local:${full}`, size: buffer.length, md5: md5Hex(buffer) };
}

const ROOT_FOLDERS = [
  'customers',
  'operations',
  'admin',
  'admin/brochures',
  'admin/catalogs',
  'admin/invoices',
  'admin/system',
  '_quarantine',
];

async function ensureEnvTree(envName) {
  await ensurePrefix(envName);
  for (const folder of ROOT_FOLDERS) {
    await ensurePrefix(joinPrefix(envName, folder));
  }
}

async function ensureSharedTree() {
  await ensurePrefix('SHARED');
  await ensurePrefix(joinPrefix('SHARED', 'admin'));
  await ensurePrefix(joinPrefix('SHARED', 'admin', 'brochures'));
  await ensurePrefix(joinPrefix('SHARED', 'admin', 'catalogs'));
}

async function ensureRootTree() {
  if (!gcsConfigured()) {
    await ensureLocalDir(config.localDriveRoot);
    await ensureLocalDir(path.join(config.localDriveRoot, 'customers'));
    await ensureLocalDir(path.join(config.localDriveRoot, 'admin', 'brochures'));
    await ensureLocalDir(path.join(config.localDriveRoot, 'admin', 'invoices'));
    await ensureLocalDir(path.join(config.localDriveRoot, '_quarantine'));
    return { mode: 'local', root: config.localDriveRoot };
  }
  await ensureEnvTree('DEV');
  await ensureEnvTree('PROD');
  await ensureSharedTree();
  return {
    mode: 'gcs',
    bucket: config.gcs.bucket,
    env: envRoot(),
    root: `gs://${config.gcs.bucket}/${envRoot()}`,
  };
}

async function ensureCustomerFolder(customerKey) {
  await ensureRootTree();
  const key = safeCustomerKey(customerKey);
  if (!gcsConfigured()) {
    const p = path.join(config.localDriveRoot, 'customers', key);
    await ensureLocalDir(path.join(p, 'profile'));
    await ensureLocalDir(path.join(p, 'kyc'));
    await ensureLocalDir(path.join(p, 'cases'));
    return `local:${p}`;
  }
  const base = joinPrefix(envRoot(), 'customers', key);
  await ensurePrefix(base);
  await ensurePrefix(joinPrefix(base, 'profile'));
  await ensurePrefix(joinPrefix(base, 'kyc'));
  await ensurePrefix(joinPrefix(base, 'cases'));
  return toGcsRef(base);
}

async function ensureProfileFolder(customerKey) {
  const cust = await ensureCustomerFolder(customerKey);
  if (String(cust).startsWith('local:')) {
    const p = path.join(cust.slice(6), 'profile');
    await ensureLocalDir(p);
    return `local:${p}`;
  }
  return toGcsRef(joinPrefix(fromGcsRef(cust), 'profile'));
}

async function ensureCaseFolders(customerKey, caseId) {
  const cust = await ensureCustomerFolder(customerKey);
  if (String(cust).startsWith('local:')) {
    const base = cust.slice(6);
    const caseBase = path.join(base, 'cases', caseId);
    await ensureLocalDir(path.join(caseBase, 'from-customer'));
    await ensureLocalDir(path.join(caseBase, 'from-ops'));
    return {
      customerId: cust,
      kycId: `local:${path.join(base, 'kyc')}`,
      profileId: `local:${path.join(base, 'profile')}`,
      fromCustomerId: `local:${path.join(caseBase, 'from-customer')}`,
      fromOpsId: `local:${path.join(caseBase, 'from-ops')}`,
    };
  }
  const base = fromGcsRef(cust);
  const caseBase = joinPrefix(base, 'cases', caseId);
  await ensurePrefix(joinPrefix(base, 'cases'));
  await ensurePrefix(caseBase);
  await ensurePrefix(joinPrefix(caseBase, 'from-customer'));
  await ensurePrefix(joinPrefix(caseBase, 'from-ops'));
  await ensurePrefix(joinPrefix(base, 'kyc'));
  return {
    customerId: cust,
    kycId: toGcsRef(joinPrefix(base, 'kyc')),
    profileId: toGcsRef(joinPrefix(base, 'profile')),
    fromCustomerId: toGcsRef(joinPrefix(caseBase, 'from-customer')),
    fromOpsId: toGcsRef(joinPrefix(caseBase, 'from-ops')),
  };
}

async function ensureInvoiceFolder(year) {
  await ensureRootTree();
  if (!gcsConfigured()) {
    const p = path.join(config.localDriveRoot, 'admin', 'invoices', String(year));
    await ensureLocalDir(p);
    return `local:${p}`;
  }
  const prefix = joinPrefix(envRoot(), 'admin', 'invoices', String(year));
  await ensurePrefix(prefix);
  return toGcsRef(prefix);
}

async function ensureBrochureFolder() {
  await ensureRootTree();
  if (!gcsConfigured()) {
    const p = path.join(config.localDriveRoot, 'admin', 'brochures');
    await ensureLocalDir(p);
    return `local:${p}`;
  }
  await ensureSharedTree();
  return toGcsRef(joinPrefix('SHARED', 'admin', 'brochures'));
}

async function uploadGcs({ folderId, buffer, fileName, mimeType, appProperties, fileId }) {
  const bucket = await getGcsBucket();
  const prefix = fromGcsRef(folderId);
  const objectPath = joinPrefix(prefix, `${fileId}_${safeFileName(fileName)}`);
  const file = bucket.file(objectPath);
  await file.save(buffer, {
    resumable: false,
    contentType: mimeType || 'application/octet-stream',
    metadata: {
      contentType: mimeType || 'application/octet-stream',
      metadata: stringifyMeta({ fileId, ...appProperties }),
    },
  });
  return { driveFileId: toGcsRef(objectPath), md5: md5Hex(buffer), size: buffer.length };
}

/**
 * Upload buffer to folder. Returns { fileId, driveFileId, md5, size, storage }
 * fileId is our public id; driveFileId is gs object ref or local path key.
 */
async function upload({ folderId, buffer, fileName, mimeType, appProperties = {} }) {
  const db = requireDb();
  let fileId;
  let driveFileId;
  let md5 = null;
  let size = buffer.length;

  const useGcs = gcsConfigured() && (isGcsRef(folderId) || !String(folderId).startsWith('local:'));
  if (!useGcs) {
    const local = await writeLocalFile({ folderId, buffer, fileName });
    fileId = local.fileId;
    driveFileId = local.driveFileId;
    size = local.size;
    md5 = local.md5;
  } else {
    fileId = await newFileId();
    const stored = await uploadGcs({
      folderId,
      buffer,
      fileName,
      mimeType,
      appProperties,
      fileId,
    });
    driveFileId = stored.driveFileId;
    md5 = stored.md5;
    size = stored.size;
  }

  const meta = {
    id: fileId,
    driveFileId,
    fileName,
    mimeType: mimeType || 'application/octet-stream',
    size,
    md5,
    folderId,
    storage: String(driveFileId).startsWith('local:') ? 'local' : 'gcs',
    appProperties,
    deletedAt: null,
    createdAt: utcnow(),
  };

  if (appProperties.kind === 'brochure') {
    await catalogUpsertFile(meta);
  } else {
    await db.collection('files').insertOne(meta);
  }

  await writeAudit({ email: appProperties.uploadedBy || '', role: appProperties.role || 'system' }, 'file.uploaded', {
    resource: { type: 'file', id: fileId },
    meta: { driveFileId, fileName, size },
    tone: 'success',
  });

  return {
    fileId,
    driveFileId,
    md5,
    size,
    storage: String(driveFileId).startsWith('local:') ? 'local' : 'gcs',
  };
}

async function downloadStream(driveFileIdOrFileId) {
  const db = getDb();
  let driveFileId = driveFileIdOrFileId;
  let meta = null;
  if (db) {
    meta = await db.collection('files').findOne({
      $or: [{ id: driveFileIdOrFileId }, { driveFileId: driveFileIdOrFileId }],
      deletedAt: null,
    });
    if (meta) driveFileId = meta.driveFileId;
  }
  if (String(driveFileId).startsWith('local:')) {
    const full = driveFileId.slice(6);
    return {
      stream: fs.createReadStream(full),
      mimeType: meta?.mimeType || 'application/octet-stream',
      fileName: meta?.fileName || path.basename(full),
      size: meta?.size,
      fileId: meta?.id,
    };
  }
  if (!isGcsRef(driveFileId) && !gcsConfigured()) {
    throw Object.assign(new Error('File storage unavailable'), { status: 503 });
  }
  const bucket = await getGcsBucket();
  if (!bucket) throw Object.assign(new Error('File storage unavailable'), { status: 503 });
  const objectPath = fromGcsRef(driveFileId);
  const file = bucket.file(objectPath);
  return {
    stream: file.createReadStream(),
    mimeType: meta?.mimeType || 'application/octet-stream',
    fileName: meta?.fileName || path.basename(objectPath),
    size: meta?.size,
    fileId: meta?.id,
  };
}

async function trash(driveFileIdOrFileId) {
  const db = requireDb();
  const meta = await db.collection('files').findOne({
    $or: [{ id: driveFileIdOrFileId }, { driveFileId: driveFileIdOrFileId }],
  });
  const driveFileId = meta?.driveFileId || driveFileIdOrFileId;
  if (meta) {
    await db.collection('files').updateOne({ id: meta.id }, { $set: { deletedAt: utcnow() } });
  }
  if (String(driveFileId).startsWith('local:')) {
    try {
      await fsp.unlink(driveFileId.slice(6));
    } catch (_) {}
    return;
  }
  if (!gcsConfigured() && !isGcsRef(driveFileId)) return;
  try {
    const bucket = await getGcsBucket();
    await bucket.file(fromGcsRef(driveFileId)).delete({ ignoreNotFound: true });
  } catch (e) {
    console.warn('gcs trash failed:', e.message);
  }
}

async function getFileMeta(fileId) {
  const db = requireDb();
  return db.collection('files').findOne({ id: fileId, deletedAt: null });
}

module.exports = {
  driveConfigured,
  driveMode,
  gcsConfigured,
  oauthConfigured: () => false,
  serviceAccountConfigured: gcsConfigured,
  ensureRootTree,
  ensureCustomerFolder,
  ensureProfileFolder,
  ensureCaseFolders,
  ensureInvoiceFolder,
  ensureBrochureFolder,
  upload,
  downloadStream,
  trash,
  getFileMeta,
};
