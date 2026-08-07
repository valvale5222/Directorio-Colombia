// Inteligencia de Clientes — módulo completo.

import { fmtEjecutivo, cmp } from '../core/utils.js';
import { openModal, mkModal, wireTable } from '../core/modal.js';
import { getVentas } from '../core/data.js';
import { computeVentasAggregates, vtYearTotal } from '../core/ventas-agg.js';

const SEG_COL  = { retenido: '#0a0a1e', reactivado: '#3aabef', nuevo: '#16a34a', sinactividad: '#94a3b8' };
const SEG_COL2 = { retenido: '#1a2a5e', reactivado: '#1a8fd1', nuevo: '#15803d', sinactividad: '#64748b' };
const SEG_CSS  = { retenido: 'sb-ret', reactivado: 'sb-rea', nuevo: 'sb-new', sinactividad: 'sb-off' };
const SEG_LBL  = { retenido: 'Retenido', reactivado: 'Reactivado', nuevo: 'Nuevo', sinactividad: 'Sin actividad' };

let ventas = null, ventasAgg = null;
let CLI_HIST, CLI_TOTAL_HISTORICO, CLI_TOP5_HIST, CLI_RESTO_HIST;
let CLI_SEGMENTOS, CLI_EVOL, CLI_TICKET_EVOL, CLI_PARETO;
let CLI_TM_HIST, CLI_TM_CURR;
let _tmRenderCurrent = null;
let _cliChartsInited = false;

function _cliSegOf(cliente) {
  for (var i = 0; i < CLI_SEGMENTOS.length; i++) {
    if (CLI_SEGMENTOS[i].clientes.some(function (c) { return c.cliente === cliente; })) return CLI_SEGMENTOS[i].id;
  }
  return 'sinactividad';
}

export function renderTreemap() {
  if (_tmRenderCurrent) _tmRenderCurrent();
}

/* ── Modal: activos / nuevos ─────────────────────────────── */
function openCliModal(type) {
  if (type === 'activos') {
    const activos = CLI_HIST.filter(function (c) { return c.years.indexOf(2026) > -1; });
    const rows = activos.map((r, i) => [`${i + 1}. ${r.cliente}`, r.importe, _cliSegOf(r.cliente), r.primerAnio, r.ultimoAnio]);
    const tv = activos.reduce((s, r) => s + r.importe, 0);
    openModal('Clientes activos 2026 · por facturación histórica',
      mkModal('mdAct') +
      `<div class="mnote" style="margin-top:8px"><strong>${activos.length} clientes activos</strong> en 2026, sobre una cartera histórica de <strong>${CLI_HIST.length}</strong>. Valor histórico acumulado de estos clientes: <strong>${fmtEjecutivo(tv)}</strong>.</div>`);
    wireTable('mdAct',
      [{ l: '# Cliente' }, { l: 'Facturación histórica', r: true, fn: v => fmtEjecutivo(v) },
       { l: 'Segmento', fn: (v) => `<span class="mseg-tag ${SEG_CSS[v]}">${SEG_LBL[v]}</span>` },
       { l: 'Primer año', r: true }, { l: 'Último año', r: true }],
      rows,
      ['TOTAL', fmtEjecutivo(tv), '', '', '']
    );
  } else {
    const nuevos = CLI_HIST.filter(function (c) { return c.primerAnio === 2026; });
    const rows = nuevos.map((r, i) => [`${i + 1}. ${r.cliente}`, r.importe, r.primerAnio]);
    const tv = nuevos.reduce((s, r) => s + r.importe, 0);
    openModal('Clientes nuevos 2026 · primera compra registrada en 2026',
      mkModal('mdNew') +
      `<div class="mnote" style="margin-top:8px"><strong>${nuevos.length} clientes nuevos</strong> (primera compra registrada en 2026). Generaron <strong>${fmtEjecutivo(tv)}</strong>.</div>`);
    wireTable('mdNew',
      [{ l: '# Cliente' }, { l: 'Ventas 2026', r: true, fn: v => fmtEjecutivo(v) }, { l: 'Primer año', r: true }],
      rows,
      ['TOTAL', fmtEjecutivo(tv), '']
    );
  }
}

