/**
 * test.js — Integration tests for server API
 *
 * Spins up the server on a random port, exercises every API route,
 * then tears down. Run: node test.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const DOCS_DIR = path.join(ROOT, 'docs');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

let serverProcess;
let BASE;
let passed = 0;
let failed = 0;

// --- Helpers ---

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  }
}

async function api(method, urlPath, body, headers = {}) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) opts.body = body;
  const res = await fetch(BASE + urlPath, opts);
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  let json;
  if (ct.includes('json')) {
    try { json = JSON.parse(text); } catch {}
  }
  return { status: res.status, text, json };
}

// --- Snapshot original docs so we can restore after tests ---

const origDocs = new Map();

function snapshotDocs() {
  for (const f of fs.readdirSync(DOCS_DIR)) {
    origDocs.set(f, fs.readFileSync(path.join(DOCS_DIR, f)));
  }
}

function restoreDocs() {
  // Remove any test-created files
  for (const f of fs.readdirSync(DOCS_DIR)) {
    if (!origDocs.has(f)) fs.unlinkSync(path.join(DOCS_DIR, f));
  }
  // Restore originals
  for (const [f, buf] of origDocs) {
    fs.writeFileSync(path.join(DOCS_DIR, f), buf);
  }
}

function cleanUploads() {
  for (const f of fs.readdirSync(UPLOADS_DIR)) {
    if (f === '.gitkeep') continue;
    fs.unlinkSync(path.join(UPLOADS_DIR, f));
  }
}

// --- Start server on random port ---

function startServer() {
  return new Promise((resolve, reject) => {
    const port = 30000 + Math.floor(Math.random() * 10000);
    BASE = `http://localhost:${port}`;
    serverProcess = execFile('node', ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
    });
    serverProcess.stderr.on('data', d => process.stderr.write(d));
    // Wait for server to be ready
    const start = Date.now();
    const poll = setInterval(async () => {
      if (Date.now() - start > 5000) {
        clearInterval(poll);
        reject(new Error('Server did not start'));
        return;
      }
      try {
        await fetch(BASE + '/api/docs');
        clearInterval(poll);
        resolve();
      } catch {}
    }, 100);
  });
}

// --- Test suites ---

async function testDocsCRUD() {
  console.log('\nDocs API');

  // List existing docs (guide.md and welcome.md ship with repo)
  let r = await api('GET', '/api/docs');
  assert(r.status === 200, 'GET /api/docs returns 200');
  assert(Array.isArray(r.json), 'returns an array');
  const initial = r.json.length;
  assert(r.json.some(d => d.name === 'guide.md'), 'guide.md in list');
  assert(r.json[0].mtime > 0, 'docs have mtime');

  // Create a new doc
  r = await api('PUT', '/api/docs/Test%20Doc.md', 'Hello world');
  assert(r.status === 200, 'PUT creates doc');
  assert(fs.existsSync(path.join(DOCS_DIR, 'Test Doc.md')), 'file written to disk');

  // Read it back
  r = await api('GET', '/api/docs/Test%20Doc.md');
  assert(r.status === 200, 'GET reads doc');
  assert(r.text === 'Hello world', 'content matches');

  // Update it
  r = await api('PUT', '/api/docs/Test%20Doc.md', 'Updated content');
  assert(r.status === 200, 'PUT updates doc');
  r = await api('GET', '/api/docs/Test%20Doc.md');
  assert(r.text === 'Updated content', 'updated content matches');

  // Rename it
  r = await api('PATCH', '/api/docs/Test%20Doc.md', JSON.stringify({ newName: 'Renamed Doc.md' }), { 'Content-Type': 'application/json' });
  assert(r.status === 200, 'PATCH renames doc');
  assert(!fs.existsSync(path.join(DOCS_DIR, 'Test Doc.md')), 'old file gone');
  assert(fs.existsSync(path.join(DOCS_DIR, 'Renamed Doc.md')), 'new file exists');

  // Rename conflict
  r = await api('PATCH', '/api/docs/Renamed%20Doc.md', JSON.stringify({ newName: 'guide.md' }), { 'Content-Type': 'application/json' });
  assert(r.status === 409, 'PATCH returns 409 on conflict');

  // Delete it
  r = await api('DELETE', '/api/docs/Renamed%20Doc.md');
  assert(r.status === 200, 'DELETE removes doc');
  assert(!fs.existsSync(path.join(DOCS_DIR, 'Renamed Doc.md')), 'file removed from disk');

  // List should be back to initial count
  r = await api('GET', '/api/docs');
  assert(r.json.length === initial, 'doc count back to initial');

  // 404 on missing doc
  r = await api('GET', '/api/docs/nonexistent.md');
  assert(r.status === 404, 'GET returns 404 for missing doc');

  // Invalid name (no .md)
  r = await api('GET', '/api/docs/badname');
  assert(r.status === 400, 'rejects name without .md');
}

async function testUploads() {
  console.log('\nUploads API');

  // List (should be empty)
  let r = await api('GET', '/api/uploads');
  assert(r.status === 200, 'GET /api/uploads returns 200');
  assert(Array.isArray(r.json) && r.json.length === 0, 'empty uploads list');

  // Upload a file
  const body = Buffer.from('fake png data');
  r = await api('POST', '/api/uploads', body, { 'X-Filename': 'test-image.png' });
  assert(r.status === 200, 'POST uploads file');
  assert(fs.existsSync(path.join(UPLOADS_DIR, 'test-image.png')), 'file written to uploads/');

  // List should have 1 item
  r = await api('GET', '/api/uploads');
  assert(r.json.length === 1, 'uploads list has 1 entry');
  assert(r.json[0] === 'test-image.png', 'filename matches');

  // Serve it as static file
  r = await api('GET', '/uploads/test-image.png');
  assert(r.status === 200, 'static serve from /uploads/ works');
  assert(r.text === 'fake png data', 'served content matches');

  // Delete it
  r = await api('DELETE', '/api/uploads/test-image.png');
  assert(r.status === 200, 'DELETE removes upload');
  assert(!fs.existsSync(path.join(UPLOADS_DIR, 'test-image.png')), 'file removed from disk');

  // 404 on missing upload
  r = await api('DELETE', '/api/uploads/nope.png');
  assert(r.status === 404, 'DELETE returns 404 for missing upload');
}

async function testStaticServing() {
  console.log('\nStatic file serving');

  let r = await api('GET', '/');
  assert(r.status === 200, 'GET / returns 200');
  assert(r.text.includes('<!DOCTYPE html>'), 'serves index.html');

  r = await api('GET', '/style.css');
  assert(r.status === 200, 'GET /style.css returns 200');

  r = await api('GET', '/editor.js');
  assert(r.status === 200, 'GET /editor.js returns 200');

  r = await api('GET', '/nonexistent.html');
  assert(r.status === 404, 'GET missing file returns 404');
}

async function testPathTraversal() {
  console.log('\nPath traversal prevention');

  let r = await api('GET', '/api/docs/..%2F..%2Fetc%2Fpasswd.md');
  // path.basename strips traversal, so this should be "passwd.md" which doesn't exist
  assert(r.status === 404, 'traversal in docs blocked (404 not file content)');

  r = await api('DELETE', '/api/uploads/..%2F..%2Fserver.js');
  assert(r.status === 404, 'traversal in uploads blocked');
  assert(fs.existsSync(path.join(ROOT, 'server.js')), 'server.js still exists');

  // Static file traversal — sibling directory prefix attack
  r = await api('GET', '/..%2F');
  assert(r.status === 403 || r.status === 404, 'static traversal above root blocked');

  // Malformed JSON in PATCH
  r = await api('PATCH', '/api/docs/guide.md', 'not json', { 'Content-Type': 'application/json' });
  assert(r.status === 400, 'malformed JSON returns 400');
}

// --- Load parser once, expose both parseMarkdown and generateFullHTML ---

function loadParser() {
  global.Citations = {
    resetCitationTracking() {},
    formatInlineCitation(k) { return '@' + k; },
    formatInlineUrlCitation(u) { return u; },
    getBibliographyCount() { return 0; },
    renderReferencesSection() { return ''; },
    getCitationCSS() { return ''; },
  };
  const parserSrc = fs.readFileSync(path.join(ROOT, 'parser.js'), 'utf-8');
  const fn = new Function(parserSrc + '\nreturn { parseMarkdown, generateFullHTML };');
  return fn();
}

function testParser() {
  console.log('\nParser data-line attributes');

  const { parseMarkdown } = loadParser();

  const md = [
    '# Title',           // line 0
    '',                   // line 1
    'First paragraph.',   // line 2
    '',                   // line 3
    '## Section',         // line 4
    '',                   // line 5
    'Second paragraph.',  // line 6
    '',                   // line 7
    '- item one',         // line 8
    '- item two',         // line 9
    '',                   // line 10
    '> A quote',          // line 11
    '> — Author',         // line 12
    '',                   // line 13
    '```js',              // line 14
    'code()',              // line 15
    '```',                // line 16
  ].join('\n');

  const html = parseMarkdown(md);

  // Check data-line attributes
  assert(html.includes('data-line="0"'), 'h1 has data-line="0"');
  assert(html.includes('data-line="2"'), 'first paragraph has data-line="2"');
  assert(html.includes('data-line="4"'), 'h2 has data-line="4"');
  assert(html.includes('data-line="6"'), 'second paragraph has data-line="6"');
  assert(html.includes('data-line="8"'), 'list has data-line="8"');
  assert(html.includes('data-line="11"'), 'epigraph has data-line="11"');
  assert(html.includes('data-line="14"'), 'code block has data-line="14"');

  // Verify element types got the attributes
  assert(/h1 data-line="0"/.test(html), 'data-line on h1 element');
  assert(/p data-line="2"/.test(html), 'data-line on p element');
  assert(/ul data-line="8"/.test(html), 'data-line on ul element');
  assert(/pre data-line="14"/.test(html), 'data-line on pre element');
}

function testFigures() {
  console.log('\nFigure HTML generation');

  const { parseMarkdown } = loadParser();

  // Basic image with caption → <figure> wrapping <img> + <figcaption>
  let html = parseMarkdown('![My caption](photo.jpg)');
  assert(html.includes('<figure>'), 'image with caption wrapped in <figure>');
  assert(html.includes('<figcaption>My caption</figcaption>'), 'figcaption contains caption text');
  assert(html.includes('src="photo.jpg"'), 'img src is set');
  assert(html.includes('alt="My caption"'), 'img alt matches caption');

  // Image without caption → no <figcaption>
  html = parseMarkdown('![](photo.jpg)');
  assert(html.includes('<figure>'), 'captionless image still wrapped in <figure>');
  assert(!html.includes('<figcaption>'), 'no figcaption when caption is empty');

  // Image with size bracket
  html = parseMarkdown('![Sized](photo.jpg)');
  assert(html.includes('<figure>'), 'sized image wrapped in <figure>');
  assert(html.includes('<figcaption>Sized</figcaption>'), 'sized image has figcaption');

  html = parseMarkdown('![Sized][75](photo.jpg)');
  assert(html.includes('style="width:75%"'), 'size bracket sets width style');

  // Fullwidth image
  html = parseMarkdown('![Full caption](photo.jpg){fullwidth}');
  assert(html.includes('<figure class="fullwidth">'), 'fullwidth modifier adds class');
  assert(html.includes('<figcaption>Full caption</figcaption>'), 'fullwidth figure has figcaption');

  // Fullwidth without caption
  html = parseMarkdown('![](photo.jpg){fullwidth}');
  assert(html.includes('<figure class="fullwidth">'), 'fullwidth without caption has figure');
  assert(!html.includes('<figcaption>'), 'fullwidth without caption has no figcaption');

  // Margin figure → should NOT produce <figure>, uses margin toggle instead
  html = parseMarkdown('![Margin cap](photo.jpg){margin}');
  assert(html.includes('marginnote'), 'margin figure uses marginnote span');
  assert(!html.includes('<figure'), 'margin figure does not use <figure>');
  assert(html.includes('Margin cap'), 'margin figure preserves caption text');

  // Margin figure without caption → no <br> + caption text
  html = parseMarkdown('![](photo.jpg){margin}');
  assert(html.includes('marginnote'), 'captionless margin figure uses marginnote');
  assert(!html.includes('<br>'), 'captionless margin figure has no <br>');

  // Multiple figures in sequence
  html = parseMarkdown('![First](a.jpg)\n\n![Second](b.jpg)\n\n![Third](c.jpg)');
  assert(html.includes('<figcaption>First</figcaption>'), 'first of multiple figures has caption');
  assert(html.includes('<figcaption>Second</figcaption>'), 'second of multiple figures has caption');
  assert(html.includes('<figcaption>Third</figcaption>'), 'third of multiple figures has caption');

  // Special characters in caption are preserved (not double-escaped)
  html = parseMarkdown('![A & B](photo.jpg)');
  assert(html.includes('<figcaption>A &amp; B</figcaption>') || html.includes('<figcaption>A & B</figcaption>'),
    'special chars in caption handled');
}

function testExportFigureCSS() {
  console.log('\nExport HTML figure styles');

  const { parseMarkdown, generateFullHTML } = loadParser();

  const body = parseMarkdown('![Test](img.jpg)');
  const html = generateFullHTML(body, 'Test Doc');

  // The inline <style> must contain figure centering rules
  assert(html.includes('figure { text-align: center; }'), 'export CSS has figure text-align center');
  assert(html.includes('figcaption { margin-top: 0.4em;'), 'export CSS has figcaption margin-top');
  assert(html.includes('font-size: 0.875rem;'), 'export CSS has figcaption font-size');

  // Basic structure checks
  assert(html.includes('<!DOCTYPE html>'), 'export is full HTML document');
  assert(html.includes('<title>Test Doc</title>'), 'export has correct title');
  assert(html.includes('tufte'), 'export links Tufte CSS');

  // The body contains our figure
  assert(html.includes('<figure>'), 'export body contains <figure>');
  assert(html.includes('<figcaption>Test</figcaption>'), 'export body contains figcaption');
}

function testPreviewCSS() {
  console.log('\nPreview CSS figure styles');

  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf-8');

  assert(css.includes('.preview-content figure'), 'style.css has .preview-content figure rule');
  assert(css.includes('text-align: center'), 'style.css has text-align center');
  assert(css.includes('.preview-content figcaption'), 'style.css has .preview-content figcaption rule');
  assert(/\.preview-content figcaption[\s\S]*?margin-top:\s*0\.4em/.test(css),
    'figcaption rule has margin-top 0.4em');
  assert(/\.preview-content figcaption[\s\S]*?font-size:\s*0\.875rem/.test(css),
    'figcaption rule has font-size 0.875rem');
}

function testAutoNumbering() {
  console.log('\nFigure auto-numbering logic');

  // The toolbar uses: (editor.value.match(/!\[/g) || []).length
  // Test the same regex pattern against various inputs
  const countImages = (text) => (text.match(/!\[/g) || []).length;

  // Empty editor → 0 images, next figure = "Figure 1"
  assert(countImages('') === 0, 'empty text has 0 images');

  // One image
  assert(countImages('![caption](url)') === 1, 'one image counts as 1');

  // Multiple images
  assert(countImages('![a](x)\n\n![b](y)\n\n![c](z)') === 3, 'three images count as 3');

  // Images with modifiers still counted
  assert(countImages('![a](x){fullwidth}\n\n![b](y){margin}') === 2, 'modified images counted');

  // Image with size bracket
  assert(countImages('![a][50](x)') === 1, 'sized image counted');

  // No false positives from regular links [text](url) without !
  assert(countImages('[not an image](url)') === 0, 'links are not counted as images');

  // Exclamation in normal text doesn't trigger (needs ![)
  assert(countImages('Hello! World') === 0, 'bare ! not counted');

  // Mixed content: images + links + text
  assert(countImages('Some text ![a](x) and [link](y) then ![b](z)') === 2,
    'mixed content counts only images');

  // Image syntax inside code block (known trade-off: counted, but acceptable for placeholder default)
  assert(countImages('```\n![code](x)\n```\n![real](y)') === 2,
    'images in code blocks are counted (known trade-off)');
}

// --- Main ---

(async () => {
  console.log('Starting server...');
  snapshotDocs();

  try {
    await startServer();
    console.log('Server running at ' + BASE);

    await testDocsCRUD();
    await testUploads();
    await testStaticServing();
    await testPathTraversal();
    testParser();
    testFigures();
    testExportFigureCSS();
    testPreviewCSS();
    testAutoNumbering();
  } catch (err) {
    console.error('Fatal:', err);
    failed++;
  } finally {
    if (serverProcess) serverProcess.kill();
    restoreDocs();
    cleanUploads();
  }

  console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m` + (failed ? `, \x1b[31m${failed} failed\x1b[0m` : ''));
  process.exit(failed > 0 ? 1 : 0);
})();
