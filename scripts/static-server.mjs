// Servidor estático mínimo para desarrollo local — sin dependencias externas.
// Uso: node scripts/static-server.mjs [puerto]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 5173;

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const s = await stat(filePath);
    if (s.isDirectory()) { res.writeHead(404); res.end(); return; }
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found: ' + req.url);
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