/* ── Modal: segmentos ────────────────────────────────────── */
function openCliSeg(segId) {
  const seg = CLI_SEGMENTOS.find(s => s.id === segId);
  if (!seg) return;
  const cid = 'mdSeg_' + segId;
  const rows = seg.clientes.map((r, i) => [`${i + 1}. ${r.cliente}`, r.importe, r.primerAnio, r.ultimoAnio]);
  const tv = seg.valorHist;
  openModal(`${seg.lbl} · ${seg.note}`,
    mkModal(cid) +
    `<div class="mnote" style="margin-top:8px"><strong>${seg.n} clientes</strong> · Valor histórico: <strong>${fmtEjecutivo(seg.valorHist)}</strong>${seg.ventas2026 > 0 ? ' · Ventas 2026: <strong>' + fmtEjecutivo(seg.ventas2026) + '</strong>' : ''}</div>`);
  wireTable(cid,
    [{ l: '# Cliente' }, { l: 'Valor histórico', r: true, fn: v => fmtEjecutivo(v) }, { l: 'Primer año', r: true }, { l: 'Último año', r: true }],
    rows, ['TOTAL', fmtEjecutivo(tv), '', '']
  );
}

window.openCliModal = openCliModal;
window.openCliSeg = openCliSeg;

/* ============================================================
   GRÁFICOS CLIENTES — se disparan al mostrar la sección (router.js)
   ============================================================ */
