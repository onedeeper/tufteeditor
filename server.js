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
const BIB_FILE = path.join(ROOT, 'library.bib');

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

const MAX_BODY = 50 * 1024 * 1024; // 50 MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); reject(new Error('Body too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeName(name) {
  return path.basename(name);
}

function safeDocPath(route) {
  const parts = route.split('/').filter(Boolean);
  for (const part of parts) {
    if (part === '..' || part === '.' || part.includes('\\')) return null;
    if (path.basename(part) !== part) return null;
  }
  if (parts.length === 1 && parts[0].endsWith('.md')) {
    return { folder: '', name: parts[0], filePath: path.join(DOCS_DIR, parts[0]) };
  }
  if (parts.length === 2 && parts[1].endsWith('.md')) {
    return { folder: parts[0], name: parts[1], filePath: path.join(DOCS_DIR, parts[0], parts[1]) };
  }
  return null;
}

// --- API handlers ---

function handleDocsAPI(req, res, urlPath) {
  const route = urlPath.replace(/^\/api\/docs\/?/, '');

  // GET /api/docs — list docs (scans 1 level of subfolders)
  if (req.method === 'GET' && route === '') {
    const entries = [];
    const items = fs.readdirSync(DOCS_DIR, { withFileTypes: true });
    for (const item of items) {
      if (item.isFile() && item.name.endsWith('.md')) {
        const stat = fs.statSync(path.join(DOCS_DIR, item.name));
        entries.push({ name: item.name, title: item.name.replace(/\.md$/, ''), mtime: stat.mtimeMs, folder: '' });
      } else if (item.isDirectory()) {
        const subDir = path.join(DOCS_DIR, item.name);
        for (const sf of fs.readdirSync(subDir)) {
          if (sf.endsWith('.md')) {
            const stat = fs.statSync(path.join(subDir, sf));
            entries.push({ name: item.name + '/' + sf, title: sf.replace(/\.md$/, ''), mtime: stat.mtimeMs, folder: item.name });
          }
        }
      }
    }
    entries.sort((a, b) => b.mtime - a.mtime);
    return sendJSON(res, 200, entries);
  }

  const docInfo = safeDocPath(route);
  if (!docInfo) {
    return sendJSON(res, 400, { error: 'Invalid document name' });
  }
  const filePath = docInfo.filePath;

  // GET /api/docs/:name — read doc
  if (req.method === 'GET') {
    if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Not found' });
    const content = fs.readFileSync(filePath, 'utf-8');
    return sendText(res, 200, content);
  }

  // PUT /api/docs/:name — create/update doc
  if (req.method === 'PUT') {
    return readBody(req).then(body => {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) return sendJSON(res, 400, { error: 'Folder does not exist' });
      fs.writeFileSync(filePath, body.toString('utf-8'));
      sendJSON(res, 200, { ok: true });
    }).catch(err => sendJSON(res, 400, { error: err.message }));
  }

  // PATCH /api/docs/:name — rename or move doc
  if (req.method === 'PATCH') {
    return readBody(req).then(body => {
      let parsed;
      try { parsed = JSON.parse(body.toString('utf-8')); } catch {
        return sendJSON(res, 400, { error: 'Invalid JSON' });
      }
      const dstFileName = parsed.newName ? safeName(parsed.newName) : docInfo.name;
      if (!dstFileName || !dstFileName.endsWith('.md')) {
        return sendJSON(res, 400, { error: 'Invalid new name' });
      }
      let dstFolder = parsed.folder !== undefined ? parsed.folder : docInfo.folder;
      if (dstFolder) {
        dstFolder = safeName(dstFolder);
        if (!dstFolder) return sendJSON(res, 400, { error: 'Invalid folder' });
      }
      const dstDir = dstFolder ? path.join(DOCS_DIR, dstFolder) : DOCS_DIR;
      if (dstFolder && !fs.existsSync(dstDir)) {
        return sendJSON(res, 400, { error: 'Destination folder does not exist' });
      }
      const dstPath = path.join(dstDir, dstFileName);
      if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Not found' });
      if (fs.existsSync(dstPath) && dstPath !== filePath) {
        return sendJSON(res, 409, { error: 'A document with that name already exists' });
      }
      fs.renameSync(filePath, dstPath);
      const newName = dstFolder ? dstFolder + '/' + dstFileName : dstFileName;
      sendJSON(res, 200, { ok: true, name: newName });
    }).catch(err => sendJSON(res, 400, { error: err.message }));
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
    }).catch(err => sendJSON(res, 400, { error: err.message }));
  }

  // DELETE /api/uploads/:name
  if (req.method === 'DELETE' && route !== '') {
    const name = safeName(route);
    const filePath = path.join(UPLOADS_DIR, name);
    if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Not found' });
    fs.unlinkSync(filePath);
    return sendJSON(res, 200, { ok: true });
  }

  sendJSON(res, 405, { error: 'Method not allowed' });
}

