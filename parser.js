/**
 * parser.js — Custom Markdown → Tufte HTML converter
 *
 * Two-pass approach:
 *  1. Block-level: split on blank lines, identify block types
 *  2. Inline: process inline formatting within each block
 */

let _sidenoteCounter = 0;
let _marginnoteCounter = 0;
let _figureCounter = 0;
let _figureLabelMap = {};
let _tableCounter = 0;
let _tableLabelMap = {};

function resetCounters() {
  _sidenoteCounter = 0;
  _marginnoteCounter = 0;
  _figureCounter = 0;
  _figureLabelMap = {};
  _tableCounter = 0;
  _tableLabelMap = {};
}

function parseModifiers(str) {
  const result = { type: null, label: null };
  if (!str) return result;
  const parts = str.split(',').map(s => s.trim());
  for (const part of parts) {
    if (part === 'margin' || part === 'fullwidth') {
      result.type = part;
    } else if (part.startsWith('label:')) {
      result.label = part.substring(6).trim();
    }
  }
  return result;
}

/* ── Inline Pass ── */

function marginToggleHTML(id, labelContent, spanClass, spanContent) {
  return `<label class="margin-toggle${labelContent === '' ? ' sidenote-number' : ''}" for="${id}">${labelContent}</label>` +
         `<input type="checkbox" id="${id}" class="margin-toggle"/>` +
         `<span class="${spanClass}">${spanContent}</span>`;
}

