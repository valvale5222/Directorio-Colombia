// Extrae las fotos base64 embebidas en "Organigrama Interactivo.html" a archivos reales
// en assets/img/organigrama/. Uso: node scripts/extract-organigrama-images.mjs
// Sin dependencias externas — solo módulos built-in de Node (fs, path, crypto).
//
// El archivo fuente no usa arrays de datos con nombre de campo (a diferencia de
// "Presentacion CO.html"): cada persona es un <div> con estilos inline y su foto
// en base64 repetida varias veces (una vez por cada tab donde aparece). Se deduplica
// por hash y se asigna el nombre de archivo según el orden de primera aparición en el
// HTML, que sigue el recorrido de "Vista General": logo → Dirección (Misael, Eduardo)
// → Operaciones (4) → SST (3) → Ingeniería (1) → Administración (1) → Comercial (1).
// Ese orden se verificó manualmente contra el texto de cada tarjeta antes de fijar el mapa.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_HTML = path.join(ROOT, 'Organigrama Interactivo.html');
const IMG_DIR = path.join(ROOT, 'assets', 'img', 'organigrama');
mkdirSync(IMG_DIR, { recursive: true });

const src = readFileSync(SOURCE_HTML, 'utf8');
const re = /data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)/g;

// hash (primeros 8 hex de sha256) → nombre base (sin extensión), en orden de primera aparición.
const BASENAMES_IN_ORDER = [
  'logo-friopacking-organigrama',
  'misael-estrada',
  'eduardo-narro',
  'jose-carlos-flores',
  'felipe-toro',
  'cristian-restrepo',
  'peeter-rosado',
  'julian-lopez',
  'juan-gomez',
  'victor-lopez',
  'mario-parra',
  'andreina-martelo',
  'vivian-castrillon',
];

const seen = new Map(); // hash -> {ext, buf}
let m;
while ((m = re.exec(src))) {
  const ext = m[1] === 'jpeg' ? 'jpg' : 'png';
  const buf = Buffer.from(m[2], 'base64');
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  if (!seen.has(hash)) seen.set(hash, { ext, buf });
}

const hashes = [...seen.keys()];
if (hashes.length !== BASENAMES_IN_ORDER.length) {
  console.warn(`Aviso: se esperaban ${BASENAMES_IN_ORDER.length} imágenes únicas, se encontraron ${hashes.length}. Revisa el mapa BASENAMES_IN_ORDER.`);
}

hashes.forEach((hash, i) => {
  const base = BASENAMES_IN_ORDER[i];
  const info = seen.get(hash);
  if (!base) {
    console.warn(`Imagen sin nombre asignado (hash=${hash}, bytes=${info.buf.length}, posición=${i}) — no se escribió ningún archivo.`);
    return;
  }
  const name = `${base}.${info.ext}`;
  writeFileSync(path.join(IMG_DIR, name), info.buf);
  console.log(`${name}: ${info.buf.length} bytes`);
});