function handleBibliographyAPI(req, res) {
  // GET /api/bibliography — read library.bib
  if (req.method === 'GET') {
    if (!fs.existsSync(BIB_FILE)) return sendText(res, 200, '');
    const content = fs.readFileSync(BIB_FILE, 'utf-8');
    return sendText(res, 200, content);
  }

  // PUT /api/bibliography — write library.bib
  if (req.method === 'PUT') {
    return readBody(req).then(body => {
      fs.writeFileSync(BIB_FILE, body.toString('utf-8'));
      sendJSON(res, 200, { ok: true });
    }).catch(err => sendJSON(res, 400, { error: err.message }));
  }

  // DELETE /api/bibliography — remove library.bib
  if (req.method === 'DELETE') {
    if (fs.existsSync(BIB_FILE)) fs.unlinkSync(BIB_FILE);
    return sendJSON(res, 200, { ok: true });
  }

  sendJSON(res, 405, { error: 'Method not allowed' });
}

function handleFoldersAPI(req, res, urlPath) {
  const route = urlPath.replace(/^\/api\/folders\/?/, '');

  // GET /api/folders — list folders
  if (req.method === 'GET' && route === '') {
    const items = fs.readdirSync(DOCS_DIR, { withFileTypes: true });
    const folders = items.filter(i => i.isDirectory()).map(i => i.name).sort();
    return sendJSON(res, 200, folders);
  }

  // POST /api/folders — create folder
  if (req.method === 'POST' && route === '') {
    return readBody(req).then(body => {
      let parsed;
      try { parsed = JSON.parse(body.toString('utf-8')); } catch {
        return sendJSON(res, 400, { error: 'Invalid JSON' });
      }
      const name = safeName(parsed.name || '');
      if (!name) return sendJSON(res, 400, { error: 'Invalid folder name' });
      const folderPath = path.join(DOCS_DIR, name);
      if (fs.existsSync(folderPath)) {
        return sendJSON(res, 409, { error: 'Folder already exists' });
      }
      fs.mkdirSync(folderPath);
      sendJSON(res, 200, { ok: true, name });
    }).catch(err => sendJSON(res, 400, { error: err.message }));
  }

  // DELETE /api/folders/:name — delete folder and all contents
  if (req.method === 'DELETE' && route !== '') {
    const name = safeName(route);
    const folderPath = path.join(DOCS_DIR, name);
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return sendJSON(res, 404, { error: 'Folder not found' });
    }
    fs.rmSync(folderPath, { recursive: true });
    return sendJSON(res, 200, { ok: true });
  }

  sendJSON(res, 405, { error: 'Method not allowed' });
}

// --- Static file serving ---

function serveStatic(req, res, urlPath) {
  // Serve uploaded files from /uploads/
  if (urlPath.startsWith('/uploads/')) {
    const name = safeName(urlPath.slice('/uploads/'.length));
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

  // Prevent path traversal — must be strictly inside ROOT
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
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
  if (urlPath.startsWith('/api/folders')) {
    return handleFoldersAPI(req, res, urlPath);
  }
  if (urlPath.startsWith('/api/uploads')) {
    return handleUploadsAPI(req, res, urlPath);
  }
  if (urlPath === '/api/bibliography') {
    return handleBibliographyAPI(req, res);
  }
  serveStatic(req, res, urlPath);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Tufte Editor running at http://localhost:${PORT}`);
});
