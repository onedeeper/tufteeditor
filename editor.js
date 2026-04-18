/**
 * editor.js — App logic for the Tufte Editor
 *
 * Sections:
 *  1. Initialization
 *  2. Live Preview & Auto-save
 *  3. Double-click Preview -> Jump to Source
 *  4. Image Lightbox (zoom/pan viewer)
 *  5. Undo / Redo History
 *  6. Document Loading & Title Rename
 *  7. Toolbar Insertions
 *  8. View Toggle & Split Pane Resizer
 *  9. Export (HTML, Print, Copy Markdown)
 * 10. Keyboard Shortcuts
 * 11. Modals (Bibliography, Images)
 * 12. Autocomplete (LaTeX, Citations, Images, URLs)
 * 13. Size Bracket Tooltip
 * 14. Table Grid Picker & Context Menu
 * 15. Sidebar (Document List)
 * 16. Citation Style Toggle
 * 17. Appearance (Background Color & Font)
 */

(async function () {
  await ImageStore.init();
  await Citations.init();

  const editor    = document.getElementById('editor');
  const backdrop  = document.getElementById('editor-backdrop');
  const preview   = document.querySelector('#preview article');
  const wordCount = document.querySelector('.word-count');
  const docTitle  = document.querySelector('.doc-title');
  const app       = document.querySelector('.app');

  const SAVE_DELAY    = 1000;
  const PREVIEW_DELAY = 150;

  /* ── Highlight side/margin notes in the editor ── */

  function updateHighlights() {
    const text = editor.value;
    // Walk the text tracking brace depth so nested {...} (e.g. LaTeX \frac{1}{2}
    // inside a margin note) don't prematurely close the match.
    const noteStart = /\{(?:sn|mn):/g;
    let html = '';
    let lastEnd = 0;
    let m;
    while ((m = noteStart.exec(text)) !== null) {
      const start = m.index;
      let depth = 1;
      let j = start + m[0].length;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      if (depth !== 0) continue; // unclosed — leave unhighlighted
      html += escapeHtml(text.substring(lastEnd, start));
      html += '<mark>' + escapeHtml(text.substring(start, j)) + '</mark>';
      lastEnd = j;
      noteStart.lastIndex = j;
    }
    html += escapeHtml(text.substring(lastEnd));
    // Trailing newline ensures backdrop height matches textarea
    backdrop.innerHTML = html + '\n';
  }

  function syncBackdropScroll() {
    backdrop.scrollTop = editor.scrollTop;
    backdrop.scrollLeft = editor.scrollLeft;
  }

  editor.addEventListener('scroll', syncBackdropScroll);

  /* ── 1. Initialization ── */

  const initDoc = await Documents.init();

  editor.value = initDoc.content;
  docTitle.textContent = initDoc.title;
  updatePreview();
  updateWordCount();
  updateHighlights();
  editor.focus();

  /* ── 2. Live Preview & Auto-save ── */

  let previewTimer;
  let undoTimer;
  let saveTimer;

  editor.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      updatePreview();
      updateWordCount();
    }, PREVIEW_DELAY);
    scheduleSave();
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => history.save(), 400);
    showAutocomplete();
    checkSizeTooltip();
    updateHighlights();
  });

  editor.addEventListener('click', () => {
    showAutocomplete();
    checkSizeTooltip();
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
    const html = parseMarkdown(editor.value);
    preview.innerHTML = html;

    // Resolve local image references
    preview.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      const resolved = ImageStore.resolve(src);
      if (resolved) img.src = resolved;
    });

    renderMathAndCode(preview);
  }

  function updateWordCount() {
    const text = editor.value.replace(/[#*`\[\](){}>_~|\\$]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = text.split(/\s+/).filter(w => w.length > 0);
    wordCount.textContent = words.length + ' word' + (words.length !== 1 ? 's' : '');
  }

  /* ── 3. Double-click Preview -> Jump to Source ── */

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

    e.preventDefault();

    // Compute character offset of the target line
    const srcLines = editor.value.split('\n');
    let offset = 0;
    for (let i = 0; i < targetLine && i < srcLines.length; i++) {
      offset += srcLines[i].length + 1;
    }
    const lineEnd = offset + (srcLines[targetLine] ? srcLines[targetLine].length : 0);

    // If in preview-only mode, switch to split
    if (app.classList.contains('view-preview')) {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.view-btn[data-view="split"]').classList.add('active');
      app.className = 'app view-split';
    }

    // Defer to run after the browser finishes processing the dblclick event,
    // otherwise the browser's default word-selection overrides our setSelectionRange
    setTimeout(() => {
      editor.focus();
      editor.setSelectionRange(offset, offset);

      // Measure the cursor's visual position using the mirror-div technique,
      // then scroll the editor to center the target line
      const scrollBefore = editor.scrollTop;
      const caretCoords = getCaretCoords();
      const editorTop = editor.getBoundingClientRect().top;
      const caretInContent = caretCoords.top - editorTop + scrollBefore;
      editor.scrollTop = Math.max(0, caretInContent - editor.clientHeight / 3);

      // Select the full line for visual highlighting
      editor.setSelectionRange(offset, lineEnd);

      // Clear highlight on next user interaction
      function clearHighlight() {
        editor.setSelectionRange(editor.selectionStart, editor.selectionStart);
        editor.removeEventListener('keydown', clearHighlight);
        editor.removeEventListener('mousedown', clearHighlight);
      }
      editor.addEventListener('keydown', clearHighlight, { once: true });
      editor.addEventListener('mousedown', clearHighlight, { once: true });
    }, 0);
  });

  /* ── 4. Image Lightbox ── */

  const lightboxOverlay = document.createElement('div');
  lightboxOverlay.className = 'lightbox-overlay';
  lightboxOverlay.style.display = 'none';
  const lightboxImg = document.createElement('img');
  lightboxImg.className = 'lightbox-img';
  lightboxOverlay.appendChild(lightboxImg);
  document.body.appendChild(lightboxOverlay);

  // Pan/zoom state
  const lb = {
    scale: 1, x: 0, y: 0,
    dragging: false, didDrag: false,
    dragStartX: 0, dragStartY: 0, startX: 0, startY: 0
  };

  function openLightbox(src) {
    lb.scale = 1; lb.x = 0; lb.y = 0;
    lightboxImg.style.transform = '';
    lightboxImg.src = src;
    lightboxOverlay.style.display = 'flex';
  }

  function closeLightbox() {
    lightboxOverlay.style.display = 'none';
  }

  function updateLightboxTransform() {
    lightboxImg.style.transform = `translate(${lb.x}px, ${lb.y}px) scale(${lb.scale})`;
  }

  preview.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') openLightbox(e.target.src);
  });

  lightboxOverlay.addEventListener('click', () => {
    if (!lb.didDrag) closeLightbox();
  });

  lightboxOverlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    lb.scale = Math.max(0.5, Math.min(10, lb.scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    updateLightboxTransform();
  }, { passive: false });

  lightboxImg.addEventListener('mousedown', (e) => {
    e.preventDefault();
    lb.dragging = true;
    lb.didDrag = false;
    lb.dragStartX = e.clientX; lb.dragStartY = e.clientY;
    lb.startX = lb.x; lb.startY = lb.y;
  });

  document.addEventListener('mousemove', (e) => {
    if (!lb.dragging) return;
    if (Math.abs(e.clientX - lb.dragStartX) > 3 || Math.abs(e.clientY - lb.dragStartY) > 3) lb.didDrag = true;
    lb.x = lb.startX + (e.clientX - lb.dragStartX);
    lb.y = lb.startY + (e.clientY - lb.dragStartY);
    updateLightboxTransform();
  });

  document.addEventListener('mouseup', () => { lb.dragging = false; });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxOverlay.style.display !== 'none') closeLightbox();
  });

  /* ── 5. Undo / Redo History ── */

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
      updateHighlights();
      scheduleSave();
    }
  };

  history.save();

  /* ── 6. Document Loading & Title Rename ── */

  function loadDocument(doc) {
    editor.value = doc.content;
    docTitle.textContent = doc.title;
    history.reset();
    updatePreview();
    updateWordCount();
    updateHighlights();
  }

  document.getElementById('undo-btn').addEventListener('click', () => history.undo());
  document.getElementById('redo-btn').addEventListener('click', () => history.redo());

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      Documents.save(editor.value).catch(() => {});
      renderSidebar();
    }, SAVE_DELAY);
  }

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

  /* ── 7. Toolbar Insertions ── */

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

  /* ── 8. View Toggle & Split Pane Resizer ── */

  document.querySelector('.view-toggles').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    const view = btn.dataset.view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    app.className = 'app view-' + view;
  });

  const splitPane   = document.querySelector('.split-pane');
  const divider     = document.querySelector('.divider');
  const editorPane  = document.querySelector('.editor-pane');
  const previewPane = document.querySelector('.preview-pane');

  let resizing = false;

  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizing = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
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
    if (!resizing) return;
    resizing = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  /* ── 9. Export ── */

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
      const fullHTML = generateFullHTML(bodyHTML, title, getAppearanceCSS());
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

  /* ── 10. Keyboard Shortcuts ── */

  editor.addEventListener('keydown', (e) => {
    // Autocomplete navigation takes priority
    if (ac.active) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        ac.index = (ac.index + 1) % ac.items.length;
        renderAutocomplete();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        ac.index = (ac.index - 1 + ac.items.length) % ac.items.length;
        renderAutocomplete();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectAutocompleteItem(ac.index);
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
    // Ctrl/Cmd+B -> bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      insertSnippet(snippets.bold);
    }
    // Ctrl/Cmd+I -> italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      insertSnippet(snippets.italic);
    }
    // Ctrl/Cmd+Z -> undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      history.undo();
    }
    // Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y -> redo
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault();
      history.redo();
    }
    // Ctrl/Cmd+S -> save (prevent default)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      Documents.save(editor.value).catch(() => {});
    }
  });

  /* ── 11. Modals ── */

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

  /* Bibliography Modal */
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

  /* Image Modal */
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
    if (imgModal.style.display !== 'none') renderImageModal();
  });

  /* ── 12. Autocomplete ── */

  const acDropdown = document.getElementById('autocomplete');

  // Autocomplete state (reset between activations via hideAutocomplete)
  const ac = { active: false, items: [], index: 0, context: null };

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
    let i = pos - 1;
    while (i >= 0 && /[a-zA-Z]/.test(text[i])) i--;
    if (i < 0 || text[i] !== '\\') return null;
    if (!isInMathContext(text, i)) return null;
    const query = text.substring(i + 1, pos);
    return { start: i, end: pos, query };
  }

  function getUrlCiteQuery() {
    const pos = editor.selectionStart;
    if (pos !== editor.selectionEnd) return null;
    const text = editor.value;
    let i = pos - 1;
    while (i >= 0 && text[i] !== '[' && text[i] !== ']' && text[i] !== '\n') i--;
    if (i < 0 || text[i] !== '[') return null;
    const query = text.substring(i + 1, pos);
    // @url[query|
    if (i >= 4 && text.substring(i - 4, i) === '@url') {
      return { start: i + 1, end: pos, query };
    }
    // @url[name][query| (second bracket)
    if (i >= 1 && text[i - 1] === ']') {
      let j = i - 2;
      while (j >= 0 && text[j] !== '[' && text[j] !== '\n') j--;
      if (j >= 4 && text.substring(j - 4, j) === '@url') {
        return { start: i + 1, end: pos, query };
      }
    }
    return null;
  }

  /**
   * Measures the viewport-relative pixel position of the cursor in the editor.
   * Creates an off-screen mirror div that replicates the editor's styling and
   * text content up to the cursor, then reads the marker element's offset.
   */
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

  function activateAutocomplete(context, items) {
    ac.context = context;
    ac.items = items;
    ac.index = 0;
    ac.active = true;
    renderAutocomplete();
    positionAutocomplete();
  }

  function showAutocomplete() {
    // LaTeX (inside math context)
    const latexCtx = getLatexQuery();
    if (latexCtx) {
      const latexResults = LatexCompletions.search(latexCtx.query);
      if (latexResults.length > 0) {
        activateAutocomplete(latexCtx, latexResults.map(r => ({
          type: 'latex', label: '\\' + r.name, detail: r.detail,
          template: r.template, cursorOffset: r.cursorOffset
        })));
        return;
      }
    }

    // URL citations
    const urlCtx = getUrlCiteQuery();
    if (urlCtx) {
      const urlResults = Citations.searchUrlStore(urlCtx.query);
      if (urlResults.length > 0) {
        activateAutocomplete(urlCtx, urlResults.map(r => ({
          type: 'urlcite', url: r.url, label: r.url,
          detail: r.name || undefined
        })));
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

    activateAutocomplete(ctx, results.slice(0, 8));
  }

  function renderAutocomplete() {
    acDropdown.innerHTML = '';
    ac.items.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'ac-item' + (i === ac.index ? ' ac-active' : '');

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

    // Keep dropdown within viewport
    const rect = acDropdown.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      acDropdown.style.left = (window.innerWidth - rect.width - 8) + 'px';
    }
    if (rect.bottom > window.innerHeight - 8) {
      acDropdown.style.top = (coords.top - rect.height - 2) + 'px';
    }
  }

  function selectAutocompleteItem(index) {
    if (!ac.context || index < 0 || index >= ac.items.length) return;
    const item = ac.items[index];
    history.save();

    if (item.type === 'latex') {
      editor.setRangeText(item.template, ac.context.start, ac.context.end, 'end');
      if (item.cursorOffset > 0) {
        const newPos = editor.selectionStart - item.cursorOffset;
        editor.setSelectionRange(newPos, newPos);
      }
      hideAutocomplete();
      editor.dispatchEvent(new Event('input'));
      return;
    }

    if (item.type === 'urlcite') {
      // Consume up to closing bracket
      let endPos = ac.context.end;
      const text = editor.value;
      while (endPos < text.length && text[endPos] !== ']' && text[endPos] !== '\n') endPos++;
      if (endPos < text.length && text[endPos] === ']') endPos++;
      editor.setRangeText(item.url + ']', ac.context.start, endPos, 'end');
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

    editor.setRangeText(replacement, ac.context.start, ac.context.end, 'end');
    hideAutocomplete();
    editor.dispatchEvent(new Event('input'));
  }

  function hideAutocomplete() {
    ac.active = false;
    ac.items = [];
    ac.index = 0;
    ac.context = null;
    acDropdown.style.display = 'none';
  }

  /* ── 13. Size Bracket Tooltip ── */

  const sizeTooltip = document.createElement('div');
  sizeTooltip.className = 'size-tooltip';
  sizeTooltip.textContent = 'Width in % (e.g., 50)';
  sizeTooltip.style.display = 'none';
  document.body.appendChild(sizeTooltip);

  function checkSizeTooltip() {
    if (ac.active) { sizeTooltip.style.display = 'none'; return; }

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

  /* ── 14. Table Grid Picker & Context Menu ── */

  const tableBtn = document.getElementById('table-btn');
  const gridPicker = document.getElementById('table-grid-picker');
  const gridContainer = document.getElementById('grid-picker-grid');
  const gridLabel = gridPicker.querySelector('.grid-picker-label');

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      gridContainer.appendChild(cell);
    }
  }

  const gridCells = gridContainer.querySelectorAll('.grid-cell');

  function highlightGrid(row, col) {
    gridCells.forEach(cell => {
      const r = parseInt(cell.dataset.row);
      const c = parseInt(cell.dataset.col);
      cell.classList.toggle('highlight', r <= row && c <= col);
    });
    gridLabel.textContent = (col + 1) + ' \u00d7 ' + (row + 1);
  }

  gridContainer.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    highlightGrid(parseInt(cell.dataset.row), parseInt(cell.dataset.col));
  });

  gridContainer.addEventListener('click', (e) => {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    const rows = parseInt(cell.dataset.row) + 1;
    const cols = parseInt(cell.dataset.col) + 1;
    insertTable(rows, cols);
    closeGridPicker();
  });

  tableBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (gridPicker.classList.contains('open')) {
      closeGridPicker();
      return;
    }
    const rect = tableBtn.getBoundingClientRect();
    gridPicker.style.top = (rect.bottom + 4) + 'px';
    gridPicker.style.left = rect.left + 'px';
    gridLabel.textContent = 'Insert Table';
    gridCells.forEach(c => c.classList.remove('highlight'));
    gridPicker.classList.add('open');
  });

  function closeGridPicker() {
    gridPicker.classList.remove('open');
  }

  document.addEventListener('click', (e) => {
    if (!gridPicker.contains(e.target) && e.target !== tableBtn) closeGridPicker();
  });

  document.addEventListener('scroll', closeGridPicker, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gridPicker.classList.contains('open')) closeGridPicker();
  });

  function insertTable(rows, cols) {
    history.save();
    editor.focus();
    const start = editor.selectionStart;

    let prefix = '';
    if (start > 0 && editor.value[start - 1] !== '\n') prefix = '\n';

    let table = prefix + '|';
    for (let c = 0; c < cols; c++) table += ' Header ' + (c + 1) + ' |';
    table += '\n';

    table += '|';
    for (let c = 0; c < cols; c++) table += ' --- |';
    table += '\n';

    for (let r = 0; r < rows; r++) {
      table += '|';
      for (let c = 0; c < cols; c++) table += '  |';
      table += '\n';
    }

    editor.setRangeText(table, start, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  }

  /* Table Context Detection */

  function getTableContext() {
    const pos = editor.selectionStart;
    const text = editor.value;
    const allLines = text.split('\n');

    // Find which line the cursor is on
    let charCount = 0;
    let cursorLine = 0;
    for (let i = 0; i < allLines.length; i++) {
      if (charCount + allLines[i].length >= pos) {
        cursorLine = i;
        break;
      }
      charCount += allLines[i].length + 1;
    }

    if (!/^\|/.test(allLines[cursorLine].trim())) return null;

    // Expand to find table boundaries
    let tableStartLine = cursorLine;
    while (tableStartLine > 0 && /^\|/.test(allLines[tableStartLine - 1].trim())) {
      tableStartLine--;
    }
    let tableEndLine = cursorLine;
    while (tableEndLine < allLines.length - 1 && /^\|/.test(allLines[tableEndLine + 1].trim())) {
      tableEndLine++;
    }

    // Validate: need at least 2 lines and second line must be separator
    const tableLines = allLines.slice(tableStartLine, tableEndLine + 1);
    if (tableLines.length < 2) return null;
    if (!/^\|[\s\-:|]+\|$/.test(tableLines[1].trim())) return null;

    // Compute char offsets for the table block
    let tableCharStart = 0;
    for (let i = 0; i < tableStartLine; i++) tableCharStart += allLines[i].length + 1;
    let tableCharEnd = tableCharStart;
    for (let i = tableStartLine; i <= tableEndLine; i++) tableCharEnd += allLines[i].length + 1;

    // Row and column index relative to the table
    const tableRowIdx = cursorLine - tableStartLine;
    const lineStart = charCount;
    const cursorCol = pos - lineStart;
    const lineUpToCursor = allLines[cursorLine].substring(0, cursorCol);
    const colIdx = (lineUpToCursor.match(/\|/g) || []).length - 1;

    return {
      tableStartLine,
      tableEndLine,
      tableCharStart,
      tableCharEnd,
      tableRowIdx,
      colIdx: Math.max(0, colIdx),
      lines: tableLines
    };
  }

  /* Table Context Menu */

  const contextMenu = document.getElementById('table-context-menu');

  editor.addEventListener('contextmenu', (e) => {
    const ctx = getTableContext();
    if (!ctx) {
      contextMenu.classList.remove('open');
      return;
    }

    e.preventDefault();
    contextMenu._tableCtx = ctx;

    contextMenu.style.top = e.clientY + 'px';
    contextMenu.style.left = e.clientX + 'px';

    const rowCount = ctx.lines.length - 2;
    const colCount = parseTableRow(ctx.lines[0]).length;

    const deleteRowBtn = contextMenu.querySelector('[data-action="delete-row"]');
    const deleteColBtn = contextMenu.querySelector('[data-action="delete-col"]');

    deleteRowBtn.disabled = ctx.tableRowIdx <= 1 || rowCount <= 1;
    deleteColBtn.disabled = colCount <= 1;

    contextMenu.classList.add('open');

    // Keep menu within viewport
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = (e.clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = (e.clientY - rect.height) + 'px';
    }
  });

  document.addEventListener('click', () => {
    contextMenu.classList.remove('open');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') contextMenu.classList.remove('open');
  });

  function rebuildTableText(rows) {
    return rows.map(cells => '| ' + cells.join(' | ') + ' |').join('\n') + '\n';
  }

  contextMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const ctx = contextMenu._tableCtx;
    if (!ctx) return;

    contextMenu.classList.remove('open');
    history.save();

    const parsed = ctx.lines.map(line => parseTableRow(line));
    const colCount = parsed[0].length;

    switch (action) {
      case 'add-row-above': {
        const emptyRow = new Array(colCount).fill('');
        const insertIdx = ctx.tableRowIdx < 2 ? 2 : ctx.tableRowIdx;
        parsed.splice(insertIdx, 0, emptyRow);
        break;
      }
      case 'add-row-below': {
        const emptyRow = new Array(colCount).fill('');
        const insertIdx = ctx.tableRowIdx < 2 ? 2 : ctx.tableRowIdx + 1;
        parsed.splice(insertIdx, 0, emptyRow);
        break;
      }
      case 'add-col-left': {
        parsed.forEach((row, i) => {
          if (i === 0) row.splice(ctx.colIdx, 0, 'Header');
          else if (i === 1) row.splice(ctx.colIdx, 0, '---');
          else row.splice(ctx.colIdx, 0, '');
        });
        break;
      }
      case 'add-col-right': {
        const insertIdx = ctx.colIdx + 1;
        parsed.forEach((row, i) => {
          if (i === 0) row.splice(insertIdx, 0, 'Header');
          else if (i === 1) row.splice(insertIdx, 0, '---');
          else row.splice(insertIdx, 0, '');
        });
        break;
      }
      case 'delete-row': {
        if (ctx.tableRowIdx >= 2) parsed.splice(ctx.tableRowIdx, 1);
        break;
      }
      case 'delete-col': {
        parsed.forEach(row => row.splice(ctx.colIdx, 1));
        break;
      }
      case 'delete-table': {
        editor.setRangeText('', ctx.tableCharStart, ctx.tableCharEnd, 'end');
        editor.dispatchEvent(new Event('input'));
        return;
      }
    }

    const newText = rebuildTableText(parsed);
    editor.setRangeText(newText, ctx.tableCharStart, ctx.tableCharEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  });

  /* ── 15. Sidebar (Document List & Folders) ── */

  const sidebar = document.querySelector('.sidebar');
  const sidebarList = document.getElementById('sidebar-list');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const newDocBtn = document.getElementById('new-doc-btn');
  const newFolderBtn = document.getElementById('new-folder-btn');
  const docContextMenu = document.getElementById('doc-context-menu');

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

  function createDocItem(doc, activeId) {
    const item = document.createElement('div');
    item.className = 'sidebar-item' + (doc.name === activeId ? ' active' : '');
    item.setAttribute('draggable', 'true');

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

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showDocContextMenu(e, doc);
    });

    // Drag-and-drop: drag this doc to a folder
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', doc.name);
      e.dataTransfer.effectAllowed = 'move';
      item.classList.add('dragging');
      sidebarList.classList.add('drag-active');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      sidebarList.classList.remove('drag-active');
      sidebarList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    return item;
  }

  function showDocContextMenu(event, doc) {
    const folders = Documents.listFolders();
    docContextMenu.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'context-menu-header';
    header.textContent = 'Move to';
    docContextMenu.appendChild(header);

    // "Root" option if doc is in a folder
    if (doc.folder) {
      const btn = document.createElement('button');
      btn.textContent = 'Root';
      btn.addEventListener('click', async () => {
        docContextMenu.classList.remove('open');
        try {
          await Documents.moveToFolder(doc.name, '');
          renderSidebar();
        } catch (err) { alert(err.message); }
      });
      docContextMenu.appendChild(btn);
    }

    // Folder options (excluding current folder)
    folders.filter(f => f !== doc.folder).forEach(folder => {
      const btn = document.createElement('button');
      btn.textContent = folder;
      btn.addEventListener('click', async () => {
        docContextMenu.classList.remove('open');
        try {
          await Documents.moveToFolder(doc.name, folder);
          renderSidebar();
        } catch (err) { alert(err.message); }
      });
      docContextMenu.appendChild(btn);
    });

    // No targets available
    if (!doc.folder && folders.filter(f => f !== doc.folder).length === 0) {
      const empty = document.createElement('button');
      empty.textContent = 'No folders available';
      empty.disabled = true;
      docContextMenu.appendChild(empty);
    }

    docContextMenu.style.left = event.clientX + 'px';
    docContextMenu.style.top = event.clientY + 'px';
    docContextMenu.classList.add('open');

    function closeMenu(e) {
      if (!docContextMenu.contains(e.target)) {
        docContextMenu.classList.remove('open');
        document.removeEventListener('mousedown', closeMenu);
      }
    }
    setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
  }

  function renderSidebar() {
    const docs = Documents.list();
    const folders = Documents.listFolders();
    const activeId = Documents.getActiveId();
    const collapsedFolders = JSON.parse(localStorage.getItem('tufte-folders-collapsed') || '{}');

    sidebarList.innerHTML = '';

    // Root drop zone (visible only during drag)
    const rootDrop = document.createElement('div');
    rootDrop.className = 'sidebar-root-drop';
    rootDrop.textContent = 'Drop here for root';
    rootDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      rootDrop.classList.add('drag-over');
    });
    rootDrop.addEventListener('dragleave', () => {
      rootDrop.classList.remove('drag-over');
    });
    rootDrop.addEventListener('drop', async (e) => {
      e.preventDefault();
      rootDrop.classList.remove('drag-over');
      const docName = e.dataTransfer.getData('text/plain');
      if (!docName) return;
      const entry = Documents.list().find(d => d.name === docName);
      if (!entry || !entry.folder) return;
      try {
        await Documents.moveToFolder(docName, '');
        renderSidebar();
      } catch (err) { alert(err.message); }
    });
    sidebarList.appendChild(rootDrop);

    // Root docs (no folder), sorted by mtime (server already sorts)
    const rootDocs = docs.filter(d => !d.folder);
    rootDocs.forEach(doc => sidebarList.appendChild(createDocItem(doc, activeId)));

    // Collect all folder names (from API + any referenced in docs)
    const allFolderNames = new Set(folders);
    docs.forEach(d => { if (d.folder) allFolderNames.add(d.folder); });
    const sortedFolders = [...allFolderNames].sort();

    sortedFolders.forEach(folder => {
      const folderDocs = docs.filter(d => d.folder === folder);
      const isCollapsed = !!collapsedFolders[folder];

      const folderEl = document.createElement('div');
      folderEl.className = 'sidebar-folder';

      // Folder header
      const header = document.createElement('div');
      header.className = 'sidebar-folder-header';

      const arrow = document.createElement('span');
      arrow.className = 'sidebar-folder-arrow' + (isCollapsed ? '' : ' expanded');
      arrow.textContent = '\u25B6';
      header.appendChild(arrow);

      const nameEl = document.createElement('span');
      nameEl.className = 'sidebar-folder-name';
      nameEl.textContent = folder;
      header.appendChild(nameEl);

      const countEl = document.createElement('span');
      countEl.className = 'sidebar-folder-count';
      countEl.textContent = folderDocs.length;
      header.appendChild(countEl);

      // Add doc to folder
      const addBtn = document.createElement('button');
      addBtn.className = 'sidebar-folder-add';
      addBtn.textContent = '+';
      addBtn.title = 'New document in ' + folder;
      addBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        clearTimeout(saveTimer);
        await Documents.save(editor.value);
        const doc = await Documents.create(null, folder);
        loadDocument(doc);
        collapsedFolders[folder] = false;
        localStorage.setItem('tufte-folders-collapsed', JSON.stringify(collapsedFolders));
        renderSidebar();
        docTitle.focus();
        const range = document.createRange();
        range.selectNodeContents(docTitle);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      header.appendChild(addBtn);

      // Delete folder
      const del = document.createElement('button');
      del.className = 'sidebar-folder-delete';
      del.textContent = '\u00d7';
      del.title = 'Delete folder';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const docCount = folderDocs.length;
        const msg = docCount > 0
          ? 'Delete folder "' + folder + '" and its ' + docCount + ' document' + (docCount !== 1 ? 's' : '') + '?'
          : 'Delete empty folder "' + folder + '"?';
        if (!confirm(msg)) return;
        try {
          await Documents.deleteFolder(folder);
          // If active doc was deleted, load the new active or create one
          const remaining = Documents.list();
          if (remaining.length > 0) {
            const doc = await Documents.load(Documents.getActiveId());
            if (doc) loadDocument(doc);
          } else {
            const doc = await Documents.create();
            loadDocument(doc);
          }
          renderSidebar();
        } catch (err) { alert(err.message); }
      });
      header.appendChild(del);

      header.addEventListener('click', () => {
        collapsedFolders[folder] = !collapsedFolders[folder];
        localStorage.setItem('tufte-folders-collapsed', JSON.stringify(collapsedFolders));
        renderSidebar();
      });

      // Drop target: accept docs dragged onto this folder
      header.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        header.classList.add('drag-over');
      });
      header.addEventListener('dragleave', () => {
        header.classList.remove('drag-over');
      });
      header.addEventListener('drop', async (e) => {
        e.preventDefault();
        header.classList.remove('drag-over');
        const docName = e.dataTransfer.getData('text/plain');
        if (!docName) return;
        const entry = Documents.list().find(d => d.name === docName);
        if (!entry || entry.folder === folder) return;
        try {
          await Documents.moveToFolder(docName, folder);
          collapsedFolders[folder] = false;
          localStorage.setItem('tufte-folders-collapsed', JSON.stringify(collapsedFolders));
          renderSidebar();
        } catch (err) { alert(err.message); }
      });

      folderEl.appendChild(header);

      // Folder items (if expanded)
      if (!isCollapsed) {
        const items = document.createElement('div');
        items.className = 'sidebar-folder-items';
        folderDocs.forEach(doc => items.appendChild(createDocItem(doc, activeId)));
        folderEl.appendChild(items);
      }

      sidebarList.appendChild(folderEl);
    });
  }

  async function switchDocument(name) {
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
    clearTimeout(saveTimer);
    await Documents.save(editor.value);

    const doc = await Documents.create();
    loadDocument(doc);
    renderSidebar();

    docTitle.focus();
    const range = document.createRange();
    range.selectNodeContents(docTitle);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  newFolderBtn.addEventListener('click', async () => {
    const name = prompt('Folder name:');
    if (!name || !name.trim()) return;
    try {
      await Documents.createFolder(name.trim());
      renderSidebar();
    } catch (err) {
      alert(err.message);
    }
  });

  renderSidebar();

  /* ── 16. Citation Style Toggle ── */

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

  /* ── 17. Appearance (Background Color & Font) ── */

  const APPEARANCE_DEFAULTS = { bg: '#fffff8', color: '#111111', font: 'et-book' };

  const BUILTIN_FONTS = {
    'et-book':      'et-book, Palatino, "Palatino Linotype", "Palatino LT STD", "Book Antiqua", Georgia, serif',
    'palatino':     'Palatino, "Palatino Linotype", "Palatino LT STD", "Book Antiqua", Georgia, serif',
    'georgia':      'Georgia, "Times New Roman", serif',
    'times':        '"Times New Roman", Times, serif',
    'garamond':     'Garamond, "EB Garamond", Georgia, serif',
    'system-sans':  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const uploadedFonts = new Map(); // filename -> family name

  const bgColorInput   = document.getElementById('bg-color-input');
  const fontColorInput = document.getElementById('font-color-input');
  const fontSelect     = document.getElementById('font-select');
  const fontUploadBtn  = document.getElementById('font-upload-btn');
  const fontFileInput  = document.getElementById('font-file-input');

  function setCSSVar(name, value) {
    document.documentElement.style.setProperty(name, value);
  }

  /* Color pickers: live CSS update on input, persist on change */

  bgColorInput.addEventListener('input', () => setCSSVar('--preview-bg', bgColorInput.value));
  bgColorInput.addEventListener('change', () => localStorage.setItem('tufte-preview-bg', bgColorInput.value));

  fontColorInput.addEventListener('input', () => setCSSVar('--preview-color', fontColorInput.value));
  fontColorInput.addEventListener('change', () => localStorage.setItem('tufte-preview-color', fontColorInput.value));

  /* Font helpers */

  function fontNameFromFile(filename) {
    return filename.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[-_]/g, ' ');
  }

  function fontFormatHint(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[ext] || '';
  }

  function buildFontFaceCSS(filename) {
    const familyName = fontNameFromFile(filename);
    const format = fontFormatHint(filename);
    const formatSrc = format ? ` format("${format}")` : '';
    return `@font-face { font-family: "${familyName}"; src: url("/fonts/${encodeURIComponent(filename)}")${formatSrc}; }`;
  }

  function registerUploadedFont(filename) {
    if (uploadedFonts.has(filename)) return;
    const styleEl = document.createElement('style');
    styleEl.textContent = buildFontFaceCSS(filename);
    document.head.appendChild(styleEl);
    uploadedFonts.set(filename, fontNameFromFile(filename));
  }

  function getFontStack(key) {
    if (BUILTIN_FONTS[key]) return BUILTIN_FONTS[key];
    const familyName = uploadedFonts.get(key);
    if (familyName) return `"${familyName}", serif`;
    return BUILTIN_FONTS['et-book'];
  }

  /**
   * Builds extra CSS for HTML export reflecting current appearance.
   * Reads from live UI state (input elements / select) rather than localStorage.
   */
  function getAppearanceCSS() {
    const parts = [];
    const bg = bgColorInput.value;
    if (bg !== APPEARANCE_DEFAULTS.bg) {
      parts.push(`body { background-color: ${bg}; }`);
      parts.push(`a:link, a:visited { text-shadow: 0.03em 0 ${bg}, -0.03em 0 ${bg}, 0 0.03em ${bg}, 0 -0.03em ${bg}; }`);
    }
    const color = fontColorInput.value;
    if (color !== APPEARANCE_DEFAULTS.color) {
      parts.push(`body { color: ${color}; }`);
    }
    const fontKey = fontSelect.value;
    if (fontKey !== APPEARANCE_DEFAULTS.font) {
      parts.push(`body { font-family: ${getFontStack(fontKey)}; }`);
    }
    if (uploadedFonts.has(fontKey)) {
      parts.push(buildFontFaceCSS(fontKey));
    }
    return parts.join(' ');
  }

  /* Font select */

  function rebuildFontSelect(selectedKey) {
    fontSelect.querySelectorAll('option[data-uploaded]').forEach(o => o.remove());
    uploadedFonts.forEach((familyName, filename) => {
      const opt = document.createElement('option');
      opt.value = filename;
      opt.textContent = familyName;
      opt.dataset.uploaded = '1';
      fontSelect.appendChild(opt);
    });
    if (selectedKey) fontSelect.value = selectedKey;
  }

  fontSelect.addEventListener('change', () => {
    setCSSVar('--preview-font', getFontStack(fontSelect.value));
    localStorage.setItem('tufte-preview-font', fontSelect.value);
  });

  /* Font Upload */

  fontUploadBtn.addEventListener('click', () => fontFileInput.click());

  fontFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const res = await fetch('/api/fonts', {
      method: 'POST',
      headers: { 'X-Filename': file.name },
      body: file,
    });
    if (!res.ok) return;
    const { name } = await res.json();
    registerUploadedFont(name);
    rebuildFontSelect(name);
    setCSSVar('--preview-font', getFontStack(name));
    localStorage.setItem('tufte-preview-font', name);
    fontFileInput.value = '';
  });

  /* Initialize Appearance — restore saved state without re-persisting */

  async function initAppearance() {
    try {
      const res = await fetch('/api/fonts');
      const fonts = await res.json();
      fonts.forEach(registerUploadedFont);
    } catch (e) { /* no fonts yet */ }

    const savedBg = localStorage.getItem('tufte-preview-bg');
    if (savedBg) bgColorInput.value = savedBg;
    setCSSVar('--preview-bg', bgColorInput.value);

    const savedColor = localStorage.getItem('tufte-preview-color');
    if (savedColor) fontColorInput.value = savedColor;
    setCSSVar('--preview-color', fontColorInput.value);

    const savedFont = localStorage.getItem('tufte-preview-font');
    if (savedFont && (BUILTIN_FONTS[savedFont] || uploadedFonts.has(savedFont))) {
      rebuildFontSelect(savedFont);
    } else {
      rebuildFontSelect(APPEARANCE_DEFAULTS.font);
    }
    setCSSVar('--preview-font', getFontStack(fontSelect.value));
  }

  initAppearance();
})();
