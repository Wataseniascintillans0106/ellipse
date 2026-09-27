/* 本地静态服务器：给手机 / 浏览器预览用
   node scripts/serve.mjs [端口]    默认 5173，监听 0.0.0.0 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 5173);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url);
    let rel = decodeURIComponent(parsed.pathname || '/');
    if (rel.endsWith('/')) rel += 'index.html';

    const target = path.resolve(ROOT, '.' + rel);
    if (!target.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
    }
    fs.readFile(target, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
            return;
        }
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        }).end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('ellipse 预览： http://localhost:' + PORT + '/index.html');
    console.log('手机访问：   http://<本机局域网 IP>:' + PORT + '/index.html');
});
