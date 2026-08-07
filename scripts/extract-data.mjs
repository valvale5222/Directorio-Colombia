// Regenera data/*.json a partir de los arrays de negocio embebidos en "Presentacion CO.html".
// Uso: node scripts/extract-data.mjs
// Sin dependencias externas — solo módulos built-in de Node (fs, path, vm).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_HTML = path.join(ROOT, 'Presentacion CO.html');
const DATA_DIR = path.join(ROOT, 'data');

const src = readFileSync(SOURCE_HTML, 'utf8');

// Extrae el literal JS (array u objeto) asignado a `const/var/let <varName> = ...;`
// contando profundidad de llaves/corchetes y respetando strings entre comillas.
function extractLiteral(source, varName) {
  const declRe = new RegExp(`(?:const|var|let)\\s+${varName}\\s*=\\s*`);
  const m = declRe.exec(source);
  if (!m) throw new Error(`No se encontró la declaración de ${varName}`);
  const start = m.index + m[0].length;
  const openChar = source[start];
  if (openChar !== '[' && openChar !== '{') {
    throw new Error(`${varName} no empieza con [ o { en la posición esperada`);
  }
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let inString = null; // "'" | '"' | null
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"') { inString = ch; continue; }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        const literalText = source.slice(start, i + 1);
        return vm.runInNewContext(`(${literalText})`, {});
      }
    }
  }
  throw new Error(`No se encontró el cierre de ${varName}`);
}

// NOTA: `data/ventas.json` ya NO se regenera desde este archivo. Desde que la
// pestaña VENTAS de "BASE COLOMBIA-.xlsx" pasó a ser la fuente autoritativa,
// se regenera con `node scripts/extract-excel.mjs` (lee el .xlsx directamente).
//
// NOTA: `data/pipeline.json` tampoco se regenera desde este archivo. Desde que
// la pestaña PIPELINE de "BASE COLOMBIA-.xlsx" pasó a ser la fuente autoritativa,
// se regenera con `node scripts/extract-pipeline.mjs` (lee el .xlsx directamente).

// ── OBJ5 y PART_DATA ya son objetos con nombre de campo — se extraen tal cual ──
const objetivos = extractLiteral(src, 'OBJ5');
const participacion = extractLiteral(src, 'PART_DATA');

writeFileSync(path.join(DATA_DIR, 'objetivos.json'), JSON.stringify(objetivos, null, 2) + '\n');
writeFileSync(path.join(DATA_DIR, 'participacion.json'), JSON.stringify(participacion, null, 2) + '\n');

console.log(`objetivos.json: ${objetivos.length} objetivos`);
console.log(`participacion.json: ${participacion.length} periodos`);
