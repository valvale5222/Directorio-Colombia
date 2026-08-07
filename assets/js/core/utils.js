// Utilidades compartidas por varias vistas: formato de moneda, orden de tablas,
// gradientes de Chart.js y la tabla genérica de "modal de detalle".

export const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function fmtMM(n) {
  if (n === null || n === undefined) return '—';
  if (Math.abs(n) >= 1) return '$' + n.toFixed(2) + 'MM';
  return '$' + Math.round(n * 1000) + 'k';
}

export function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return n.toFixed(2) + '%';
}

export function fmt(n) {
  return n == null ? '—' : n.toFixed(2);
}

// Formato ejecutivo compartido — $X.XXMM / $XXXK / $X entero.
// Único formateador de moneda de la app (unifica el antiguo duplicado `fmtV` de Clientes).
export function fmtEjecutivo(v) {
  if (v === null || v === undefined) return '—';
  const neg = v < 0, a = Math.abs(v);
  let s;
  if (a >= 1000000) s = '$' + (a / 1000000).toFixed(2) + 'MM';
  else if (a >= 1000) s = '$' + Math.round(a / 1000) + 'K';
  else s = '$' + Math.round(a);
  return neg ? ('-' + s) : s;
}

// Gradiente radial reutilizable para donas premium (con fallback a color plano).
export function radialGrad(ctx, area, c1, c2) {
  if (!area || typeof ctx.createRadialGradient !== 'function') return c2;
  const cx = area.left + area.width / 2, cy = area.top + area.height / 2;
  const r = Math.max(area.width, area.height) / 2;
  const g = ctx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}

// Ordenamiento compartido — números, texto (sin tildes/case) y nombres con
// numeración de ranking ("1. Cliente").
export function sortKey(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).replace(/^\d+\.\s*/, '');
  const DIACRITICS = /[̀-ͯ]/g;
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

export function cmp(va, vb) {
  let ka = sortKey(va), kb = sortKey(vb);
  if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
  ka = String(ka); kb = String(kb);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

// Tabla genérica de los modales de detalle — resalta el máximo/mínimo por columna.
export function tbl(head, rows, foot) {
  function pn(s) {
    if (!s || s === '—') return NaN;
    const c = String(s).replace(/−/g, '-').replace(/[^\d.\-]/g, '');
    const m = c.match(/^-?\d+\.?\d*/);
    return m ? parseFloat(m[0]) : NaN;
  }
  const colV = head.map((hh, ci) => {
    if (!hh.r) return null;
    const vs = rows.map(r => pn(r[ci])).filter(v => !isNaN(v));
    return vs.length >= 3 ? vs : null;
  });
  const cMax = colV.map(v => v ? Math.max(...v) : null);
  const cMin = colV.map(v => v ? Math.min(...v) : null);
  let h = '<div style="overflow-x:auto"><table class="dt"><tr>' +
    head.map(x => `<th class="${x.r ? 'num' : ''}">${x.t}</th>`).join('') + '</tr>';
  rows.forEach(r => {
    h += '<tr>' + r.map((c, ci) => {
      const base = head[ci] && head[ci].r ? 'num' : '';
      const n = pn(c);
      let cls = base;
      if (!isNaN(n) && cMax[ci] !== null && cMax[ci] !== cMin[ci]) {
        if (n === cMax[ci]) cls = (base ? 'num ' : '') + 'td-hi';
        else if (n === cMin[ci]) cls = (base ? 'num ' : '') + 'td-lo';
      }
      return `<td class="${cls}">${c}</td>`;
    }).join('') + '</tr>';
  });
  if (foot) h += '<tr class="tot">' + foot.map((c, i) => `<td class="${head[i] && head[i].r ? 'num' : ''}">${c}</td>`).join('') + '</tr>';
  return h + '</table></div>';
}
