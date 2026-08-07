// Vista Ventas — hero 2026, evolución histórica, estacionalidad, Top 5 clientes,
// por tipo de venta y detalle de operaciones 2026.

import { getVentas } from '../core/data.js';
import { computeVentasAggregates, vtYearTotal } from '../core/ventas-agg.js';
import { meses, fmtPct, fmtEjecutivo, tbl } from '../core/utils.js';
import { openModal, setModalChartInstance } from '../core/modal.js';
import { isDarkTheme } from '../core/theme.js';

const INK = () => (isDarkTheme() ? '#e7ebf6' : '#0a0a1e');
const INK_MUTED = () => (isDarkTheme() ? '#c3cbe6' : '#3d4a6a');

let agg = null; // se llena en ready()

function _renderVtLegend(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = agg.VT_YR_CFG.map((c) => {
    const style = 'border-color:' + c.c + ';border-style:' +
      (c.d && c.d.length ? 'dashed' : 'solid') + ';border-width:' + c.w + 'px';
    return '<span class="vt-leg-item"><span class="vt-leg-line" style="' + style + '"></span>' + c.label + '</span>';
  }).join('');
}

/* Hex → "r,g,b" — usado para construir el degradado de área del año protagonista */
function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
}

function _vtDs(dataByYear) {
  return agg.VT_YR_CFG.map((cfg) => {
    const isLast = cfg.yr === agg.VT_YEARS[agg.VT_YEARS.length - 1];
    const isPrev = cfg.yr === agg.VT_YEARS[agg.VT_YEARS.length - 2];
    const ptBg = isLast ? cfg.c : (isPrev ? cfg.c : '#fff');
    const rgb = _hexToRgb(cfg.c);
    return {
      label: cfg.label,
      data: dataByYear[cfg.yr],
      borderColor: cfg.c,
      borderWidth: cfg.w,
      borderDash: cfg.d,
      pointRadius: cfg.r,
      pointHoverRadius: cfg.hr,
      pointBackgroundColor: ptBg,
      pointBorderColor: cfg.c,
      pointBorderWidth: isLast ? 2.5 : 2,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: cfg.c,
      pointHoverBorderWidth: isLast ? 3 : 2,
      /* Sólo el año protagonista lleva relleno de área — sutil degradado hacia
         la base, refuerza jerarquía visual sin ocultar los años de referencia. */
      fill: isLast ? 'origin' : false,
      backgroundColor: isLast ? (ctx) => {
        const area = ctx.chart.chartArea;
        if (!area) return 'rgba(' + rgb + ',.12)';
        const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, 'rgba(' + rgb + ',.22)');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        return g;
      } : 'transparent',
      spanGaps: false,
    };
  });
}

/* ── Highlight de series al pasar el mouse por la leyenda — atenúa el resto ── */
function _vtWireLegendHighlight(legendId, chart) {
  const el = document.getElementById(legendId);
  if (!el || !chart) return;
  const items = el.querySelectorAll('.vt-leg-item');
  items.forEach((item, i) => {
    item.addEventListener('mouseenter', () => {
      chart.data.datasets.forEach((ds, di) => {
        if (ds._vtBorder === undefined) ds._vtBorder = ds.borderColor;
        ds.borderColor = di === i ? ds._vtBorder : 'rgba(180,190,210,.28)';
      });
      chart.update('none');
    });
    item.addEventListener('mouseleave', () => {
      chart.data.datasets.forEach((ds) => { if (ds._vtBorder !== undefined) ds.borderColor = ds._vtBorder; });
      chart.update('none');
    });
  });
}

/* ── Etiquetas de valor sobre barras — refuerza lectura directa sin depender del hover ── */
const _vtBarValuePlugin = {
  id: 'vtBarValue',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts || !opts.fmt) return;
    const meta = chart.getDatasetMeta(0);
    const data = chart.data.datasets[0].data;
    const horiz = chart.options.indexAxis === 'y';
    const { ctx } = chart;
    ctx.save();
    ctx.font = "700 10.5px 'Inter',sans-serif";
    ctx.fillStyle = opts.color || INK_MUTED();
    meta.data.forEach((bar, i) => {
      const v = data[i];
      if (v === null || v === undefined) return;
      const txt = opts.fmt(v);
      if (horiz) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, bar.x + 8, bar.y);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(txt, bar.x, bar.y - 8);
      }
    });
    ctx.restore();
  }
};

function _vtExternalTooltip(ctx) {
  const chart = ctx.chart;
  const tooltip = ctx.tooltip;
  const wrap = chart.canvas.parentNode;

  /* Get or create tooltip element — one per chart-wrap */
  let el = wrap.querySelector('.vt-ext-tip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'vt-ext-tip';
    wrap.appendChild(el);
  }

  /* Hide when cursor leaves chart */
  if (!tooltip.dataPoints || tooltip.opacity === 0) {
    el.style.opacity = '0';
    return;
  }

  /* Auto-detect formatter from canvas attribute */
  const isPct = chart.canvas.dataset && chart.canvas.dataset.vtFmt === 'pct';
  const fmtV = isPct ? fmtPct : fmtEjecutivo;

  /* Non-null data points, sorted 2026 → 2021 (protagonist first) */
  const dp = tooltip.dataPoints
    .filter((p) => p.parsed.y !== null && p.parsed.y !== undefined)
    .sort((a, b) => parseInt(b.dataset.label, 10) - parseInt(a.dataset.label, 10));

  if (!dp.length) { el.style.opacity = '0'; return; }

  const month = dp[0].label || '';
  let html = '<div class="vt-tip-hdr">' + month + '</div><div class="vt-tip-rows">';
  dp.forEach((p) => {
    const yr = p.dataset.label;
    const v = p.parsed.y;
    const c = p.dataset.borderColor;
    const star = yr === '2026';
    html += '<div class="vt-tip-row' + (star ? ' star' : '') + '">'
      + '<span class="vt-tip-dot" style="background:' + c + '"></span>'
      + '<span class="vt-tip-yr">' + yr + '</span>'
      + '<span class="vt-tip-val">' + fmtV(v) + '</span>'
      + '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
  el.style.opacity = '1';

  /* Position: right of caret, flip left if near chart edge */
  const wW = wrap.offsetWidth;
  const wH = wrap.offsetHeight;
  const tipW = el.offsetWidth || 200;
  const tipH = el.offsetHeight || 130;
  const cx = tooltip.caretX;
  const cy = tooltip.caretY;

  let left = (cx + tipW + 20 > wW) ? (cx - tipW - 12) : (cx + 16);
  left = Math.max(0, Math.min(left, wW - tipW));
  const top = Math.max(0, Math.min(cy - Math.round(tipH / 2), wH - tipH));

  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

/* ── Ventas: shared Chart.js options (outside guard, used in modals too) ── */
const _vtSharedOpts = {
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 900, easing: 'easeInOutQuart' },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      enabled: false,              /* built-in disabled — external tooltip renders instead */
      external: _vtExternalTooltip,
      mode: 'index', intersect: false  /* still needed for dataPoints collection */
    }
  },
  scales: {
    x: { grid: { display: false }, border: { display: false },
      ticks: { font: { size: 10 }, color: '#94a3b8', maxRotation: 0 } },
    y: { grid: { color: 'rgba(10,10,30,.05)', lineWidth: 1 }, border: { display: false },
      ticks: { font: { size: 10 }, color: '#94a3b8', padding: 6 } }
  },
  elements: {
    point: { radius: 2 },            /* fallback default; ventas datasets override via _vtDs() */
    line: { tension: .35, borderCapStyle: 'round', borderJoinStyle: 'round' }
  }
};

