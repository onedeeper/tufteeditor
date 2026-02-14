/**
 * documents.js — Multi-document CRUD via server API
 */

const Documents = (function () {
  const ACTIVE_KEY = 'tufte-doc-active';

  let _docs = [];       // cached list: [{name, title, mtime}]
  let _activeDoc = null; // filename of active doc

  function sanitize(title) {
    return title.replace(/[\/\\:*?"<>|]/g, '').trim() || 'Untitled Document';
  }

  async function init() {
    const res = await fetch('/api/docs');
    _docs = await res.json();

    if (_docs.length === 0) {
      return { name: null, title: 'Untitled Document', content: '' };
    }

    // Restore active doc from localStorage
    const saved = localStorage.getItem(ACTIVE_KEY);
    const entry = _docs.find(d => d.name === saved) || _docs[0];
    _activeDoc = entry.name;
    localStorage.setItem(ACTIVE_KEY, _activeDoc);

    const content = await (await fetch('/api/docs/' + encodeURIComponent(_activeDoc))).text();
    return { name: _activeDoc, title: entry.title, content };
  }

  async function create(title) {
    const docTitle = sanitize(title || 'Untitled Document');
    let name = docTitle + '.md';

    // Avoid collisions
    let i = 2;
    while (_docs.some(d => d.name === name)) {
      name = docTitle + ' ' + i + '.md';
      i++;
    }

    await fetch('/api/docs/' + encodeURIComponent(name), {
      method: 'PUT',
      body: ''
    });

    const entry = { name, title: name.replace(/\.md$/, ''), mtime: Date.now() };
    _docs.unshift(entry);
    _activeDoc = name;
    localStorage.setItem(ACTIVE_KEY, _activeDoc);
    return { name, title: entry.title, content: '' };
  }

  async function load(name) {
    const entry = _docs.find(d => d.name === name);
    if (!entry) return null;
    _activeDoc = name;
    localStorage.setItem(ACTIVE_KEY, _activeDoc);
    const content = await (await fetch('/api/docs/' + encodeURIComponent(name))).text();
    return { name, title: entry.title, content };
  }

  async function save(content) {
    if (!_activeDoc) return;
    await fetch('/api/docs/' + encodeURIComponent(_activeDoc), {
      method: 'PUT',
      body: content
    });
    const entry = _docs.find(d => d.name === _activeDoc);
    if (entry) entry.mtime = Date.now();
  }

  async function rename(newTitle) {
    if (!_activeDoc) return;
    const safeName = sanitize(newTitle) + '.md';
    if (safeName === _activeDoc) return;

    const res = await fetch('/api/docs/' + encodeURIComponent(_activeDoc), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: safeName })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Rename failed');
    }

    const entry = _docs.find(d => d.name === _activeDoc);
    if (entry) {
      entry.name = safeName;
      entry.title = safeName.replace(/\.md$/, '');
      entry.mtime = Date.now();
    }
    _activeDoc = safeName;
    localStorage.setItem(ACTIVE_KEY, _activeDoc);
  }

  async function deleteDoc(name) {
    await fetch('/api/docs/' + encodeURIComponent(name), { method: 'DELETE' });
    _docs = _docs.filter(d => d.name !== name);

    if (_docs.length === 0) {
      // Create a fresh doc
      const fresh = await create();
      const content = await (await fetch('/api/docs/' + encodeURIComponent(fresh.name))).text();
      return { name: fresh.name, title: fresh.title, content };
    }

    if (_activeDoc === name) {
      _activeDoc = _docs[0].name;
      localStorage.setItem(ACTIVE_KEY, _activeDoc);
    }

    const content = await (await fetch('/api/docs/' + encodeURIComponent(_activeDoc))).text();
    const entry = _docs.find(d => d.name === _activeDoc);
    return { name: _activeDoc, title: entry.title, content };
  }

  function list() {
    return _docs;
  }

  function getActiveId() {
    return _activeDoc;
  }

  function getActiveTitle() {
    const entry = _docs.find(d => d.name === _activeDoc);
    return entry ? entry.title : '';
  }

  return { init, create, load, save, rename, deleteDoc, list, getActiveId, getActiveTitle };
})();