export function initClientesCharts() {
  if (_cliChartsInited) return;
  _cliChartsInited = true;

  /* ── Clientes activos vs nuevos por año (+ tasa de captación) ─ */
  (function () {
    var el = document.getElementById('chCliEvol');
    if (!el) return;
    if (Chart.getChart(el)) Chart.getChart(el).destroy();

    var tasaData = CLI_EVOL.years.map(function (y, i) {
      var act = CLI_EVOL.activos[i], nvo = CLI_EVOL.nuevos[i];
      return act > 0 ? +(nvo / act * 100).toFixed(2) : null;
    });
    var tasaMax = Math.ceil((Math.max.apply(null, tasaData.filter(function (v) { return v != null; })) + 15) / 10) * 10;

    var leg = document.getElementById('cliEvolLegend');
    if (leg) {
      leg.innerHTML = '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:3px;background:#3EC6AC;display:inline-block"></span>Clientes Atendidos</span>'
        + '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:3px;background:#185FA5;display:inline-block"></span>Clientes nuevos</span>'
        + '<span style="display:flex;align-items:center;gap:5px"><span style="width:16px;border-top:2.5px solid #d97706;display:inline-block"></span>Tasa de captaci&oacute;n</span>';
    }

    new Chart(el, {
      type: 'bar',
      data: {
        labels: CLI_EVOL.years.map(String),
        datasets: [
          { label: 'Clientes atendidos', data: CLI_EVOL.activos,
            backgroundColor: 'rgba(62,198,172,.85)', borderRadius: 5, borderSkipped: false,
            barPercentage: .7, categoryPercentage: .75, yAxisID: 'y', order: 2 },
          { label: 'Clientes nuevos', data: CLI_EVOL.nuevos,
            backgroundColor: 'rgba(24,95,165,.8)', borderRadius: 5, borderSkipped: false,
            barPercentage: .7, categoryPercentage: .75, yAxisID: 'y', order: 2 },
          { label: 'Tasa de captación', data: tasaData, type: 'line',
            borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,.08)',
            borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 6,
            pointBackgroundColor: '#fff', pointBorderColor: '#d97706', pointBorderWidth: 2,
            fill: false, tension: .35, yAxisID: 'y1', order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index', intersect: false,
            backgroundColor: 'rgba(9,12,30,.95)',
            padding: { top: 11, bottom: 11, left: 13, right: 13 },
            cornerRadius: 10,
            borderColor: 'rgba(62,198,172,.25)', borderWidth: 1,
            titleColor: 'rgba(255,255,255,.4)', titleFont: { size: 9.5, weight: '700' },
            bodyColor: 'rgba(255,255,255,.82)',
            animation: { duration: 180, easing: 'easeOutQuad' },
            callbacks: {
              title: function (items) { return 'Año ' + items[0].label; },
              label: function (ctx) {
                if (ctx.dataset.label === 'Tasa de captación') return ' Tasa de captación: ' + ctx.parsed.y.toFixed(2) + '%';
                return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
          y: { grid: { color: 'rgba(10,10,30,.05)' }, border: { display: false },
               ticks: { font: { size: 10 }, color: '#94a3b8' },
               title: { display: true, text: 'N° de clientes', font: { size: 10 }, color: '#94a3b8' } },
          y1: { position: 'right', min: 0, max: tasaMax,
                grid: { display: false }, border: { display: false },
                ticks: { font: { size: 10 }, color: '#d97706', callback: function (v) { return v + '%'; } },
                title: { display: true, text: 'Tasa de captación', font: { size: 10 }, color: '#d97706' } }
        }
      }
    });

    var ins = document.getElementById('cliEvolInsight');
    if (ins) {
      var lastI = CLI_EVOL.years.length - 1;
      var lastY = CLI_EVOL.years[lastI], lastAct = CLI_EVOL.activos[lastI], lastNvo = CLI_EVOL.nuevos[lastI];
      var lastTasa = lastAct > 0 ? (lastNvo / lastAct * 100).toFixed(2) : '0.00';
      ins.innerHTML = 'En <strong>' + lastY + '</strong> (disponible al 06 de abril de 2026) hubo <strong>' + lastAct + ' clientes atendidos</strong>, de los cuales <strong>' + lastNvo + '</strong> fueron nuevos &mdash; tasa de captaci&oacute;n: <strong>' + lastTasa + '%</strong>.';
    }
  })();

  /* ── Evolución del ticket promedio por año ─────────── */
  (function () {
    var el = document.getElementById('chTicketEvol');
    if (!el) return;
    if (Chart.getChart(el)) Chart.getChart(el).destroy();

    new Chart(el, {
      type: 'bar',
      data: {
        labels: CLI_TICKET_EVOL.years.map(String),
        datasets: [{ label: 'Ticket promedio', data: CLI_TICKET_EVOL.avgTicket,
          backgroundColor: CLI_TICKET_EVOL.years.map(function (y) { return y === 2026 ? 'rgba(217,119,6,.85)' : 'rgba(62,198,172,.85)'; }),
          borderRadius: 6, borderSkipped: false, barPercentage: .6, categoryPercentage: .7 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(9,12,30,.95)', padding: { top: 11, bottom: 11, left: 13, right: 13 }, cornerRadius: 10,
            borderColor: 'rgba(62,198,172,.25)', borderWidth: 1,
            titleColor: 'rgba(255,255,255,.4)', titleFont: { size: 9.5, weight: '700' },
            bodyColor: 'rgba(255,255,255,.85)',
            animation: { duration: 180, easing: 'easeOutQuad' },
            callbacks: {
              title: function (items) {
                var i = items[0].dataIndex, y = CLI_TICKET_EVOL.years[i];
                return 'Año ' + y + (y === 2026 ? ' (al 06 abr)' : '');
              },
              label: function (ctx) { return ' Ticket promedio: ' + fmtEjecutivo(ctx.parsed.y); },
              afterLabel: function (ctx) {
                var i = ctx.dataIndex;
                return [' Ventas: ' + fmtEjecutivo(CLI_TICKET_EVOL.ventas[i]), ' Clientes activos: ' + CLI_TICKET_EVOL.clientes[i]];
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' } },
          y: { grid: { color: 'rgba(10,10,30,.05)' }, border: { display: false },
               ticks: { font: { size: 10 }, color: '#94a3b8', callback: function (v) { return fmtEjecutivo(v); } } }
        }
      }
    });

    var ins = document.getElementById('ticketEvolInsight');
    if (ins) {
      var maxI = 0; CLI_TICKET_EVOL.avgTicket.forEach(function (v, i) { if (v > CLI_TICKET_EVOL.avgTicket[maxI]) maxI = i; });
      var lastI2 = CLI_TICKET_EVOL.years.length - 1;
      ins.innerHTML = 'El ticket promedio m&aacute;s alto se registra en <strong>' + CLI_TICKET_EVOL.years[maxI] + ' (' + fmtEjecutivo(CLI_TICKET_EVOL.avgTicket[maxI]) + ')</strong>. El a&ntilde;o ' + CLI_TICKET_EVOL.years[lastI2] + ' (' + fmtEjecutivo(CLI_TICKET_EVOL.avgTicket[lastI2]) + ') refleja &uacute;nicamente lo disponible al 06 de abril de 2026.';
    }
  })();

  /* ── Pareto de clientes histórico + tabla lateral con hover sync ── */
  (function () {
    var el = document.getElementById('chPareto');
    if (!el) return;
    if (Chart.getChart(el)) Chart.getChart(el).destroy();

    var labels = CLI_PARETO.map(function (r, i) {
      var nm = r.nm.split(' ')[0];
      return (i + 1) + '. ' + nm;
    });
    var barData = CLI_PARETO.map(function (r) { return +(r.v / 1000000).toFixed(3); });
    var lineData = CLI_PARETO.map(function (r) { return +r.acum.toFixed(2); });

    var leg = document.getElementById('paretoLegend');
    if (leg) {
      leg.innerHTML = '<span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:3px;background:#3EC6AC;display:inline-block"></span>Ventas (US$ MM)</span>'
        + '<span style="display:flex;align-items:center;gap:5px"><span style="width:16px;border-top:2px solid #d97706;display:inline-block"></span>% Acumulado</span>';
    }

    var paretoChart = new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Ventas (US$ MM)', data: barData,
            backgroundColor: 'rgba(62,198,172,.75)',
            borderRadius: 4, borderSkipped: false,
            yAxisID: 'y', order: 2 },
          { label: '% Acumulado', data: lineData,
            type: 'line', borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,.08)',
            borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 5,
            pointBackgroundColor: '#fff', pointBorderColor: '#d97706', pointBorderWidth: 2,
            fill: true, tension: .35, yAxisID: 'y1', order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeInOutQuart' },
        onHover: function (evt, activeEls, chart) {
          var body = document.getElementById('paretoTblBody');
          if (!body) return;
          Array.prototype.forEach.call(body.querySelectorAll('tr'), function (r) { r.classList.remove('row-hover'); });
          if (activeEls && activeEls.length) {
            var idx = activeEls[0].index;
            var row = body.querySelector('tr[data-idx="' + idx + '"]');
            if (row) row.classList.add('row-hover');
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index', intersect: false,
            backgroundColor: 'rgba(9,12,30,.95)',
            padding: { top: 11, bottom: 11, left: 13, right: 13 },
            cornerRadius: 10,
            borderColor: 'rgba(62,198,172,.25)', borderWidth: 1,
            titleColor: 'rgba(255,255,255,.4)', titleFont: { size: 9.5, weight: '700' },
            bodyColor: 'rgba(255,255,255,.82)',
            animation: { duration: 180, easing: 'easeOutQuad' },
            callbacks: {
              title: function (items) { return CLI_PARETO[items[0].dataIndex].nm; },
              label: function (ctx) {
                var i = ctx.dataIndex;
                var r = CLI_PARETO[i];
                if (ctx.dataset.label === 'Ventas (US$ MM)') return ' Ventas: $' + (r.v / 1000000).toFixed(2) + 'MM (' + r.pct.toFixed(2) + '%)';
                return ' Acumulado: ' + r.acum.toFixed(2) + '%';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 9 }, color: '#94a3b8', maxRotation: 45, minRotation: 30 } },
          y: { grid: { color: 'rgba(10,10,30,.05)' }, border: { display: false },
               ticks: { font: { size: 10 }, color: '#94a3b8', callback: function (v) { return '$' + v + 'MM'; } },
               title: { display: true, text: 'Ventas (MM)', font: { size: 10 }, color: '#94a3b8' } },
          y1: { position: 'right', min: 0, max: 100,
                grid: { display: false }, border: { display: false },
                ticks: { font: { size: 10 }, color: '#d97706', callback: function (v) { return v + '%'; } },
                title: { display: true, text: '% Acumulado', font: { size: 10 }, color: '#d97706' } }
        }
      }
    });

    /* Tabla lateral · refleja exactamente los clientes del Pareto · ordenable,
       manteniendo el data-idx original para el hover-sync con el gr&aacute;fico */
    var tbody = document.getElementById('paretoTblBody');
    var paretoHead = document.getElementById('paretoHead');
    var pSc = -1, pSa = true;
    var PARETO_KEY = [
      function (r) { return r.i + 1; },
      function (r) { return r.nm; },
      function (r) { return r.v; },
      function (r) { return r.acum; }
    ];
    function renderParetoTbl() {
      if (!tbody) return;
      var rows = CLI_PARETO.map(function (r, i) { return { i: i, nm: r.nm, v: r.v, acum: r.acum }; });
      if (pSc >= 0) {
        rows.sort(function (a, b) {
          var c = cmp(PARETO_KEY[pSc](a), PARETO_KEY[pSc](b));
          return pSa ? c : -c;
        });
      }
      tbody.innerHTML = rows.map(function (r) {
        return '<tr data-idx="' + r.i + '"><td>' + (r.i + 1) + '</td><td>' + r.nm + '</td><td class="r">' + fmtEjecutivo(r.v) + '</td><td class="r">' + r.acum.toFixed(2) + '%</td></tr>';
      }).join('');
      Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr) {
        tr.addEventListener('mouseenter', function () {
          var idx = +tr.dataset.idx;
          paretoChart.setActiveElements([{ datasetIndex: 0, index: idx }, { datasetIndex: 1, index: idx }]);
          paretoChart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
          paretoChart.update('none');
        });
        tr.addEventListener('mouseleave', function () {
          paretoChart.setActiveElements([]);
          paretoChart.tooltip.setActiveElements([], { x: 0, y: 0 });
          paretoChart.update('none');
        });
      });
      if (paretoHead) {
        Array.prototype.forEach.call(paretoHead.querySelectorAll('th'), function (th, i) {
          var sorted = pSc === i;
          th.classList.toggle('sorted', sorted);
          var sic = th.querySelector('.sic');
          if (sic) sic.textContent = sorted ? (pSa ? '▲' : '▼') : '↕';
        });
      }
    }
    if (paretoHead) {
      Array.prototype.forEach.call(paretoHead.querySelectorAll('th'), function (th) {
        th.onclick = function () {
          var col = +th.dataset.col;
          if (pSc === col) pSa = !pSa; else { pSc = col; pSa = true; }
          renderParetoTbl();
        };
      });
    }
    renderParetoTbl();

    var ins = document.getElementById('paretoInsight');
    if (ins) {
      var top3 = CLI_PARETO[2] ? CLI_PARETO[2].acum.toFixed(2) : 0;
      var top5 = CLI_PARETO[4] ? CLI_PARETO[4].acum.toFixed(2) : 0;
      ins.innerHTML = 'El Pareto permite identificar si el valor generado depende de pocos clientes y ayuda a priorizar cuentas estrat&eacute;gicas. Los <strong>3 principales</strong> concentran el <strong>' + top3 + '%</strong> del valor hist&oacute;rico; los <strong>5 principales</strong> el <strong>' + top5 + '%</strong>.';
    }
  })();

}

