/**
 * editor.js — App logic
 * Live preview, toolbar, view toggle, resizer, localStorage, export
 */

(async function () {
  await ImageStore.init();

  const editor    = document.getElementById('editor');
  const preview   = document.querySelector('#preview article');
  const wordCount = document.querySelector('.word-count');
  const docTitle  = document.querySelector('.doc-title');
  const app       = document.querySelector('.app');

  const SAVE_DELAY    = 1000;
  const PREVIEW_DELAY = 150;

  /* ── Starter Content ── */
  const STARTER = `# Tufte Markdown Editor

## Getting Started

{newthought:Welcome to the Tufte Markdown Editor.} This split-pane editor lets you write in an extended Markdown syntax and see a live preview styled with Edward Tufte's elegant CSS.

All five custom tokens are demonstrated below, along with standard Markdown formatting.

## Sidenotes and Margin Notes

Sidenotes are like footnotes, but better — they appear in the margin right next to the relevant text.{sn:This is a sidenote. It appears in the margin and is numbered automatically.} They keep the reader's eye on the page instead of forcing them to jump to the bottom.

Margin notes are similar but unnumbered.{mn:This is a margin note. It uses the ⊕ symbol as a toggle on mobile devices.} Use them for supplementary commentary that doesn't need a numbered reference.

## New Thoughts

{newthought:A new thought} marks the beginning of a new section within a larger discussion. It renders the opening words in small caps, a classic Tufte convention.

## Epigraphs

> The purpose of computing is insight, not numbers.
> — Richard Hamming

Epigraphs set the tone for a section with a quotation and attribution.

## Full-width Figures

Standard images are set within the article width. Use \`![caption][size](url)\` where size is a percentage:

![A standard figure caption][60](https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/300px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg)

Full-width images stretch across the entire page:

![A full-width figure caption][100](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camille_Pissarro_-_Boulevard_Montmartre_-_Eremitage.jpg/1280px-Camille_Pissarro_-_Boulevard_Montmartre_-_Eremitage.jpg){fullwidth}

## Standard Markdown

You can use all the usual formatting: **bold text**, *italic text*, \`inline code\`, and [hyperlinks](https://edwardtufte.github.io/tufte-css/).

### Code Blocks

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

### Lists

- First item
- Second item with **bold**
- Third item

1. Ordered first
2. Ordered second
3. Ordered third

---

## Citations

Load a BibTeX file using the **Bib** button in the toolbar, then cite references inline with \`@key\` syntax. For example, @tufte2001 produces a numbered citation linked to the references section.

You can also cite URLs directly: @url[https://edwardtufte.github.io/tufte-css/] will create a reference entry for that URL.

Unknown keys like @nonexistent will show an error indicator. Toggle between numbered [1] and APA (Author, Year) styles using the toggle in the top bar.

---

{newthought:That covers the basics.} Try editing the text on the left and watch the preview update in real time. Use the toolbar buttons to insert any of the custom tokens.`;

  /* ── How to Use Guide ── */
  const GUIDE = `# How to Use Tufte Editor

## The Interface

{newthought:The editor is a split-pane layout.} The left pane is where you write in Markdown, and the right pane shows a live preview styled with Tufte CSS. Use the **Edit**, **Split**, and **Preview** buttons in the top bar to switch between views. Drag the divider to resize the panes.

## Documents

The sidebar on the left lists all your documents. Click **+ New** to create a new document, or click any document to switch to it. Click the title at the top to rename a document. Documents are saved automatically as you type.

## Writing

You can use standard Markdown: **bold**, *italic*, \`inline code\`, [links](url), headings with \`#\`, lists with \`-\` or \`1.\`, blockquotes with \`>\`, code blocks with triple backticks, and horizontal rules with \`---\`.

## Tufte Tokens

Beyond standard Markdown, this editor supports five tokens from Tufte's typographic style. You can type them manually or use the toolbar buttons.

### Sidenotes

Add numbered notes in the margin with \`{sn:Your note text}\`. Place them inline right after the word they annotate.{sn:Like this sidenote right here.}

### Margin Notes

Add unnumbered margin notes with \`{mn:Your note text}\`.{mn:Margin notes work just like sidenotes but without a number.} Use these for supplementary remarks that don't need a reference number.

### New Thoughts

Mark the start of a new train of thought with \`{newthought:Opening words}\`. {newthought:This renders} the opening words in small caps.

### Epigraphs

Write a blockquote with an attribution line starting with \`--\` or \`—\`:

> It is not enough to do your best; you must know what to do, and then do your best.
> — W. Edwards Deming

## Images

### From a URL

Use the syntax \`![caption][width%](url)\`:

- \`![My photo][50](https://example.com/photo.jpg)\` — 50% width
- \`![Wide shot][100](url){fullwidth}\` — full-width figure
- \`![Detail][100](url){margin}\` — margin figure

The \`[width%]\` bracket is optional; omit it for default sizing.

### Uploaded Images

Click the **Upload** button in the toolbar to upload images from your computer. Uploaded images persist across sessions — you won't need to re-upload them after refreshing the page.

Once uploaded, reference an image by its filename: \`![caption][50](photo.jpg)\`. As you type \`@\` in the editor, autocomplete will suggest uploaded image filenames alongside citation keys.

## Citations

### Loading a Bibliography

Click the **Bib** button in the toolbar to open the bibliography modal. Paste BibTeX entries or load a \`.bib\` file, then click **Apply**.

### Citing References

Once loaded, cite a reference inline with \`@citekey\` — for example, \`@tufte2001\`. Autocomplete will suggest matching keys as you type after \`@\`.

To cite a URL directly, use \`@url[https://example.com]\`. A references section is generated automatically at the bottom of the document.

Toggle between **[1]** numbered and **APA** citation styles using the toggle in the top bar.

## Keyboard Shortcuts

- **Ctrl/Cmd + B** — Bold
- **Ctrl/Cmd + I** — Italic
- **Ctrl/Cmd + Z** — Undo
- **Ctrl/Cmd + Shift + Z** — Redo
- **Ctrl/Cmd + S** — Force save
- **Tab** — Insert two spaces

## Exporting

Click **Export** in the top bar for three options:

- **Download HTML** — A standalone \`.html\` file with Tufte CSS, ready to open in any browser or host anywhere. Uploaded images are inlined automatically.
- **Print / PDF** — Opens the browser print dialog. Use "Save as PDF" for a PDF export.
- **Copy Markdown** — Copies the raw Markdown source to your clipboard.`;

  /* ── Restore / Init ── */
  const initDoc = Documents.init(STARTER);

  // On first run, also create the how-to-use guide
  if (Documents.list().length === 1) {
    Documents.create('How to Use Tufte Editor', GUIDE);
    Documents.load(initDoc.id);
  }

  editor.value = initDoc.content;
  docTitle.textContent = initDoc.title;
  updatePreview();
  updateWordCount();

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
  }

  function updateWordCount() {
    const text = editor.value
      .replace(/\{(sn|mn|newthought):([^}]*)\}/g, '$2')
      .replace(/[#*`\[\](){}!>-]/g, ' ');
    const words = text.split(/\s+/).filter(w => w.length > 0);
    wordCount.textContent = words.length + ' word' + (words.length !== 1 ? 's' : '');
  }

  /* ── Undo / Redo ── */
  const history = {
    states: [],
    pointer: -1,
    MAX: 200,

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

  document.getElementById('undo-btn').addEventListener('click', () => history.undo());
  document.getElementById('redo-btn').addEventListener('click', () => history.redo());

  /* ── Auto-save ── */
  let saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      Documents.save(editor.value);
      renderSidebar();
    }, SAVE_DELAY);
  }

  docTitle.addEventListener('input', () => {
    Documents.saveTitle(docTitle.textContent.trim());
    renderSidebar();
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
    // Use execCommand for undo support where available, fall back to direct manipulation
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
  const divider   = document.querySelector('.divider');
  const editorPane = document.querySelector('.editor-pane');
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
    const container = document.querySelector('.split-pane');
    const rect = container.getBoundingClientRect();
    const isVertical = window.innerWidth <= 640;

    if (isVertical) {
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      const clamped = Math.max(20, Math.min(80, pct));
      editorPane.style.flex = `0 0 ${clamped}%`;
      previewPane.style.flex = `0 0 ${100 - clamped}%`;
    } else {
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(20, Math.min(80, pct));
      editorPane.style.flex = `0 0 ${clamped}%`;
      previewPane.style.flex = `0 0 ${100 - clamped}%`;
    }
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

  exportMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-export]');
    if (!btn) return;
    exportMenu.classList.remove('open');
    const action = btn.dataset.export;

    if (action === 'html') {
      const title = docTitle.textContent.trim() || 'Untitled';
      let bodyHTML = parseMarkdown(editor.value);
      if (ImageStore.getCount() > 0) bodyHTML = ImageStore.resolveInHTML(bodyHTML);
      const fullHTML = generateFullHTML(bodyHTML, title);
      const blob = new Blob([fullHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = title.replace(/[^a-zA-Z0-9 _-]/g, '') + '.html';
      a.click();
      URL.revokeObjectURL(url);
    }

    if (action === 'print') {
      window.print();
    }

    if (action === 'markdown') {
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
      Documents.save(editor.value);
    }
  });

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

  bibBtn.addEventListener('click', () => {
    bibText.value = '';
    bibFile.value = '';
    updateBibStatus();
    bibModal.style.display = 'flex';
  });

  bibCancel.addEventListener('click', () => {
    bibModal.style.display = 'none';
  });

  bibModal.addEventListener('click', (e) => {
    if (e.target === bibModal) bibModal.style.display = 'none';
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
    const count = Citations.loadBibliography(text);
    updateBibStatus();
    bibModal.style.display = 'none';
    updatePreview();
  });

  bibClear.addEventListener('click', () => {
    Citations.clearBibliography();
    updateBibStatus();
    updatePreview();
  });

  /* ── Image Upload ── */
  const imgUploadBtn = document.getElementById('img-upload-btn');
  const imgFileInput = document.getElementById('img-file-input');

  imgUploadBtn.addEventListener('click', () => imgFileInput.click());

  imgFileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files.length) return;
    let loaded = 0;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        ImageStore.addImage(file.name, ev.target.result);
        loaded++;
        if (loaded === files.length) updatePreview();
      };
      reader.readAsDataURL(file);
    }
    imgFileInput.value = '';
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
    checkSizeTooltip();
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

    // Walk backwards from cursor to find opening [
    let i = pos - 1;
    while (i >= 0 && text[i] !== '[' && text[i] !== ']' && text[i] !== '\n') i--;
    if (i < 0 || text[i] !== '[') { sizeTooltip.style.display = 'none'; return; }

    // This [ should be preceded by ] (closing caption brackets)
    if (i < 1 || text[i - 1] !== ']') { sizeTooltip.style.display = 'none'; return; }

    // Walk back to find opening [ of caption
    let j = i - 2;
    while (j >= 0 && text[j] !== '[' && text[j] !== '\n') j--;
    if (j < 1 || text[j] !== '[' || text[j - 1] !== '!') { sizeTooltip.style.display = 'none'; return; }

    // Check there's a closing ] after cursor
    let k = pos;
    while (k < text.length && text[k] !== ']' && text[k] !== '\n') k++;
    if (k >= text.length || text[k] !== ']') { sizeTooltip.style.display = 'none'; return; }

    // Show tooltip above cursor
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
      item.className = 'sidebar-item' + (doc.id === activeId ? ' active' : '');

      const title = document.createElement('span');
      title.className = 'sidebar-item-title';
      title.textContent = doc.title || 'Untitled Document';
      item.appendChild(title);

      const date = document.createElement('span');
      date.className = 'sidebar-item-date';
      date.textContent = formatRelativeDate(doc.updatedAt);
      item.appendChild(date);

      const del = document.createElement('button');
      del.className = 'sidebar-item-delete';
      del.textContent = '\u00d7';
      del.title = 'Delete document';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Delete "' + (doc.title || 'Untitled Document') + '"?')) return;
        const result = Documents.deleteDoc(doc.id);
        if (result) {
          editor.value = result.content;
          docTitle.textContent = result.title;
          history.states = [];
          history.pointer = -1;
          history.save();
          updatePreview();
          updateWordCount();
        } else {
          // Deleted last doc — reinitialize
          const fresh = Documents.init(STARTER);
          editor.value = fresh.content;
          docTitle.textContent = fresh.title;
          history.states = [];
          history.pointer = -1;
          history.save();
          updatePreview();
          updateWordCount();
        }
        renderSidebar();
      });
      item.appendChild(del);

      item.addEventListener('click', () => {
        if (doc.id === activeId) return;
        switchDocument(doc.id);
      });

      sidebarList.appendChild(item);
    });
  }

  function switchDocument(id) {
    // Flush pending save
    clearTimeout(saveTimer);
    Documents.save(editor.value);

    const doc = Documents.load(id);
    if (!doc) return;

    editor.value = doc.content;
    docTitle.textContent = doc.title;

    // Reset undo history
    history.states = [];
    history.pointer = -1;
    history.save();

    updatePreview();
    updateWordCount();
    hideAutocomplete();
    renderSidebar();
    editor.focus();
  }

  newDocBtn.addEventListener('click', () => {
    // Save current document first
    clearTimeout(saveTimer);
    Documents.save(editor.value);

    const doc = Documents.create();
    editor.value = doc.content;
    docTitle.textContent = doc.title;

    // Reset undo history
    history.states = [];
    history.pointer = -1;
    history.save();

    updatePreview();
    updateWordCount();
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
