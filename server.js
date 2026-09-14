const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg']);

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  let filePath = path.join(ROOT_DIR, reqPath);

  // 1. Direct file match
  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    return serveFile(filePath, req, res);
  }

  // 2. Check if reqPath + .html exists (e.g. /blog -> /blog.html or /about -> /about.html)
  if (fs.existsSync(filePath + '.html') && !fs.statSync(filePath + '.html').isDirectory()) {
    return serveFile(filePath + '.html', req, res);
  }

  // 3. If directory, check for index.html inside directory, or [dirname].html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const dirIndex = path.join(filePath, 'index.html');
    if (fs.existsSync(dirIndex)) {
      return serveFile(dirIndex, req, res);
    }
    const siblingHtml = filePath + '.html';
    if (fs.existsSync(siblingHtml)) {
      return serveFile(siblingHtml, req, res);
    }
  }

  // 4. If nothing matched, serve 404.html
  const errorPage = path.join(ROOT_DIR, '404.html');
  if (fs.existsSync(errorPage)) {
    return serveFile(errorPage, req, res, 404);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

function serveFile(targetFile, req, res, statusCode = 200) {
  const stat = fs.statSync(targetFile);
  const ext = path.extname(targetFile).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const etag = `"${stat.size}-${Number(stat.mtime)}"`;

  // 304 Not Modified Check
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304);
    return res.end();
  }

  // Cache Control Optimization
  let cacheControl = 'no-cache';
  if (['.webp', '.jpg', '.jpeg', '.png', '.woff', '.woff2', '.ttf', '.ico'].includes(ext)) {
    cacheControl = 'public, max-age=31536000, immutable';
  } else if (['.css', '.js'].includes(ext)) {
    cacheControl = 'public, max-age=86400';
  }

  const headers = {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': cacheControl,
    'ETag': etag
  };

  // Compression Optimization for text assets
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const canGzip = COMPRESSIBLE.has(ext) && acceptEncoding.includes('gzip');

  if (canGzip) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(statusCode, headers);
    const rawStream = fs.createReadStream(targetFile);
    const gzipStream = zlib.createGzip({ level: 6 });
    rawStream.pipe(gzipStream).pipe(res);
  } else {
    headers['Content-Length'] = stat.size;
    res.writeHead(statusCode, headers);
    fs.createReadStream(targetFile).pipe(res);
  }
}

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🚀 Kizuna Real Estate Website is running locally!`);
  console.log(`  🔗 Open: http://localhost:${PORT}`);
  console.log(`  ⚡ High-performance compression & caching active`);
  console.log(`======================================================\n`);
});