export const ready = (async function init() {
  ventas = await getVentas();
  ventasAgg = computeVentasAggregates(ventas);

  /* ── Agregado histórico por cliente (todos los años disponibles) ── */
  CLI_HIST = (function () {
    var byCli = {};
    ventas.forEach(function (r) {
      var c = r.cliente;
      byCli[c] = byCli[c] || { cliente: c, importe: 0, years: [] };
      byCli[c].importe += r.importe;
      if (byCli[c].years.indexOf(r.anio) === -1) byCli[c].years.push(r.anio);
    });
    var arr = Object.keys(byCli).map(function (k) {
      var d = byCli[k];
      d.years.sort(function (a, b) { return a - b; });
      d.importe = Math.round(d.importe * 100) / 100;
      d.primerAnio = d.years[0];
      d.ultimoAnio = d.years[d.years.length - 1];
      return d;
    });
    arr.sort(function (a, b) { return b.importe - a.importe; });
    return arr;
  })();
  CLI_TOTAL_HISTORICO = CLI_HIST.reduce(function (s, c) { return s + c.importe; }, 0);
  CLI_TOP5_HIST = CLI_HIST.slice(0, 5);
  CLI_RESTO_HIST = Math.round((CLI_TOTAL_HISTORICO - CLI_TOP5_HIST.reduce(function (s, c) { return s + c.importe; }, 0)) * 100) / 100;

  /* ── Segmentación de la cartera 2026 — lógica (documentada, spec §7.3):
     • Nuevo: primera compra registrada en 2026 (no aparece en ningún año anterior).
     • Retenido/recurrente: compra en 2026 y también en 2025 (período inmediatamente anterior).
     • Reactivado: compra en 2026, SIN compra en 2025, pero con al menos una compra histórica
       anterior a 2025 (cliente que "vuelve" tras un vacío).
     • Sin actividad 2026: cliente histórico (con compra en algún año) que no registra venta en 2026.
     Todo se deriva de las fechas reales de data/ventas.json — no se asume ni se completa nada. ── */
  CLI_SEGMENTOS = (function () {
    function buildSeg(id, lbl, note, clientes) {
      var vh = clientes.reduce(function (s, c) { return s + c.importe; }, 0);
      var v26 = clientes.reduce(function (s, c) { var m = ventasAgg.VT_TOP_CLIENTES.find(function (t) { return t.cliente === c.cliente; }); return s + (m ? m.importe : 0); }, 0);
      return {
        id: id, lbl: lbl, note: note, n: clientes.length,
        pctCartera: CLI_HIST.length ? (clientes.length / CLI_HIST.length * 100) : 0,
        valorHist: Math.round(vh * 100) / 100,
        pctValorHist: CLI_TOTAL_HISTORICO ? (vh / CLI_TOTAL_HISTORICO * 100) : 0,
        ventas2026: Math.round(v26 * 100) / 100,
        pct2026: ventasAgg.VT_2026_TOTAL ? (v26 / ventasAgg.VT_2026_TOTAL * 100) : 0,
        clientes: clientes
      };
    }
    var nuevos = CLI_HIST.filter(function (c) { return c.primerAnio === 2026; });
    var retenidos = CLI_HIST.filter(function (c) { return c.primerAnio !== 2026 && c.years.indexOf(2026) > -1 && c.years.indexOf(2025) > -1; });
    var reactivados = CLI_HIST.filter(function (c) { return c.primerAnio !== 2026 && c.years.indexOf(2026) > -1 && c.years.indexOf(2025) === -1; });
    var sinActividad = CLI_HIST.filter(function (c) { return c.years.indexOf(2026) === -1; });
    return [
      buildSeg('retenido', 'Retenidos', 'Compra en 2026 y también en 2025 — clientes recurrentes', retenidos),
      buildSeg('reactivado', 'Reactivados', 'Compra en 2026, sin compra en 2025, con historial anterior', reactivados),
      buildSeg('nuevo', 'Nuevos', 'Primera compra registrada en 2026', nuevos),
      buildSeg('sinactividad', 'Sin actividad 2026', 'Cliente histórico sin ventas registradas en 2026', sinActividad)
    ];
  })();

  /* ── Clientes atendidos y nuevos por año (todos los años con registros) ── */
  CLI_EVOL = (function () {
    var activos = [], nuevos = [];
    ventasAgg.VT_YEARS.forEach(function (yr) {
      var rows = ventas.filter(function (r) { return r.anio === yr; });
      var clientesYr = Array.from(new Set(rows.map(function (r) { return r.cliente; })));
      activos.push(clientesYr.length);
      var nuevosYr = clientesYr.filter(function (c) {
        var d = CLI_HIST.find(function (x) { return x.cliente === c; });
        return d && d.primerAnio === yr;
      });
      nuevos.push(nuevosYr.length);
    });
    return { years: ventasAgg.VT_YEARS, activos: activos, nuevos: nuevos };
  })();

  /* ── Ticket promedio por año = ventas del año / clientes únicos con facturación ese año ── */
  CLI_TICKET_EVOL = (function () {
    var totales = ventasAgg.VT_YEARS.map(function (yr) { return vtYearTotal(ventasAgg, yr); });
    var clientes = CLI_EVOL.activos;
    var avgTicket = totales.map(function (v, i) { return clientes[i] ? Math.round(v / clientes[i] * 100) / 100 : 0; });
    return { years: ventasAgg.VT_YEARS, ventas: totales, clientes: clientes, avgTicket: avgTicket };
  })();

  /* ── Pareto de concentración — cartera histórica completa, mayor a menor ── */
  CLI_PARETO = (function () {
    var total = CLI_TOTAL_HISTORICO;
    var acc = 0;
    return CLI_HIST.map(function (c) {
      acc += c.importe;
      return { nm: c.cliente, v: c.importe, pct: total ? c.importe / total * 100 : 0, acum: total ? acc / total * 100 : 0 };
    });
  })();

  /* ── KPI cards de Clientes — calculados en tiempo real desde CLI_HIST / CLI_SEGMENTOS ── */
  (function () {
    var activos2026 = CLI_HIST.filter(function (c) { return c.years.indexOf(2026) > -1; }).length;
    var nuevosSeg = CLI_SEGMENTOS.find(function (s) { return s.id === 'nuevo'; });
    var nuevos2026 = nuevosSeg ? nuevosSeg.n : 0;
    var cartera = CLI_HIST.length;
    var sinActSeg = CLI_SEGMENTOS.find(function (s) { return s.id === 'sinactividad'; });
    var sinAct = sinActSeg ? sinActSeg.n : 0;
    function setTxt(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }
    setTxt('kpiActivosVal', String(activos2026));
    setTxt('kpiActivosCtx', (cartera ? (activos2026 / cartera * 100).toFixed(2) : '0.00') + '% de la cartera histórica · ' + cartera + ' clientes totales');
    var barA = document.getElementById('kpiActivosBar'); if (barA) barA.style.width = (cartera ? (activos2026 / cartera * 100) : 0) + '%';
    setTxt('kpiNuevosVal', String(nuevos2026));
    setTxt('kpiNuevosCtx', (activos2026 ? (nuevos2026 / activos2026 * 100).toFixed(2) : '0.00') + '% de activos son nuevos · ' + (cartera ? (nuevos2026 / cartera * 100).toFixed(2) : '0.00') + '% histórico');
    var barN = document.getElementById('kpiNuevosBar'); if (barN) barN.style.width = (activos2026 ? (nuevos2026 / activos2026 * 100) : 0) + '%';
    setTxt('kpiCarteraVal', String(cartera));
    setTxt('kpiCarteraDelta', sinAct + ' sin actividad · ' + activos2026 + ' activos 2026');
    setTxt('kpiValorVal', fmtEjecutivo(ventasAgg.VT_2026_TOTAL));
  })();

  /* ── Textos de rango histórico — derivados de ventasAgg.VT_YEARS y CLI_HIST,
     nunca hardcodeados, así el texto sigue siendo correcto si cambia el rango
     de años disponible en data/ventas.json. ── */
  (function () {
    var yrs = ventasAgg.VT_YEARS;
    var range = yrs.length > 1 ? (yrs[0] + '–' + yrs[yrs.length - 1]) : String(yrs[0] || '');
    function setTxt(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }
    setTxt('cliHeroRight', 'Cartera histórica ' + range + ' · ' + yrs[yrs.length - 1] + ' frente al histórico');
    setTxt('kpiCarteraCtx', 'Clientes únicos ' + range);
    setTxt('tmBtnHist', 'Histórico ' + range);
    setTxt('cliTicketYearsSub', 'Años con registros en la base: ' + yrs.join(', '));
    setTxt('paretoYearsSub', 'Pareto histórico ' + range + ' · Clientes ordenados de mayor a menor');
    setTxt('paretoCardTitle', 'Pareto de ventas · histórico ' + range);
    setTxt('paretoTblTitle', 'Detalle · cartera completa (' + CLI_HIST.length + ' clientes)');
  })();

  /* ── Treemap — Top 5 histórico / Top 5 2026 (derivado de CLI_HIST / VT_TOP5) ── */
  CLI_TM_HIST = CLI_TOP5_HIST.map(function (c) {
    return { n: c.cliente, v: c.importe, p: CLI_TOTAL_HISTORICO ? Math.round(c.importe / CLI_TOTAL_HISTORICO * 10000) / 100 : 0, s: _cliSegOf(c.cliente) };
  });
  CLI_TM_CURR = ventasAgg.VT_TOP5.map(function (c) {
    return { n: c.cliente, v: c.importe, p: ventasAgg.VT_2026_TOTAL ? Math.round(c.importe / ventasAgg.VT_2026_TOTAL * 10000) / 100 : 0, s: _cliSegOf(c.cliente) };
  });
  (function () {
    let currentData = CLI_TM_HIST;

    function squarify(items, W, H) {
      const sorted = [...items].sort((a, b) => b.v - a.v);
      const total = sorted.reduce((s, i) => s + i.v, 0);
      const rects = [];
      function layout(items, x, y, w, h, sub) {
        if (!items.length) return;
        if (items.length === 1) { rects.push({ ...items[0], x, y, w, h }); return; }
        const isW = w >= h, sh = isW ? h : w;
        function worst(row, rs) {
          if (!row.length) return Infinity;
          const ra = rs / sub * w * h, rl = ra / sh;
          if (rl <= 0) return Infinity;
          let mx = 0;
          for (const it of row) {
            const is = sh * it.v / rs;
            if (is <= 0) continue;
            const a = Math.max(rl / is, is / rl);
            if (a > mx) mx = a;
          }
          return mx;
        }
        let row = [], rs = 0, idx = 0;
        while (idx < items.length) {
          const nr = [...row, items[idx]], ns = rs + items[idx].v;
          if (!row.length || worst(nr, ns) <= worst(row, rs)) { row = nr; rs = ns; idx++; }
          else break;
        }
        const frac = rs / sub, rl = (isW ? w : h) * frac;
        let pos = isW ? y : x;
        for (const it of row) {
          const is = sh * it.v / rs;
          if (isW) rects.push({ ...it, x, y: pos, w: rl, h: is });
          else rects.push({ ...it, x: pos, y, w: is, h: rl });
          pos += is;
        }
        const rem = items.slice(idx);
        if (rem.length) {
          const ns2 = sub - rs;
          if (isW) layout(rem, x + rl, y, w - rl, h, ns2);
          else layout(rem, x, y + rl, w, h - rl, ns2);
        }
      }
      layout(sorted, 0, 0, W, H, total);
      return rects;
    }

    function render(data) {
      const wrap = document.getElementById('treemapWrap');
      if (!wrap) return;
      const W = wrap.clientWidth;
      if (W < 20) return;
      const H = wrap.clientHeight || 360, G = 2;
      const rects = squarify(data, W, H);
      wrap.innerHTML = rects.map(r => {
        const area = r.w * r.h;
        const big = area > 18000, med = area > 7000;
        const c1 = SEG_COL[r.s] || '#0a0a1e', c2 = SEG_COL2[r.s] || '#1a2a5e';
        const cls = big ? 'tm-big' : med ? 'tm-med' : '';
        const nm = r.n;
        const vl = med ? (fmtEjecutivo(r.v) + ' · ' + r.p + '%') : '';
        return `<div class="tm-cell ${cls}" style="left:${r.x + G}px;top:${r.y + G}px;width:${r.w - G * 2}px;height:${r.h - G * 2}px;background:linear-gradient(135deg,${c1},${c2})" title="${r.n} — ${fmtEjecutivo(r.v)} (${r.p}%)"><div><div class="tm-nm">${nm}</div>${vl ? `<div class="tm-vl">${vl}</div>` : ''}</div></div>`;
      }).join('');
    }

    document.querySelectorAll('#tmToggle .tm-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#tmToggle .tm-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentData = btn.dataset.tm === 'hist' ? CLI_TM_HIST : CLI_TM_CURR;
        render(currentData);
      };
    });

    window.addEventListener('resize', () => {
      const wrap = document.getElementById('treemapWrap');
      if (wrap && wrap.offsetParent) render(currentData);
    });

    // lazy: se renderiza al visitar la sección (resize event en go())
    _tmRenderCurrent = () => render(currentData);
  })();

  /* ── Segmentation table — ordenable por encabezado, total siempre al final ── */
  (function () {
    const segHeadEl = document.getElementById('segHead');
    const SEG_KEY = [s => s.lbl, s => s.n, s => s.pctCartera, s => s.valorHist, s => s.ventas2026, s => s.pct2026];
    let sc = -1, sa = true;
    function render() {
      const rows = [...CLI_SEGMENTOS];
      if (sc >= 0) {
        rows.sort((a, b) => {
          const c = cmp(SEG_KEY[sc](a), SEG_KEY[sc](b));
          return sa ? c : -c;
        });
      }
      let h = '', tn = 0, tvh = 0, tvc = 0;
      CLI_SEGMENTOS.forEach(s => { tn += s.n; tvh += s.valorHist; tvc += s.ventas2026; });
      rows.forEach(s => {
        h += `<tr onclick="openCliSeg('${s.id}')" title="Ver detalle — ${s.lbl}">
        <td>
          <div><span class="sbadge ${SEG_CSS[s.id]}">${s.lbl}</span></div>
          <div style="font-size:10px;color:var(--ts);margin-top:3px;line-height:1.3">${s.note}</div>
        </td>
        <td class="r" style="font-weight:600">${s.n}</td>
        <td class="r">${s.pctCartera.toFixed(2)}%</td>
        <td class="r">${fmtEjecutivo(s.valorHist)}</td>
        <td class="r" style="font-weight:600;color:${s.ventas2026 > 0 ? 'var(--brand-d)' : 'var(--ts)'}">${s.ventas2026 > 0 ? fmtEjecutivo(s.ventas2026) : '—'}</td>
        <td class="r">${s.ventas2026 > 0 ? s.pct2026.toFixed(2) + '%' : '—'}</td>
      </tr>`;
      });
      h += `<tr class="tot">
      <td style="font-weight:700">Total cartera</td>
      <td class="r">${tn}</td><td class="r">100.00%</td>
      <td class="r">${fmtEjecutivo(tvh)}</td>
      <td class="r">${fmtEjecutivo(tvc)}</td>
      <td class="r">100.00%</td>
    </tr>`;
      document.getElementById('segBody').innerHTML = h;
      if (segHeadEl) {
        [].slice.call(segHeadEl.querySelectorAll('th')).forEach((th, i) => {
          const sorted = sc === i;
          th.classList.toggle('sorted', sorted);
          const sic = th.querySelector('.sic');
          if (sic) sic.textContent = sorted ? (sa ? '▲' : '▼') : '↕';
        });
      }
    }
    if (segHeadEl) {
      [].slice.call(segHeadEl.querySelectorAll('th')).forEach(th => {
        th.onclick = () => {
          const col = +th.dataset.col;
          if (sc === col) sa = !sa; else { sc = col; sa = true; }
          render();
        };
      });
    }
    render();
    var insEl = document.getElementById('segInsight');
    if (insEl) {
      var nr = CLI_SEGMENTOS.filter(function (s) { return s.id === 'nuevo' || s.id === 'reactivado'; });
      var nrN = nr.reduce(function (s, x) { return s + x.n; }, 0);
      var nrPct = nr.reduce(function (s, x) { return s + x.pct2026; }, 0);
      insEl.innerHTML = 'Segmentos <strong>Nuevo + Reactivado</strong> generan el <strong>' + nrPct.toFixed(2) + '%</strong> de las ventas 2026 con ' + nrN + ' clientes.';
    }
  })();
})();
