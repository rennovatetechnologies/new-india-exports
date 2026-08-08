const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const config = require('../../config');
const { requireDb, getDb } = require('../../db');
const { utcnow, safeCustomerKey } = require('../helpers');
const { newFileId } = require('../ids');
const { writeAudit } = require('../audit');

let driveClient = null;
let driveAuthMode = null; // 'oauth' | 'service_account'

function oauthConfigured() {
  const g = config.googleDrive;
  return Boolean(g.oauthClientId && g.oauthClientSecret && g.oauthRefreshToken && g.rootFolderId);
}

function serviceAccountConfigured() {
  const g = config.googleDrive;
  // Service accounts have no My Drive storage quota — Shared Drive id is required.
  return Boolean(g.clientEmail && g.privateKey && g.rootFolderId && g.sharedDriveId);
}

function driveConfigured() {
  return oauthConfigured() || serviceAccountConfigured();
}

function driveMode() {
  if (oauthConfigured()) return 'oauth';
  if (serviceAccountConfigured()) return 'service_account';
  return 'local';
}

function isDriveQuotaError(err) {
  const status = err?.status || err?.code || err?.response?.status;
  const msg = String(err?.message || err?.errors?.[0]?.message || '');
  return status === 403 && /storage quota|shared drives|Service Accounts/i.test(msg);
}

async function writeLocalFile({ folderId, buffer, fileName }) {
  const dir = String(folderId).startsWith('local:')
    ? folderId.slice(6)
    : path.join(config.localDriveRoot, '_uploads');
  await ensureLocalDir(dir);
  const fileId = await newFileId();
  const safeName = `${fileId}_${String(fileName).replace(/[^\w.\-]+/g, '_')}`;
  const full = path.join(dir, safeName);
  await fsp.writeFile(full, buffer);
  return { fileId, driveFileId: `local:${full}`, size: buffer.length };
}

