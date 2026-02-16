/**
 * editor.js — App logic
 * Live preview, toolbar, view toggle, resizer, server-backed save, export
 */

(async function () {
  await ImageStore.init();
  await Citations.init();

  const editor    = document.getElementById('editor');
  const preview   = document.querySelector('#preview article');
  const wordCount = document.querySelector('.word-count');
  const docTitle  = document.querySelector('.doc-title');
  const app       = document.querySelector('.app');

  const SAVE_DELAY    = 1000;
  const PREVIEW_DELAY = 150;

  /* ── Restore / Init ── */
  const initDoc = await Documents.init();

  editor.value = initDoc.content;
  docTitle.textContent = initDoc.title;
  updatePreview();
  updateWordCount();
  editor.focus();

  /* ── Live Preview ── */
  let previewTimer;
  let undoTimer;
  editor.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      updatePreview();
      updateWordCount();
    }, PREVIEW_DELAY);
    scheduleSave();
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => history.save(), 400);
  });

  function renderMathAndCode(el) {
    if (typeof katex !== 'undefined') {
      el.querySelectorAll('.math-inline').forEach(node => {
        try { katex.render(node.textContent, node, { displayMode: false, throwOnError: false }); }
        catch(e) {}
      });
      el.querySelectorAll('.math-display').forEach(node => {
        try { katex.render(node.textContent, node, { displayMode: true, throwOnError: false }); }
        catch(e) {}
      });
    }
    if (typeof Prism !== 'undefined') Prism.highlightAllUnder(el);
  }

  function updatePreview() {
    preview.innerHTML = parseMarkdown(editor.value);
    // Resolve uploaded image sources
    if (ImageStore.getCount() > 0) {
      preview.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        const resolved = ImageStore.resolve(src);
        if (resolved) img.src = resolved;
      });
    }
    renderMathAndCode(preview);
  }

  function updateWordCount() {
    const text = editor.value
      .replace(/\{(sn|mn|newthought):([^}]*)\}/g, '$2')
      .replace(/[#*`\[\](){}!>-]/g, ' ');
    const words = text.split(/\s+/).filter(w => w.length > 0);
    wordCount.textContent = words.length + ' word' + (words.length !== 1 ? 's' : '');
  }

  /* ── Double-click Preview → Jump to Source ── */
  preview.addEventListener('dblclick', (e) => {
    // Walk up from click target to find nearest element with data-line
    let el = e.target;
    while (el && el !== preview) {
      if (el.dataset && el.dataset.line !== undefined) break;
      el = el.parentElement;
    }
    if (!el || el === preview || el.dataset.line === undefined) return;

    const targetLine = parseInt(el.dataset.line, 10);
    if (isNaN(targetLine)) return;

    // Compute character offset of that line
    const srcLines = editor.value.split('\n');
    let offset = 0;
    for (let i = 0; i < targetLine && i < srcLines.length; i++) {
      offset += srcLines[i].length + 1;
    }

    // If in preview-only mode, switch to split
    if (app.classList.contains('view-preview')) {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.view-btn[data-view="split"]').classList.add('active');
      app.className = 'app view-split';
    }

    editor.focus();
    editor.setSelectionRange(offset, offset);

    // Scroll editor to show the target line (centered roughly)
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
    editor.scrollTop = Math.max(0, targetLine * lineHeight - editor.clientHeight / 3);
  });

  /* ── Undo / Redo ── */
  const history = {
    states: [],
    pointer: -1,
    MAX: 200,

    reset() {
      this.states = [];
      this.pointer = -1;
      this.save();
    },

    save() {
      const state = { value: editor.value, selStart: editor.selectionStart, selEnd: editor.selectionEnd };
      if (this.pointer < this.states.length - 1) {
        this.states.length = this.pointer + 1;
      }
      if (this.states.length > 0 && this.states[this.states.length - 1].value === state.value) return;
      this.states.push(state);
      if (this.states.length > this.MAX) this.states.shift();
      this.pointer = this.states.length - 1;
    },

    undo() {
      clearTimeout(undoTimer);
      const current = editor.value;
      const top = this.pointer >= 0 ? this.states[this.pointer] : null;
      if (!top || top.value !== current) {
        this.states.length = this.pointer + 1;
        this.states.push({ value: current, selStart: editor.selectionStart, selEnd: editor.selectionEnd });
        this.pointer = this.states.length - 1;
      }
      if (this.pointer <= 0) return;
      this.pointer--;
      this._restore();
    },

    redo() {
      clearTimeout(undoTimer);
      if (this.pointer >= this.states.length - 1) return;
      this.pointer++;
      this._restore();
    },

    _restore() {
      const state = this.states[this.pointer];
      editor.value = state.value;
      editor.setSelectionRange(state.selStart, state.selEnd);
      editor.focus();
      updatePreview();
      updateWordCount();
      scheduleSave();
    }
  };

  history.save();

  function loadDocument(doc) {
    editor.value = doc.content;
    docTitle.textContent = doc.title;
    history.reset();
    updatePreview();
    updateWordCount();
  }

  document.getElementById('undo-btn').addEventListener('click', () => history.undo());
  document.getElementById('redo-btn').addEventListener('click', () => history.redo());

  /* ── Auto-save ── */
  let saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      Documents.save(editor.value).catch(() => {});
      renderSidebar();
    }, SAVE_DELAY);
  }

  /* ── Title Rename (blur-based) ── */
  let titleBeforeEdit = '';

  docTitle.addEventListener('focus', () => {
    titleBeforeEdit = docTitle.textContent.trim();
  });

  docTitle.addEventListener('blur', async () => {
    const newTitle = docTitle.textContent.trim();
    if (!newTitle || newTitle === titleBeforeEdit) {
      if (!newTitle) docTitle.textContent = titleBeforeEdit;
      return;
    }
    try {
      await Documents.rename(newTitle);
      renderSidebar();
    } catch (e) {
      alert(e.message);
      docTitle.textContent = titleBeforeEdit;
    }
  });

  docTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); docTitle.blur(); }
  });

  /* ── Toolbar Insertions ── */
  const snippets = {
    sidenote:   { before: '{sn:', after: '}', placeholder: 'sidenote text' },
    marginnote: { before: '{mn:', after: '}', placeholder: 'margin note text' },
    newthought: { before: '{newthought:', after: '}', placeholder: 'Opening words' },
    epigraph:   { before: '> ', after: '\n> — Author', placeholder: 'Quote text', newline: true },
    fullwidth:  { before: '![', after: '][100](url){fullwidth}', placeholder: 'caption', newline: true },
    bold:       { before: '**', after: '**', placeholder: 'bold text' },
    italic:     { before: '*', after: '*', placeholder: 'italic text' },
    code:       { before: '`', after: '`', placeholder: 'code' },
    link:       { before: '[', after: '](url)', placeholder: 'link text' },
    image:      { before: '![', after: '][50](url)', placeholder: 'caption', newline: true },
    heading:    { before: '## ', after: '', placeholder: 'Heading', newline: true },
    hr:         { before: '\n---\n', after: '', placeholder: '' },
    marginfig:  { before: '![', after: '][100](url){margin}', placeholder: 'caption', newline: true },
    cite:       { before: '@', after: '', placeholder: 'citekey' },
    citeurl:    { before: '@url[', after: ']', placeholder: 'https://example.com' },
  };

  document.querySelector('.toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-insert]');
    if (!btn) return;
    const key = btn.dataset.insert;
    const snip = snippets[key];
    if (!snip) return;
    if (key === 'image' || key === 'fullwidth' || key === 'marginfig') {
      const count = (editor.value.match(/!\[/g) || []).length;
      insertSnippet({ ...snip, placeholder: 'Figure ' + (count + 1) });
      return;
    }
    insertSnippet(snip);
  });

  function insertSnippet({ before, after, placeholder, newline }) {
    history.save();
    editor.focus();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.substring(start, end);
    const text = selected || placeholder;

    let prefix = before;
    if (newline && start > 0 && editor.value[start - 1] !== '\n') {
      prefix = '\n' + prefix;
    }

    const insertion = prefix + text + after;
    editor.setRangeText(insertion, start, end, 'end');

    // Select the placeholder so user can type over it
    if (!selected && placeholder) {
      const pStart = start + prefix.length;
      editor.setSelectionRange(pStart, pStart + placeholder.length);
    }

    editor.dispatchEvent(new Event('input'));
  }

  /* ── View Toggle ── */
  document.querySelector('.view-toggles').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    const view = btn.dataset.view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    app.className = 'app view-' + view;
  });

  /* ── Split Pane Resizer ── */
  const splitPane   = document.querySelector('.split-pane');
  const divider     = document.querySelector('.divider');
  const editorPane  = document.querySelector('.editor-pane');
  const previewPane = document.querySelector('.preview-pane');

  let dragging = false;

  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = splitPane.getBoundingClientRect();
    const vertical = window.innerWidth <= 640;
    const pct = vertical
      ? ((e.clientY - rect.top) / rect.height) * 100
      : ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    editorPane.style.flex = `0 0 ${clamped}%`;
    previewPane.style.flex = `0 0 ${100 - clamped}%`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  /* ── Export ── */
  const exportBtn  = document.querySelector('.export-btn');
  const exportMenu = document.querySelector('.export-menu');

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    exportMenu.classList.remove('open');
  });

  exportMenu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-export]');
    if (!btn) return;
    exportMenu.classList.remove('open');
    const action = btn.dataset.export;

    if (action === 'html') {
      const title = docTitle.textContent.trim() || 'Untitled';
      let bodyHTML = parseMarkdown(editor.value);
      if (ImageStore.getCount() > 0) bodyHTML = await ImageStore.resolveInHTML(bodyHTML);
      // Pre-render math + code to static HTML (exported file only needs KaTeX CSS, not JS)
      const temp = document.createElement('div');
      temp.innerHTML = bodyHTML;
      renderMathAndCode(temp);
      bodyHTML = temp.innerHTML;
      const fullHTML = generateFullHTML(bodyHTML, title);
      const blob = new Blob([fullHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = title.replace(/[^a-zA-Z0-9 _-]/g, '') + '.html';
      a.click();
      URL.revokeObjectURL(url);
    } else if (action === 'print') {
      window.print();
    } else if (action === 'markdown') {
      navigator.clipboard.writeText(editor.value).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Markdown'; }, 1500);
      });
    }
  });

  /* ── Keyboard Shortcuts ── */
  editor.addEventListener('keydown', (e) => {
    // Autocomplete navigation takes priority
    if (acActive) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acIndex = (acIndex + 1) % acItems.length;
        renderAutocomplete();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        acIndex = (acIndex - 1 + acItems.length) % acItems.length;
        renderAutocomplete();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectAutocompleteItem(acIndex);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideAutocomplete();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        setTimeout(showAutocomplete, 0);
      }
    }
    // Tab inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      insertSnippet({ before: '  ', after: '', placeholder: '' });
    }
    // Ctrl/Cmd+B → bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      insertSnippet(snippets.bold);
    }
    // Ctrl/Cmd+I → italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      insertSnippet(snippets.italic);
    }
    // Ctrl/Cmd+Z → undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      history.undo();
    }
    // Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y → redo
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault();
      history.redo();
    }
    // Ctrl/Cmd+S → save (prevent default)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      Documents.save(editor.value).catch(() => {});
    }
  });

  /* ── Modal Helper ── */
  function setupModal(overlay, openBtn, closeBtn, onOpen) {
    openBtn.addEventListener('click', () => {
      if (onOpen) onOpen();
      overlay.style.display = 'flex';
    });
    closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  }

  /* ── Bibliography Modal ── */
  const bibBtn    = document.getElementById('bib-btn');
  const bibModal  = document.getElementById('bib-modal');
  const bibText   = document.getElementById('bib-textarea');
  const bibFile   = document.getElementById('bib-file');
  const bibStatus = document.getElementById('bib-status');
  const bibApply  = document.getElementById('bib-apply');
  const bibCancel = document.getElementById('bib-cancel');
  const bibClear  = document.getElementById('bib-clear');

  function updateBibStatus() {
    const count = Citations.getBibliographyCount();
    bibStatus.textContent = count > 0 ? count + ' entr' + (count === 1 ? 'y' : 'ies') + ' loaded' : '';
  }

  setupModal(bibModal, bibBtn, bibCancel, () => {
    bibText.value = '';
    bibFile.value = '';
    updateBibStatus();
  });

  bibFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      bibText.value = ev.target.result;
    };
    reader.readAsText(file);
  });

  bibApply.addEventListener('click', () => {
    const text = bibText.value.trim();
    if (!text) { bibModal.style.display = 'none'; return; }
    Citations.loadBibliography(text);
    updateBibStatus();
    bibModal.style.display = 'none';
    updatePreview();
  });

  bibClear.addEventListener('click', () => {
    Citations.clearBibliography();
    updateBibStatus();
    updatePreview();
  });

  /* ── Image Modal ── */
  const imgManageBtn = document.getElementById('img-manage-btn');
  const imgModal     = document.getElementById('img-modal');
  const imgList      = document.getElementById('img-list');
  const imgUploadMore = document.getElementById('img-upload-more');
  const imgClose     = document.getElementById('img-close');
  const imgFileInput = document.getElementById('img-file-input');

  function renderImageModal() {
    const all = ImageStore.getAll();
    imgList.innerHTML = '';
    if (all.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'img-empty';
      empty.textContent = 'No images uploaded yet.';
      imgList.appendChild(empty);
      return;
    }
    all.forEach(name => {
      const item = document.createElement('div');
      item.className = 'img-item';

      const thumb = document.createElement('img');
      thumb.className = 'img-thumb';
      thumb.src = '/uploads/' + encodeURIComponent(name);
      thumb.alt = name;
      item.appendChild(thumb);

      const nameEl = document.createElement('span');
      nameEl.className = 'img-name';
      nameEl.textContent = name;
      item.appendChild(nameEl);

      const del = document.createElement('button');
      del.className = 'img-delete-btn';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete image "' + name + '"?')) return;
        await ImageStore.removeImage(name);
        renderImageModal();
        updatePreview();
      });
      item.appendChild(del);

      imgList.appendChild(item);
    });
  }

  setupModal(imgModal, imgManageBtn, imgClose, renderImageModal);

  imgUploadMore.addEventListener('click', () => imgFileInput.click());

  imgFileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    for (const file of files) {
      await ImageStore.addImage(file);
    }
    imgFileInput.value = '';
    updatePreview();
    // Re-render modal if open
    if (imgModal.style.display !== 'none') renderImageModal();
  });

  /* ── Autocomplete (Citations + Images) ── */
  const acDropdown = document.getElementById('autocomplete');
  let acActive = false;
  let acItems = [];
  let acIndex = 0;
  let acContext = null;

  function getCiteQuery() {
    const pos = editor.selectionStart;
    if (pos !== editor.selectionEnd) return null;
    const text = editor.value;
    let i = pos - 1;
    while (i >= 0 && /[\w:.\-]/.test(text[i])) i--;
    if (i < 0 || text[i] !== '@') return null;
    if (i > 0 && /\w/.test(text[i - 1])) return null;
    const query = text.substring(i + 1, pos);
    if (query === 'url' || query.startsWith('url[')) return null;
    return { start: i, end: pos, query };
  }

  function isInMathContext(text, pos) {
    let inDisplay = false;
    let inInline = false;
    let i = 0;
    while (i < pos) {
      if (text[i] === '$' && i + 1 < text.length && text[i + 1] === '$') {
        if (inDisplay) { inDisplay = false; i += 2; continue; }
        if (!inInline) { inDisplay = true; i += 2; continue; }
      }
      if (text[i] === '$') {
        if (!inDisplay) inInline = !inInline;
        i++; continue;
      }
      i++;
    }
    return inDisplay || inInline;
  }

  function getLatexQuery() {
    const pos = editor.selectionStart;
    if (pos !== editor.selectionEnd) return null;
    const text = editor.value;
    // Scan back for backslash + letters
    let i = pos - 1;
    while (i >= 0 && /[a-zA-Z]/.test(text[i])) i--;
    if (i < 0 || text[i] !== '\\') return null;
    // Verify we're inside math context
    if (!isInMathContext(text, i)) return null;
    const query = text.substring(i + 1, pos);
    return { start: i, end: pos, query };
  }

  function getUrlCiteQuery() {
    const pos = editor.selectionStart;
    if (pos !== editor.selectionEnd) return null;
    const text = editor.value;
    // Scan backwards to find opening [
    let i = pos - 1;
    while (i >= 0 && text[i] !== '[' && text[i] !== ']' && text[i] !== '\n') i--;
    if (i < 0 || text[i] !== '[') return null;
    const query = text.substring(i + 1, pos);
    // Case 1: @url[query|
    if (i >= 4 && text.substring(i - 4, i) === '@url') {
      return { start: i + 1, end: pos, query };
    }
    // Case 2: @url[name][query|  (second bracket)
    if (i >= 1 && text[i - 1] === ']') {
      let j = i - 2;
      while (j >= 0 && text[j] !== '[' && text[j] !== '\n') j--;
      if (j >= 4 && text.substring(j - 4, j) === '@url') {
        return { start: i + 1, end: pos, query };
      }
    }
    return null;
  }

  function getCaretCoords() {
    const pos = editor.selectionStart;
    const mirror = document.createElement('div');
    const cs = getComputedStyle(editor);

    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
     'wordSpacing', 'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom',
     'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
     'borderLeftWidth', 'boxSizing', 'tabSize'].forEach(prop => {
      mirror.style[prop] = cs[prop];
    });
    mirror.style.position = 'absolute';
    mirror.style.top = '-9999px';
    mirror.style.left = '-9999px';
    mirror.style.width = editor.clientWidth + 'px';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflow = 'hidden';

    const textBefore = editor.value.substring(0, pos);
    mirror.appendChild(document.createTextNode(textBefore));

    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.appendChild(marker);

    document.body.appendChild(mirror);

    const editorRect = editor.getBoundingClientRect();
    const top = marker.offsetTop - editor.scrollTop + editorRect.top;
    const left = marker.offsetLeft - editor.scrollLeft + editorRect.left;

    document.body.removeChild(mirror);
    return { top, left };
  }

  function showAutocomplete() {
    // Try LaTeX first (always available inside math context)
    const latexCtx = getLatexQuery();
    if (latexCtx) {
      const latexResults = LatexCompletions.search(latexCtx.query);
      if (latexResults.length > 0) {
        acContext = latexCtx;
        acItems = latexResults.map(r => ({
          type: 'latex', label: '\\' + r.name, detail: r.detail,
          template: r.template, cursorOffset: r.cursorOffset
        }));
        acIndex = 0;
        acActive = true;
        renderAutocomplete();
        positionAutocomplete();
        return;
      }
    }

    // URL citation autocomplete
    const urlCtx = getUrlCiteQuery();
    if (urlCtx) {
      const urlResults = Citations.searchUrlStore(urlCtx.query);
      if (urlResults.length > 0) {
        acContext = urlCtx;
        acItems = urlResults.map(r => ({
          type: 'urlcite', url: r.url, label: r.url,
          detail: r.name || undefined
        }));
        acIndex = 0;
        acActive = true;
        renderAutocomplete();
        positionAutocomplete();
        return;
      }
      hideAutocomplete();
      return;
    }

    // Citations + Images
    const hasBib = Citations.getBibliographyCount() > 0;
    const hasImages = ImageStore.getCount() > 0;
    if (!hasBib && !hasImages) { hideAutocomplete(); return; }

    const ctx = getCiteQuery();
    if (!ctx) { hideAutocomplete(); return; }

    const results = [];

    if (hasBib) {
      Citations.searchEntries(ctx.query).forEach(r => {
        results.push({ type: 'cite', key: r.key, label: '@' + r.key, detail: r.preview });
      });
    }

    if (hasImages) {
      ImageStore.search(ctx.query).forEach(r => {
        results.push({ type: 'image', name: r.name, label: r.name, detail: 'Image' });
      });
    }

    if (results.length === 0) { hideAutocomplete(); return; }

    acContext = ctx;
    acItems = results.slice(0, 8);
    acIndex = 0;
    acActive = true;

    renderAutocomplete();
    positionAutocomplete();
  }

  function renderAutocomplete() {
    acDropdown.innerHTML = '';
    acItems.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'ac-item' + (i === acIndex ? ' ac-active' : '');

      const keySpan = document.createElement('span');
      keySpan.className = 'ac-key';
      keySpan.textContent = item.label;
      div.appendChild(keySpan);

      if (item.detail) {
        const detailSpan = document.createElement('span');
        detailSpan.className = 'ac-detail';
        detailSpan.textContent = item.detail;
        div.appendChild(detailSpan);
      }

      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectAutocompleteItem(i);
      });

      acDropdown.appendChild(div);
    });
    acDropdown.style.display = 'block';
  }

  function positionAutocomplete() {
    const coords = getCaretCoords();
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
    acDropdown.style.top = (coords.top + lineHeight + 2) + 'px';
    acDropdown.style.left = coords.left + 'px';

    const rect = acDropdown.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      acDropdown.style.left = (window.innerWidth - rect.width - 8) + 'px';
    }
    if (rect.bottom > window.innerHeight - 8) {
      acDropdown.style.top = (coords.top - rect.height - 2) + 'px';
    }
  }

  function selectAutocompleteItem(index) {
    if (!acContext || index < 0 || index >= acItems.length) return;
    const item = acItems[index];
    history.save();

    if (item.type === 'latex') {
      editor.setRangeText(item.template, acContext.start, acContext.end, 'end');
      if (item.cursorOffset > 0) {
        const newPos = editor.selectionStart - item.cursorOffset;
        editor.setSelectionRange(newPos, newPos);
      }
      hideAutocomplete();
      editor.dispatchEvent(new Event('input'));
      return;
    }

    if (item.type === 'urlcite') {
      // Find end of current bracket content (consume up to ])
      let endPos = acContext.end;
      const text = editor.value;
      while (endPos < text.length && text[endPos] !== ']' && text[endPos] !== '\n') endPos++;
      if (endPos < text.length && text[endPos] === ']') endPos++; // include ]
      editor.setRangeText(item.url + ']', acContext.start, endPos, 'end');
      hideAutocomplete();
      editor.dispatchEvent(new Event('input'));
      return;
    }

    let replacement;
    if (item.type === 'cite') {
      replacement = '@' + item.key;
    } else {
      replacement = '![][50](' + item.name + ')';
    }

    editor.setRangeText(replacement, acContext.start, acContext.end, 'end');
    hideAutocomplete();
    editor.dispatchEvent(new Event('input'));
  }

  function hideAutocomplete() {
    acActive = false;
    acItems = [];
    acIndex = 0;
    acContext = null;
    acDropdown.style.display = 'none';
  }

  editor.addEventListener('input', () => { showAutocomplete(); checkSizeTooltip(); });
  editor.addEventListener('click', () => { showAutocomplete(); checkSizeTooltip(); });

  /* ── Size Bracket Tooltip ── */
  const sizeTooltip = document.createElement('div');
  sizeTooltip.className = 'size-tooltip';
  sizeTooltip.textContent = 'Width in % (e.g., 50)';
  sizeTooltip.style.display = 'none';
  document.body.appendChild(sizeTooltip);

  function checkSizeTooltip() {
    if (acActive) { sizeTooltip.style.display = 'none'; return; }

    const pos = editor.selectionStart;
    if (pos !== editor.selectionEnd) { sizeTooltip.style.display = 'none'; return; }

    const text = editor.value;
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = text.indexOf('\n', pos);
    const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    const col = pos - lineStart;

    if (!/!\[[^\]]*\]\[[^\]]*$/.test(line.substring(0, col)) ||
        !/^[^\]]*\]/.test(line.substring(col))) {
      sizeTooltip.style.display = 'none';
      return;
    }

    const coords = getCaretCoords();
    sizeTooltip.style.top = (coords.top - 26) + 'px';
    sizeTooltip.style.left = coords.left + 'px';
    sizeTooltip.style.display = 'block';
  }

  editor.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      checkSizeTooltip();
    }
  });
  editor.addEventListener('blur', () => { sizeTooltip.style.display = 'none'; });

  /* ── Sidebar ── */
  const sidebar = document.querySelector('.sidebar');
  const sidebarList = document.getElementById('sidebar-list');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const newDocBtn = document.getElementById('new-doc-btn');

  // Restore collapsed state
  if (localStorage.getItem('tufte-sidebar-collapsed') === '1') {
    sidebar.classList.add('collapsed');
  }

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('tufte-sidebar-collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
  });

  function formatRelativeDate(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    return new Date(timestamp).toLocaleDateString();
  }

  function renderSidebar() {
    const docs = Documents.list();
    const activeId = Documents.getActiveId();
    sidebarList.innerHTML = '';

    docs.forEach(doc => {
      const item = document.createElement('div');
      item.className = 'sidebar-item' + (doc.name === activeId ? ' active' : '');

      const title = document.createElement('span');
      title.className = 'sidebar-item-title';
      title.textContent = doc.title || 'Untitled Document';
      item.appendChild(title);

      const date = document.createElement('span');
      date.className = 'sidebar-item-date';
      date.textContent = formatRelativeDate(doc.mtime);
      item.appendChild(date);

      const del = document.createElement('button');
      del.className = 'sidebar-item-delete';
      del.textContent = '\u00d7';
      del.title = 'Delete document';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete "' + (doc.title || 'Untitled Document') + '"?')) return;
        const result = await Documents.deleteDoc(doc.name);
        loadDocument(result);
        renderSidebar();
      });
      item.appendChild(del);

      item.addEventListener('click', () => {
        if (doc.name === activeId) return;
        switchDocument(doc.name);
      });

      sidebarList.appendChild(item);
    });
  }

  async function switchDocument(name) {
    // Flush pending save
    clearTimeout(saveTimer);
    await Documents.save(editor.value);

    const doc = await Documents.load(name);
    if (!doc) return;

    loadDocument(doc);
    hideAutocomplete();
    renderSidebar();
    editor.focus();
  }

  newDocBtn.addEventListener('click', async () => {
    // Save current document first
    clearTimeout(saveTimer);
    await Documents.save(editor.value);

    const doc = await Documents.create();
    loadDocument(doc);
    renderSidebar();

    // Focus title and select it for editing
    docTitle.focus();
    const range = document.createRange();
    range.selectNodeContents(docTitle);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  renderSidebar();

  /* ── Citation Style Toggle ── */
  const styleToggle = document.querySelector('.cite-style-toggle');

  function syncStyleToggle() {
    const current = Citations.getCitationStyle();
    styleToggle.querySelectorAll('.cite-style-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.citeStyle === current);
    });
  }

  syncStyleToggle();

  styleToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.cite-style-btn');
    if (!btn) return;
    Citations.setCitationStyle(btn.dataset.citeStyle);
    syncStyleToggle();
    updatePreview();
  });
})();
