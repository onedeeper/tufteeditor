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
  assert(r.json.some(d => d.name === 'welcome.md'), 'welcome.md in list');
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
  r = await api('PATCH', '/api/docs/Renamed%20Doc.md', JSON.stringify({ newName: 'welcome.md' }), { 'Content-Type': 'application/json' });
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
