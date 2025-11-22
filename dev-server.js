const http = require('http');
const fs = require('fs');
const path = require('path');

// Serve files from the script directory to avoid depending on process.cwd()
const root = path.resolve(__dirname);
const port = process.env.PORT || 3000;

const clients = new Set();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

function send404(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

function serveFile(reqPath, res) {
  // Accept either a request path ("/index.html" or "index.html") or an absolute file path.
  let filePath;
  if (path.isAbsolute(reqPath)) {
    filePath = reqPath;
  } else {
    const decoded = decodeURIComponent(reqPath || '');
    const rel = decoded.startsWith('/') ? decoded.slice(1) : decoded;
    filePath = path.join(root, rel || '');
  }

  // Normalize and ensure the file is inside the root directory (prevent directory traversal)
  const resolvedRoot = path.resolve(root) + path.sep;
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedRoot)) {
    send404(res);
    return;
  }

  fs.stat(resolvedFile, (err, stats) => {
    if (err) {
      send404(res);
      return;
    }

    if (stats.isDirectory()) {
      // try index.html
      const indexPath = path.join(resolvedFile, 'index.html');
      fs.stat(indexPath, (err2, stats2) => {
        if (err2 || !stats2.isFile()) return send404(res);
        streamFile(indexPath, res);
      });
    } else if (stats.isFile()) {
      streamFile(resolvedFile, res);
    } else {
      send404(res);
    }
  });
}

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mime[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => send404(res));
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/events') {
    // SSE endpoint
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');

    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });

    return;
  }

  if (url === '/livereload.js') {
    // serve the client helper
    const lrPath = path.join(__dirname, 'livereload.js');
    return serveFile(lrPath, res);
  }

  // serve static
  let p = url;
  if (p === '/') p = '/index.html';
  const filePath = path.join(root, p);
  serveFile(filePath, res);
});

let debounceTimer = null;
const ignored = ['node_modules', '.git'];

function broadcastReload() {
  for (const res of clients) {
    try {
      res.write('event: reload\n');
      res.write('data: reload\n\n');
    } catch (e) {
      // ignore
    }
  }
}

// Watch for file changes in the project root
try {
  fs.watch(root, { recursive: true }, (evt, filename) => {
    if (!filename) return;
    const f = filename.toString();
    // ignore some dirs
    for (const ig of ignored) if (f.includes(ig)) return;

    // debounce bursts
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log('File change detected:', f);
      broadcastReload();
    }, 100);
  });
  console.log('Watching files for changes...');
} catch (e) {
  console.warn(
    'fs.watch may not support recursive on this platform. If changes are not detected, consider using chokidar and `npm i chokidar`.'
  );
}

server.listen(port, () => {
  console.log(`Dev server listening: http://localhost:${port}`);
  console.log('SSE live-reload available at /events');
});
