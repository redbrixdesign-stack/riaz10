// Loopback-only static preview for realistic compressed-asset Lighthouse runs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../..');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.woff2':'font/woff2', '.png':'image/png', '.svg':'image/svg+xml'};
http.createServer((req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
    if (!/^(index\.html|sw\.js|manifest\.json|css\/|js\/|assets\/)/.test(relative)) { res.writeHead(404); return res.end(); }
    const target = path.resolve(root,relative);
    if (!target.startsWith(root+path.sep) || relative.split('/').some(p=>p.startsWith('.'))) { res.writeHead(404); return res.end(); }
    const data = fs.readFileSync(target);
    const compressible = /\.(js|css|html|json|svg)$/.test(target);
    const encoding = compressible && /br/.test(req.headers['accept-encoding'] || '') ? 'br' : compressible && /gzip/.test(req.headers['accept-encoding'] || '') ? 'gzip' : null;
    res.setHeader('Content-Type',types[path.extname(target)] || 'application/octet-stream');
    res.setHeader('Cache-Control', /\.(html)$/.test(target) || relative === 'sw.js' ? 'no-cache' : 'public, max-age=31536000, immutable');
    res.setHeader('Vary','Accept-Encoding');
    if (encoding) res.setHeader('Content-Encoding',encoding);
    res.end(encoding === 'br' ? zlib.brotliCompressSync(data) : encoding === 'gzip' ? zlib.gzipSync(data) : data);
  } catch (e) { res.writeHead(404); res.end(); }
}).listen(8874,'127.0.0.1',()=>console.log('Compressed preview: http://127.0.0.1:8874'));