/* ── Mapa de calor de estacionalidad ── */
let _hmTip = null;
function _hmTipShow(ev, title) {
  if (!_hmTip) {
    _hmTip = document.createElement('div');
    _hmTip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0;'
      + 'transition:opacity .15s;background:rgba(9,12,30,.95);border:1px solid rgba(62,198,172,.28);'
      + 'border-radius:10px;padding:9px 14px;font-family:Inter,sans-serif;font-size:11px;'
      + 'font-weight:600;color:#fff;box-shadow:0 14px 40px rgba(10,10,30,.4),0 3px 10px rgba(10,10,30,.22);'
      + 'white-space:nowrap;letter-spacing:.2px';
    document.body.appendChild(_hmTip);
  }
  _hmTip.textContent = title;
  _hmTip.style.opacity = '1';
  _hmTip.style.left = (ev.clientX + 16) + 'px';
  _hmTip.style.top = (ev.clientY - 40) + 'px';
}
function _hmTipHide() { if (_hmTip) _hmTip.style.opacity = '0'; }
function _hmTipMove(ev) {
  if (!_hmTip || _hmTip.style.opacity === '0') return;
  const tipW = _hmTip.offsetWidth || 180;
  let left = ev.clientX + 16;
  if (left + tipW > window.innerWidth - 10) left = ev.clientX - tipW - 10;
  _hmTip.style.left = left + 'px';
  _hmTip.style.top = (ev.clientY - 40) + 'px';
}
// Expuestas en window: el grid del mapa de calor se inyecta como innerHTML con
// atributos onmouseenter/onmouseleave/onmousemove que se resuelven en el scope global.
window._hmTipShow = _hmTipShow;
window._hmTipHide = _hmTipHide;
window._hmTipMove = _hmTipMove;

function _hmapRender() {
  const el = document.getElementById('hmapGrid');
  if (!el) return;
  const data = agg.VT_SEAS_BYYEAR;
  const mes = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const years = agg.VT_YEARS;

  /* Max value for color normalization (sqrt for perceptual balance) */
  const allVals = [];
  years.forEach((yr) => {
    (data[yr] || []).forEach((v) => { if (v && v > 0) allVals.push(v); });
  });
  const vmax = allVals.length ? Math.max.apply(null, allVals) : 1;

  /* Aqua → navy gradient (Friopacking identity) */
  const stops = [[0, 240, 249, 246], [0.15, 196, 232, 220], [0.35, 128, 211, 189], [0.58, 62, 198, 172], [0.82, 22, 110, 92], [1, 10, 10, 30]];
  function interpHm(t) {
    if (t <= 0) return stops[0].slice(1);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], f = (t - a[0]) / (b[0] - a[0]);
        return [Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), Math.round(a[3] + (b[3] - a[3]) * f)];
      }
    }
    return stops[5].slice(1);
  }

  function cellFmt(v) {
    if (!v || v === 0) return '';
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + Math.round(v / 1000) + 'K';
    return '$' + Math.round(v);
  }
  function cellTitle(yr, m, v) {
    const vStr = v && v > 0 ? fmtEjecutivo(v) : 'Sin registros en la base';
    return yr + ' · ' + mes[m] + ': ' + vStr;
  }

  let h = '<table class="hmap-table"><thead><tr>';
  h += '<th class="hmap-yr-th" style="vertical-align:bottom;padding-bottom:8px;width:6.5%">&nbsp;</th>';
  mes.forEach((m) => { h += '<th class="hmap-th">' + m + '</th>'; });
  h += '</tr></thead><tbody>';

  years.forEach((yr) => {
    const yData = data[yr] || [];
    h += '<tr><td class="hmap-yr-th">' + yr + '</td>';
    for (let m = 0; m < 12; m++) {
      const v = yData[m];
      const isEmpty = (v === null || v === undefined || v === 0);
      const tipText = cellTitle(yr, m, isEmpty ? 0 : v);
      if (isEmpty) {
        h += '<td class="hmap-cell" style="background:#f5f7fa;color:#c8d0de"'
          + ' onmouseenter="_hmTipShow(event,\'' + tipText + '\')" onmouseleave="_hmTipHide()" onmousemove="_hmTipMove(event)"></td>';
      } else {
        const t = Math.sqrt(v / vmax);
        const c = interpHm(t);
        const bg = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
        const tx = t > 0.52 ? '#fff' : (t > 0.22 ? '#0A1E64' : '#3d5070');
        const lbl = cellFmt(v);
        h += '<td class="hmap-cell" style="background:' + bg + ';color:' + tx + '"'
          + ' onmouseenter="_hmTipShow(event,\'' + tipText + '\')" onmouseleave="_hmTipHide()" onmousemove="_hmTipMove(event)">' + lbl + '</td>';
      }
    }
    h += '</tr>';
  });
  h += '</tbody></table>';
  el.innerHTML = h;

  /* Scale bar */
  const sb = document.getElementById('hmapScaleBar');
  if (sb) {
    let sbH = '';
    for (let i = 0; i < 30; i++) { const c = interpHm(i / 29); sbH += '<div style="flex:1;background:rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')"></div>'; }
    sb.innerHTML = sbH;
  }
}

/* ── Tarjetas KPI (kpi-v3) — mismo componente premium usado en Clientes,
   reutilizado aquí para dar profundidad analítica a Evolución y Análisis. ── */