async function getGoogleDrive() {
  if (!driveConfigured()) return null;
  if (driveClient) return driveClient;
  const { google } = require('googleapis');
  const g = config.googleDrive;

  if (oauthConfigured()) {
    const oauth2 = new google.auth.OAuth2(g.oauthClientId, g.oauthClientSecret, g.oauthRedirectUri);
    oauth2.setCredentials({ refresh_token: g.oauthRefreshToken });
    driveClient = google.drive({ version: 'v3', auth: oauth2 });
    driveAuthMode = 'oauth';
    return driveClient;
  }

  const auth = new google.auth.JWT({
    email: g.clientEmail,
    key: g.privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  driveClient = google.drive({ version: 'v3', auth });
  driveAuthMode = 'service_account';
  return driveClient;
}

async function ensureLocalDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function cacheFolder(key, folderId) {
  const db = getDb();
  if (!db) return;
  await db.collection('drive_folders').updateOne(
    { key },
    { $set: { key, folderId, updatedAt: utcnow() }, $setOnInsert: { createdAt: utcnow() } },
    { upsert: true }
  );
}

async function getCachedFolder(key) {
  const db = getDb();
  if (!db) return null;
  const row = await db.collection('drive_folders').findOne({ key });
  const id = row?.folderId || null;
  if (!id) return null;
  // Ignore stale cache when storage mode flips between local and Google.
  if (String(id).startsWith('local:') && driveConfigured()) return null;
  if (!String(id).startsWith('local:') && !driveConfigured()) return null;
  return id;
}

async function googleCreateFolder(name, parentId) {
  const drive = await getGoogleDrive();
  const meta = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined,
  };
  const params = {
    resource: meta,
    fields: 'id, name',
    supportsAllDrives: true,
  };
  const res = await drive.files.create(params);
  return res.data.id;
}

async function ensureChildFolder(cacheKey, name, parentId) {
  const cached = await getCachedFolder(cacheKey);
  if (cached) return cached;
  const drive = await getGoogleDrive();
  if (!drive) {
    const localPath = path.join(config.localDriveRoot, cacheKey.replace(/:/g, path.sep));
    await ensureLocalDir(localPath);
    await cacheFolder(cacheKey, `local:${localPath}`);
    return `local:${localPath}`;
  }
  // search existing
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const listParams = {
    q,
    fields: 'files(id,name)',
    spaces: 'drive',
  };
  if (config.googleDrive.sharedDriveId) {
    listParams.supportsAllDrives = true;
    listParams.includeItemsFromAllDrives = true;
    listParams.corpora = 'drive';
    listParams.driveId = config.googleDrive.sharedDriveId;
  }
  const listed = await drive.files.list(listParams);
  const existing = listed.data.files?.[0]?.id;
  if (existing) {
    await cacheFolder(cacheKey, existing);
    return existing;
  }
  const id = await googleCreateFolder(name, parentId);
  await cacheFolder(cacheKey, id);
  return id;
}

async function ensureRootTree() {
  if (!driveConfigured()) {
    await ensureLocalDir(config.localDriveRoot);
    await ensureLocalDir(path.join(config.localDriveRoot, 'customers'));
    await ensureLocalDir(path.join(config.localDriveRoot, 'admin', 'brochures'));
    await ensureLocalDir(path.join(config.localDriveRoot, 'admin', 'invoices'));
    await ensureLocalDir(path.join(config.localDriveRoot, '_quarantine'));
    return { mode: 'local', root: config.localDriveRoot };
  }
  const root = config.googleDrive.rootFolderId;
  const customers = await ensureChildFolder('root:customers', 'customers', root);
  const operations = await ensureChildFolder('root:operations', 'operations', root);
  const admin = await ensureChildFolder('root:admin', 'admin', root);
  await ensureChildFolder('root:admin:brochures', 'brochures', admin);
  await ensureChildFolder('root:admin:invoices', 'invoices', admin);
  await ensureChildFolder('root:admin:catalogs', 'catalogs', admin);
  await ensureChildFolder('root:admin:system', 'system', admin);
  await ensureChildFolder('root:quarantine', '_quarantine', root);
  return { mode: 'google', root, customers, operations, admin };
}

async function ensureCustomerFolder(customerKey) {
  await ensureRootTree();
  const key = safeCustomerKey(customerKey);
  if (!driveConfigured()) {
    const p = path.join(config.localDriveRoot, 'customers', key);
    await ensureLocalDir(path.join(p, 'profile'));
    await ensureLocalDir(path.join(p, 'kyc'));
    await ensureLocalDir(path.join(p, 'cases'));
    const id = `local:${p}`;
    await cacheFolder(`customer:${key}`, id);
    return id;
  }
  const customers = await getCachedFolder('root:customers');
  return ensureChildFolder(`customer:${key}`, key, customers);
}

async function ensureCaseFolders(customerKey, caseId) {
  const cust = await ensureCustomerFolder(customerKey);
  if (String(cust).startsWith('local:')) {
    const base = cust.slice(6);
    const caseBase = path.join(base, 'cases', caseId);
    await ensureLocalDir(path.join(caseBase, 'from-customer'));
    await ensureLocalDir(path.join(caseBase, 'from-ops'));
    const kycId = `local:${path.join(base, 'kyc')}`;
    return {
      customerId: cust,
      kycId,
      fromCustomerId: `local:${path.join(caseBase, 'from-customer')}`,
      fromOpsId: `local:${path.join(caseBase, 'from-ops')}`,
    };
  }
  const casesParent = await ensureChildFolder(
    `customer:${safeCustomerKey(customerKey)}:cases`,
    'cases',
    cust
  );
  const caseFolder = await ensureChildFolder(
    `case:${caseId}`,
    caseId,
    casesParent
  );
  const fromCustomerId = await ensureChildFolder(`case:${caseId}:from-customer`, 'from-customer', caseFolder);
  const fromOpsId = await ensureChildFolder(`case:${caseId}:from-ops`, 'from-ops', caseFolder);
  const kycId = await ensureChildFolder(
    `customer:${safeCustomerKey(customerKey)}:kyc`,
    'kyc',
    cust
  );
  return { customerId: cust, kycId, fromCustomerId, fromOpsId };
}

async function ensureInvoiceFolder(year) {
  await ensureRootTree();
  if (!driveConfigured()) {
    const p = path.join(config.localDriveRoot, 'admin', 'invoices', String(year));
    await ensureLocalDir(p);
    return `local:${p}`;
  }
  const invoices = await getCachedFolder('root:admin:invoices');
  return ensureChildFolder(`admin:invoices:${year}`, String(year), invoices);
}

async function ensureBrochureFolder() {
  await ensureRootTree();
  if (!driveConfigured()) {
    const p = path.join(config.localDriveRoot, 'admin', 'brochures');
    await ensureLocalDir(p);
    return `local:${p}`;
  }
  return getCachedFolder('root:admin:brochures');
}

/**
 * Upload buffer to folder. Returns { fileId, driveFileId, md5, size, storage }
 * fileId is our public id; driveFileId is Google id or local path key.
 */
async function upload({ folderId, buffer, fileName, mimeType, appProperties = {} }) {
  const db = requireDb();
  let fileId;
  let driveFileId;
  let md5 = null;
  let size = buffer.length;

  if (String(folderId).startsWith('local:') || !driveConfigured()) {
    const local = await writeLocalFile({ folderId, buffer, fileName });
    fileId = local.fileId;
    driveFileId = local.driveFileId;
    size = local.size;
  } else {
    fileId = await newFileId();
    try {
      const drive = await getGoogleDrive();
      const media = {
        mimeType: mimeType || 'application/octet-stream',
        body: Readable.from(buffer),
      };
      const resource = {
        name: fileName,
        parents: [folderId],
        appProperties: { fileId, ...appProperties },
      };
      const res = await drive.files.create({
        resource,
        media,
        fields: 'id,md5Checksum,size',
        supportsAllDrives: true,
      });
      driveFileId = res.data.id;
      md5 = res.data.md5Checksum || null;
    } catch (err) {
      if (!isDriveQuotaError(err)) throw err;
      console.warn(
        'Google Drive upload blocked (service account has no My Drive quota). Falling back to local storage. Set GOOGLE_DRIVE_SHARED_DRIVE_ID to a Shared Drive that contains the root folder.'
      );
      const localFolder = `local:${path.join(config.localDriveRoot, '_uploads')}`;
      const local = await writeLocalFile({ folderId: localFolder, buffer, fileName });
      fileId = local.fileId;
      driveFileId = local.driveFileId;
      size = local.size;
    }
  }

  await db.collection('files').insertOne({
    id: fileId,
    driveFileId,
    fileName,
    mimeType: mimeType || 'application/octet-stream',
    size,
    md5,
    folderId,
    appProperties,
    deletedAt: null,
    createdAt: utcnow(),
  });

  await writeAudit({ email: appProperties.uploadedBy || '', role: appProperties.role || 'system' }, 'file.uploaded', {
    resource: { type: 'file', id: fileId },
    meta: { driveFileId, fileName, size },
    tone: 'success',
  });

  return { fileId, driveFileId, md5, size, storage: String(driveFileId).startsWith('local:') ? 'local' : 'google' };
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
  const drive = await getGoogleDrive();
  if (!drive) throw Object.assign(new Error('File storage unavailable'), { status: 503 });
  const params = { fileId: driveFileId, alt: 'media' };
  if (config.googleDrive.sharedDriveId) params.supportsAllDrives = true;
  const res = await drive.files.get(params, { responseType: 'stream' });
  return {
    stream: res.data,
    mimeType: meta?.mimeType || 'application/octet-stream',
    fileName: meta?.fileName || 'download',
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
  if (!driveConfigured()) return;
  const drive = await getGoogleDrive();
  const params = { fileId: driveFileId };
  if (config.googleDrive.sharedDriveId) params.supportsAllDrives = true;
  try {
    await drive.files.update({ ...params, resource: { trashed: true } });
  } catch (e) {
    console.warn('drive trash failed:', e.message);
  }
}

async function getFileMeta(fileId) {
  const db = requireDb();
  return db.collection('files').findOne({ id: fileId, deletedAt: null });
}

module.exports = {
  driveConfigured,
  driveMode,
  oauthConfigured,
  serviceAccountConfigured,
  ensureRootTree,
  ensureCustomerFolder,
  ensureCaseFolders,
  ensureInvoiceFolder,
  ensureBrochureFolder,
  upload,
  downloadStream,
  trash,
  getFileMeta,
};