function parseInline(text) {
  const placeholders = [];
  const placeholderTexts = []; // plain text versions for alt attributes

  // Extract inline code → placeholders (before other processing to prevent bold/italic inside code)
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    placeholders.push('<code>' + escapeHtml(code) + '</code>');
    placeholderTexts.push(code);
    return '\x00PH' + (placeholders.length - 1) + '\x00';
  });

  // Extract inline math $...$ → placeholders (before other processing to prevent bold/italic inside math)
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
    placeholders.push('<span class="math-inline">' + escapeHtml(math) + '</span>');
    placeholderTexts.push(math);
    return '\x00PH' + (placeholders.length - 1) + '\x00';
  });

  // Sidenotes: {sn:text}
  text = text.replace(/\{sn:([^}]+)\}/g, (_, content) => {
    return marginToggleHTML('sn-' + (++_sidenoteCounter), '', 'sidenote', content);
  });

  // Margin notes: {mn:text}
  text = text.replace(/\{mn:([^}]+)\}/g, (_, content) => {
    return marginToggleHTML('mn-' + (++_marginnoteCounter), '&#8853;', 'marginnote', content);
  });

  // New thought: {newthought:text}
  text = text.replace(/\{newthought:([^}]+)\}/g, (_, content) => {
    return `<span class="newthought">${content}</span>`;
  });

  // Figure references: {fig:label} → resolved after full document parse
  text = text.replace(/\{fig:([^}]+)\}/g, (_, label) => {
    return `<a href="#fig-${escapeAttr(label.trim())}" class="figure-ref">\x00FIGREF:${label.trim()}\x00</a>`;
  });

  // Table references: {tbl:label} → resolved after full document parse
  text = text.replace(/\{tbl:([^}]+)\}/g, (_, label) => {
    return `<a href="#tbl-${escapeAttr(label.trim())}" class="table-ref">\x00TBLREF:${label.trim()}\x00</a>`;
  });

  // Citations: @url[url] and @key — single pass for stable left-to-right numbering
  text = text.replace(/@url\[([^\]]*)\]\[([^\]]+)\]|@url\[([^\]]+)\]|(?<!\w)@([a-zA-Z][\w:-]*)/g, (match, urlName, urlUrl, urlOnly, keyMatch) => {
    if (urlUrl !== undefined) return Citations.formatInlineUrlCitation(urlUrl, urlName || '');
    if (urlOnly !== undefined) return Citations.formatInlineUrlCitation(urlOnly);
    return Citations.formatInlineCitation(keyMatch);
  });

  // Images: ![caption](url), ![caption][size%](url), with optional {modifier,label:name}
  text = text.replace(/!\[([^\]]*)\](?:\[([^\]]*)\])?\(([^)]+)\)(?:\{([^}]+)\})?/g, (_, caption, size, url, modifierStr) => {
    const mods = parseModifiers(modifierStr);
    const sizeVal = size ? parseInt(size, 10) : NaN;
    const sizeStyle = (!isNaN(sizeVal) && sizeVal > 0) ? ` style="width:${sizeVal}%"` : '';

    // Build plain text alt by resolving placeholders to their text content
    const altText = caption.replace(/\x00PH(\d+)\x00/g, (_, i) => placeholderTexts[parseInt(i)]);
    const imgTag = `<img src="${escapeAttr(url)}" alt="${escapeAttr(altText)}"${sizeStyle}/>`;

    if (mods.type === 'margin') {
      return marginToggleHTML('mn-fig-' + (++_marginnoteCounter), '&#8853;', 'marginnote', imgTag + (caption ? '<br>' + caption : ''));
    }

    const figClass = mods.type === 'fullwidth' ? ' class="fullwidth"' : '';

    // Auto-number non-margin figures that have a caption or label
    if (caption || mods.label) {
      _figureCounter++;
      const figNum = _figureCounter;
      const figId = mods.label ? `fig-${mods.label}` : `fig-${figNum}`;
      if (mods.label) _figureLabelMap[mods.label] = figNum;

      const figCaption = caption
        ? `<figcaption><strong>Figure ${figNum}:</strong> ${caption}</figcaption>`
        : `<figcaption><strong>Figure ${figNum}</strong></figcaption>`;
      return `<figure id="${figId}"${figClass}>${imgTag}${figCaption}</figure>`;
    }

    return `<figure${figClass}>${imgTag}</figure>`;
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

/* ── Table Helpers ── */

function parseTableRow(line) {
  // Strip leading/trailing pipes and split on |
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.substring(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1);
  return trimmed.split('|').map(cell => cell.trim());
}

function parseTable(lines, dataLineAttr) {
  // Check for caption line: |: Caption text {label:name}
  const hasCaption = /^\|:\s/.test(lines[0]);
  const dataLines = hasCaption ? lines.slice(1) : lines;

  let captionHTML = '';
  let wrapperId = '';

  if (hasCaption) {
    let rawCaption = lines[0].replace(/^\|:\s*/, '');
    let label = null;
    const labelMatch = rawCaption.match(/\{label:([^}]+)\}/);
    if (labelMatch) {
      label = labelMatch[1].trim();
      rawCaption = rawCaption.replace(/\{label:[^}]+\}/, '').trim();
    }

    _tableCounter++;
    const tblNum = _tableCounter;
    if (label) _tableLabelMap[label] = tblNum;
    wrapperId = ` id="${label ? 'tbl-' + label : 'tbl-' + tblNum}"`;

    const captionContent = rawCaption
      ? `<strong>Table ${tblNum}:</strong> ${parseInline(rawCaption)}`
      : `<strong>Table ${tblNum}</strong>`;
    captionHTML = `<caption>${captionContent}</caption>\n`;
  }

  const headerCells = parseTableRow(dataLines[0]);
  const sepCells = parseTableRow(dataLines[1]);

  // Determine alignment from separator row
  const alignments = sepCells.map(cell => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });

  const alignAttr = (i) => {
    const a = alignments[i] || 'left';
    return a !== 'left' ? ` style="text-align:${a}"` : '';
  };

  let html = `<div class="table-wrapper"${wrapperId}${dataLineAttr}><table>\n${captionHTML}<thead><tr>`;
  headerCells.forEach((cell, i) => {
    html += `<th${alignAttr(i)}>${parseInline(cell)}</th>`;
  });
  html += '</tr></thead>\n<tbody>\n';

  for (let r = 2; r < dataLines.length; r++) {
    const cells = parseTableRow(dataLines[r]);
    html += '<tr>';
    headerCells.forEach((_, i) => {
      html += `<td${alignAttr(i)}>${parseInline(cells[i] || '')}</td>`;
    });
    html += '</tr>\n';
  }

  html += '</tbody>\n</table></div>\n';
  return html;
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

    // Table (GFM pipe table, with optional |: caption line)
    const tableLines = block.split('\n');
    const captionOffset = /^\|:\s/.test(tableLines[0]) ? 1 : 0;
    if (tableLines.length >= captionOffset + 2 &&
        /^\|/.test(tableLines[captionOffset].trim()) &&
        /^\|[\s\-:|]+\|$/.test(tableLines[captionOffset + 1].trim())) {
      html += parseTable(tableLines, dl);
      continue;
    }

    // Paragraph (default)
    html += `<p${dl}>${parseInline(block.replace(/\n/g, ' '))}</p>\n`;
  }

  if (inSection || openedImplicitSection) html += '</section>\n';

  html += Citations.renderReferencesSection();

  // Resolve figure references: replace placeholders with actual figure numbers
  html = html.replace(/\x00FIGREF:([^\x00]+)\x00/g, (_, label) => {
    const num = _figureLabelMap[label.trim()];
    return num !== undefined ? `Figure ${num}` : `Figure ??`;
  });

  // Resolve table references
  html = html.replace(/\x00TBLREF:([^\x00]+)\x00/g, (_, label) => {
    const num = _tableLabelMap[label.trim()];
    return num !== undefined ? `Table ${num}` : `Table ??`;
  });

  return html;
}