function _vtKpiCardsHtml(cards) {
  return cards.map((c) => (
    '<div class="kpi-v3 vt-anim" style="cursor:default">'
    + '<div class="kv3-icon">' + c.icon + '</div>'
    + '<div class="kv3-lbl">' + c.lbl + '</div>'
    + '<div class="kv3-val" style="color:' + c.color + '">' + c.val + '</div>'
    + '<div class="kv3-bar-track"><div class="kv3-bar-fill" style="width:' + Math.max(2, c.bar) + '%;background:' + c.color + '"></div></div>'
    + '<div class="kv3-ctx">' + c.ctx + '</div>'
    + '<div class="kv3-delta" style="color:' + c.deltaColor + '">' + c.delta + '</div>'
    + '</div>'
  )).join('');
}

function _renderVtEvolKpis() {
  const el = document.getElementById('vtEvolKpis');
  if (!el) return;
  const curYr = agg.VT_YEARS[agg.VT_YEARS.length - 1];

  const bestYr = agg.VT_BEST_YEAR;
  const bestShare = agg.VT_TOTAL_HIST ? (bestYr.total / agg.VT_TOTAL_HIST * 100) : 0;

  /* Ticket promedio 2026 — ventas 2026 ÷ número de operaciones 2026 */
  const opsCount2026 = agg.VT_2026.length;
  const avgTicket2026 = opsCount2026 ? (agg.VT_2026_TOTAL / opsCount2026) : null;

  /* Margen ponderado histórico — promedio de los años con margen informado, ponderado por sus ventas */
  let mgNum = 0, mgDen = 0, mgYears = 0;
  agg.VT_YEARS.forEach((y) => {
    const m = agg.VT_MARGEN_YEAR[y];
    if (m == null) return;
    const t = vtYearTotal(agg, y);
    mgNum += m * t; mgDen += t; mgYears++;
  });
  const mgHist = mgDen ? (mgNum / mgDen) : null;

  el.innerHTML = _vtKpiCardsHtml([
    {
      icon: '🗂️', lbl: 'Ventas hist&oacute;ricas totales', color: '#185FA5',
      val: fmtEjecutivo(agg.VT_TOTAL_HIST), bar: 100,
      ctx: agg.VT_YEARS[0] + '&ndash;' + curYr + ' &middot; ' + curYr + ' disponible al ' + agg.VT_LAST_SALE_TXT,
      delta: agg.VT_YEARS.length + ' a&ntilde;os de historia en la base', deltaColor: 'var(--ts)'
    },
    {
      icon: '🏆', lbl: 'Mejor a&ntilde;o hist&oacute;rico', color: '#0F6E56',
      val: String(bestYr.yr), bar: bestShare,
      ctx: fmtEjecutivo(bestYr.total) + ' en ventas totales',
      delta: bestShare.toFixed(1) + '% del acumulado hist&oacute;rico', deltaColor: '#0F6E56'
    },
    {
      icon: '🎫', lbl: 'Ticket promedio 2026', color: '#3EC6AC',
      val: avgTicket2026 != null ? fmtEjecutivo(avgTicket2026) : '—', bar: 100,
      ctx: 'Venta promedio por operaci&oacute;n',
      delta: opsCount2026 + (opsCount2026 === 1 ? ' operaci&oacute;n cerrada en 2026' : ' operaciones cerradas en 2026'), deltaColor: 'var(--ts)'
    },
    {
      icon: '💹', lbl: 'Margen ponderado hist&oacute;rico', color: '#d97706',
      val: mgHist != null ? mgHist.toFixed(2) + '%' : '—', bar: mgHist != null ? Math.min(100, mgHist) : 0,
      ctx: mgYears + ' a&ntilde;os con margen informado',
      delta: 'Ponderado por ventas de cada a&ntilde;o', deltaColor: 'var(--ts)'
    }
  ]);
}

function _renderVtAnalisisKpis() {
  const el = document.getElementById('vtAnalisisKpis');
  if (!el) return;
  const pct = agg.VT_SEAS_PCT;
  let maxI = 0, minI = 0;
  pct.forEach((v, i) => { if (v > pct[maxI]) maxI = i; if (v < pct[minI]) minI = i; });

  const qPct = agg.VT_SEAS_Q_PCT;
  const qRange = ['Ene-Mar', 'Abr-Jun', 'Jul-Sep', 'Oct-Dic'];
  let maxQ = 0;
  qPct.forEach((v, i) => { if (v > qPct[maxQ]) maxQ = i; });

  const top3 = pct.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 3);
  const top3Sum = top3.reduce((s, m) => s + m.v, 0);
  const top3Names = top3.map((m) => meses[m.i]).join(', ');

  /* Barras decorativas — escaladas a una referencia realista (no a 100%) para
     que el nivel de llenado sea legible incluso con % mensuales pequeños. */
  const barScale = (v, ref) => Math.min(100, v / ref * 100);

  el.innerHTML = _vtKpiCardsHtml([
    {
      icon: '📅', lbl: 'Mes pico hist&oacute;rico', color: '#0F6E56',
      val: meses[maxI], bar: barScale(pct[maxI], 25),
      ctx: pct[maxI].toFixed(1) + '% del total facturado',
      delta: fmtEjecutivo(agg.VT_SEAS_MONTH[maxI]) + ' acumulados', deltaColor: 'var(--ts)'
    },
    {
      icon: '📉', lbl: 'Mes de menor actividad', color: '#7b8db0',
      val: meses[minI], bar: barScale(pct[minI], 25),
      ctx: pct[minI].toFixed(1) + '% del total facturado',
      delta: fmtEjecutivo(agg.VT_SEAS_MONTH[minI]) + ' acumulados', deltaColor: 'var(--ts)'
    },
    {
      icon: '🥇', lbl: 'Trimestre l&iacute;der', color: '#3EC6AC',
      val: 'Q' + (maxQ + 1), bar: barScale(qPct[maxQ], 45),
      ctx: qRange[maxQ] + ' &middot; ' + qPct[maxQ].toFixed(1) + '% del total',
      delta: 'Concentra la mayor porci&oacute;n del a&ntilde;o', deltaColor: 'var(--ts)'
    },
    {
      icon: '⚖️', lbl: 'Concentraci&oacute;n top 3 meses', color: '#D85A30',
      val: top3Sum.toFixed(1) + '%', bar: barScale(top3Sum, 65),
      ctx: top3Names,
      delta: 'del total facturado hist&oacute;rico', deltaColor: 'var(--ts)'
    }
  ]);
}

export function vtSwitchTab(view) {
  document.querySelectorAll('#vtTabs .vt-tab-btn').forEach((t) => { t.classList.toggle('active', t.dataset.vtview === view); });
  document.querySelectorAll('#ventas .vt-view').forEach((v) => { v.classList.toggle('active', v.dataset.vtview === view); });
  setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 60);
}

