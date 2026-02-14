/**
 * server.js — Zero-dependency Node.js server
 * Static files + REST API for docs and uploads
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DOCS_DIR = path.join(ROOT, 'docs');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

// Auto-create directories
fs.mkdirSync(DOCS_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeName(name) {
  return path.basename(name);
}

// --- API handlers ---

function handleDocsAPI(req, res, urlPath) {
  const route = urlPath.replace(/^\/api\/docs\/?/, '');

  // GET /api/docs — list docs
  if (req.method === 'GET' && route === '') {
    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md'));
    const docs = files.map(f => {
      const stat = fs.statSync(path.join(DOCS_DIR, f));
      return { name: f, title: f.replace(/\.md$/, ''), mtime: stat.mtimeMs };
    });
    docs.sort((a, b) => b.mtime - a.mtime);
    return sendJSON(res, 200, docs);
  }

  const name = safeName(decodeURIComponent(route));
  if (!name || !name.endsWith('.md')) {
    return sendJSON(res, 400, { error: 'Invalid document name' });
  }
  const filePath = path.join(DOCS_DIR, name);

  // GET /api/docs/:name — read doc
  if (req.method === 'GET') {
    if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Not found' });
    const content = fs.readFileSync(filePath, 'utf-8');
    return sendText(res, 200, content);
  }

  // PUT /api/docs/:name — create/update doc
  if (req.method === 'PUT') {
    return readBody(req).then(body => {
      fs.writeFileSync(filePath, body.toString('utf-8'));
      sendJSON(res, 200, { ok: true });
    });
  }

  // PATCH /api/docs/:name — rename doc
  if (req.method === 'PATCH') {
    return readBody(req).then(body => {
      const { newName } = JSON.parse(body.toString('utf-8'));
      const safeDst = safeName(newName);
      if (!safeDst || !safeDst.endsWith('.md')) {
        return sendJSON(res, 400, { error: 'Invalid new name' });
      }
      const dstPath = path.join(DOCS_DIR, safeDst);
      if (fs.existsSync(dstPath)) {
        return sendJSON(res, 409, { error: 'A document with that name already exists' });
      }
      if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Not found' });
      fs.renameSync(filePath, dstPath);
      sendJSON(res, 200, { ok: true, name: safeDst });
    });
  }

  // DELETE /api/docs/:name
  if (req.method === 'DELETE') {
    if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Not found' });
    fs.unlinkSync(filePath);
    return sendJSON(res, 200, { ok: true });
  }

  sendJSON(res, 405, { error: 'Method not allowed' });
}

function handleUploadsAPI(req, res, urlPath) {
  const route = urlPath.replace(/^\/api\/uploads\/?/, '');

  // GET /api/uploads — list uploads
  if (req.method === 'GET' && route === '') {
    const files = fs.readdirSync(UPLOADS_DIR).filter(f => f !== '.gitkeep');
    return sendJSON(res, 200, files);
  }

  // POST /api/uploads — upload file (raw body, X-Filename header)
  if (req.method === 'POST' && route === '') {
    const filename = safeName(req.headers['x-filename'] || 'upload');
    if (!filename) return sendJSON(res, 400, { error: 'Missing filename' });
    return readBody(req).then(body => {
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), body);
      sendJSON(res, 200, { ok: true, name: filename });
    });
  }

  // DELETE /api/uploads/:name
  if (req.method === 'DELETE' && route !== '') {
    const name = safeName(decodeURIComponent(route));
    const filePath = path.join(UPLOADS_DIR, name);
    if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Not found' });
    fs.unlinkSync(filePath);
    return sendJSON(res, 200, { ok: true });
  }

  sendJSON(res, 405, { error: 'Method not allowed' });
}

// --- Static file serving ---

function serveStatic(req, res, urlPath) {
  // Serve uploaded files from /uploads/
  if (urlPath.startsWith('/uploads/')) {
    const name = safeName(decodeURIComponent(urlPath.replace(/^\/uploads\//, '')));
    const filePath = path.join(UPLOADS_DIR, name);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(name).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  // Default to index.html for root
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  filePath = path.normalize(filePath);

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end('Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

// --- Request handler ---

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = decodeURIComponent(parsed.pathname);

  if (urlPath.startsWith('/api/docs')) {
    return handleDocsAPI(req, res, urlPath);
  }
  if (urlPath.startsWith('/api/uploads')) {
    return handleUploadsAPI(req, res, urlPath);
  }
  serveStatic(req, res, urlPath);
});

server.listen(PORT, () => {
  console.log(`Tufte Editor running at http://localhost:${PORT}`);
});
