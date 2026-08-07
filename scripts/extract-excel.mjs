// Regenera data/ventas.json a partir de la pestaña "VENTAS" de "BASE COLOMBIA-.xlsx".
// Uso: node scripts/extract-excel.mjs
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
const OUT_PATH = path.join(ROOT, 'data', 'ventas.json');

// Rango histórico válido para la sección Ventas del dashboard.
const RANGE_MIN = '2023-01-01';
const RANGE_MAX = '2026-07-31';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ── Lector mínimo de ZIP (central directory → local headers → inflate) ──
function readZipEntries(buf) {
  // Busca el End Of Central Directory record (EOCD) desde el final del archivo.
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

function parseSheetRows(xml, shared) {
  const rows = [];
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const cells = {};
    const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const col = cm[1];
      const attrs = cm[3];
      const inner = cm[4];
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

function excelSerialToISO(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

// ── 1. Leer el ZIP y localizar la pestaña "VENTAS" vía workbook.xml + rels ──
const buf = readFileSync(XLSX_PATH);
const { extract } = readZipEntries(buf);

const workbookXml = extract('xl/workbook.xml').toString('utf8');
const sheetMeta = [...workbookXml.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)]
  .map((m) => ({ name: m[1], rid: m[2] }));
const ventasSheet = sheetMeta.find((s) => s.name.trim().toUpperCase() === 'VENTAS');
if (!ventasSheet) throw new Error('No se encontró la pestaña "VENTAS" en el libro');

const relsXml = extract('xl/_rels/workbook.xml.rels').toString('utf8');
const relMatch = new RegExp('<Relationship Id="' + ventasSheet.rid + '"[^>]*Target="([^"]+)"').exec(relsXml);
if (!relMatch) throw new Error('No se encontró el target del rId de VENTAS en workbook.xml.rels');
const sheetPath = 'xl/' + relMatch[1];

const sharedStringsRaw = extract('xl/sharedStrings.xml');
const shared = parseSharedStrings(sharedStringsRaw ? sharedStringsRaw.toString('utf8') : null);
const sheetXml = extract(sheetPath).toString('utf8');
const rows = parseSheetRows(sheetXml, shared);

// ── 2. Header dinámico (por nombre de columna, no por letra fija) ──
const headerRow = rows.find((r) => r.r === 1);
if (!headerRow) throw new Error('No se encontró la fila de encabezado en la pestaña VENTAS');
const colByLabel = {};
Object.entries(headerRow.cells).forEach(([col, label]) => {
  if (label) colByLabel[String(label).trim().toUpperCase()] = col;
});
const COL_ANIO = colByLabel['AÑO'];
const COL_MES = colByLabel['MES'];
const COL_FECHA = colByLabel['FECHA'];
const COL_CLIENTE = colByLabel['CLIENTE'];
const COL_FRUTA = colByLabel['FRUTA'];
const COL_REFRI = colByLabel['REFRIGERANTE'];
const COL_VENDEDOR = colByLabel['VENDEDOR'];
const COL_IMPORTE = colByLabel['IMPORTE'];
const COL_MARGEN = colByLabel['MARGEN COMERCIAL'];
const COL_TIPO = colByLabel['TIPO DE VENTA'];
const COL_DESC = Object.keys(colByLabel).find((k) => k.startsWith('DESCRIPCIÓN') || k.startsWith('DESCRIPCION'));
const COL_DESCRIPCION = COL_DESC ? colByLabel[COL_DESC] : null;

if (!COL_FECHA || !COL_CLIENTE || !COL_IMPORTE) {
  throw new Error('Encabezados esperados no encontrados. Encabezados detectados: ' + JSON.stringify(colByLabel));
}

// ── 3. Filas de datos → objetos con nombre de campo ──
// `anio` y `mes` se derivan de la fecha (serial de Excel), no de las columnas
// Año/Mes de texto: la fuente tiene inconsistencias puntuales entre esas
// etiquetas y la fecha real (ej. una fila rotulada año "2023" cuya fecha real
// es 2024-04-25; otra rotulada "Agosto" cuya fecha real es 30/07). La fecha
// serial es el único campo no ambiguo, así que es la fuente de verdad.
const dataRows = rows.filter((r) => r.r >= 2 && r.cells[COL_FECHA] != null && r.cells[COL_IMPORTE] != null);

const ventas = dataRows.map((r) => {
  const c = r.cells;
  const fechaISO = excelSerialToISO(c[COL_FECHA]);
  const anio = Number(fechaISO.slice(0, 4));
  const mesIdx = Number(fechaISO.slice(5, 7)) - 1;
  const margenRaw = COL_MARGEN ? c[COL_MARGEN] : null;
  const descRaw = COL_DESCRIPCION ? c[COL_DESCRIPCION] : null;
  if (COL_ANIO && c[COL_ANIO] != null && Number(c[COL_ANIO]) !== anio) {
    console.warn(`Aviso: fila ${r.r} — columna Año dice ${c[COL_ANIO]} pero la fecha (${fechaISO}) indica ${anio}. Se usó ${anio}.`);
  }
  if (COL_MES && c[COL_MES] != null && String(c[COL_MES]).trim() !== MESES[mesIdx]) {
    console.warn(`Aviso: fila ${r.r} — columna Mes dice "${c[COL_MES]}" pero la fecha (${fechaISO}) indica "${MESES[mesIdx]}". Se usó "${MESES[mesIdx]}".`);
  }
  return {
    anio,
    fechaISO,
    mes: MESES[mesIdx],
    cliente: (c[COL_CLIENTE] || '').trim(),
    fruta: c[COL_FRUTA] ? c[COL_FRUTA].trim() : null,
    refrigerante: c[COL_REFRI] ? c[COL_REFRI].trim() : null,
    vendedor: c[COL_VENDEDOR] ? c[COL_VENDEDOR].trim() : null,
    margen: margenRaw != null && margenRaw !== '' ? Number(margenRaw) : null,
    importe: Number(c[COL_IMPORTE]),
    tipoVenta: c[COL_TIPO] ? String(c[COL_TIPO]).trim() : null,
    nombreProyecto: descRaw ? descRaw.trim() : null,
  };
}).filter((r) => r.fechaISO >= RANGE_MIN && r.fechaISO <= RANGE_MAX);

ventas.sort((a, b) => a.fechaISO.localeCompare(b.fechaISO));

writeFileSync(OUT_PATH, JSON.stringify(ventas, null, 2) + '\n');
console.log(`ventas.json: ${ventas.length} registros (${RANGE_MIN} a ${RANGE_MAX}), pestaña "${ventasSheet.name}" de ${path.basename(XLSX_PATH)}`);