/* ── Flip toggle — locks modal overflow during 3D transition to kill scrollbar flicker ── */
function _vtDoFlip() {
  const inner = document.getElementById('mdlFlipInner');
  if (!inner) return;
  const modal = document.querySelector('#modalBg .modal');
  if (modal) modal.style.overflow = 'hidden';
  inner.classList.toggle('is-flipped');
  setTimeout(() => { if (modal) modal.style.overflow = ''; }, 640);
}
// Expuesta en window: el botón de flip vive en HTML inyectado en el modal (innerHTML).
window._vtDoFlip = _vtDoFlip;

/* ── Ventas modal legend HTML ── */
function _vtLegHtml() {
  return agg.VT_YR_CFG.map((c) => {
    const style = 'border-color:' + c.c + ';border-style:' + (c.d && c.d.length ? 'dashed' : 'solid') + ';border-width:' + c.w + 'px';
    return '<span class="vt-leg-item"><span class="vt-leg-line" style="' + style + '"></span>' + c.label + '</span>';
  }).join('');
}

/* ── Compute optimal flip height: maximize chart area without scroll ── */
function _vtFlipHeight() {
  /* 90vh modal max - header(~70px) - subtitle(~18px) - body padding(40px) - buffer(2px) = 130px overhead */
  return Math.max(380, Math.min(Math.floor(window.innerHeight * 0.90) - 130, 720));
}

/* ── Build modal body with flip card — stable UX ──
   Both faces are flex columns inside a fixed-height grid cell.
   chart-wrap uses flex:1 to fill remaining height after legend row.
   Table wrapper uses flex:1 + overflow:hidden to contain table exactly.
   Height is computed dynamically to fill available modal space.
   No layout shift. No scroll flicker. No modal movement. ── */
function _vtFlipModal(chartId, tableHtml) {
  const h = _vtFlipHeight();

  /* Front face: legend + "Ver detalle" button row (fixed height), then chart fills rest */
  const legRow = '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;'
    + 'padding-bottom:10px;margin-bottom:10px;border-bottom:.5px solid var(--border)">'
    + '<div class="vt-legend" style="flex:1;border-bottom:none;padding-bottom:0;margin-bottom:0">' + _vtLegHtml() + '</div>'
    + '<button class="btn-det-v2" onclick="_vtDoFlip()">&#9783;&nbsp; Ver detalle</button>'
    + '</div>';

  const front = '<div class="mdl-flip-front">'
    + legRow
    /* chart-wrap: flex:1 fills (container_height - legRow_height); min-height:0 required for flex shrink */
    + '<div class="chart-wrap" style="flex:1;min-height:0"><canvas id="' + chartId + '"></canvas></div>'
    + '</div>';

  /* Back face: "Ver gráfico" button (fixed), then table fills rest — overflow:hidden prevents scroll */
  const back = '<div class="mdl-flip-back" style="padding:6px 0 0">'
    + '<div style="flex-shrink:0;padding-bottom:12px;margin-bottom:0;border-bottom:.5px solid var(--border);'
    + 'display:flex;align-items:center;justify-content:space-between">'
    + '<span style="font-size:11px;font-weight:600;color:var(--ts);text-transform:uppercase;letter-spacing:.7px">Detalle mensual</span>'
    + '<button class="btn-back-v2" style="margin-bottom:0" onclick="_vtDoFlip()">&#8592;&nbsp; Ver gr&aacute;fico</button>'
    + '</div>'
    + '<div style="flex:1;overflow:hidden;padding-top:10px">'
    + tableHtml
    + '</div>'
    + '</div>';

  /* Fixed height on inner = both faces always same height → zero reflow on flip */
  return '<div class="mdl-flip">'
    + '<div class="mdl-flip-inner" id="mdlFlipInner" style="height:' + h + 'px">'
    + front + back
    + '</div></div>';
}

/* ── Monthly table for ventas (derived from cumulative data) ── */
function _vtTableV(dataCum) {
  const head = [{ t: 'Mes' }].concat(agg.VT_YEARS.map((y) => ({ t: String(y), r: 1 })));
  const rows = meses.map((m, i) => {
    const row = [m];
    agg.VT_YEARS.forEach((y) => {
      const monthly = agg.VT_MONTHLY[y][i];
      row.push(monthly ? fmtEjecutivo(monthly) : '—');
    });
    return row;
  });
  const foot = ['Total'].concat(agg.VT_YEARS.map((y) => fmtEjecutivo(vtYearTotal(agg, y))));
  const curYr = agg.VT_YEARS[agg.VT_YEARS.length - 1];
  return tbl(head, rows, foot) + '<div class="mnote">Valores mensuales de venta por año. ' + curYr + ' disponible al ' + agg.VT_LAST_SALE_TXT + '.</div>';
}

let _vtModalChart = null;
function openVtVentas() {
  const title = 'Ventas acumuladas por año';
  const sub = 'US$ — evolución acumulada mensual, años con registros en la base';
  openModal(title, _vtFlipModal('_mcanvas', _vtTableV(agg.VT_CUM)), sub);
  if (typeof Chart !== 'undefined') {
    setTimeout(() => {
      const el = document.getElementById('_mcanvas');
      if (!el) return;
      if (_vtModalChart) { _vtModalChart.destroy(); _vtModalChart = null; }
      el.style.width = '100%'; el.style.height = '100%';
      el.dataset.vtFmt = 'mm'; /* formatter for external tooltip */
      _vtModalChart = new Chart(el, { type: 'line', data: { labels: meses, datasets: _vtDs(agg.VT_CUM) },
        options: { ..._vtSharedOpts,
          scales: { ..._vtSharedOpts.scales,
            y: { ..._vtSharedOpts.scales.y, ticks: { ..._vtSharedOpts.scales.y.ticks,
              callback: (v) => fmtEjecutivo(v) } } }
        } });
      setModalChartInstance(_vtModalChart);
    }, 80);
  }
}
window.openVtVentas = openVtVentas;

/* Meta anual 2026 — objetivo comercial fijado en la pestaña OBJETIVOS del Excel
   ("OBJETIVO 1 · Lograr objetivo de ventas de $5MM con margen operativo 18%"),
   no se calcula a partir del histórico de ventas. */
const VT_META_ANUAL = 5000000;

