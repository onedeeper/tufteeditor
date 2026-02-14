/**
 * documents.js — Multi-document CRUD with localStorage
 */

const Documents = (function () {
  const INDEX_KEY = 'tufte-doc-index';
  const ACTIVE_KEY = 'tufte-doc-active';
  const CONTENT_PREFIX = 'tufte-doc-content:';

  // Old single-document keys (for migration)
  const OLD_CONTENT_KEY = 'tufte-editor-content';
  const OLD_TITLE_KEY = 'tufte-editor-title';

  function generateId() {
    return 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
  }

  function getIndex() {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function setIndex(index) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  function init(starterContent) {
    let index = getIndex();

    if (!index) {
      // Check for old single-document data to migrate
      const oldContent = localStorage.getItem(OLD_CONTENT_KEY);
      const oldTitle = localStorage.getItem(OLD_TITLE_KEY);

      if (oldContent !== null) {
        const id = generateId();
        const now = Date.now();
        const title = oldTitle || 'Untitled Document';
        index = [{ id: id, title: title, createdAt: now, updatedAt: now }];
        setIndex(index);
        localStorage.setItem(CONTENT_PREFIX + id, oldContent);
        localStorage.setItem(ACTIVE_KEY, id);

        // Remove old keys
        localStorage.removeItem(OLD_CONTENT_KEY);
        localStorage.removeItem(OLD_TITLE_KEY);

        return { id: id, title: title, content: oldContent };
      }

      // No old data — create starter document
      var id = generateId();
      var now = Date.now();
      index = [{ id: id, title: 'Untitled Document', createdAt: now, updatedAt: now }];
      setIndex(index);
      localStorage.setItem(CONTENT_PREFIX + id, starterContent);
      localStorage.setItem(ACTIVE_KEY, id);
      return { id: id, title: 'Untitled Document', content: starterContent };
    }

    // Index exists — load active or first document
    var activeId = localStorage.getItem(ACTIVE_KEY);
    var entry = index.find(function (d) { return d.id === activeId; });
    if (!entry) {
      entry = index[0];
      activeId = entry.id;
      localStorage.setItem(ACTIVE_KEY, activeId);
    }
    var content = localStorage.getItem(CONTENT_PREFIX + activeId) || '';
    return { id: activeId, title: entry.title, content: content };
  }

  function create(title, content) {
    var id = generateId();
    var now = Date.now();
    var docTitle = title || 'Untitled Document';
    var docContent = content || '';
    var index = getIndex() || [];
    index.unshift({ id: id, title: docTitle, createdAt: now, updatedAt: now });
    setIndex(index);
    localStorage.setItem(CONTENT_PREFIX + id, docContent);
    localStorage.setItem(ACTIVE_KEY, id);
    return { id: id, title: docTitle, content: docContent };
  }

  function load(id) {
    var index = getIndex() || [];
    var entry = index.find(function (d) { return d.id === id; });
    if (!entry) return null;
    localStorage.setItem(ACTIVE_KEY, id);
    var content = localStorage.getItem(CONTENT_PREFIX + id) || '';
    return { id: id, title: entry.title, content: content };
  }

  function save(content) {
    var activeId = localStorage.getItem(ACTIVE_KEY);
    if (!activeId) return;
    localStorage.setItem(CONTENT_PREFIX + activeId, content);
    var index = getIndex() || [];
    var entry = index.find(function (d) { return d.id === activeId; });
    if (entry) {
      entry.updatedAt = Date.now();
      setIndex(index);
    }
  }

  function saveTitle(title) {
    var activeId = localStorage.getItem(ACTIVE_KEY);
    if (!activeId) return;
    var index = getIndex() || [];
    var entry = index.find(function (d) { return d.id === activeId; });
    if (entry) {
      entry.title = title;
      entry.updatedAt = Date.now();
      setIndex(index);
    }
  }

  function deleteDoc(id) {
    var index = getIndex() || [];
    index = index.filter(function (d) { return d.id !== id; });
    localStorage.removeItem(CONTENT_PREFIX + id);

    if (index.length === 0) {
      // Deleted last document — clear everything
      localStorage.removeItem(INDEX_KEY);
      localStorage.removeItem(ACTIVE_KEY);
      return null;
    }

    setIndex(index);

    var activeId = localStorage.getItem(ACTIVE_KEY);
    if (activeId === id) {
      // Switch to first remaining document
      var next = index[0];
      localStorage.setItem(ACTIVE_KEY, next.id);
      var content = localStorage.getItem(CONTENT_PREFIX + next.id) || '';
      return { id: next.id, title: next.title, content: content };
    }

    return { id: activeId, title: '', content: '' };
  }

  function list() {
    return getIndex() || [];
  }

  function getActiveId() {
    return localStorage.getItem(ACTIVE_KEY);
  }

  return {
    init: init,
    create: create,
    load: load,
    save: save,
    saveTitle: saveTitle,
    deleteDoc: deleteDoc,
    list: list,
    getActiveId: getActiveId
  };
})();
