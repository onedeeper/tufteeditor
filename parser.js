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

function parseInline(text) {
  // Sidenotes: {sn:text}
  text = text.replace(/\{sn:([^}]+)\}/g, (_, content) => {
    const id = 'sn-' + (++_snCounter);
    return `<label class="margin-toggle sidenote-number" for="${id}"></label>` +
           `<input type="checkbox" id="${id}" class="margin-toggle"/>` +
           `<span class="sidenote">${content}</span>`;
  });

  // Margin notes: {mn:text}
  text = text.replace(/\{mn:([^}]+)\}/g, (_, content) => {
    const id = 'mn-' + (++_mnCounter);
    return `<label class="margin-toggle" for="${id}">&#8853;</label>` +
           `<input type="checkbox" id="${id}" class="margin-toggle"/>` +
           `<span class="marginnote">${content}</span>`;
  });

  // New thought: {newthought:text}
  text = text.replace(/\{newthought:([^}]+)\}/g, (_, content) => {
    return `<span class="newthought">${content}</span>`;
  });

  // Citations: @url[url] and @key — single pass for stable left-to-right numbering
  text = text.replace(/@url\[([^\]]+)\]|(?<!\w)@([a-zA-Z][\w:-]*)/g, (match, urlMatch, keyMatch) => {
    if (urlMatch !== undefined) return Citations.formatInlineUrlCitation(urlMatch);
    return Citations.formatInlineCitation(keyMatch);
  });

  // Images: ![caption](url), ![caption][size%](url), with optional {margin} or {fullwidth}
  text = text.replace(/!\[([^\]]*)\](?:\[([^\]]*)\])?\(([^)]+)\)(?:\{(margin|fullwidth)\})?/g, (_, caption, size, url, modifier) => {
    const sizeVal = size ? parseInt(size, 10) : NaN;
    const sizeStyle = (!isNaN(sizeVal) && sizeVal > 0) ? ` style="width:${sizeVal}%"` : '';
    const imgTag = `<img src="${escapeAttr(url)}" alt="${escapeAttr(caption)}"${sizeStyle}/>`;

    if (modifier === 'margin') {
      const id = 'mn-fig-' + (++_mnCounter);
      return `<label class="margin-toggle" for="${id}">&#8853;</label>` +
             `<input type="checkbox" id="${id}" class="margin-toggle"/>` +
             `<span class="marginnote">${imgTag}${caption ? '<br>' + caption : ''}</span>`;
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

  // Inline code: `code`
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text*
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return text;
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Block-level Pass ── */

function parseMarkdown(src) {
  resetCounters();
  Citations.resetCitationTracking();

  const lines = src.split('\n');
  const blocks = [];
  let current = [];

  // Group lines into blocks separated by blank lines
  // but keep fenced code blocks together
  let inCode = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        current.push(line);
        blocks.push(current.join('\n'));
        current = [];
        inCode = false;
        continue;
      } else {
        if (current.length) { blocks.push(current.join('\n')); current = []; }
        inCode = true;
        current.push(line);
        continue;
      }
    }
    if (inCode) {
      current.push(line);
      continue;
    }
    if (line.trim() === '') {
      if (current.length) { blocks.push(current.join('\n')); current = []; }
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n'));

  let html = '';
  let inSection = false;
  let openedImplicitSection = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Fenced code block
    if (/^```/.test(block)) {
      const codeLines = block.split('\n');
      const lang = codeLines[0].replace(/^```/, '').trim();
      const code = escapeHtml(codeLines.slice(1, -1).join('\n'));
      html += `<pre><code${lang ? ` class="language-${lang}"` : ''}>${code}</code></pre>\n`;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(block.trim())) {
      html += '<hr/>\n';
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
      html += `<h${level}>${text}</h${level}>\n`;
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
        html += `<div class="epigraph"><blockquote><p>${quote}</p><footer>${parseInline(footer)}</footer></blockquote></div>\n`;
      } else {
        html += `<blockquote><p>${quote}</p></blockquote>\n`;
      }
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(block)) {
      const items = block.split('\n')
        .filter(l => /^[-*]\s/.test(l))
        .map(l => `<li>${parseInline(l.replace(/^[-*]\s+/, ''))}</li>`);
      html += `<ul>${items.join('')}</ul>\n`;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(block)) {
      const items = block.split('\n')
        .filter(l => /^\d+\.\s/.test(l))
        .map(l => `<li>${parseInline(l.replace(/^\d+\.\s+/, ''))}</li>`);
      html += `<ol>${items.join('')}</ol>\n`;
      continue;
    }

    // Paragraph (default)
    html += `<p>${parseInline(block.replace(/\n/g, ' '))}</p>\n`;
  }

  if (inSection) html += '</section>\n';

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
<style>body { padding: 2rem 0; }${Citations.getCitationCSS()}</style>
</head>
<body>
<article>
${bodyHTML}
</article>
</body>
</html>`;
}