function renderVtHero() {
  const total = agg.VT_2026_TOTAL;
  const pct = VT_META_ANUAL ? (total / VT_META_ANUAL * 100) : 0;
  const brecha = Math.max(0, VT_META_ANUAL - total);
  const ops = agg.VT_2026.length;
  const clientesUnicos = agg.VT_2026_CLIENTES_UNICOS.length;
  const mgVal = agg.VT_MARGEN_PONDERADO;
  const cobertura = agg.VT_MARGEN_COBERTURA;

  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('vtHeroVal', fmtEjecutivo(total));
  set('vtHeroPctVal', pct.toFixed(2) + '%');
  set('vtHeroPctSub', 'Meta: ' + fmtEjecutivo(VT_META_ANUAL) + ' &middot; Brecha: ' + fmtEjecutivo(brecha));
  set('vtHeroOpsVal', String(ops));
  set('vtHeroOpsSub', clientesUnicos + (clientesUnicos === 1 ? ' cliente único' : ' clientes únicos'));
  set('vtHeroMargenVal', mgVal != null ? mgVal.toFixed(2) + '%' : '—');
  set('vtHeroMargenSub', 'Cobertura: ' + cobertura.toFixed(2) + '% de las ventas');
  set('vtHeroMetaLbl', 'Meta: ' + fmtEjecutivo(VT_META_ANUAL));
  set('vtHeroProgMid', 'Vendido: ' + fmtEjecutivo(total) + ' &middot; Brecha: ' + fmtEjecutivo(brecha));

  /* Crecimiento interanual — mismo periodo (ene–jul) 2026 vs 2025, si ambos años están en la base */
  let growthTxt = 'no calculable con la fuente actual (-)';
  const lastMonthIdx = agg.VT_2026.length
    ? Math.max(...agg.VT_2026.map((r) => new Date(r.fechaISO).getUTCMonth()))
    : -1;
  if (lastMonthIdx >= 0 && agg.VT_MONTHLY[2025]) {
    const sum2026 = agg.VT_MONTHLY[2026].slice(0, lastMonthIdx + 1).reduce((a, b) => a + b, 0);
    const sum2025 = agg.VT_MONTHLY[2025].slice(0, lastMonthIdx + 1).reduce((a, b) => a + b, 0);
    if (sum2025 > 0) {
      const g = (sum2026 / sum2025 - 1) * 100;
      growthTxt = (g >= 0 ? '+' : '') + g.toFixed(1) + '% vs. ' + meses[lastMonthIdx] + '–' + meses[0] + ' 2025';
    }
  }
  const lastTxt = agg.VT_LAST_SALE_TXT;
  set('vtHeroMsg', 'Ventas 2026 al ' + lastTxt + ' &middot; Crecimiento interanual: <strong style="color:#fff">' + growthTxt + '</strong>');
}

export function animVtHero() {
  renderVtHero();
  const fill = document.getElementById('vtHeroFill');
  if (!fill) return;
  /* Resetear instantáneamente a 0 */
  fill.style.transition = 'none';
  fill.style.width = '0%';
  /* Doble rAF: fuerza reflow entre el reset y la animación */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.transition = 'width 1.1s cubic-bezier(.4,0,.2,1)';
      fill.style.width = Math.min(100, (agg.VT_2026_TOTAL / VT_META_ANUAL * 100)) + '%';
    });
  });
}

