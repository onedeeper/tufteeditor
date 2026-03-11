/**
 * documents.js — Multi-document CRUD via server API
 *
 * Supports folders: doc names may be "file.md" (root) or "folder/file.md".
 * The `folder` field on each doc entry is "" for root, or the folder name.
 */

const Documents = (function () {
  const ACTIVE_KEY = 'tufte-doc-active';

  let _docs = [];       // cached list: [{name, title, mtime, folder}]
  let _folders = [];    // cached list of folder names
  let _activeDoc = null; // path of active doc (e.g., "guide.md" or "Essays/doc.md")

  function docApiPath(name) {
    return '/api/docs/' + name.split('/').map(encodeURIComponent).join('/');
  }

  async function fetchContent(name) {
    return (await fetch(docApiPath(name))).text();
  }

  function sanitize(title) {
    return title.replace(/[\/\\:*?"<>|]/g, '').trim() || 'Untitled Document';
  }

  async function init() {
    const [docsRes, foldersRes] = await Promise.all([
      fetch('/api/docs'),
      fetch('/api/folders')
    ]);
    _docs = await docsRes.json();
    _folders = await foldersRes.json();

    if (_docs.length === 0) {
      return { name: null, title: 'Untitled Document', content: '' };
    }

    // Restore active doc from localStorage
    const saved = localStorage.getItem(ACTIVE_KEY);
    const entry = _docs.find(d => d.name === saved) || _docs[0];
    _activeDoc = entry.name;
    localStorage.setItem(ACTIVE_KEY, _activeDoc);

    const content = await fetchContent(_activeDoc);
    return { name: _activeDoc, title: entry.title, content };
  }

  async function create(title, folder) {
    folder = folder || '';
    const docTitle = sanitize(title || 'Untitled Document');
    let fileName = docTitle + '.md';
    let fullName = folder ? folder + '/' + fileName : fileName;

    // Avoid collisions
    let i = 2;
    while (_docs.some(d => d.name === fullName)) {
      fileName = docTitle + ' ' + i + '.md';
      fullName = folder ? folder + '/' + fileName : fileName;
      i++;
    }

    await fetch(docApiPath(fullName), { method: 'PUT', body: '' });

    const entry = { name: fullName, title: fileName.replace(/\.md$/, ''), mtime: Date.now(), folder };
    _docs.unshift(entry);
    _activeDoc = fullName;
    localStorage.setItem(ACTIVE_KEY, _activeDoc);
    return { name: fullName, title: entry.title, content: '' };
  }

  async function load(name) {
    const entry = _docs.find(d => d.name === name);
    if (!entry) return null;
    _activeDoc = name;
    localStorage.setItem(ACTIVE_KEY, _activeDoc);
    const content = await fetchContent(name);
    return { name, title: entry.title, content };
  }

  async function save(content) {
    if (!_activeDoc) return;
    await fetch(docApiPath(_activeDoc), { method: 'PUT', body: content });
    const entry = _docs.find(d => d.name === _activeDoc);
    if (entry) entry.mtime = Date.now();
  }

  async function rename(newTitle) {
    if (!_activeDoc) return;
    const entry = _docs.find(d => d.name === _activeDoc);
    const folder = entry ? entry.folder : '';
    const newFileName = sanitize(newTitle) + '.md';
    const newFullName = folder ? folder + '/' + newFileName : newFileName;
    if (newFullName === _activeDoc) return;

    const res = await fetch(docApiPath(_activeDoc), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: newFileName })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Rename failed');
    }

    if (entry) {
      entry.name = newFullName;
      entry.title = newFileName.replace(/\.md$/, '');
      entry.mtime = Date.now();
    }
    _activeDoc = newFullName;
    localStorage.setItem(ACTIVE_KEY, _activeDoc);
  }

  async function moveToFolder(name, targetFolder) {
    const entry = _docs.find(d => d.name === name);
    if (!entry) return;

    const res = await fetch(docApiPath(name), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: targetFolder })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Move failed');
    }

    const result = await res.json();
    entry.name = result.name;
    entry.folder = targetFolder;
    entry.mtime = Date.now();

    if (_activeDoc === name) {
      _activeDoc = result.name;
      localStorage.setItem(ACTIVE_KEY, _activeDoc);
    }
  }

  async function deleteDoc(name) {
    await fetch(docApiPath(name), { method: 'DELETE' });
    _docs = _docs.filter(d => d.name !== name);

    if (_docs.length === 0) {
      return create();
    }

    if (_activeDoc === name) {
      _activeDoc = _docs[0].name;
      localStorage.setItem(ACTIVE_KEY, _activeDoc);
    }

    const content = await fetchContent(_activeDoc);
    const entry = _docs.find(d => d.name === _activeDoc);
    return { name: _activeDoc, title: entry.title, content };
  }

  async function createFolder(name) {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create folder');
    }
    _folders.push(name);
    _folders.sort();
  }

  async function deleteFolder(name) {
    const res = await fetch('/api/folders/' + encodeURIComponent(name), { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete folder');
    }
    // Remove docs that were in this folder from cache
    const wasActive = _docs.some(d => d.folder === name && d.name === _activeDoc);
    _docs = _docs.filter(d => d.folder !== name);
    _folders = _folders.filter(f => f !== name);

    if (wasActive) {
      if (_docs.length > 0) {
        _activeDoc = _docs[0].name;
        localStorage.setItem(ACTIVE_KEY, _activeDoc);
      } else {
        _activeDoc = null;
      }
    }
  }

  function list() { return _docs; }
  function listFolders() { return _folders; }
  function getActiveId() { return _activeDoc; }

  return { init, create, load, save, rename, deleteDoc, moveToFolder, createFolder, deleteFolder, list, listFolders, getActiveId };
})();
