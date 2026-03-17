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
const origFolders = new Set();

function snapshotDocs() {
  for (const f of fs.readdirSync(DOCS_DIR)) {
    const fp = path.join(DOCS_DIR, f);
    if (fs.statSync(fp).isDirectory()) {
      origFolders.add(f);
    } else {
      origDocs.set(f, fs.readFileSync(fp));
    }
  }
}

function restoreDocs() {
  // Remove any test-created files and folders
  for (const f of fs.readdirSync(DOCS_DIR)) {
    const fp = path.join(DOCS_DIR, f);
    if (fs.statSync(fp).isDirectory()) {
      if (!origFolders.has(f)) fs.rmSync(fp, { recursive: true });
    } else if (!origDocs.has(f)) {
      fs.unlinkSync(fp);
    }
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
  const guideDoc = r.json.find(d => d.name === 'guide.md');
  assert(guideDoc.folder === '', 'root docs have empty folder field');

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
  // safeDocPath rejects paths with ".." segments
  assert(r.status === 400 || r.status === 404, 'traversal in docs blocked');

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

async function testFolders() {
  console.log('\nFolders API');

  // List folders (should be empty initially)
  let r = await api('GET', '/api/folders');
  assert(r.status === 200, 'GET /api/folders returns 200');
  assert(Array.isArray(r.json), 'folders returns an array');
  const initialFolders = r.json.length;

  // Create a folder
  r = await api('POST', '/api/folders', JSON.stringify({ name: 'TestNotes' }), { 'Content-Type': 'application/json' });
  assert(r.status === 200, 'POST creates folder');
  assert(fs.existsSync(path.join(DOCS_DIR, 'TestNotes')), 'folder created on disk');

  // List folders
  r = await api('GET', '/api/folders');
  assert(r.json.length === initialFolders + 1, 'folder count increased');
  assert(r.json.includes('TestNotes'), 'new folder in list');

  // Duplicate folder
  r = await api('POST', '/api/folders', JSON.stringify({ name: 'TestNotes' }), { 'Content-Type': 'application/json' });
  assert(r.status === 409, 'duplicate folder returns 409');

  // Create doc in folder
  r = await api('PUT', '/api/docs/TestNotes/Folder%20Doc.md', 'Folder content');
  assert(r.status === 200, 'PUT creates doc in folder');
  assert(fs.existsSync(path.join(DOCS_DIR, 'TestNotes', 'Folder Doc.md')), 'doc written in folder');

  // Read doc from folder
  r = await api('GET', '/api/docs/TestNotes/Folder%20Doc.md');
  assert(r.status === 200, 'GET reads doc from folder');
  assert(r.text === 'Folder content', 'folder doc content matches');

  // List all docs includes folder doc
  r = await api('GET', '/api/docs');
  const folderDoc = r.json.find(d => d.name === 'TestNotes/Folder Doc.md');
  assert(folderDoc !== undefined, 'folder doc in list');
  assert(folderDoc.folder === 'TestNotes', 'folder field set correctly');

  // Move doc to root
  r = await api('PATCH', '/api/docs/TestNotes/Folder%20Doc.md',
    JSON.stringify({ folder: '' }),
    { 'Content-Type': 'application/json' });
  assert(r.status === 200, 'PATCH moves doc to root');
  assert(r.json.name === 'Folder Doc.md', 'moved doc name is correct');
  assert(fs.existsSync(path.join(DOCS_DIR, 'Folder Doc.md')), 'doc now at root');
  assert(!fs.existsSync(path.join(DOCS_DIR, 'TestNotes', 'Folder Doc.md')), 'doc gone from folder');

  // Move doc back to folder
  r = await api('PATCH', '/api/docs/Folder%20Doc.md',
    JSON.stringify({ folder: 'TestNotes' }),
    { 'Content-Type': 'application/json' });
  assert(r.status === 200, 'PATCH moves doc to folder');
  assert(r.json.name === 'TestNotes/Folder Doc.md', 'moved doc path correct');

  // Delete folder with docs (recursive delete)
  r = await api('DELETE', '/api/folders/TestNotes');
  assert(r.status === 200, 'DELETE removes folder with contents');
  assert(!fs.existsSync(path.join(DOCS_DIR, 'TestNotes')), 'folder removed from disk');
  assert(!fs.existsSync(path.join(DOCS_DIR, 'TestNotes', 'Folder Doc.md')), 'docs inside removed too');

  // List should be back to initial
  r = await api('GET', '/api/folders');
  assert(r.json.length === initialFolders, 'folder count back to initial');

  // Create doc in nonexistent folder should fail
  r = await api('PUT', '/api/docs/NoSuchFolder/doc.md', 'content');
  assert(r.status === 400, 'PUT in nonexistent folder returns 400');

  // Path traversal in folder names
  r = await api('POST', '/api/folders', JSON.stringify({ name: '../etc' }), { 'Content-Type': 'application/json' });
  assert(r.status === 200 || r.status === 400, 'folder traversal handled');
  // safeName strips path, so ../etc becomes "etc" — clean up if it was created
  const etcPath = path.join(DOCS_DIR, 'etc');
  if (fs.existsSync(etcPath)) fs.rmdirSync(etcPath);

  // Deeply nested doc path should be rejected
  r = await api('GET', '/api/docs/a/b/c.md');
  assert(r.status === 400, 'deeply nested path rejected');
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

  // Basic image with caption → auto-numbered <figure> with <figcaption>
  let html = parseMarkdown('![My caption](photo.jpg)');
  assert(html.includes('<figure id="fig-1"'), 'image with caption wrapped in <figure> with id');
  assert(html.includes('<strong>Figure 1:</strong> My caption'), 'figcaption has auto-numbered prefix');
  assert(html.includes('src="photo.jpg"'), 'img src is set');
  assert(html.includes('alt="My caption"'), 'img alt matches caption');

  // Image without caption → no figcaption, no numbering
  html = parseMarkdown('![](photo.jpg)');
  assert(html.includes('<figure>') || html.includes('<figure '), 'captionless image still wrapped in <figure>');
  assert(!html.includes('<figcaption>'), 'no figcaption when caption is empty');

  // Image with size bracket
  html = parseMarkdown('![Sized](photo.jpg)');
  assert(html.includes('<figure id="fig-1"'), 'sized image wrapped in numbered <figure>');
  assert(html.includes('Figure 1:</strong> Sized'), 'sized image has numbered figcaption');

  html = parseMarkdown('![Sized][75](photo.jpg)');
  assert(html.includes('style="width:75%"'), 'size bracket sets width style');

  // Fullwidth image
  html = parseMarkdown('![Full caption](photo.jpg){fullwidth}');
  assert(html.includes('class="fullwidth"'), 'fullwidth modifier adds class');
  assert(html.includes('Figure 1:</strong> Full caption'), 'fullwidth figure has numbered figcaption');

  // Fullwidth without caption
  html = parseMarkdown('![](photo.jpg){fullwidth}');
  assert(html.includes('class="fullwidth"'), 'fullwidth without caption has figure class');
  assert(!html.includes('<figcaption>'), 'fullwidth without caption has no figcaption');

  // Margin figure → should NOT produce <figure>, uses margin toggle instead, NOT numbered
  html = parseMarkdown('![Margin cap](photo.jpg){margin}');
  assert(html.includes('marginnote'), 'margin figure uses marginnote span');
  assert(!html.includes('<figure'), 'margin figure does not use <figure>');
  assert(html.includes('Margin cap'), 'margin figure preserves caption text');

  // Margin figure without caption → no <br> + caption text
  html = parseMarkdown('![](photo.jpg){margin}');
  assert(html.includes('marginnote'), 'captionless margin figure uses marginnote');
  assert(!html.includes('<br>'), 'captionless margin figure has no <br>');

  // Multiple figures in sequence — auto-numbered
  html = parseMarkdown('![First](a.jpg)\n\n![Second](b.jpg)\n\n![Third](c.jpg)');
  assert(html.includes('Figure 1:</strong> First'), 'first figure is numbered 1');
  assert(html.includes('Figure 2:</strong> Second'), 'second figure is numbered 2');
  assert(html.includes('Figure 3:</strong> Third'), 'third figure is numbered 3');
  assert(html.includes('id="fig-1"'), 'first figure has id fig-1');
  assert(html.includes('id="fig-2"'), 'second figure has id fig-2');
  assert(html.includes('id="fig-3"'), 'third figure has id fig-3');

  // Special characters in caption are preserved (not double-escaped)
  html = parseMarkdown('![A & B](photo.jpg)');
  assert(html.includes('A &amp; B') || html.includes('A & B'),
    'special chars in caption handled');

  // Margin figures don't affect numbering of regular figures
  html = parseMarkdown('![First](a.jpg)\n\n![Side](b.jpg){margin}\n\n![Second](c.jpg)');
  assert(html.includes('Figure 1:</strong> First'), 'figure before margin is numbered 1');
  assert(html.includes('Figure 2:</strong> Second'), 'figure after margin is numbered 2');
  assert(!html.includes('Figure 3'), 'margin figure does not consume a number');
}

function testExportFigureCSS() {
  console.log('\nExport HTML figure styles');

  const { parseMarkdown, generateFullHTML } = loadParser();

  const body = parseMarkdown('![Test](img.jpg)');
  const html = generateFullHTML(body, 'Test Doc');

  // The inline <style> must contain figure centering rules
  assert(html.includes('figure {') && html.includes('text-align: center'), 'export CSS has figure text-align center');
  assert(html.includes('margin-top: 0.4em;') && html.includes('figcaption {'), 'export CSS has figcaption margin-top');
  assert(html.includes('font-size: 0.875rem;'), 'export CSS has figcaption font-size');
  assert(html.includes('a.figure-ref'), 'export CSS has figure-ref rule');

  // Basic structure checks
  assert(html.includes('<!DOCTYPE html>'), 'export is full HTML document');
  assert(html.includes('<title>Test Doc</title>'), 'export has correct title');
  assert(html.includes('tufte'), 'export links Tufte CSS');

  // The body contains our auto-numbered figure
  assert(html.includes('<figure id="fig-1"'), 'export body contains numbered <figure>');
  assert(html.includes('Figure 1:</strong> Test'), 'export body contains numbered figcaption');
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
  assert(css.includes('.preview-content a.figure-ref'), 'style.css has figure-ref rule');
}

function testAutoNumbering() {
  console.log('\nFigure auto-numbering in parser');

  const { parseMarkdown } = loadParser();

  // Single figure is numbered 1
  let html = parseMarkdown('![Caption](img.jpg)');
  assert(html.includes('Figure 1:'), 'single figure numbered 1');

  // Multiple figures numbered sequentially
  html = parseMarkdown('![A](a.jpg)\n\n![B](b.jpg)\n\n![C](c.jpg)');
  assert(html.includes('Figure 1:') && html.includes('Figure 2:') && html.includes('Figure 3:'),
    'multiple figures numbered sequentially');

  // Margin figures do not get numbered
  html = parseMarkdown('![A](a.jpg)\n\n![M](m.jpg){margin}\n\n![B](b.jpg)');
  assert(html.includes('Figure 1:') && html.includes('Figure 2:'),
    'margin figures skipped in numbering');
  assert(!html.includes('Figure 3'), 'no Figure 3 when margin skipped');

  // Captionless images are not numbered
  html = parseMarkdown('![](a.jpg)\n\n![B](b.jpg)');
  assert(html.includes('Figure 1:') && html.includes('B'), 'captionless image not numbered, next is Figure 1');
  assert(!html.includes('Figure 2'), 'no Figure 2 since captionless was skipped');

  // Each parseMarkdown call resets the counter
  html = parseMarkdown('![Fresh](img.jpg)');
  assert(html.includes('Figure 1:'), 'counter resets between parseMarkdown calls');
}

function testFigureLabelsAndRefs() {
  console.log('\nFigure labels and references');

  const { parseMarkdown } = loadParser();

  // Label syntax creates a figure with a named id
  let html = parseMarkdown('![My plot](plot.png){label:myplot}');
  assert(html.includes('id="fig-myplot"'), 'labeled figure has named id');
  assert(html.includes('Figure 1:'), 'labeled figure is still numbered');

  // Figure reference resolves to correct number
  html = parseMarkdown('![Plot](plot.png){label:myplot}\n\nSee {fig:myplot} for details.');
  assert(html.includes('Figure 1'), 'figure reference shows Figure 1');
  assert(html.includes('href="#fig-myplot"'), 'figure reference links to figure id');
  assert(html.includes('class="figure-ref"'), 'figure reference has figure-ref class');

  // Forward reference (reference before figure)
  html = parseMarkdown('See {fig:myplot} below.\n\n![Plot](plot.png){label:myplot}');
  assert(html.includes('>Figure 1<'), 'forward reference resolves correctly');

  // Unknown label shows ??
  html = parseMarkdown('See {fig:missing}.');
  assert(html.includes('Figure ??'), 'unknown label shows Figure ??');

  // Multiple labeled figures
  html = parseMarkdown('![A](a.jpg){label:first}\n\n![B](b.jpg){label:second}\n\nSee {fig:first} and {fig:second}.');
  assert(html.includes('>Figure 1<'), 'first label resolves to 1');
  assert(html.includes('>Figure 2<'), 'second label resolves to 2');

  // Combined modifier and label
  html = parseMarkdown('![Wide](w.jpg){fullwidth,label:wide}');
  assert(html.includes('class="fullwidth"'), 'combined modifier keeps fullwidth class');
  assert(html.includes('id="fig-wide"'), 'combined modifier keeps label id');
  assert(html.includes('Figure 1:'), 'combined modifier figure is numbered');

  // Label-only (no caption) still gets numbered
  html = parseMarkdown('![](img.jpg){label:nocap}');
  assert(html.includes('id="fig-nocap"'), 'label-only figure has id');
  assert(html.includes('<strong>Figure 1</strong>'), 'label-only figure shows Figure N without colon');
}

function testLatexInCaptions() {
  console.log('\nLaTeX in figure captions');

  const { parseMarkdown } = loadParser();

  // LaTeX in caption renders as math-inline span in figcaption
  let html = parseMarkdown('![Values of $x_1$ over time](plot.png)');
  assert(html.includes('math-inline'), 'LaTeX in caption produces math-inline span');
  assert(html.includes('<figcaption>'), 'caption with LaTeX has figcaption');

  // Alt attribute uses plain text (no HTML tags)
  assert(html.includes('alt="Values of x_1 over time"'), 'alt uses plain text for LaTeX');
  assert(!html.includes('alt="Values of <span'), 'alt does not contain HTML tags');

  // Code in caption also works
  html = parseMarkdown('![The `foo` function](code.png)');
  assert(html.includes('<code>foo</code>'), 'code in caption renders');
  assert(html.includes('alt="The foo function"'), 'alt uses plain text for code');
}

function testTableParser() {
  console.log('\nTable parsing');

  const { parseMarkdown } = loadParser();

  // Basic table
  const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |';
  const html = parseMarkdown(md);
  assert(html.includes('<table>'), 'basic table produces <table>');
  assert(html.includes('<thead>'), 'table has <thead>');
  assert(html.includes('<tbody>'), 'table has <tbody>');
  assert(html.includes('<th>Name</th>'), 'header cell rendered');
  assert(html.includes('<td>Alice</td>'), 'data cell rendered');
  assert(html.includes('<td>30</td>'), 'second column data rendered');
  assert(html.includes('table-wrapper'), 'table wrapped in .table-wrapper');

  // Table with alignment
  const mdAlign = '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |';
  const alignHtml = parseMarkdown(mdAlign);
  assert(alignHtml.includes('text-align:center'), 'center alignment applied');
  assert(alignHtml.includes('text-align:right'), 'right alignment applied');
  assert(!alignHtml.includes('text-align:left'), 'left alignment is default (no explicit style)');

  // Table with inline formatting in cells
  const mdInline = '| **Bold** | *Italic* |\n| --- | --- |\n| `code` | [link](url) |';
  const inlineHtml = parseMarkdown(mdInline);
  assert(inlineHtml.includes('<strong>Bold</strong>'), 'bold in table cell');
  assert(inlineHtml.includes('<em>Italic</em>'), 'italic in table cell');
  assert(inlineHtml.includes('<code>code</code>'), 'code in table cell');

  // Table gets data-line attribute
  const mdWithContext = 'Some text\n\n| H |\n| --- |\n| D |';
  const ctxHtml = parseMarkdown(mdWithContext);
  assert(ctxHtml.includes('data-line="2"'), 'table has correct data-line');

  // Non-table pipe text is not mistaken for a table
  const mdNotTable = '| just a pipe at start';
  const notTableHtml = parseMarkdown(mdNotTable);
  assert(!notTableHtml.includes('<table>'), 'single pipe line is not a table');

  // Table with empty cells
  const mdEmpty = '| H1 | H2 |\n| --- | --- |\n|  |  |';
  const emptyHtml = parseMarkdown(mdEmpty);
  assert(emptyHtml.includes('<td></td>'), 'empty cells rendered');
}

function testTableExportCSS() {
  console.log('\nTable export CSS');

  const { parseMarkdown, generateFullHTML } = loadParser();

  const body = parseMarkdown('| H |\n| --- |\n| D |');
  const html = generateFullHTML(body, 'Test');
  assert(html.includes('table-wrapper'), 'export CSS has table-wrapper rule');
  assert(html.includes('border-collapse'), 'export CSS has border-collapse');
  assert(html.includes('<table>'), 'exported body contains table');
}

function testTablePreviewCSS() {
  console.log('\nTable preview CSS');

  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf-8');
  assert(css.includes('.preview-content .table-wrapper'), 'style.css has table-wrapper rule');
  assert(css.includes('.preview-content table'), 'style.css has table rule');
  assert(css.includes('.preview-content th'), 'style.css has th rule');
  assert(css.includes('.preview-content td'), 'style.css has td rule');
  assert(css.includes('.table-grid-picker'), 'style.css has grid picker rule');
  assert(css.includes('.table-context-menu'), 'style.css has context menu rule');
}

// --- Main ---

(async () => {
  console.log('Starting server...');
  snapshotDocs();

  try {
    await startServer();
    console.log('Server running at ' + BASE);

    await testDocsCRUD();
    await testFolders();
    await testUploads();
    await testStaticServing();
    await testPathTraversal();
    testParser();
    testFigures();
    testExportFigureCSS();
    testPreviewCSS();
    testAutoNumbering();
    testFigureLabelsAndRefs();
    testLatexInCaptions();
    testTableParser();
    testTableExportCSS();
    testTablePreviewCSS();
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
