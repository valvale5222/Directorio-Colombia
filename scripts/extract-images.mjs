// Extrae las imágenes base64 embebidas en "Presentacion CO.html" a archivos reales en assets/img/.
// Uso: node scripts/extract-images.mjs
// Sin dependencias externas — solo módulos built-in de Node (fs, path, crypto).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_HTML = path.join(ROOT, 'Presentacion CO.html');
const IMG_DIR = path.join(ROOT, 'assets', 'img');
mkdirSync(IMG_DIR, { recursive: true });

const src = readFileSync(SOURCE_HTML, 'utf8');
const re = /data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)/g;

const seen = new Map(); // hash -> {ext, bytes, firstIndex}
let m;
while ((m = re.exec(src))) {
  const ext = m[1] === 'jpeg' ? 'jpg' : 'png';
  const buf = Buffer.from(m[2], 'base64');
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  if (!seen.has(hash)) seen.set(hash, { ext, bytes: buf.length, index: m.index, buf });
}

// Mapeo hash → nombre de archivo final, determinado inspeccionando cada imagen una vez
// (tamaños distintivos: fondo de portada ~357KB, logo Grupo ~107KB, logo FrioPacking ~7.4KB).
const NAMES = {
  '600063b1': 'cover-default.jpg',
  'c8332a1f': 'logo-friopacking-group.png',
  '771ba0c4': 'logo-friopacking.png',
};

for (const [hash, info] of seen) {
  const name = NAMES[hash];
  if (!name) {
    console.warn(`Imagen sin nombre asignado (hash=${hash}, bytes=${info.bytes}) — no se escribió ningún archivo.`);
    continue;
  }
  writeFileSync(path.join(IMG_DIR, name), info.buf);
  console.log(`${name}: ${info.bytes} bytes`);
}