/* ── Export: full standalone HTML ── */

function generateFullHTML(bodyHTML, title, extraCSS) {
  extraCSS = extraCSS || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title || 'Untitled')}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tufte-css/1.8.0/tufte.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
<style>body { padding: 2rem 0; } article { counter-reset: sidenote-counter; } section { display: flow-root; } pre { width: 55%; overflow-x: auto; } figure { display: table; text-align: center; } figcaption { display: table-caption; caption-side: bottom; float: none; max-width: 100%; margin-right: 0; margin-top: 0.4em; font-size: 0.875rem; text-align: center; } a.figure-ref, a.table-ref { text-decoration: none; background: none; text-shadow: none; color: inherit; border-bottom: 1px solid #999; } a.figure-ref:hover, a.table-ref:hover { border-bottom-color: #333; } caption { caption-side: top; text-align: left; padding: 0.4em 0; font-size: 0.875rem; } article img { cursor: zoom-in; } .lightbox-overlay { position:fixed; inset:0; background:rgba(0,0,0,.9); display:flex; align-items:center; justify-content:center; z-index:500; cursor:zoom-out; } .lightbox-img { max-width:90vw; max-height:90vh; object-fit:contain; user-select:none; -webkit-user-select:none; } .table-wrapper { width:55%; margin:1.5em 0; overflow-x:auto; } table { border-collapse:collapse; width:100%; } th { text-align:left; padding:0.5em 0.75em; border-bottom:2px solid #333; font-weight:600; } td { padding:0.4em 0.75em; border-bottom:1px solid #ddd; } @media print { .table-wrapper { width:100%; } }${Citations.getCitationCSS()} ${extraCSS}</style>
</head>
<body>
<article>
${bodyHTML}
</article>
<script>(function(){var lb=document.createElement('div');lb.className='lightbox-overlay';lb.style.display='none';var im=document.createElement('img');im.className='lightbox-img';lb.appendChild(im);document.body.appendChild(lb);var s=1,tx=0,ty=0,dr=false,dd=false,x0,y0,tx0,ty0;function u(){im.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')';}document.querySelector('article').addEventListener('click',function(e){if(e.target.tagName==='IMG'){s=1;tx=0;ty=0;im.style.transform='';im.src=e.target.src;lb.style.display='flex';}});lb.addEventListener('click',function(){if(!dd)lb.style.display='none';});lb.addEventListener('wheel',function(e){e.preventDefault();s=Math.max(.5,Math.min(10,s*(e.deltaY>0?.9:1.1)));u();},{passive:false});im.addEventListener('mousedown',function(e){e.preventDefault();dr=true;dd=false;x0=e.clientX;y0=e.clientY;tx0=tx;ty0=ty;});document.addEventListener('mousemove',function(e){if(!dr)return;if(Math.abs(e.clientX-x0)>3||Math.abs(e.clientY-y0)>3)dd=true;tx=tx0+(e.clientX-x0);ty=ty0+(e.clientY-y0);u();});document.addEventListener('mouseup',function(){dr=false;});document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.style.display='none';});})()</script>
</body>
</html>`;
}
