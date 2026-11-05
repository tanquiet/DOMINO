// Complaints, their photos and citizens' grades live in this browser's IndexedDB (no server in this app).
// If the browser blocks storage (private window), they last until the page closes.
function makeStore(dbName, storeName) {
  const memory = new Map();
  let dbPromise = null;

  const openDb = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(storeName, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(() => null);
    }
    return dbPromise;
  };

  const tx = (db, mode, run) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const out = run(t.objectStore(storeName));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });

  return {
    all: async () => {
      const db = await openDb();
      return db ? tx(db, 'readonly', (s) => s.getAll()) : [...memory.values()];
    },
    save: async (list) => {
      const db = await openDb();
      if (!db) { list.forEach((c) => memory.set(c.id, c)); return; }
      await tx(db, 'readwrite', (s) => { list.forEach((c) => s.put(c)); });
    },
    remove: async (ids) => {
      const db = await openDb();
      if (!db) { ids.forEach((id) => memory.delete(id)); return; }
      await tx(db, 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); });
    },
  };
}

const complaints = makeStore('domino-complaints', 'complaints');
export const allComplaints = complaints.all, saveComplaints = complaints.save, deleteComplaints = complaints.remove;

const feedback = makeStore('domino-feedback', 'feedback');
export const allFeedback = feedback.all, saveFeedback = feedback.save, deleteFeedback = feedback.remove;

const contractorReports = makeStore('domino-contractor-reports', 'reports');
export const allContractorReports = contractorReports.all, saveContractorReports = contractorReports.save, deleteContractorReports = contractorReports.remove;

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
