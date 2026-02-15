/**
 * citations.js — BibTeX parser, citation store, reference rendering
 *
 * Public API:
 *  loadBibliography(bibText)        — parse BibTeX and store entries
 *  setCitationStyle(style)          — 'numbered' or 'apa'
 *  getCitationStyle()               — current style
 *  resetCitationTracking()          — call at start of each render
 *  formatInlineCitation(key)        — inline HTML for @key
 *  formatInlineUrlCitation(url)     — inline HTML for @url[...]
 *  renderReferencesSection()        — full references HTML block
 *  getCitationCSS()                 — CSS for citations in exported HTML
 */

const Citations = (function () {
  // Persistent state (saved to localStorage)
  let _bibliography = new Map();   // key → BibEntry
  let _citationStyle = 'numbered'; // 'numbered' | 'apa'

  // Per-render tracking (reset each parse)
  let _citedKeys = [];       // ordered list of unique cited keys
  let _citedKeySet = new Set();
  let _citeCounter = 0;
  let _urlCitations = [];    // { url, number }

  const BIB_STORAGE_KEY = 'tufte-bibliography';
  const STYLE_STORAGE_KEY = 'tufte-citation-style';
  const URL_STORE_KEY = 'tufte-url-citations';

  let _urlStore = []; // persistent list of { url, name } for autocomplete

  // Restore from localStorage on load
  try {
    const savedBib = localStorage.getItem(BIB_STORAGE_KEY);
    if (savedBib) {
      const entries = JSON.parse(savedBib);
      _bibliography = new Map(entries);
    }
    const savedStyle = localStorage.getItem(STYLE_STORAGE_KEY);
    if (savedStyle === 'numbered' || savedStyle === 'apa') {
      _citationStyle = savedStyle;
    }
    const savedUrls = localStorage.getItem(URL_STORE_KEY);
    if (savedUrls) _urlStore = JSON.parse(savedUrls);
  } catch (e) {
    // ignore parse errors
  }

  /* ── BibTeX Parser (state-machine approach) ── */

  function parseBibTeX(text) {
    const entries = new Map();
    let i = 0;

    while (i < text.length) {
      // Scan for @type{
      const atIdx = text.indexOf('@', i);
      if (atIdx === -1) break;
      i = atIdx + 1;

      // Read entry type
      let type = '';
      while (i < text.length && /[a-zA-Z]/.test(text[i])) {
        type += text[i];
        i++;
      }
      type = type.toLowerCase();

      // Skip whitespace
      while (i < text.length && /\s/.test(text[i])) i++;

      // Expect opening brace
      if (text[i] !== '{') continue;
      i++;

      // Find the matching closing brace using depth counter
      const entryStart = i;
      let depth = 1;
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        if (depth > 0) i++;
      }
      if (depth !== 0) break;

      const entryBody = text.substring(entryStart, i);
      i++; // skip closing brace

      // Skip non-entry types like @string, @preamble, @comment
      if (['string', 'preamble', 'comment'].includes(type)) continue;

      // Parse entry body: first token is the key, then field = value pairs
      const entry = parseEntryBody(entryBody, type);
      if (entry && entry.key) {
        entries.set(entry.key.toLowerCase(), entry);
      }
    }

    return entries;
  }

  function parseEntryBody(body, type) {
    let i = 0;

    // Skip whitespace
    while (i < body.length && /\s/.test(body[i])) i++;

    // Read citation key (up to first comma)
    let key = '';
    while (i < body.length && body[i] !== ',') {
      key += body[i];
      i++;
    }
    key = key.trim();
    if (!key) return null;
    i++; // skip comma

    const fields = {};
    fields.type = type;

    // Parse field = value pairs
    while (i < body.length) {
      // Skip whitespace and commas
      while (i < body.length && /[\s,]/.test(body[i])) i++;
      if (i >= body.length) break;

      // Read field name
      let fieldName = '';
      while (i < body.length && /[a-zA-Z_-]/.test(body[i])) {
        fieldName += body[i];
        i++;
      }
      fieldName = fieldName.toLowerCase().trim();
      if (!fieldName) { i++; continue; }

      // Skip whitespace
      while (i < body.length && /\s/.test(body[i])) i++;

      // Expect =
      if (body[i] !== '=') continue;
      i++;

      // Skip whitespace
      while (i < body.length && /\s/.test(body[i])) i++;

      // Read value: braced {…}, quoted "…", or bare number
      let value = '';
      if (body[i] === '{') {
        i++; // skip opening brace
        let depth = 1;
        while (i < body.length && depth > 0) {
          if (body[i] === '{') depth++;
          else if (body[i] === '}') depth--;
          if (depth > 0) { value += body[i]; }
          i++;
        }
      } else if (body[i] === '"') {
        i++; // skip opening quote
        while (i < body.length && body[i] !== '"') {
          value += body[i];
          i++;
        }
        i++; // skip closing quote
      } else {
        // Bare value (number or string constant)
        while (i < body.length && body[i] !== ',' && body[i] !== '}' && !/\s/.test(body[i])) {
          value += body[i];
          i++;
        }
      }

      fields[fieldName] = value.trim();
    }

    return { key, ...fields };
  }

  /* ── Author Normalization ── */

  function normalizeAuthors(authorStr) {
    if (!authorStr) return '';
    // Split on " and " (case-insensitive)
    const authors = authorStr.split(/\s+and\s+/i);
    const normalized = authors.map(a => {
      a = a.trim();
      // "Last, First" format
      if (a.includes(',')) {
        const parts = a.split(',').map(p => p.trim());
        return parts[1] + ' ' + parts[0];
      }
      // Already "First Last" format
      return a;
    });
    if (normalized.length === 1) return normalized[0];
    if (normalized.length === 2) return normalized[0] + ' & ' + normalized[1];
    return normalized.slice(0, -1).join(', ') + ' & ' + normalized[normalized.length - 1];
  }

  function getLastName(authorStr) {
    if (!authorStr) return 'Unknown';
    const firstAuthor = authorStr.split(/\s+and\s+/i)[0].trim();
    if (firstAuthor.includes(',')) {
      return firstAuthor.split(',')[0].trim();
    }
    const parts = firstAuthor.split(/\s+/);
    return parts[parts.length - 1];
  }

  /* ── Public API ── */

  function loadBibliography(bibText) {
    const parsed = parseBibTeX(bibText);
    // Merge into existing bibliography
    for (const [key, entry] of parsed) {
      _bibliography.set(key, entry);
    }
    // Persist
    try {
      localStorage.setItem(BIB_STORAGE_KEY, JSON.stringify([..._bibliography]));
    } catch (e) {
      // storage full, ignore
    }
    return parsed.size;
  }

  function setCitationStyle(style) {
    if (style === 'numbered' || style === 'apa') {
      _citationStyle = style;
      localStorage.setItem(STYLE_STORAGE_KEY, style);
    }
  }

  function getCitationStyle() {
    return _citationStyle;
  }

  function resetCitationTracking() {
    _citedKeys = [];
    _citedKeySet = new Set();
    _citeCounter = 0;
    _urlCitations = [];
  }

  function citationLink(number, label, titleAttr) {
    const title = titleAttr ? ` title="${escapeAttr(titleAttr)}"` : '';
    return `<a class="citation" href="#ref-${number}"${title}>${label}</a>`;
  }

  function trackCitation(key) {
    if (_citedKeySet.has(key)) {
      return _citedKeys.indexOf(key) + 1;
    }
    _citeCounter++;
    _citedKeys.push(key);
    _citedKeySet.add(key);
    return _citeCounter;
  }

  function formatInlineCitation(key) {
    const lowerKey = key.toLowerCase();
    const entry = _bibliography.get(lowerKey);

    if (!entry) {
      return `<span class="citation-error">[@${escapeHtml(key)}]</span>`;
    }

    const number = trackCitation(lowerKey);
    const refText = formatReferenceText(entry);
    if (_citationStyle === 'apa') {
      const lastName = getLastName(entry.author);
      const year = entry.year || 'n.d.';
      return citationLink(number, `(${escapeHtml(lastName)}, ${escapeHtml(year)})`, refText);
    }

    return citationLink(number, `[${number}]`, refText);
  }

  function formatInlineUrlCitation(url, name) {
    let domain;
    try { domain = new URL(url).hostname; } catch (e) { domain = url; }
    const displayName = name || domain;

    addToUrlStore(url, name);

    const urlKey = '__url__' + url;
    const existing = _urlCitations.find(u => u.url === url);
    if (existing && name) existing.name = name;
    const number = trackCitation(urlKey);
    if (!existing) _urlCitations.push({ url, name: name || '', number });

    if (_citationStyle === 'apa') return citationLink(number, `(${escapeHtml(displayName)})`, name || url);
    return citationLink(number, `[${number}]`, name || url);
  }

  function renderReferencesSection() {
    if (_citedKeys.length === 0) return '';

    let html = '<div class="references"><h2>References</h2><ol class="references-list">';

    for (let i = 0; i < _citedKeys.length; i++) {
      const key = _citedKeys[i];
      const num = i + 1;

      if (key.startsWith('__url__')) {
        const url = key.substring(7);
        const urlEntry = _urlCitations.find(u => u.url === url);
        const urlName = urlEntry ? urlEntry.name : '';
        if (urlName) {
          html += `<li id="ref-${num}">${escapeHtml(urlName)}. <a href="${escapeAttr(url)}">${escapeHtml(url)}</a></li>`;
        } else {
          html += `<li id="ref-${num}"><a href="${escapeAttr(url)}">${escapeHtml(url)}</a></li>`;
        }
      } else {
        const entry = _bibliography.get(key);
        if (entry) {
          html += `<li id="ref-${num}">${formatReferenceHTML(entry)}</li>`;
        }
      }
    }

    html += '</ol></div>';
    return html;
  }

  /* ── Reference Formatting ── */

  function formatReferenceText(entry) {
    const parts = [];
    if (entry.author) parts.push(normalizeAuthors(entry.author));
    if (entry.year) parts.push('(' + entry.year + ')');
    if (entry.title) parts.push(entry.title);
    if (entry.journal) parts.push(entry.journal);
    if (entry.publisher) parts.push(entry.publisher);
    if (entry.volume) {
      let vol = entry.volume;
      if (entry.pages) vol += ', ' + entry.pages;
      parts.push(vol);
    } else if (entry.pages) {
      parts.push(entry.pages);
    }
    return parts.join('. ').replace(/\.\./g, '.') + '.';
  }

  function formatReferenceHTML(entry) {
    if (_citationStyle === 'apa') {
      return formatAPAReference(entry);
    }
    return formatNumberedReference(entry);
  }

  function formatNumberedReference(entry) {
    const parts = [];
    if (entry.author) parts.push(escapeHtml(normalizeAuthors(entry.author)));
    if (entry.title) parts.push(`"${escapeHtml(entry.title)}"`);
    if (entry.journal) parts.push(`<em>${escapeHtml(entry.journal)}</em>`);
    if (entry.publisher) parts.push(escapeHtml(entry.publisher));
    if (entry.volume) {
      let vol = 'vol. ' + escapeHtml(entry.volume);
      if (entry.pages) vol += ', pp. ' + escapeHtml(entry.pages);
      parts.push(vol);
    } else if (entry.pages) {
      parts.push('pp. ' + escapeHtml(entry.pages));
    }
    if (entry.year) parts.push(escapeHtml(entry.year));

    let ref = parts.join(', ') + '.';
    if (entry.doi) {
      ref += ` <a href="https://doi.org/${escapeAttr(entry.doi)}">doi:${escapeHtml(entry.doi)}</a>`;
    } else if (entry.url) {
      ref += ` <a href="${escapeAttr(entry.url)}">${escapeHtml(entry.url)}</a>`;
    }
    return ref;
  }

  function formatAPAReference(entry) {
    const parts = [];
    if (entry.author) {
      parts.push(escapeHtml(formatAPAAuthors(entry.author)));
    }
    if (entry.year) parts.push(`(${escapeHtml(entry.year)})`);
    if (entry.title) parts.push(escapeHtml(entry.title));
    if (entry.journal) {
      let journalPart = `<em>${escapeHtml(entry.journal)}</em>`;
      if (entry.volume) journalPart += `, <em>${escapeHtml(entry.volume)}</em>`;
      if (entry.pages) journalPart += `, ${escapeHtml(entry.pages)}`;
      parts.push(journalPart);
    } else {
      if (entry.publisher) parts.push(escapeHtml(entry.publisher));
    }

    let ref = parts.join('. ').replace(/\.\./g, '.') + '.';
    if (entry.doi) {
      ref += ` <a href="https://doi.org/${escapeAttr(entry.doi)}">https://doi.org/${escapeHtml(entry.doi)}</a>`;
    } else if (entry.url) {
      ref += ` <a href="${escapeAttr(entry.url)}">${escapeHtml(entry.url)}</a>`;
    }
    return ref;
  }

  function formatAPAAuthors(authorStr) {
    if (!authorStr) return '';
    const authors = authorStr.split(/\s+and\s+/i).map(a => {
      a = a.trim();
      if (a.includes(',')) {
        const parts = a.split(',').map(p => p.trim());
        // APA: Last, F. M.
        const initials = parts[1].split(/\s+/).map(n => n[0] + '.').join(' ');
        return parts[0] + ', ' + initials;
      }
      // "First Last" → "Last, F."
      const parts = a.split(/\s+/);
      if (parts.length === 1) return a;
      const last = parts[parts.length - 1];
      const initials = parts.slice(0, -1).map(n => n[0] + '.').join(' ');
      return last + ', ' + initials;
    });
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return authors[0] + ', & ' + authors[1];
    return authors.slice(0, -1).join(', ') + ', & ' + authors[authors.length - 1];
  }

  /* ── URL Store (for autocomplete) ── */

  function addToUrlStore(url, name) {
    const idx = _urlStore.findIndex(u => u.url === url);
    if (idx !== -1) {
      if (name) _urlStore[idx].name = name;
      return;
    }
    _urlStore.push({ url, name: name || '' });
    if (_urlStore.length > 50) _urlStore.shift();
    try {
      localStorage.setItem(URL_STORE_KEY, JSON.stringify(_urlStore));
    } catch (e) {}
  }

  function searchUrlStore(query) {
    const q = query ? query.toLowerCase() : '';
    return _urlStore.filter(u =>
      !q || u.url.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q))
    ).slice(0, 8);
  }

  /* ── Helpers ── */

  // escapeHtml and escapeAttr are globals from parser.js (loaded first)

  function getCitationCSS() {
    return `
a.citation { text-decoration: none; color: inherit; background: none; text-shadow: none; }
a.citation:hover { text-decoration: underline; }
.citation-error { color: #c00; border-bottom: 1px dashed #c00; }
.references { clear: both; border-top: 1px solid #ccc; margin-top: 3rem; padding-top: 1.5rem; width: 55%; }
.references h2 { font-size: 1.4rem; margin-bottom: 1rem; }
.references-list { padding-left: 1.5em; }
.references-list li { margin-bottom: 0.75em; line-height: 1.5; overflow-wrap: anywhere; }
.references-list a { word-break: break-all; background: none; text-shadow: none; text-decoration: underline; }`;
  }

  function getBibliographyCount() {
    return _bibliography.size;
  }

  function clearBibliography() {
    _bibliography.clear();
    localStorage.removeItem(BIB_STORAGE_KEY);
  }

  function searchEntries(query) {
    const q = query ? query.toLowerCase() : '';
    const results = [];
    for (const [key, entry] of _bibliography) {
      if (!q || key.includes(q) ||
          (entry.author && entry.author.toLowerCase().includes(q)) ||
          (entry.title && entry.title.toLowerCase().includes(q)) ||
          (entry.year && entry.year.includes(q))) {
        const preview = [];
        if (entry.author) preview.push(getLastName(entry.author));
        if (entry.year) preview.push(entry.year);
        if (entry.title) {
          const t = entry.title.length > 50 ? entry.title.substring(0, 50) + '...' : entry.title;
          preview.push(t);
        }
        results.push({ key, preview: preview.join(' \u2014 ') });
        if (results.length >= 8) break;
      }
    }
    return results;
  }

  return {
    loadBibliography,
    setCitationStyle,
    getCitationStyle,
    resetCitationTracking,
    formatInlineCitation,
    formatInlineUrlCitation,
    renderReferencesSection,
    getCitationCSS,
    getBibliographyCount,
    clearBibliography,
    searchEntries,
    searchUrlStore
  };
})();