export const ready = (async function init() {
  const ventas = await getVentas();
  agg = computeVentasAggregates(ventas);

  _renderVtLegend('vtLeg1');
  _hmapRender();
  _renderVtEvolKpis();
  _renderVtAnalisisKpis();

  if (typeof Chart !== 'undefined') {
    Chart.register(_vtBarValuePlugin);

    const _elVA = document.getElementById('chVentasAcum');
    /* External tooltip reads data-vt-fmt from canvas element (set in HTML) */
    if (_elVA) {
      const _chVA = new Chart(_elVA, { type: 'line', data: { labels: meses, datasets: _vtDs(agg.VT_CUM) },
        options: { ..._vtSharedOpts,
          scales: { ..._vtSharedOpts.scales,
            y: { ..._vtSharedOpts.scales.y, ticks: { ..._vtSharedOpts.scales.y.ticks,
              callback: (v) => fmtEjecutivo(v) } } } } });
      _vtWireLegendHighlight('vtLeg1', _chVA);
    }

    /* ── Evolución de ventas · barras por cierre/disponible de año ── */
    const VT_CURR_YR = agg.VT_YEARS[agg.VT_YEARS.length - 1];
    const VT_CURR_YR_SHORT = agg.VT_LAST_SALE ? agg.VT_LAST_SALE.slice(8, 10) + '/' + agg.VT_LAST_SALE.slice(5, 7) : '';
    const VT_YR_LBL = agg.VT_YEARS.map((y, i) => i === agg.VT_YEARS.length - 1 ? (y + ' (al ' + VT_CURR_YR_SHORT + ')') : String(y));
    const _elVAB = document.getElementById('chVentasAnualBar');
    if (_elVAB) {
      new Chart(_elVAB, {
        type: 'bar',
        data: {
          labels: VT_YR_LBL,
          datasets: [{
            data: agg.VT_YEARS.map((y) => vtYearTotal(agg, y)),
            backgroundColor: agg.VT_YR_CFG.map((c) => c.c),
            borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false,
            maxBarThickness: 54,
            barPercentage: 0.62,
            categoryPercentage: 0.7
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 22 } },
          animation: { duration: 900, easing: 'easeInOutQuart' },
          plugins: {
            legend: { display: false },
            vtBarValue: { fmt: fmtEjecutivo },
            tooltip: {
              backgroundColor: 'rgba(9,12,30,.95)', padding: { top: 11, bottom: 11, left: 13, right: 13 }, cornerRadius: 10,
              borderColor: 'rgba(62,198,172,.25)', borderWidth: 1,
              titleColor: 'rgba(255,255,255,.4)', titleFont: { size: 9.5, weight: '700' },
              bodyColor: 'rgba(255,255,255,.85)', bodyFont: { size: 12, weight: '600' },
              callbacks: {
                title: (items) => items.length ? items[0].label : '',
                label: (ctx) => 'Ventas: ' + fmtEjecutivo(ctx.parsed.y),
                afterLabel: (ctx) => ctx.dataIndex === agg.VT_YEARS.length - 1 ? ('Disponible al ' + agg.VT_LAST_SALE_TXT) : null
              }
            }
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
            y: { grid: { color: 'rgba(10,10,30,.05)' }, border: { display: false },
              ticks: { font: { size: 10 }, color: '#94a3b8', callback: (v) => fmtEjecutivo(v) } }
          }
        }
      });
    }

    /* Subtítulos dinámicos — reflejan los años realmente presentes en la base */
    (function () {
      const yrsTxt = agg.VT_YEARS.join(', ');
      const sub1 = document.getElementById('vtEvolSub1');
      if (sub1) sub1.textContent = 'US$ — años con registros en la base: ' + yrsTxt;
      const sub2 = document.getElementById('vtEvolSub2');
      if (sub2) sub2.textContent = 'Cierre anual (' + VT_CURR_YR + ' = disponible al ' + agg.VT_LAST_SALE_TXT + ')';
    })();

    /* ── Evolución de margen mensual por año (línea, % ponderado por importe) ── */
    _renderVtLegend('vtLegMargen');
    const _elMM = document.getElementById('chMargenMensual');
    if (_elMM) {
      const _chMM = new Chart(_elMM, { type: 'line', data: { labels: meses, datasets: _vtDs(agg.VT_MARGEN_MONTHLY) },
        options: { ..._vtSharedOpts,
          scales: { ..._vtSharedOpts.scales,
            y: { ..._vtSharedOpts.scales.y, ticks: { ..._vtSharedOpts.scales.y.ticks,
              callback: (v) => v + '%' } } } } });
      _vtWireLegendHighlight('vtLegMargen', _chMM);
    }

    /* ── Margen comercial ponderado por año (barras) ── */
    const _elMA = document.getElementById('chMargenAnual');
    if (_elMA) {
      new Chart(_elMA, {
        type: 'bar',
        data: {
          labels: VT_YR_LBL,
          datasets: [{
            data: agg.VT_YEARS.map((y) => agg.VT_MARGEN_YEAR[y]),
            backgroundColor: agg.VT_YR_CFG.map((c) => c.c),
            borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false,
            maxBarThickness: 54,
            barPercentage: 0.62,
            categoryPercentage: 0.7
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 22 } },
          animation: { duration: 900, easing: 'easeInOutQuart' },
          plugins: {
            legend: { display: false },
            vtBarValue: { fmt: (v) => v.toFixed(1) + '%' },
            tooltip: {
              backgroundColor: 'rgba(9,12,30,.95)', padding: { top: 11, bottom: 11, left: 13, right: 13 }, cornerRadius: 10,
              borderColor: 'rgba(62,198,172,.25)', borderWidth: 1,
              titleColor: 'rgba(255,255,255,.4)', titleFont: { size: 9.5, weight: '700' },
              bodyColor: 'rgba(255,255,255,.85)', bodyFont: { size: 12, weight: '600' },
              callbacks: {
                title: (items) => items.length ? items[0].label : '',
                label: (ctx) => ctx.parsed.y == null ? 'Sin margen informado' : ('Margen: ' + ctx.parsed.y.toFixed(2) + '%')
              }
            }
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
            y: { grid: { color: 'rgba(10,10,30,.05)' }, border: { display: false },
              ticks: { font: { size: 10 }, color: '#94a3b8', callback: (v) => v + '%' } }
          }
        }
      });
    }

    /* ================================================================
       SECCIÓN 2 — ANÁLISIS DE ESTACIONALIDAD (toda la historia disponible)
       ================================================================ */

    /* === Estacionalidad promedio: barras horizontales === */
    (function () {
      const el = document.getElementById('chSeasAvg');
      if (!el) return;
      const cols = agg.VT_SEAS_PCT.map((p) => {
        if (p >= 40) return '#0a0a1e';
        if (p >= 15) return '#0F6E56';
        if (p >= 5) return '#3EC6AC';
        return '#BFE8DC';
      });
      new Chart(el, {
        type: 'bar',
        data: {
          labels: meses,
          datasets: [{
            data: agg.VT_SEAS_PCT,
            backgroundColor: cols,
            borderRadius: 4,
            barPercentage: 0.72
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 900, easing: 'easeInOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(10,10,30,.92)', padding: 10, cornerRadius: 8,
              titleColor: '#c4cbe4', bodyColor: '#fff',
              callbacks: {
                label: (ctx) => {
                  const pct = ctx.parsed.x;
                  const m = agg.VT_SEAS_MONTH[ctx.dataIndex];
                  if (!m) return 'Sin registros en la base';
                  return pct.toFixed(1) + '% del total  ·  ' + fmtEjecutivo(m);
                }
              }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(10,10,30,.05)' }, border: { display: false },
              ticks: { font: { size: 10 }, color: '#94a3b8', callback: (v) => v + '%' } },
            y: { grid: { display: false }, border: { display: false },
              ticks: { font: { size: 11, weight: '600' }, color: INK_MUTED() } }
          }
        }
      });
    })();

    /* === Concentración trimestral: barras verticales === */
    (function () {
      const el = document.getElementById('chSeasQ');
      if (!el) return;
      new Chart(el, {
        type: 'bar',
        data: {
          labels: ['Q1 · Ene-Mar', 'Q2 · Abr-Jun', 'Q3 · Jul-Sep', 'Q4 · Oct-Dic'],
          datasets: [{
            data: agg.VT_SEAS_Q_PCT,
            backgroundColor: ['#3EC6AC', INK(), 'rgba(62,198,172,.55)', '#94a3b8'],
            borderRadius: 7,
            barPercentage: 0.65
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          layout: { padding: { top: 22 } },
          animation: { duration: 900, easing: 'easeInOutQuart' },
          plugins: {
            legend: { display: false },
            vtBarValue: { fmt: (v) => v.toFixed(1) + '%', color: INK() },
            tooltip: {
              backgroundColor: 'rgba(10,10,30,.92)', padding: 10, cornerRadius: 8,
              titleColor: '#c4cbe4', bodyColor: '#fff',
              callbacks: {
                label: (ctx) => ctx.parsed.y.toFixed(1) + '% del total facturado'
              }
            }
          },
          scales: {
            x: { grid: { display: false }, border: { display: false },
              ticks: { font: { size: 11, weight: '800' }, color: INK() } },
            y: { grid: { color: 'rgba(10,10,30,.05)' }, border: { display: false },
              ticks: { font: { size: 10 }, color: '#94a3b8', callback: (v) => v + '%' } }
          }
        }
      });
    })();
  } // fin guard Chart.js CDN

  /* ── Ranking de Clientes 2026 — filas-barra proporcionales, sin gráfico de pastel ──
     Se calcula localmente sobre agg.VT_TOP_CLIENTES (lista completa ordenada)
     para no tocar agg.VT_TOP5, que sigue usando la vista Clientes tal cual. */
  (function () {
    const TIPO_LABELS = { PR: 'Proyecto', VS: 'Venta de Servicio', AD: 'Adicional' };
    function tipoLabel(cod) {
      if (!cod) return '-';
      if (cod === 'MIXTO') return 'Mixto';
      return TIPO_LABELS[cod] || cod;
    }

    const listEl = document.getElementById('vtRankList');
    if (!listEl) return;
    const TOP_N = agg.VT_TOP_CLIENTES.slice(0, 3);
    const maxV = TOP_N.length ? TOP_N[0].importe : 1;
    const total2026 = agg.VT_2026_TOTAL;
    const totalTop3 = TOP_N.reduce((s, r) => s + r.importe, 0);
    const mgInformadoTop3 = TOP_N.filter((r) => r.margen != null);
    const mgWeightedTop3 = mgInformadoTop3.length
      ? mgInformadoTop3.reduce((s, r) => s + r.importe * r.margen, 0) / mgInformadoTop3.reduce((s, r) => s + r.importe, 0) * 100
      : null;

    const subEl = document.getElementById('vtTop10Sub');
    if (subEl) subEl.textContent = '· al ' + agg.VT_LAST_SALE_TXT;

    listEl.innerHTML = TOP_N.map((r, i) => {
      const mg = r.margen != null ? r.margen * 100 : null;
      const mgCls = mg == null ? '' : (mg >= 18 ? 'mg-ok' : mg >= 12 ? 'mg-warn' : 'mg-crit');
      const barW = Math.max(2, Math.round(r.importe / maxV * 100));
      const pctShare = total2026 ? (r.importe / total2026 * 100) : 0;
      const rankCls = i === 0 ? '' : i === 1 ? 'r2' : 'r3';
      return '<div class="vt-rank-row ' + rankCls + '">'
        + '<div class="vt-rank-fill" style="width:' + barW + '%"></div>'
        + '<span class="vt-rank-name" title="' + r.cliente + '">' + r.cliente + '</span>'
        + '<div class="vt-rank-metrics">'
        + '<span class="vt-rank-val">' + fmtEjecutivo(r.importe) + '</span>'
        + '<span class="vt-rank-mg ' + mgCls + '">' + (mg == null ? '-' : mg.toFixed(2) + '%') + '</span>'
        + '<span class="vt-rank-pct">' + pctShare.toFixed(1) + '%</span>'
        + '</div></div>';
    }).join('');

    const totalEl = document.getElementById('vtRankTotal');
    if (totalEl) {
      totalEl.innerHTML = '<span>TOTAL TOP 3 &middot; ' + TOP_N.length + ' clientes</span>'
        + '<span>' + fmtEjecutivo(totalTop3) + (mgWeightedTop3 != null ? ' &middot; ' + mgWeightedTop3.toFixed(2) + '%' : '') + '</span>';
    }
  })();

  /* ── Por Tipo de Venta 2026 — barra destacada + lista, sin gráfico de pastel ── */
  (function () {
    const highlightEl = document.getElementById('vtTipoHighlight');
    const legEl = document.getElementById('chTipoLeg');
    const totalEl = document.getElementById('vtTipoTotal');

    if (!agg.VT_TIPO_DISPONIBLE) {
      if (highlightEl) highlightEl.innerHTML = '';
      if (legEl) legEl.innerHTML = '<div style="padding:8px 0;font-size:11.5px;color:var(--ts);line-height:1.6">'
        + 'Falta información: la columna TIPO DE VENTA de la pestaña VENTAS no está completada.</div>';
      if (totalEl) totalEl.textContent = '';
      return;
    }

    /* Etiquetas y colores conocidos de la columna TIPO DE VENTA (pestaña VENTAS del Excel).
       Un código nuevo que no esté en este mapa se muestra tal cual (fallback),
       en vez de ocultarse — así nunca se pierde información de la fuente. */
    const TIPO_LABELS = { PR: 'Proyecto', VS: 'Venta de Servicio', AD: 'Adicional' };
    const TIPO_DOT = { PR: '#3A5FA8', VS: '#0F6E56', AD: '#B45309' };
    const FALLBACK_DOTS = ['#7b8db0', '#94a3b8', '#c3ccd9'];

    const tipoAgg = {};
    agg.VT_2026.forEach((r) => {
      const t = r.tipoVenta;
      if (!t) return;
      if (!tipoAgg[t]) tipoAgg[t] = { cant: 0, imp: 0 };
      tipoAgg[t].cant++;
      tipoAgg[t].imp += r.importe;
    });
    const totalCantTipo = agg.VT_2026.length;
    const totalImpTipo = agg.VT_2026_TOTAL;
    const codigosTipo = Object.keys(tipoAgg).sort((a, b) => tipoAgg[b].imp - tipoAgg[a].imp);
    const tipoData = codigosTipo.map((cod, i) => ({
      cod, lbl: TIPO_LABELS[cod] || cod,
      dot: TIPO_DOT[cod] || FALLBACK_DOTS[i % FALLBACK_DOTS.length],
      imp: tipoAgg[cod].imp, cant: tipoAgg[cod].cant,
      pctImp: totalImpTipo ? tipoAgg[cod].imp / totalImpTipo * 100 : 0,
    }));

    const top = tipoData[0];
    if (highlightEl && top) {
      highlightEl.innerHTML = '<div class="vt-tipo-highlight-fill" style="width:' + Math.max(6, top.pctImp) + '%"></div>'
        + '<span class="vt-tipo-highlight-lbl">' + top.lbl + '<span class="pct">' + top.pctImp.toFixed(1) + '%</span></span>';
    }

    if (legEl) legEl.innerHTML = tipoData.map((d) => {
      return '<div class="vt-tipo-item"><span class="vt-tipo-dot" style="background:' + d.dot + '"></span>'
        + '<span class="lbl">' + d.lbl + '</span><span class="val">' + fmtEjecutivo(d.imp) + '</span></div>';
    }).join('');

    if (totalEl) totalEl.textContent = 'Total: ' + totalCantTipo + ' ventas · ' + fmtEjecutivo(totalImpTipo);
  })();

  /* ── Detalle Ventas 2026 — tabla con búsqueda, orden y paginación ── */
  (function () {
    const tbody = document.getElementById('vt26Body');
    if (!tbody) return;
    const TIPO_LABELS = { PR: 'Proyecto', VS: 'Venta de Servicio', AD: 'Adicional' };
    function tipoLabel(cod) {
      if (!cod) return '-';
      if (cod === 'MIXTO') return 'Mixto';
      return TIPO_LABELS[cod] || cod;
    }
    /* Ordenar de mayor a menor por importe */
    const rows = [].concat(agg.VT_2026).sort((a, b) => b.importe - a.importe);
    const PG = 15;
    let pg = 0, sc = -1, sa = true, q = '';
    const SORT_FIELDS = ['fechaISO', 'cliente', 'tipoVenta', 'importe', 'margen'];

    const fmtV = fmtEjecutivo;
    function mgCls(v) { return v >= 18 ? 'mg-ok' : v >= 12 ? 'mg-warn' : 'mg-crit'; }
    function fechaCorta(iso) { const d = new Date(iso); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); }

    const totalImpAll = rows.reduce((s, r) => s + r.importe, 0);
    const mgRows = rows.filter((r) => r.margen != null);
    const totalMgAll = mgRows.length ? mgRows.reduce((s, r) => s + r.importe * r.margen, 0) / mgRows.reduce((s, r) => s + r.importe, 0) : null;

    (function () {
      const subEl = document.getElementById('vt26SubHead');
      if (subEl) subEl.textContent = 'Registros disponibles en la fuente al ' + agg.VT_LAST_SALE_TXT;
      const infoEl = document.getElementById('vt26Info');
      if (infoEl) infoEl.textContent = rows.length + ' operaciones · Total: ' + fmtEjecutivo(totalImpAll);
    })();

    function renderTable() {
      const fq = q.toLowerCase();
      let filtered = rows.filter((r) => r.cliente.toLowerCase().indexOf(fq) > -1 || tipoLabel(r.tipoVenta).toLowerCase().indexOf(fq) > -1);
      if (sc >= 0) {
        const key = SORT_FIELDS[sc];
        filtered = [].concat(filtered).sort((a, b) => {
          let va = a[key], vb = b[key];
          if (va == null) va = (key === 'margen') ? -1 : (typeof vb === 'number' ? 0 : '');
          if (vb == null) vb = (key === 'margen') ? -1 : (typeof va === 'number' ? 0 : '');
          const c = typeof va === 'number' ? (va - vb) : (va < vb ? -1 : va > vb ? 1 : 0);
          return sa ? c : -c;
        });
      }
      const maxP = Math.max(0, Math.ceil(filtered.length / PG) - 1);
      if (pg > maxP) pg = maxP;
      const pr = filtered.slice(pg * PG, (pg + 1) * PG);
      let html = '';
      pr.forEach((r) => {
        const mg = r.margen;
        html += '<tr style="cursor:pointer" onclick="_openVt26Detail(\'' + r.fechaISO + '\')">'
          + '<td>' + fechaCorta(r.fechaISO) + '</td>'
          + '<td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">' + r.cliente + '</td>'
          + '<td><span style="font-size:10px;padding:2px 7px;border-radius:4px;background:#f0f4f9;color:var(--ts);font-weight:600">' + tipoLabel(r.tipoVenta) + '</span></td>'
          + '<td class="r" style="font-weight:700">' + fmtV(r.importe) + '</td>'
          + '<td class="r">' + (mg != null ? ('<span class="' + mgCls(mg * 100) + '">' + (mg * 100).toFixed(2) + '%</span>') : '-') + '</td>'
          + '</tr>';
      });
      if (!pr.length) html = '<tr><td colspan="5" style="text-align:center;color:var(--ts);padding:20px">Sin resultados</td></tr>';
      html += '<tr class="tbl-total-row">'
        + '<td colspan="3" style="font-weight:800">TOTAL (' + rows.length + ' operaciones)</td>'
        + '<td class="r" style="font-weight:900">' + fmtEjecutivo(totalImpAll) + '</td>'
        + '<td class="r" style="font-weight:900">' + (totalMgAll != null ? (totalMgAll * 100).toFixed(2) + '%' : '-') + '</td>'
        + '</tr>';
      tbody.innerHTML = html;
      const info = document.getElementById('vt26PagInfo');
      if (info) info.textContent = 'Pág. ' + (pg + 1) + '/' + (maxP + 1) + ' · ' + filtered.length + ' registros';
      const prev = document.getElementById('vt26Prev'), next = document.getElementById('vt26Next');
      if (prev) prev.disabled = pg === 0;
      if (next) next.disabled = pg >= maxP;
    }

    /* Modal de detalle completo por fecha (clave única suficiente: 1 venta por fecha en la base actual) */
    window._openVt26Detail = function (fechaIso) {
      const r = agg.VT_2026.find((x) => x.fechaISO === fechaIso);
      if (!r) return;
      const html = '<table class="sc"><tbody>'
        + '<tr><td>Fecha</td><td class="r">' + fechaCorta(r.fechaISO) + '</td></tr>'
        + '<tr><td>Cliente</td><td class="r">' + r.cliente + '</td></tr>'
        + '<tr><td>Fruta</td><td class="r">' + (r.fruta || '-') + '</td></tr>'
        + '<tr><td>Refrigerante</td><td class="r">' + (r.refrigerante || '-') + '</td></tr>'
        + '<tr><td>Vendedor</td><td class="r">' + (r.vendedor || '-') + '</td></tr>'
        + '<tr><td>Margen %</td><td class="r">' + (r.margen != null ? (r.margen * 100).toFixed(2) + '%' : '-') + '</td></tr>'
        + '<tr><td>Importe</td><td class="r">' + fmtEjecutivo(r.importe) + '</td></tr>'
        + '<tr><td>Tipo de venta</td><td class="r">' + tipoLabel(r.tipoVenta) + '</td></tr>'
        + '<tr><td>Descripción del proyecto</td><td class="r">' + (r.nombreProyecto || '-') + '</td></tr>'
        + '</tbody></table>';
      openModal('Detalle de venta · ' + r.cliente, html, fechaCorta(r.fechaISO));
    };

    /* Sort by header click */
    document.querySelectorAll('#vt26Tbl th[data-col]').forEach((th) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = +th.getAttribute('data-col');
        if (sc === col) sa = !sa; else { sc = col; sa = col === 3 || col === 4 ? false : true; }
        document.querySelectorAll('#vt26Tbl th').forEach((t) => { t.classList.remove('sorted'); const si = t.querySelector('.sic'); if (si) si.textContent = '↕'; });
        th.classList.add('sorted'); const si = th.querySelector('.sic'); if (si) si.textContent = sa ? '▲' : '▼';
        pg = 0; renderTable();
      });
    });

    /* Search */
    const srch = document.getElementById('vt26Search');
    if (srch) srch.addEventListener('input', function () { q = this.value; pg = 0; renderTable(); });

    /* Pagination */
    const prev = document.getElementById('vt26Prev'), next = document.getElementById('vt26Next');
    if (prev) prev.addEventListener('click', () => { pg--; renderTable(); });
    if (next) next.addEventListener('click', () => { pg++; renderTable(); });

    renderTable();
  })();

  const vtTabsEl = document.getElementById('vtTabs');
  if (vtTabsEl) vtTabsEl.addEventListener('click', (e) => {
    const t = e.target.closest('.vt-tab-btn');
    if (!t || !t.dataset.vtview) return;
    vtSwitchTab(t.dataset.vtview);
  });
})();
