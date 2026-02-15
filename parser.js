/**
 * parser.js — Custom Markdown → Tufte HTML converter
 *
 * Two-pass approach:
 *  1. Block-level: split on blank lines, identify block types
 *  2. Inline: process inline formatting within each block
 */

let _snCounter = 0;
let _mnCounter = 0;

function resetCounters() {
  _snCounter = 0;
  _mnCounter = 0;
}

/* ── Inline Pass ── */

function marginToggleHTML(id, labelContent, spanClass, spanContent) {
  return `<label class="margin-toggle${labelContent === '' ? ' sidenote-number' : ''}" for="${id}">${labelContent}</label>` +
         `<input type="checkbox" id="${id}" class="margin-toggle"/>` +
         `<span class="${spanClass}">${spanContent}</span>`;
}

function parseInline(text) {
  const placeholders = [];

  // Extract inline code → placeholders (before other processing to prevent bold/italic inside code)
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    placeholders.push('<code>' + escapeHtml(code) + '</code>');
    return '\x00PH' + (placeholders.length - 1) + '\x00';
  });

  // Extract inline math $...$ → placeholders (before other processing to prevent bold/italic inside math)
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
    placeholders.push('<span class="math-inline">' + escapeHtml(math) + '</span>');
    return '\x00PH' + (placeholders.length - 1) + '\x00';
  });

  // Sidenotes: {sn:text}
  text = text.replace(/\{sn:([^}]+)\}/g, (_, content) => {
    return marginToggleHTML('sn-' + (++_snCounter), '', 'sidenote', content);
  });

  // Margin notes: {mn:text}
  text = text.replace(/\{mn:([^}]+)\}/g, (_, content) => {
    return marginToggleHTML('mn-' + (++_mnCounter), '&#8853;', 'marginnote', content);
  });

  // New thought: {newthought:text}
  text = text.replace(/\{newthought:([^}]+)\}/g, (_, content) => {
    return `<span class="newthought">${content}</span>`;
  });

  // Citations: @url[url] and @key — single pass for stable left-to-right numbering
  text = text.replace(/@url\[([^\]]*)\]\[([^\]]+)\]|@url\[([^\]]+)\]|(?<!\w)@([a-zA-Z][\w:-]*)/g, (match, urlName, urlUrl, urlOnly, keyMatch) => {
    if (urlUrl !== undefined) return Citations.formatInlineUrlCitation(urlUrl, urlName || '');
    if (urlOnly !== undefined) return Citations.formatInlineUrlCitation(urlOnly);
    return Citations.formatInlineCitation(keyMatch);
  });

  // Images: ![caption](url), ![caption][size%](url), with optional {margin} or {fullwidth}
  text = text.replace(/!\[([^\]]*)\](?:\[([^\]]*)\])?\(([^)]+)\)(?:\{(margin|fullwidth)\})?/g, (_, caption, size, url, modifier) => {
    const sizeVal = size ? parseInt(size, 10) : NaN;
    const sizeStyle = (!isNaN(sizeVal) && sizeVal > 0) ? ` style="width:${sizeVal}%"` : '';
    const imgTag = `<img src="${escapeAttr(url)}" alt="${escapeAttr(caption)}"${sizeStyle}/>`;

    if (modifier === 'margin') {
      return marginToggleHTML('mn-fig-' + (++_mnCounter), '&#8853;', 'marginnote', imgTag + (caption ? '<br>' + caption : ''));
    }

    if (modifier === 'fullwidth') {
      return `<figure class="fullwidth">${imgTag}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }

    return `<figure>${imgTag}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
  });

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return `<a href="${escapeAttr(url)}">${label}</a>`;
  });

  // Bold: **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text*
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Restore placeholders (code and math)
  text = text.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholders[parseInt(i)]);

  return text;
}

function escapeAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Block-level Pass ── */

