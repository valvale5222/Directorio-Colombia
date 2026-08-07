// Regenera data/pipeline.json a partir de la pestaña "PIPELINE" de "BASE COLOMBIA-.xlsx".
// Uso: node scripts/extract-pipeline.mjs
// Sin dependencias externas — solo módulos built-in de Node (fs, path, zlib).
// El .xlsx es un ZIP; este script implementa un lector mínimo de ZIP (central
// directory + inflate) y un parser de sheetXML/sharedStrings suficiente para
// las tablas simples que usa este libro (sin fórmulas, sin celdas combinadas).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'BASE COLOMBIA-.xlsx');
const OUT_PATH = path.join(ROOT, 'data', 'pipeline.json');

// ── Lector mínimo de ZIP (central directory → local headers → inflate) ──
function readZipEntries(buf) {
  const EOCD_SIG = 0x06054b50;
  let eocdOff = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocdOff = i; break; }
  }
  if (eocdOff === -1) throw new Error('EOCD no encontrado — ¿el archivo es un .xlsx válido?');

  const cdEntries = buf.readUInt16LE(eocdOff + 10);
  const cdOffset = buf.readUInt32LE(eocdOff + 16);

  const entries = {};
  let off = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    const sig = buf.readUInt32LE(off);
    if (sig !== 0x02014b50) throw new Error('Central directory corrupto en offset ' + off);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localHeaderOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries[name] = { method, compSize, localHeaderOff };
    off += 46 + nameLen + extraLen + commentLen;
  }

  function extract(name) {
    const e = entries[name];
    if (!e) return null;
    const lh = e.localHeaderOff;
    const lhSig = buf.readUInt32LE(lh);
    if (lhSig !== 0x04034b50) throw new Error('Local header corrupto para ' + name);
    const nameLen = buf.readUInt16LE(lh + 26);
    const extraLen = buf.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + nameLen + extraLen;
    const raw = buf.subarray(dataStart, dataStart + e.compSize);
    if (e.method === 0) return raw;
    if (e.method === 8) return zlib.inflateRawSync(raw);
    throw new Error('Método de compresión no soportado (' + e.method + ') para ' + name);
  }

  return { entries, extract };
}

// ── Parser mínimo de XML plano (regex, suficiente para sheetXML de Excel) ──
function parseSharedStrings(xml) {
  if (!xml) return [];
  const items = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const t = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
    items.push(decodeXmlEntities(t));
  }
  return items;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Cada celda es una etiqueta autocontenida (autocerrada `<c .../>` cuando está
// vacía, o `<c ...>...</c>` cuando tiene valor/fórmula). Deben distinguirse
// probando primero la forma autocerrada: si no, una celda vacía seguida de
// celdas con contenido hace que un [\s\S]*? lazy "adopte" el contenido de las
// celdas siguientes y las pierda (columnas corridas).
const CELL_RE = /<c r="([A-Z]+)(\d+)"(?:[^>]*?)\/>|<c r="([A-Z]+)(\d+)"([^>]*?)>([\s\S]*?)<\/c>/g;

function parseSheetRows(xml, shared) {
  const rows = [];
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = {};
    CELL_RE.lastIndex = 0;
    let cm;
    while ((cm = CELL_RE.exec(rm[2]))) {
      const selfClosed = cm[1] !== undefined;
      const col = selfClosed ? cm[1] : cm[3];
      if (selfClosed) continue; // celda vacía — sin valor que registrar
      const attrs = cm[5];
      const inner = cm[6];
      const typeMatch = /t="(\w+)"/.exec(attrs);
      const type = typeMatch ? typeMatch[1] : null;
      const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
      let val = vMatch ? vMatch[1] : null;
      if (type === 's' && val !== null) val = shared[parseInt(val, 10)];
      else if (val !== null) val = decodeXmlEntities(val);
      cells[col] = val;
    }
    rows.push({ r: parseInt(rm[1], 10), cells });
  }
  return rows;
}

// ── 1. Leer el ZIP y localizar la pestaña "PIPELINE" vía workbook.xml + rels ──
const buf = readFileSync(XLSX_PATH);
const { extract } = readZipEntries(buf);

const workbookXml = extract('xl/workbook.xml').toString('utf8');
const sheetMeta = [...workbookXml.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)]
  .map((m) => ({ name: m[1], rid: m[2] }));
const pipelineSheet = sheetMeta.find((s) => s.name.trim().toUpperCase() === 'PIPELINE');
if (!pipelineSheet) throw new Error('No se encontró la pestaña "PIPELINE" en el libro');

const relsXml = extract('xl/_rels/workbook.xml.rels').toString('utf8');
const relMatch = new RegExp('<Relationship Id="' + pipelineSheet.rid + '"[^>]*Target="([^"]+)"').exec(relsXml);
if (!relMatch) throw new Error('No se encontró el target del rId de PIPELINE en workbook.xml.rels');
const sheetPath = 'xl/' + relMatch[1];

