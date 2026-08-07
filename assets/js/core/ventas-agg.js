// Agregados derivados de data/ventas.json, compartidos por las vistas Ventas y Clientes
// (ambas parten del mismo histórico de ventas, así que el cálculo vive en un solo lugar).

import { meses } from './utils.js';

const VT_YR_COLOR = { 2023: '#94A3B8', 2024: '#F59E0B', 2025: '#3EC6AC', 2026: '#0A1E64' };
const VT_MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function vtFechaLarga(iso) {
  const d = new Date(iso);
  return String(d.getUTCDate()).padStart(2, '0') + ' de ' + VT_MESES_LARGO[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
}

export function vtYearTotal(agg, yr) {
  const c = agg.VT_CUM[yr];
  if (!c) return 0;
  // El año en curso trae `null` en los meses aún sin datos (ver computeVentasAggregates);
  // el total real es el último acumulado no-nulo, no necesariamente el último elemento.
  for (let i = c.length - 1; i >= 0; i--) {
    if (c[i] != null) return c[i];
  }
  return 0;
}

// `ventas` = array de registros de data/ventas.json (años sin datos no se inventan).
export function computeVentasAggregates(ventas) {
  const VT_YEARS = Array.from(new Set(ventas.map(r => r.anio))).sort((a, b) => a - b);

  const VT_YR_CFG = VT_YEARS.map((yr, i) => {
    const last = i === VT_YEARS.length - 1;
    const isRecent = i >= VT_YEARS.length - 2;
    return {
      yr, label: String(yr), c: VT_YR_COLOR[yr],
      d: last ? [] : (isRecent ? [] : [5, 4]),
      w: last ? 3.5 : (isRecent ? 2.5 : 1.5),
      r: last ? 5.5 : (isRecent ? 4 : 2),
      hr: last ? 8 : (isRecent ? 6 : 4),
    };
  });

  // Agregados mensuales / acumulados por año (nominal, USD).
  const VT_MONTHLY = {};
  const VT_CUM = {};
  VT_YEARS.forEach((yr, idx) => {
    const arr = new Array(12).fill(0);
    const hasMonth = new Array(12).fill(false);
    ventas.forEach(r => {
      if (r.anio !== yr) return;
      const m = new Date(r.fechaISO).getUTCMonth();
      arr[m] += r.importe;
      hasMonth[m] = true;
    });
    VT_MONTHLY[yr] = arr;

    // Año en curso (el más reciente de la base): el acumulado debe detenerse en el
    // último mes con registros reales. Los meses posteriores quedan en `null`
    // (no en 0 ni proyectados) para que la serie no siga plana hasta diciembre.
    const isCurrentYear = idx === VT_YEARS.length - 1;
    let lastDataMonth = -1;
    if (isCurrentYear) hasMonth.forEach((has, m) => { if (has) lastDataMonth = m; });

    let acc = 0;
    VT_CUM[yr] = arr.map((v, m) => {
      if (isCurrentYear && lastDataMonth >= 0 && m > lastDataMonth) return null;
      acc += v;
      return Math.round(acc * 100) / 100;
    });
  });

  // Estacionalidad — agrega TODA la historia disponible, sin filtro de zona
  // (la fuente actual no contiene una columna de zona comercial confiable).
  const VT_SEAS_MONTH = new Array(12).fill(0);
  const VT_SEAS_BYYEAR = {};
  VT_YEARS.forEach(yr => { VT_SEAS_BYYEAR[yr] = new Array(12).fill(0); });
  ventas.forEach(r => {
    const m = new Date(r.fechaISO).getUTCMonth();
    VT_SEAS_MONTH[m] += r.importe;
    VT_SEAS_BYYEAR[r.anio][m] += r.importe;
  });
  const VT_SEAS_TOTAL = VT_SEAS_MONTH.reduce((a, b) => a + b, 0);
  const VT_SEAS_PCT = VT_SEAS_MONTH.map(v => VT_SEAS_TOTAL ? (v / VT_SEAS_TOTAL * 100) : 0);
  const VT_SEAS_Q = [0, 0, 0, 0];
  VT_SEAS_MONTH.forEach((v, i) => { VT_SEAS_Q[Math.floor(i / 3)] += v; });
  const VT_SEAS_Q_PCT = VT_SEAS_Q.map(v => VT_SEAS_TOTAL ? (v / VT_SEAS_TOTAL * 100) : 0);

  // Ventas 2026 — Top clientes (agrupado por cliente, sin deducir margen entre registros).
  const VT_2026 = ventas.filter(r => r.anio === 2026);
  const VT_2026_TOTAL = VT_2026.reduce((s, r) => s + r.importe, 0);
  const VT_2026_CLIENTES_UNICOS = Array.from(new Set(VT_2026.map(r => r.cliente)));
  const VT_TOP_CLIENTES = (() => {
    const byCli = {};
    VT_2026.forEach(r => {
      const c = r.cliente;
      byCli[c] = byCli[c] || { cliente: c, importe: 0, margenSum: 0, margenCount: 0, tiposVenta: new Set() };
      byCli[c].importe += r.importe;
      if (r.margen != null) { byCli[c].margenSum += r.margen; byCli[c].margenCount++; }
      if (r.tipoVenta) byCli[c].tiposVenta.add(r.tipoVenta);
    });
    const arr = Object.values(byCli).map(d => ({
      cliente: d.cliente,
      importe: Math.round(d.importe * 100) / 100,
      margen: d.margenCount ? (d.margenSum / d.margenCount) : null,
      tipoVenta: d.tiposVenta.size === 1 ? [...d.tiposVenta][0] : (d.tiposVenta.size > 1 ? 'MIXTO' : null),
    }));
    arr.sort((a, b) => b.importe - a.importe);
    return arr;
  })();
  const VT_TOP5 = VT_TOP_CLIENTES.slice(0, 5);
  const VT_RESTO_IMPORTE = Math.round((VT_2026_TOTAL - VT_TOP5.reduce((s, c) => s + c.importe, 0)) * 100) / 100;

  // Margen mensual/anual por año — ponderado por importe, solo sobre filas con
  // margen informado (null donde no hubo ventas con margen ese mes/año, nunca 0).
  const VT_MARGEN_MONTHLY = {};
  const VT_MARGEN_YEAR = {};
  VT_YEARS.forEach(yr => {
    const impByMonth = new Array(12).fill(0);
    const impMgByMonth = new Array(12).fill(0);
    const hasMgByMonth = new Array(12).fill(false);
    let impYr = 0, impMgYr = 0, hasMgYr = false;
    ventas.forEach(r => {
      if (r.anio !== yr || r.margen == null) return;
      const m = new Date(r.fechaISO).getUTCMonth();
      impByMonth[m] += r.importe; impMgByMonth[m] += r.importe * r.margen; hasMgByMonth[m] = true;
      impYr += r.importe; impMgYr += r.importe * r.margen; hasMgYr = true;
    });
    VT_MARGEN_MONTHLY[yr] = impByMonth.map((imp, i) => hasMgByMonth[i] ? Math.round(impMgByMonth[i] / imp * 10000) / 100 : null);
    VT_MARGEN_YEAR[yr] = hasMgYr ? Math.round(impMgYr / impYr * 10000) / 100 : null;
  });

  // Margen 2026: cobertura e indicador ponderado solo sobre lo informado.
  const VT_MARGEN_ROWS = VT_2026.filter(r => r.margen != null);
  const VT_MARGEN_IMPORTE = VT_MARGEN_ROWS.reduce((s, r) => s + r.importe, 0);
  const VT_MARGEN_PONDERADO = VT_MARGEN_IMPORTE
    ? (VT_MARGEN_ROWS.reduce((s, r) => s + r.importe * r.margen, 0) / VT_MARGEN_IMPORTE * 100)
    : null;
  const VT_MARGEN_COBERTURA = VT_2026_TOTAL ? (VT_MARGEN_IMPORTE / VT_2026_TOTAL * 100) : 0;

  // Última fecha disponible (para textos "al ..." dinámicos).
  const VT_LAST_SALE = ventas.reduce((max, r) => (!max || new Date(r.fechaISO) > new Date(max)) ? r.fechaISO : max, null);
  const VT_LAST_SALE_TXT = VT_LAST_SALE ? vtFechaLarga(VT_LAST_SALE) : 'No disponible';

  // Tipo de venta — disponible si al menos una fila trae la columna TIPO DE VENTA informada.
  const VT_TIPO_DISPONIBLE = VT_2026.some(r => r.tipoVenta != null && String(r.tipoVenta).trim() !== '');

  // Histórico completo (2023–jul 2026, todo lo que entrega `ventas`) — para la sección de análisis.
  const VT_TOTAL_HIST = ventas.reduce((s, r) => s + r.importe, 0);
  const VT_BEST_YEAR = VT_YEARS.reduce((best, yr) => {
    const t = vtYearTotal({ VT_CUM }, yr);
    return (!best || t > best.total) ? { yr, total: t } : best;
  }, null);

  return {
    meses, VT_YEARS, VT_YR_COLOR, VT_YR_CFG, VT_MONTHLY, VT_CUM,
    VT_SEAS_MONTH, VT_SEAS_BYYEAR, VT_SEAS_TOTAL, VT_SEAS_PCT, VT_SEAS_Q, VT_SEAS_Q_PCT,
    VT_2026, VT_2026_TOTAL, VT_2026_CLIENTES_UNICOS,
    VT_TOP_CLIENTES, VT_TOP5, VT_RESTO_IMPORTE,
    VT_MARGEN_MONTHLY, VT_MARGEN_YEAR, VT_TOTAL_HIST, VT_BEST_YEAR,
    VT_MARGEN_ROWS, VT_MARGEN_IMPORTE, VT_MARGEN_PONDERADO, VT_MARGEN_COBERTURA,
    VT_LAST_SALE, VT_LAST_SALE_TXT, VT_TIPO_DISPONIBLE,
  };
}