function parseMarkdown(src) {
  resetCounters();
  Citations.resetCitationTracking();

  const lines = src.split('\n');
  const blocks = [];
  const blockLines = []; // source line index (0-based) where each block starts
  let current = [];
  let currentStart = 0;

  // Group lines into blocks separated by blank lines
  // but keep fenced code blocks and $$ math blocks together
  let fence = null; // null | 'code' | 'math'

  function flushBlock() {
    if (current.length) {
      blocks.push(current.join('\n'));
      blockLines.push(currentStart);
      current = [];
    }
  }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const fenceType = /^```/.test(line) ? 'code' : /^\$\$$/.test(line.trim()) ? 'math' : null;

    if (fenceType && fenceType === fence) {
      // Closing fence
      current.push(line);
      flushBlock();
      fence = null;
      continue;
    }

    if (fence) {
      current.push(line);
      continue;
    }

    if (fenceType) {
      // Opening fence
      flushBlock();
      fence = fenceType;
      currentStart = lineIdx;
      current.push(line);
      continue;
    }

    if (line.trim() === '') {
      flushBlock();
    } else {
      if (current.length === 0) currentStart = lineIdx;
      current.push(line);
    }
  }
  flushBlock();

  let html = '';
  let inSection = false;
  let openedImplicitSection = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const dl = ` data-line="${blockLines[i]}"`;

    // Fenced code block
    if (/^```/.test(block)) {
      const codeLines = block.split('\n');
      const lang = codeLines[0].replace(/^```/, '').trim();
      const code = escapeHtml(codeLines.slice(1, -1).join('\n'));
      html += `<pre${dl}><code${lang ? ` class="language-${lang}"` : ''}>${code}</code></pre>\n`;
      continue;
    }

    // Display math block
    const mathMatch = block.match(/^\$\$([\s\S]*?)\$\$$/);
    if (mathMatch && mathMatch[1].trim()) {
      html += `<div class="math-display"${dl}>${escapeHtml(mathMatch[1].trim())}</div>\n`;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(block.trim())) {
      html += `<hr${dl}/>\n`;
      continue;
    }

    // Heading
    const headingMatch = block.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = parseInline(headingMatch[2]);
      if (level === 2 || level === 3) {
        if (inSection || openedImplicitSection) html += '</section>\n';
        openedImplicitSection = false;
        html += '<section>\n';
        inSection = true;
      }
      html += `<h${level}${dl}>${text}</h${level}>\n`;
      continue;
    }

    // Wrap pre-section content in an implicit section so Tufte CSS width rules apply
    if (!inSection && !openedImplicitSection) {
      html += '<section>\n';
      openedImplicitSection = true;
    }

    // Epigraph: blockquote ending with attribution
    if (/^>\s/.test(block)) {
      const bqLines = block.split('\n');
      const contentLines = [];
      let footer = '';
      for (const l of bqLines) {
        const stripped = l.replace(/^>\s?/, '');
        if (/^—\s*/.test(stripped) || /^--\s*/.test(stripped)) {
          footer = stripped.replace(/^—\s*/, '').replace(/^--\s*/, '');
        } else {
          contentLines.push(stripped);
        }
      }
      const quote = parseInline(contentLines.join(' '));
      if (footer) {
        html += `<div class="epigraph"${dl}><blockquote><p>${quote}</p><footer>${parseInline(footer)}</footer></blockquote></div>\n`;
      } else {
        html += `<blockquote${dl}><p>${quote}</p></blockquote>\n`;
      }
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(block)) {
      const items = block.split('\n')
        .filter(l => /^[-*]\s/.test(l))
        .map(l => `<li>${parseInline(l.replace(/^[-*]\s+/, ''))}</li>`);
      html += `<ul${dl}>${items.join('')}</ul>\n`;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(block)) {
      const items = block.split('\n')
        .filter(l => /^\d+\.\s/.test(l))
        .map(l => `<li>${parseInline(l.replace(/^\d+\.\s+/, ''))}</li>`);
      html += `<ol${dl}>${items.join('')}</ol>\n`;
      continue;
    }

    // Paragraph (default)
    html += `<p${dl}>${parseInline(block.replace(/\n/g, ' '))}</p>\n`;
  }

  if (inSection || openedImplicitSection) html += '</section>\n';

  html += Citations.renderReferencesSection();

  return html;
}

/* ── Export: full standalone HTML ── */

function generateFullHTML(bodyHTML, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title || 'Untitled')}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tufte-css/1.8.0/tufte.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
<style>body { padding: 2rem 0; } section { display: flow-root; }${Citations.getCitationCSS()}</style>
</head>
<body>
<article>
${bodyHTML}
</article>
</body>
</html>`;
}