const sharedStringsRaw = extract('xl/sharedStrings.xml');
const shared = parseSharedStrings(sharedStringsRaw ? sharedStringsRaw.toString('utf8') : null);
const sheetXml = extract(sheetPath).toString('utf8');
const rows = parseSheetRows(sheetXml, shared);

// ── 2. Header dinámico (por nombre de columna, no por letra fija) ──
const headerRow = rows.find((r) => r.r === 1);
if (!headerRow) throw new Error('No se encontró la fila de encabezado en la pestaña PIPELINE');
const colByLabel = {};
Object.entries(headerRow.cells).forEach(([col, label]) => {
  if (label) colByLabel[String(label).trim().replace(/\s+/g, ' ').toUpperCase()] = col;
});
const COL_CLIENTE = colByLabel['CLIENTE'];
const COL_PROYECTO = colByLabel['PROYECTO'];
const COL_PRODUCTO = colByLabel['PRODUCTO'];
const COL_IMPORTE_KEY = Object.keys(colByLabel).find((k) => k.startsWith('IMPORTE'));
const COL_IMPORTE = COL_IMPORTE_KEY ? colByLabel[COL_IMPORTE_KEY] : null;
const COL_DOLARES = colByLabel['DOLARES'];
const COL_MARGEN = colByLabel['MARGEN COMERCIAL'];
const COL_MES = colByLabel['MES DE CIERRE'];
const COL_PROB = colByLabel['PROB DE CIERRE'];
const COL_STATUS = colByLabel['STATUS'];
const COL_REFRI = colByLabel['REFRIGERANTE'];
const COL_AGRO = colByLabel['AGRO/NO AGRO'];
const COL_TIPO = colByLabel['TIPO DE VENTA'];
const COL_ANIO = colByLabel['AÑO'];

if (!COL_CLIENTE || !COL_STATUS || !COL_ANIO) {
  throw new Error('Encabezados esperados no encontrados. Encabezados detectados: ' + JSON.stringify(colByLabel));
}

// Algunas celdas numéricas quedaron formateadas como texto en el Excel (ej.
// "$1,000,000.00" como shared string en vez de número) — se limpia el símbolo
// de moneda y los separadores de miles antes de convertir.
function toNumber(val) {
  if (val == null) return null;
  const n = typeof val === 'string' ? Number(val.replace(/[^0-9.\-]/g, '')) : Number(val);
  return Number.isFinite(n) ? n : null;
}

// ── 3. Filas de datos → objetos con nombre de campo ──
// "MES DE CIERRE" = 0 en la fuente representa "sin mes asignado" (se observa
// siempre junto a "PROB DE CIERRE" = 0 en oportunidades Perdidas/Canceladas
// sin fecha estimada) → se normaliza a null.
const dataRows = rows.filter((r) => r.r >= 2 && r.cells[COL_CLIENTE] != null && String(r.cells[COL_CLIENTE]).trim() !== '');

const pipeline = dataRows.map((r) => {
  const c = r.cells;
  const mesRaw = COL_MES ? c[COL_MES] : null;
  const mesNum = mesRaw != null ? Number(mesRaw) : null;
  const anioRaw = COL_ANIO ? c[COL_ANIO] : null;
  return {
    cliente: String(c[COL_CLIENTE]).trim(),
    proyecto: COL_PROYECTO && c[COL_PROYECTO] != null ? String(c[COL_PROYECTO]).trim() : null,
    producto: COL_PRODUCTO && c[COL_PRODUCTO] != null ? String(c[COL_PRODUCTO]).trim() : null,
    importeCOP: COL_IMPORTE ? toNumber(c[COL_IMPORTE]) : null,
    dolares: COL_DOLARES ? toNumber(c[COL_DOLARES]) : null,
    margen: COL_MARGEN ? toNumber(c[COL_MARGEN]) : null,
    mesCierre: mesNum && mesNum > 0 ? mesNum : null,
    probabilidad: COL_PROB ? toNumber(c[COL_PROB]) : null,
    estado: COL_STATUS && c[COL_STATUS] != null ? String(c[COL_STATUS]).trim() : null,
    refrigerante: COL_REFRI && c[COL_REFRI] != null ? String(c[COL_REFRI]).trim() : null,
    agro: COL_AGRO && c[COL_AGRO] != null ? String(c[COL_AGRO]).trim() : null,
    tipoVenta: COL_TIPO && c[COL_TIPO] != null ? String(c[COL_TIPO]).trim() : null,
    anio: anioRaw != null ? Number(anioRaw) : null,
  };
});

writeFileSync(OUT_PATH, JSON.stringify(pipeline, null, 2) + '\n');
console.log(`pipeline.json: ${pipeline.length} registros, pestaña "${pipelineSheet.name}" de ${path.basename(XLSX_PATH)}`);
