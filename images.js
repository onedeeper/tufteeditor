/**
 * images.js — Image store backed by server filesystem
 *
 * Images are stored as files in uploads/ and served by the Node server.
 * The browser keeps a Set of filenames for quick lookup and autocomplete.
 */

const ImageStore = (function () {
  const _images = new Set(); // filenames

  async function init() {
    const res = await fetch('/api/uploads');
    const files = await res.json();
    for (const f of files) _images.add(f);
  }

  async function addImage(file) {
    await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'X-Filename': file.name },
      body: file
    });
    _images.add(file.name);
  }

  async function removeImage(name) {
    await fetch('/api/uploads/' + encodeURIComponent(name), { method: 'DELETE' });
    _images.delete(name);
  }

  function resolve(src) {
    return _images.has(src) ? '/uploads/' + encodeURIComponent(src) : null;
  }

  async function fetchAsDataURL(url) {
    const blob = await (await fetch(url)).blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  async function resolveInHTML(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const imgs = temp.querySelectorAll('img');
    const promises = [];
    for (const img of imgs) {
      const src = img.getAttribute('src');
      const decoded = decodeURIComponent(src.replace(/^\/uploads\//, ''));
      if (src.startsWith('/uploads/') && _images.has(decoded)) {
        promises.push(fetchAsDataURL(src).then(dataURL => { img.setAttribute('src', dataURL); }));
      }
    }
    await Promise.all(promises);
    return temp.innerHTML;
  }

  function search(query) {
    const q = query ? query.toLowerCase() : '';
    const results = [];
    for (const name of _images) {
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

  function getAll() {
    return Array.from(_images);
  }

  return { init, addImage, removeImage, resolve, resolveInHTML, search, getCount, getAll };
})();
