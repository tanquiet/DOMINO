// Complaints and their photos live in this browser's IndexedDB (no server in this app).
// If the browser blocks storage (private window), they last until the page closes.
const DB = 'domino-complaints', STORE = 'complaints';
const memory = new Map();
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
  }
  return dbPromise;
}

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function allComplaints() {
  const db = await openDb();
  return db ? tx(db, 'readonly', (s) => s.getAll()) : [...memory.values()];
}

export async function saveComplaints(list) {
  const db = await openDb();
  if (!db) { list.forEach((c) => memory.set(c.id, c)); return; }
  await tx(db, 'readwrite', (s) => { list.forEach((c) => s.put(c)); });
}

export async function deleteComplaints(ids) {
  const db = await openDb();
  if (!db) { ids.forEach((id) => memory.delete(id)); return; }
  await tx(db, 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); });
}

// Shrinks a photo for storage. Redrawing it also drops EXIF data such as the phone's GPS trail.
export async function preparePhoto(file, maxSide = 1280) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch {
    throw new Error('This browser could not open that photo. Try a JPEG or PNG.');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', 0.82));
}
