/**
 * images.js — Image store for uploaded images
 *
 * Stores uploaded images as data URLs keyed by filename.
 * Provides search for autocomplete and resolution for preview/export.
 * Persists images in IndexedDB so they survive page refreshes.
 */

const ImageStore = (function () {
  const _images = new Map(); // filename → dataURL
  let _db = null;

  const DB_NAME = 'tufte-images';
  const DB_VERSION = 1;
  const STORE_NAME = 'images';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME, { keyPath: 'name' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function init() {
    _db = await openDB();
    const tx = _db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => {
        for (const record of req.result) {
          _images.set(record.name, record.dataURL);
        }
        resolve();
      };
      req.onerror = () => resolve(); // degrade gracefully
    });
  }

  function addImage(filename, dataURL) {
    _images.set(filename, dataURL);
    if (_db) {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ name: filename, dataURL });
    }
  }

  function removeImage(filename) {
    _images.delete(filename);
    if (_db) {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(filename);
    }
  }

  function resolve(src) {
    return _images.get(src) || null;
  }

  function resolveInHTML(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    temp.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      const resolved = _images.get(src);
      if (resolved) img.setAttribute('src', resolved);
    });
    return temp.innerHTML;
  }

  function search(query) {
    const q = query ? query.toLowerCase() : '';
    const results = [];
    for (const [name] of _images) {
      if (!q || name.toLowerCase().includes(q)) {
        results.push({ name });
        if (results.length >= 8) break;
      }
    }
    return results;
  }

  function getCount() {
    return _images.size;
  }

  return { init, addImage, removeImage, resolve, resolveInHTML, search, getCount };
})();
