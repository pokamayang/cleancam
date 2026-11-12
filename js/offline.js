// ============================================================
// CleanCam – Offline queue (IndexedDB)
// Reports, photos and voice notes are queued here and synced
// when the connection returns.
// ============================================================

const DB_NAME = 'cleancam_offline';
const DB_VERSION = 1;
const STORE_REPORTS = 'pending_reports';
const STORE_MEDIA   = 'pending_media';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        db.createObjectStore(STORE_REPORTS, { keyPath: 'client_id' });
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: 'local_id' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function queueReport(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    tx.objectStore(STORE_REPORTS).put({ ...report, _queued_at: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function queueMedia(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).put({ ...item, local_id: item.local_id || crypto.randomUUID() });
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function getPendingReports() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_REPORTS, 'readonly').objectStore(STORE_REPORTS).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function getPendingMedia() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_MEDIA, 'readonly').objectStore(STORE_MEDIA).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function deleteReport(clientId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    tx.objectStore(STORE_REPORTS).delete(clientId);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function deleteMedia(localId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).delete(localId);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

// ── Badge update ──────────────────────────────────────────────
async function updateBadge() {
  const reports = await getPendingReports();
  const media   = await getPendingMedia();
  const count   = reports.length;
  const badge   = document.getElementById('offline-badge');
  if (badge) {
    if (count === 0) {
      badge.style.display = 'none';
    } else {
      const label = count === 1 ? i18n.t('offline_1') : i18n.t('offline_badge');
      badge.textContent = `${count} ${label}`;
      badge.style.display = 'flex';
    }
  }
  return count;
}

// ── Sync ──────────────────────────────────────────────────────
let _syncing = false;
let _backoff  = 5000;

async function syncQueue() {
  if (_syncing || !navigator.onLine) return;
  _syncing = true;

  try {
    const reports = await getPendingReports();
    for (const r of reports) {
      try {
        const { _queued_at, ...payload } = r;
        await db.createReport(payload);
        await deleteReport(r.client_id);
      } catch (e) {
        console.warn('Report sync failed', e);
      }
    }

    const mediaItems = await getPendingMedia();
    for (const m of mediaItems) {
      try {
        const { local_id, file_data, bucket, path, ...meta } = m;
        const blob = await (await fetch(file_data)).blob();
        const url  = await db.uploadFile(bucket, path, blob);
        await db.insertMedia({ ...meta, storage_path: url });
        await deleteMedia(local_id);
      } catch (e) {
        console.warn('Media sync failed', e);
      }
    }

    _backoff = 5000;
  } finally {
    _syncing = false;
    await updateBadge();
  }
}

// Listen for connectivity changes
window.addEventListener('online',  () => { _backoff = 5000; syncQueue(); });
window.addEventListener('offline', () => updateBadge());

// Periodic sync attempt
setInterval(syncQueue, 30000);

window.offline = { queueReport, queueMedia, getPendingReports, getPendingMedia, updateBadge, syncQueue };
