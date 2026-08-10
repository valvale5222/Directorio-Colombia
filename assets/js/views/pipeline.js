import { getPipeline } from '../core/data.js';
import { meses, fmtEjecutivo } from '../core/utils.js';

const PIPE_ESTADOS = ['Negociación','En proceso de cotización','Prospecto','En análisis','Postpuesto','Cancelado','Perdido'];
const PIPE_ESTADO_COLOR = {
  'Prospecto':'#7B8DB0',
  'En proceso de cotización':'#4FA8E0',
  'En análisis':'#1E3A5F',
  'Negociación':'#D97706',
  'Postpuesto':'#AAB6C9',
  'Cancelado':'#94A3B8',
  'Perdido':'#D85A30'
};
const PIPE_ESTADO_BG = {
  'Prospecto':'#f1f5f9',
  'En proceso de cotización':'rgba(79,168,224,.12)',
  'En análisis':'rgba(30,58,95,.10)',
  'Negociación':'#fef3c7',
  'Postpuesto':'#eef1f6',
  'Cancelado':'rgba(148,163,184,.15)',
  'Perdido':'rgba(216,90,48,.12)'
};
const PIPE_ESTADO_ICON = {
  'Prospecto':'person_search',
  'En proceso de cotización':'request_quote',
  'En análisis':'query_stats',
  'Negociación':'handshake',
  'Postpuesto':'pause_circle',
  'Cancelado':'cancel',
  'Perdido':'trending_down'
};
/* Años habilitados para la segmentación de Forecast / Clientes por Etapa */
const YEARS_ALLOWED = [2026, 2027];

let _pipeProbSel = new Set(['all']);
let _pipeEstadoSel = new Set(['all']);
let _pipeSwitchView = null;

export function pipeGoTab(view) {
  if (_pipeSwitchView) _pipeSwitchView(view);
}

export const ready = (async function init() {
  const rows = await getPipeline();

  var PROB_LABELS = [['all','Todas'],['0','0%'],['5','5%'],['20','20%'],['40','40%'],['60','60%'],['80','80%'],['100','100%']];
  var _chPipeSeas = null;
  var _pipeSeasCache = {};
  var _pipeStageSel = null;
  var _pipeClienteFocus = 'all';
  var _pipeClienteSearch = '';

  function agg(rows) {
    var importe = 0;
    rows.forEach(function(r){ importe += (r.dolares||0); });
    return {count: rows.length, importe: importe};
  }
  function avgProb(rows) {
    var vs = rows.filter(function(r){ return r.probabilidad != null; });
    if (!vs.length) return 0;
    return vs.reduce(function(s,r){ return s+r.probabilidad; }, 0) / vs.length * 100;
  }
  function activeRows() { return rows.filter(function(r){ return r.estado !== 'Perdido' && r.estado !== 'Cancelado'; }); }
  function normSearch(s) { return String(s||'').toLowerCase().trim().replace(/\s+/g,' '); }
  function kpiCard(color, label, val, ctx, barPct, icon) {
    var track = (barPct == null) ? '' :
      '<div class="kv3-bar-track"><div class="kv3-bar-fill" style="width:' + Math.min(barPct,100).toFixed(1) + '%;background:' + color + '"></div></div>';
    var iconHtml = icon ? '<span class="material-symbols-rounded kv3-icon" aria-hidden="true" style="color:' + color + '">' + icon + '</span>' : '';
    return '<div class="kpi-v3" style="--accent:' + color + ';cursor:default">'
      + iconHtml
      + '<div class="kv3-lbl">' + label + '</div>'
      + '<div class="kv3-val" style="color:' + color + '">' + val + '</div>'
      + track
      + '<div class="kv3-ctx">' + ctx + '</div>'
      + '</div>';
  }
  function emptyState(icon, title, sub) {
    return '<div class="pipe-empty"><span class="material-symbols-rounded" aria-hidden="true">' + icon + '</span>'
      + '<div class="pipe-empty-ttl">' + title + '</div>'
      + (sub ? '<div class="pipe-empty-sub">' + sub + '</div>' : '')
      + '</div>';
  }
  function summaryChip(text, cls) { return '<span class="pf-summary-chip' + (cls ? ' ' + cls : '') + '">' + text + '</span>'; }

  /* Panel de filtros plegable — colapsado por defecto para reducir ruido visual;
     el resumen en el encabezado deja ver el estado activo sin necesidad de abrirlo. */
  function setupCollapsiblePanel(panelId, toggleId, bodyId, clearId, onClear) {
    var panel = document.getElementById(panelId);
    var toggle = document.getElementById(toggleId);
    var body = document.getElementById(bodyId);
    var clearBtn = document.getElementById(clearId);
    var collapsed = true;
    function apply() {
      if (body) body.classList.toggle('collapsed', collapsed);
      if (panel) panel.classList.toggle('expanded', !collapsed);
      if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));
    }
    if (toggle) {
      toggle.addEventListener('click', function(){ collapsed = !collapsed; apply(); });
      toggle.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); collapsed = !collapsed; apply(); }
      });
    }
    if (clearBtn) clearBtn.addEventListener('click', function(e){ e.stopPropagation(); onClear(); });
    apply();
  }

  /* ════════════════════════════════════════════════════════════
     SEGMENTADOR AÑO / MES — reutilizado por Forecast y Clientes por Etapa.
     Cada instancia mantiene su propio estado (independiente entre tabs).
     ════════════════════════════════════════════════════════════ */
  function yearsAvailable() {
    var present = new Set(rows.map(function(r){ return r.anio; }));
    return YEARS_ALLOWED.filter(function(y){ return present.has(y); });
  }
  function monthsAvailable(year) {
    var set = new Set();
    rows.forEach(function(r){ if (r.anio === year && r.mesCierre != null) set.add(r.mesCierre); });
    return Array.from(set).sort(function(a,b){ return a-b; });
  }

  function createYearMonthSegment(containerId, onChange) {
    var years = yearsAvailable();
    var state = { anio: years.length ? years[0] : null, meses: new Set() };
    if (state.anio != null) state.meses = new Set(monthsAvailable(state.anio));

    function currentMonths() { return state.anio != null ? monthsAvailable(state.anio) : []; }
    function isFull() { var mo = currentMonths(); return mo.length > 0 && state.meses.size === mo.length; }

    function render() {
      var el = document.getElementById(containerId);
      if (!el) return;
      var months = currentMonths();
      var sel = state.meses.size, total = months.length;
      var noneSel = sel === 0;
      var allSel = total > 0 && sel === total;
      var statusIcon = noneSel ? 'error' : 'check_circle';
      var statusTxt = noneSel
        ? 'Sin meses seleccionados'
        : allSel
          ? ('Año completo · ' + total + ' mes' + (total === 1 ? '' : 'es') + ' con cierre estimado')
          : (sel + ' de ' + total + ' meses seleccionados');
      var html = '<div class="ym">'
        + '<div class="ym-years" role="tablist" aria-label="Año">'
        +   years.map(function(y) {
              return '<button type="button" class="ym-year' + (y === state.anio ? ' active' : '') + '" data-year="' + y + '" role="tab" aria-selected="' + (y === state.anio) + '">'
                + '<span class="material-symbols-rounded" aria-hidden="true">event</span><span>' + y + '</span></button>';
            }).join('')
        + '</div>'
        + '<div class="ym-body">'
        +   (months.length
              ? '<div class="ym-months">' + months.map(function(m) {
                    var active = state.meses.has(m);
                    return '<button type="button" class="ym-month' + (active ? ' active' : '') + '" data-month="' + m + '" aria-pressed="' + active + '">' + meses[m-1] + '</button>';
                  }).join('') + '</div>'
              : '<div class="ym-nodata"><span class="material-symbols-rounded" aria-hidden="true">event_busy</span>Sin meses con cierre estimado en ' + state.anio + '</div>')
        +   '<div class="ym-tools">'
        +     '<button type="button" class="ym-tool" data-action="all"' + (!months.length ? ' disabled' : '') + '><span class="material-symbols-rounded" aria-hidden="true">done_all</span>Todos</button>'
        +     '<button type="button" class="ym-tool" data-action="clear"' + (!sel ? ' disabled' : '') + '><span class="material-symbols-rounded" aria-hidden="true">backspace</span>Limpiar</button>'
        +   '</div>'
        + '</div>'
        + '<div class="ym-status' + (noneSel ? ' warn' : '') + '"><span class="material-symbols-rounded" aria-hidden="true">' + statusIcon + '</span>' + statusTxt + '</div>'
        + '</div>';
      el.innerHTML = html;
    }

    var container = document.getElementById(containerId);
    if (container) {
      container.addEventListener('click', function(e) {
        var yb = e.target.closest('.ym-year');
        if (yb) {
          var y = Number(yb.dataset.year);
          if (y !== state.anio) {
            state.anio = y;
            state.meses = new Set(monthsAvailable(y));
            render();
            onChange();
          }
          return;
        }
        var mb = e.target.closest('.ym-month');
        if (mb) {
          var m = Number(mb.dataset.month);
          if (state.meses.has(m)) state.meses.delete(m); else state.meses.add(m);
          render();
          onChange();
          return;
        }
        var tb = e.target.closest('.ym-tool');
        if (tb && !tb.disabled) {
          if (tb.dataset.action === 'all') state.meses = new Set(currentMonths());
          else state.meses = new Set();
          render();
          onChange();
        }
      });
    }
    render();
    return { filter: state, isFull: isFull, availableMonths: currentMonths, render: render };
  }

  /* Coincide si: mismo año Y (segmento en "año completo" → incluye filas sin
     mes asignado, o el mes de cierre está entre los meses elegidos). */
  function rowInSegment(r, seg) {
    if (!seg || seg.filter.anio == null) return false;
    if (r.anio !== seg.filter.anio) return false;
    if (!seg.filter.meses.size) return false;
    if (seg.isFull()) return true;
    return r.mesCierre != null && seg.filter.meses.has(r.mesCierre);
  }
  function segHorizon(seg) {
    if (!seg) return [];
    return seg.isFull() ? seg.availableMonths() : Array.from(seg.filter.meses).sort(function(a,b){ return a-b; });
  }

  /* ── Mini-tabs de vista ── */
  function switchView(view) {
    document.querySelectorAll('#pipeViewTabs .pipe-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.view===view); });
    var map = {resumen:'pipeViewResumen', forecast:'pipeViewForecast', diversificacion:'pipeViewDiversificacion', clientes:'pipeViewClientes'};
    Object.keys(map).forEach(function(k){
      var el = document.getElementById(map[k]); if (el) el.classList.toggle('active', k===view);
    });
    if (view === 'forecast' && _chPipeSeas) _chPipeSeas.resize();
  }
  _pipeSwitchView = switchView;
  var viewTabsEl = document.getElementById('pipeViewTabs');
  if (viewTabsEl) viewTabsEl.addEventListener('click', function(e) {
    var t = e.target.closest('.pipe-tab'); if (!t || !t.dataset.view) return;
    switchView(t.dataset.view);
  });

  /* ── Hero fijo — universo completo, no reacciona a selección ni filtros ── */
  function renderHero() {
    var negAgg = agg(rows.filter(function(r){ return r.estado==='Negociación'; }));
    var perdAgg = agg(rows.filter(function(r){ return r.estado==='Perdido'; }));
    var actAgg = agg(activeRows());
    var html = ''
      + '<div class="pipe-hkpi"><span class="material-symbols-rounded pipe-hkpi-ic" aria-hidden="true">handshake</span><div class="pipe-hkpi-l">Oportunidades en Negociación</div>'
      + '<div class="pipe-hkpi-v">' + fmtEjecutivo(negAgg.importe) + '</div>'
      + '<div class="pipe-hkpi-s">' + negAgg.count + ' oportunidades</div></div>'
      + '<div class="pipe-hkpi"><span class="material-symbols-rounded pipe-hkpi-ic" aria-hidden="true">trending_up</span><div class="pipe-hkpi-l">Pipeline Activo</div>'
      + '<div class="pipe-hkpi-v">' + fmtEjecutivo(actAgg.importe) + '</div>'
      + '<div class="pipe-hkpi-s">' + actAgg.count + ' oportunidades activas</div></div>'
      + '<div class="pipe-hkpi"><span class="material-symbols-rounded pipe-hkpi-ic" aria-hidden="true" style="color:#F0997B">trending_down</span><div class="pipe-hkpi-l">Oportunidades Perdidas</div>'
      + '<div class="pipe-hkpi-v" style="color:#F0997B">' + perdAgg.count + '</div>'
      + '<div class="pipe-hkpi-s">' + fmtEjecutivo(perdAgg.importe) + ' en importe</div></div>';
    var el = document.getElementById('pipeHeroKpis');
    if (el) el.innerHTML = html;
  }

  /* Sincroniza el KPI de Pipeline en Portada con el mismo cálculo (agg + activeRows) usado en esta sección */
  function renderCoverPipelineKpi() {
    var count = agg(activeRows()).count;
    var el = document.getElementById('coverPipeCount');
    if (el) el.textContent = count;
  }

  /* ════════════════════════════════════════════════════════════
     VISTA 1 — RESUMEN EMBUDO (KPIs fijos + embudo + detalle)
     ════════════════════════════════════════════════════════════ */
  function renderResumenKpis() {
    var act = activeRows();
    var a = agg(act);
    var ticket = a.count ? a.importe / a.count : 0;
    var pAvg = avgProb(act);
    var html = ''
      + kpiCard('#3EC6AC', 'Pipeline Total', fmtEjecutivo(a.importe), 'Importe de oportunidades activas', null, 'account_balance_wallet')
      + kpiCard('#1E3A5F', 'Oportunidades Activas', String(a.count), 'Excluye vendido, perdido y postpuesto', null, 'workspaces')
      + kpiCard('#0F6E56', 'Probabilidad Promedio', pAvg.toFixed(2) + '%', 'Lectura comercial de cierre con nosotros', null, 'percent')
      + kpiCard('#D97706', 'Ticket Promedio', fmtEjecutivo(ticket), 'Pipeline total / oportunidades activas', null, 'payments');
    var el = document.getElementById('pipeKpiFixed');
    if (el) el.innerHTML = html;
  }

  function pickDefaultStage() {
    var best = null, bestVal = -1;
    PIPE_ESTADOS.forEach(function(e) {
      if (e === 'Perdido' || e === 'Cancelado') return;
      var a = agg(rows.filter(function(r){ return r.estado===e; }));
      if (a.importe > bestVal) { bestVal = a.importe; best = e; }
    });
    return best;
  }

  function renderFunnel() {
    var byEstado = {};
    PIPE_ESTADOS.forEach(function(e){ byEstado[e] = agg(rows.filter(function(r){ return r.estado===e; })); });
    var maxN = Math.max.apply(null, PIPE_ESTADOS.map(function(e){ return byEstado[e].count; }).concat([1]));
    var fh = '';
    PIPE_ESTADOS.forEach(function(nm) {
      if (nm === 'Cancelado') fh += '<div class="funnel-sep-v2"></div>';
      var a = byEstado[nm];
      var w = a.count ? Math.max(12, a.count/maxN*100) : 4;
      var c = PIPE_ESTADO_COLOR[nm];
      fh += '<div class="fstage-v2' + (nm===_pipeStageSel?' sel':'') + '" data-etapa="' + nm + '" style="--stage-c:' + c + '">'
        + '<div class="fv2-label-wrap"><span class="material-symbols-rounded fv2-icon" aria-hidden="true" style="color:' + c + '">' + PIPE_ESTADO_ICON[nm] + '</span>'
        + '<div><div class="fv2-label">' + nm + '</div><div class="fv2-count">' + a.count + ' oportunidad' + (a.count===1?'':'es') + '</div></div></div>'
        + '<div class="fv2-bar-wrap"><div class="fv2-bar" style="width:' + w + '%;background:linear-gradient(90deg,' + c + 'b3,' + c + ')"></div></div>'
        + '<div class="fv2-meta">' + fmtEjecutivo(a.importe) + '</div></div>';
    });
    var el = document.getElementById('funnelV2');
    if (!el) return;
    el.innerHTML = fh;
    el.querySelectorAll('.fstage-v2').forEach(function(node) {
      node.addEventListener('click', function() {
        _pipeStageSel = node.dataset.etapa;
        renderFunnel();
        renderStageDetail();
      });
    });
  }

  function renderStageDetail() {
    var nm = _pipeStageSel;
    var card = document.getElementById('pipeStageDetail');
    if (!card) return;
    if (!nm) { card.innerHTML = emptyState('ads_click', 'Selecciona una etapa', 'Elige una etapa del embudo para ver su detalle.'); return; }
    var stageRows = rows.filter(function(r){ return r.estado===nm; });
    var a = agg(stageRows);
    var pAvg = avgProb(stageRows);
    var ticket = a.count ? a.importe / a.count : 0;
    var top5 = stageRows.slice().sort(function(x,y){ return (y.dolares||0)-(x.dolares||0); }).slice(0,5);
    var html = ''
      + '<div class="psd-hdr"><div><div class="psd-name">' + nm + '</div><div class="psd-sub">' + a.count + ' oportunidades &middot; ' + fmtEjecutivo(a.importe) + '</div></div>'
      + '<span class="psd-badge" style="background:' + PIPE_ESTADO_BG[nm] + ';color:' + PIPE_ESTADO_COLOR[nm] + '"><span class="material-symbols-rounded" aria-hidden="true">' + PIPE_ESTADO_ICON[nm] + '</span>' + nm + '</span></div>'
      + '<div class="psd-stats">'
      + '<div class="psd-stat"><div class="psd-stat-l">Importe</div><div class="psd-stat-v">' + fmtEjecutivo(a.importe) + '</div></div>'
      + '<div class="psd-stat"><div class="psd-stat-l">Ticket Promedio</div><div class="psd-stat-v">' + fmtEjecutivo(ticket) + '</div></div>'
      + '<div class="psd-stat"><div class="psd-stat-l">Prob. Promedio</div><div class="psd-stat-v">' + pAvg.toFixed(2) + '%</div></div>'
      + '</div>'
      + '<div class="psd-list-h"><span class="material-symbols-rounded" aria-hidden="true">format_list_numbered</span>Top 5 oportunidades</div>';
    if (!top5.length) {
      html += emptyState('inbox', 'Sin oportunidades', 'Esta etapa no tiene oportunidades registradas.');
    } else {
      html += '<div class="psd-list-scroll">';
      top5.forEach(function(r) {
        var mesLbl = r.mesCierre != null ? meses[r.mesCierre-1] + ' ' + r.anio : 'Sin fecha';
        html += '<div class="psd-item"><div class="psd-item-main">'
          + '<div class="psd-item-cli">' + r.cliente + '</div>'
          + '<div class="psd-item-proj">' + (r.proyecto || 'Sin descripción registrada') + '</div></div>'
          + '<div class="psd-item-meta"><div class="psd-item-val">' + fmtEjecutivo(r.dolares) + '</div>'
          + '<div class="psd-item-sub"><span class="material-symbols-rounded" aria-hidden="true">percent</span>' + (r.probabilidad != null ? (r.probabilidad*100).toFixed(2)+'%' : '—')
          + ' <span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>' + mesLbl + '</div></div></div>';
      });
      html += '</div>';
    }
    card.innerHTML = html;
  }

  /* ════════════════════════════════════════════════════════════
     VISTA 2 — FORECAST (segmentador año/mes propio + filtros + KPI + gráfico + tabla)
     ════════════════════════════════════════════════════════════ */
  function rowMatchesProb(r) { return _pipeProbSel.has('all') || (r.probabilidad != null && _pipeProbSel.has(String(Math.round(r.probabilidad*100)))); }
  function rowMatchesEstado(r) { return _pipeEstadoSel.has('all') || _pipeEstadoSel.has(r.estado); }
  function forecastRows() { return rows.filter(function(r){ return rowMatchesProb(r) && rowMatchesEstado(r) && rowInSegment(r, forecastYM); }); }

  function toggleSel(sel, val) {
    if (val === 'all') { sel.clear(); sel.add('all'); }
    else {
      sel.delete('all');
      if (sel.has(val)) sel.delete(val); else sel.add(val);
      if (!sel.size) sel.add('all');
    }
  }
  function renderProbChips() {
    var el = document.getElementById('pfProb'); if (!el) return;
    el.innerHTML = PROB_LABELS.map(function(p) {
      var active = _pipeProbSel.has(p[0]);
      return '<div class="pf-chip' + (active?' active':'') + '" data-prob="' + p[0] + '">' + p[1] + '</div>';
    }).join('');
  }
  function renderEstadoChips() {
    var el = document.getElementById('pfEstado'); if (!el) return;
    var items = [['all','Todas','apps']].concat(PIPE_ESTADOS.map(function(e){ return [e, e, PIPE_ESTADO_ICON[e]]; }));
    el.innerHTML = items.map(function(it) {
      var active = _pipeEstadoSel.has(it[0]);
      return '<div class="pf-chip' + (active?' active':'') + '" data-estado="' + it[0] + '"><span class="material-symbols-rounded" aria-hidden="true">' + it[2] + '</span>' + it[1] + '</div>';
    }).join('');
  }
  var pfProbEl = document.getElementById('pfProb');
  if (pfProbEl) pfProbEl.addEventListener('click', function(e) {
    var t = e.target.closest('.pf-chip'); if (!t) return;
    toggleSel(_pipeProbSel, t.dataset.prob);
    renderProbChips(); renderForecastAll();
  });
  var pfEstadoEl = document.getElementById('pfEstado');
  if (pfEstadoEl) pfEstadoEl.addEventListener('click', function(e) {
    var t = e.target.closest('.pf-chip'); if (!t) return;
    toggleSel(_pipeEstadoSel, t.dataset.estado);
    renderEstadoChips(); renderForecastAll();
  });

  function renderForecastKpis() {
    var fRows = forecastRows();
    var a = agg(fRows);
    var yearActive = forecastYM.filter.anio;
    var fixedA = agg(activeRows().filter(function(r){ return r.anio === yearActive; }));
    var weightedImporte = fRows.reduce(function(s, r){ return s + (r.dolares||0) * (r.probabilidad||0); }, 0);
    var html = ''
      + kpiCard('#1E3A5F', 'Pipeline Bruto ' + (yearActive || ''), fmtEjecutivo(fixedA.importe), 'Importe de oportunidades activas en ' + (yearActive || '—'), null, 'account_balance_wallet')
      + kpiCard('#0F6E56', 'Forecast', fmtEjecutivo(a.importe), a.count + ' oportunidades seg&uacute;n filtro', null, 'insights')
      + kpiCard('#3EC6AC', 'Oportunidades', String(a.count), 'N&uacute;mero de oportunidades filtradas', null, 'workspaces')
      + kpiCard('#D97706', 'Importe ponderado', fmtEjecutivo(weightedImporte), 'Importe &times; probabilidad de cada oportunidad', null, 'trending_up');
    var el = document.getElementById('pipeKpiForecast');
    if (el) el.innerHTML = html;
  }

  function renderPipeSeasChart() {
    var emptyEl = document.getElementById('pipeSeasEmpty');
    var wrapEl = document.getElementById('pipeSeasChartWrap');
    var canvasEl = document.getElementById('chPipeSeas');
    var horizon = segHorizon(forecastYM);

    if (!horizon.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (wrapEl) wrapEl.hidden = true;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (wrapEl) wrapEl.hidden = false;

    var fRows = forecastRows();
    var labels = horizon.map(function(m){ return meses[m-1]; });
    var byMonthEtapa = {};
    PIPE_ESTADOS.forEach(function(e) {
      byMonthEtapa[e] = horizon.map(function(){ return {importe:0, count:0, probSum:0, probN:0}; });
    });
    fRows.forEach(function(r) {
      if (r.mesCierre == null) return;
      var idx = horizon.indexOf(r.mesCierre);
      if (idx === -1) return;
      var cell = byMonthEtapa[r.estado][idx];
      cell.importe += (r.dolares||0);
      cell.count += 1;
      if (r.probabilidad != null) { cell.probSum += r.probabilidad; cell.probN += 1; }
    });
    _pipeSeasCache = byMonthEtapa;

    if (!canvasEl || typeof Chart === 'undefined') return;
    var newDataByEstado = {};
    PIPE_ESTADOS.forEach(function(e) {
      newDataByEstado[e] = byMonthEtapa[e].map(function(c){ return c.importe; });
    });

    if (_chPipeSeas) {
      _chPipeSeas.data.labels = labels;
      _chPipeSeas.data.datasets.forEach(function(ds) { ds.data = newDataByEstado[ds.label]; });
      _chPipeSeas.resize();
      _chPipeSeas.update('active');
      return;
    }

    var datasets = PIPE_ESTADOS.map(function(e) {
      return {
        label: e,
        data: newDataByEstado[e],
        backgroundColor: PIPE_ESTADO_COLOR[e],
        borderRadius: 4,
        borderSkipped: false,
        maxBarThickness: 42,
        stack: 'pipe',
        hidden: (e === 'Perdido' || e === 'Cancelado')
      };
    });

    _chPipeSeas = new Chart(canvasEl, {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: {duration:450, easing:'easeInOutQuart'},
        interaction: {mode:'index', intersect:false},
        plugins: {
          legend: {display:true, position:'bottom', labels:{boxWidth:9, font:{size:9.5}, padding:10, color:'#7b8db0'}},
          tooltip: {
            backgroundColor:'rgba(9,12,30,.95)', padding:{top:11,bottom:11,left:13,right:13}, cornerRadius:10,
            borderColor:'rgba(62,198,172,.25)', borderWidth:1,
            titleColor:'rgba(255,255,255,.4)', titleFont:{size:9.5,weight:'700'},
            bodyColor:'rgba(255,255,255,.85)', bodyFont:{size:11,weight:'600'},
            filter: function(item) {
              var cell = (_pipeSeasCache[item.dataset.label]||[])[item.dataIndex];
              return !!(cell && cell.count);
            },
            callbacks: {
              title: function(items) { return items.length ? items[0].label : ''; },
              label: function(c) {
                var cell = _pipeSeasCache[c.dataset.label][c.dataIndex];
                var pAvg = cell.probN ? (cell.probSum/cell.probN*100) : 0;
                return c.dataset.label + ': ' + fmtEjecutivo(cell.importe) + ' · '
                  + cell.count + ' oport. · ' + pAvg.toFixed(2) + '% prob. prom.';
              }
            }
          }
        },
        scales: {
          x: {stacked:true, grid:{display:false}, border:{display:false}, ticks:{font:{size:10}, color:'#94a3b8'}},
          y: {stacked:true, grid:{color:'rgba(10,10,30,.05)'}, border:{display:false}, ticks:{font:{size:10}, color:'#94a3b8', callback:function(v){ return fmtEjecutivo(v); }}}
        }
      }
    });
  }

  function renderForecastTable() {
    var horizon = segHorizon(forecastYM);
    var allFiltered = forecastRows();
    var body = '';
    if (!horizon.length) {
      body = '<tr><td colspan="5" style="text-align:center;color:var(--ts);padding:16px">Selecciona al menos un mes en el segmentador de periodo.</td></tr>';
      var bodyElEmpty = document.getElementById('pipeForecastTblBody');
      if (bodyElEmpty) bodyElEmpty.innerHTML = body;
      var infoElEmpty = document.getElementById('pipeForecastTblInfo');
      if (infoElEmpty) infoElEmpty.textContent = 'Sin meses seleccionados';
      return;
    }
    var fRows = allFiltered.filter(function(r){ return r.mesCierre != null && horizon.indexOf(r.mesCierre) !== -1; });
    var totCount = 0, totImporte = 0, totProbSum = 0, totProbN = 0;
    horizon.forEach(function(m) {
      var mr = fRows.filter(function(r){ return r.mesCierre===m; });
      if (!mr.length) return;
      var a = agg(mr);
      var pAvg = avgProb(mr);
      var byE = {};
      mr.forEach(function(r){ byE[r.estado] = (byE[r.estado]||0) + (r.dolares||0); });
      var domE = '—', domV = -1;
      Object.keys(byE).forEach(function(e){ if (byE[e] > domV) { domV = byE[e]; domE = e; } });
      totCount += a.count; totImporte += a.importe;
      mr.forEach(function(r){ if (r.probabilidad != null) { totProbSum += r.probabilidad; totProbN += 1; } });
      var domBadge = domE === '—' ? '—' : ('<span class="pipe-mini-badge" style="background:' + PIPE_ESTADO_BG[domE] + ';color:' + PIPE_ESTADO_COLOR[domE] + '"><span class="material-symbols-rounded" aria-hidden="true">' + PIPE_ESTADO_ICON[domE] + '</span>' + domE + '</span>');
      body += '<tr><td>' + meses[m-1] + '</td><td class="r">' + a.count + '</td>'
        + '<td class="r" style="font-weight:700">' + fmtEjecutivo(a.importe) + '</td><td>' + domBadge + '</td><td class="r">' + pAvg.toFixed(2) + '%</td></tr>';
    });
    if (!body) {
      body = '<tr><td colspan="5" style="text-align:center;color:var(--ts);padding:16px">Sin oportunidades con mes de cierre en el filtro actual</td></tr>';
    } else {
      var totProbAvg = totProbN ? (totProbSum/totProbN*100) : 0;
      body += '<tr style="background:#f7faff;font-weight:700;border-top:2px solid var(--brand)"><td>Total</td><td class="r">' + totCount + '</td>'
        + '<td class="r">' + fmtEjecutivo(totImporte) + '</td><td>—</td><td class="r">' + totProbAvg.toFixed(2) + '%</td></tr>';
    }
    var bodyEl = document.getElementById('pipeForecastTblBody');
    if (bodyEl) bodyEl.innerHTML = body;
    var infoEl = document.getElementById('pipeForecastTblInfo');
    if (infoEl) {
      var excluded = allFiltered.length - fRows.length;
      infoEl.textContent = fRows.length + ' oportunidades con mes de cierre estimado' + (excluded ? ' · ' + excluded + ' sin mes asignado (no incluidas)' : '');
    }
  }

  /* Cinco etapas activas del Forecast (excluye "Perdido", que no es una etapa en curso) */
  var PIPE_ESTADOS_ACTIVOS = PIPE_ESTADOS.filter(function(e){ return e !== 'Perdido' && e !== 'Cancelado'; });

  function renderForecastStageCards() {
    var el = document.getElementById('pfStageGrid');
    if (!el) return;
    var fRows = forecastRows();
    el.innerHTML = PIPE_ESTADOS_ACTIVOS.map(function(estado) {
      var stageRows = fRows.filter(function(r){ return r.estado === estado; })
        .slice()
        .sort(function(a, b) {
          var av = a.dolares, bv = b.dolares;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return bv - av;
        });
      var listHtml;
      if (!stageRows.length) {
        listHtml = '<div class="pf-stage-empty"><span class="material-symbols-rounded" aria-hidden="true">inbox</span>Sin oportunidades para los filtros seleccionados</div>';
      } else {
        listHtml = stageRows.map(function(r) {
          var cliente = r.cliente || '—';
          var val = r.dolares != null ? fmtEjecutivo(r.dolares) : '—';
          return '<div class="pf-stage-row"><span class="pf-stage-cli" title="' + cliente.replace(/"/g,'&quot;') + '">' + cliente + '</span>'
            + '<span class="pf-stage-val">' + val + '</span></div>';
        }).join('');
      }
      return '<div class="pf-stage-card" style="--accent:' + PIPE_ESTADO_COLOR[estado] + '">'
        + '<div class="pf-stage-head"><span class="pf-stage-name"><span class="material-symbols-rounded" aria-hidden="true">' + PIPE_ESTADO_ICON[estado] + '</span>' + estado + '</span>'
        + '<span class="pf-stage-count">' + stageRows.length + '</span></div>'
        + '<div class="pf-stage-list">' + listHtml + '</div>'
        + '</div>';
    }).join('');
  }

  function renderPfFilterSummary() {
    var el = document.getElementById('pfFilterSummary');
    if (!el) return;
    var year = forecastYM.filter.anio;
    var selCount = forecastYM.filter.meses.size;
    var periodTxt = !selCount ? 'Sin meses' : (forecastYM.isFull() ? 'Año completo' : (selCount + ' mes' + (selCount===1?'':'es')));
    var probTxt = _pipeProbSel.has('all') ? 'Prob: Todas' : ('Prob: ' + _pipeProbSel.size);
    var estadoTxt = _pipeEstadoSel.has('all') ? 'Estado: Todas' : ('Estado: ' + _pipeEstadoSel.size);
    el.innerHTML = summaryChip(String(year || '—'), 'year')
      + summaryChip(periodTxt, selCount ? null : 'warn')
      + summaryChip(probTxt, _pipeProbSel.has('all') ? null : 'active-filter')
      + summaryChip(estadoTxt, _pipeEstadoSel.has('all') ? null : 'active-filter');
  }

  function renderForecastAll() {
    renderPfFilterSummary();
    renderForecastKpis();
    renderPipeSeasChart();
    renderForecastTable();
    renderForecastStageCards();
  }

  /* ════════════════════════════════════════════════════════════
     VISTA 3 — CLIENTES POR ETAPA (segmentador año/mes propio + agrupado + búsqueda)
     ════════════════════════════════════════════════════════════ */
  function clienteInSegment(r) { return rowInSegment(r, clientesYM); }

  function renderClienteFilterSummary() {
    var el = document.getElementById('pipeClienteFilterSummary');
    if (!el) return;
    var year = clientesYM.filter.anio;
    var selCount = clientesYM.filter.meses.size;
    var periodTxt = !selCount ? 'Sin meses' : (clientesYM.isFull() ? 'Año completo' : (selCount + ' mes' + (selCount===1?'':'es')));
    el.innerHTML = summaryChip(String(year || '—'), 'year') + summaryChip(periodTxt, selCount ? null : 'warn');
  }

  function renderClienteTabs() {
    var el = document.getElementById('pipeClienteTabs'); if (!el) return;
    var base = rows.filter(clienteInSegment);
    var items = [['all','Todas', base.length, 'apps']].concat(PIPE_ESTADOS.map(function(e) {
      return [e, e, base.filter(function(r){ return r.estado===e; }).length, PIPE_ESTADO_ICON[e]];
    }));
    el.innerHTML = items.map(function(it) {
      var active = _pipeClienteFocus === it[0];
      return '<div class="pipe-tab' + (active?' active':'') + '" data-etapa="' + it[0] + '"><span class="material-symbols-rounded" aria-hidden="true">' + it[3] + '</span>' + it[1] + ' <span class="pt-count">' + it[2] + '</span></div>';
    }).join('');
  }
  var clienteTabsEl = document.getElementById('pipeClienteTabs');
  if (clienteTabsEl) clienteTabsEl.addEventListener('click', function(e) {
    var t = e.target.closest('.pipe-tab'); if (!t) return;
    _pipeClienteFocus = t.dataset.etapa;
    renderClienteTabs(); renderClienteGroups();
  });
  var clienteSearchEl = document.getElementById('pipeClienteSearch');
  if (clienteSearchEl) clienteSearchEl.addEventListener('input', function() { _pipeClienteSearch = this.value; renderClienteGroups(); });

  function renderClienteGroups() {
    renderClienteFilterSummary();
    var groupsEl = document.getElementById('pipeEtapaGroups');
    if (!groupsEl) return;

    if (!clientesYM.filter.meses.size) {
      groupsEl.innerHTML = '<div class="card">' + emptyState('event_busy', 'Sin meses seleccionados', 'Elige al menos un mes en el segmentador de periodo para ver clientes por etapa.') + '</div>';
      return;
    }

    var q = normSearch(_pipeClienteSearch);
    var total = agg(rows.filter(clienteInSegment));
    var etapas = _pipeClienteFocus === 'all' ? PIPE_ESTADOS : [_pipeClienteFocus];
    var html = '';
    var grandCount = 0, grandImporte = 0, grandProbSum = 0, grandProbN = 0;

    etapas.forEach(function(nm) {
      var etapaRows = rows.filter(function(r){ return r.estado===nm && clienteInSegment(r); });
      var filtered = etapaRows.filter(function(r) {
        return normSearch(r.cliente).indexOf(q) >= 0 || normSearch(r.proyecto).indexOf(q) >= 0;
      });
      if (q && !filtered.length) return;
      var a = agg(etapaRows);
      var fa = agg(filtered);
      var part = total.importe ? (a.importe/total.importe*100) : 0;
      grandCount += filtered.length; grandImporte += fa.importe;
      filtered.forEach(function(r){ if (r.probabilidad != null) { grandProbSum += r.probabilidad; grandProbN += 1; } });

      var sorted = filtered.slice().sort(function(x,y){ return (y.dolares||0)-(x.dolares||0); });
      var rowsHtml = sorted.map(function(r) {
        var mesLbl = r.mesCierre != null ? meses[r.mesCierre-1] + ' ' + r.anio : '—';
        var proyecto = r.proyecto || 'Sin descripción registrada';
        return '<tr><td>' + r.cliente + '</td>'
          + '<td style="color:var(--tm);max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + String(proyecto).replace(/"/g,'&quot;') + '">' + proyecto + '</td>'
          + '<td>' + mesLbl + '</td>'
          + '<td class="r" style="font-weight:700">' + fmtEjecutivo(r.dolares) + '</td>'
          + '<td class="r">' + (r.probabilidad != null ? (r.probabilidad*100).toFixed(2)+'%' : '—') + '</td></tr>';
      }).join('');
      if (!sorted.length) rowsHtml = '<tr><td colspan="5" style="text-align:center;color:var(--ts);padding:12px">Sin oportunidades' + (q ? ' que coincidan con la búsqueda' : ' registradas') + '</td></tr>';

      html += '<div class="pipe-etapa-group">'
        + '<div class="pipe-etapa-hdr">'
        + '<span class="material-symbols-rounded peh-icon" aria-hidden="true" style="color:' + PIPE_ESTADO_COLOR[nm] + '">' + PIPE_ESTADO_ICON[nm] + '</span>'
        + '<span class="peh-name" style="color:' + PIPE_ESTADO_COLOR[nm] + '">' + nm + '</span>'
        + '<span class="peh-meta">' + a.count + ' oportunidad' + (a.count===1?'':'es') + ' &middot; ' + part.toFixed(2) + '% participaci&oacute;n &middot; ' + fmtEjecutivo(a.importe) + ' importe total</span>'
        + '</div>'
        + '<div class="pipe-etapa-tbl"><table><thead><tr>'
        + '<th>Cliente</th><th>Proyecto</th><th>Mes cierre</th><th class="r">Importe</th><th class="r">Probabilidad</th>'
        + '</tr></thead><tbody>' + rowsHtml + '</tbody>'
        + (sorted.length ? '<tfoot><tr><td colspan="3">Total etapa' + (q?' (filtrado)':'') + '</td><td class="r">' + fmtEjecutivo(fa.importe) + '</td><td></td></tr></tfoot>' : '')
        + '</table></div></div>';
    });

    if (!html) {
      groupsEl.innerHTML = '<div class="card">' + emptyState('search_off', 'Sin resultados', 'No hay oportunidades que coincidan con la búsqueda actual.') + '</div>';
      return;
    }
    var grandProbAvg = grandProbN ? (grandProbSum/grandProbN*100) : 0;
    groupsEl.innerHTML = html
      + '<div class="card pipe-grand-total">'
      + '<div class="pgt-lbl"><span class="material-symbols-rounded" aria-hidden="true">functions</span>Total general' + (q?' (filtrado)':'') + '</div>'
      + '<div class="pgt-stats">'
      + '<div class="pgt-stat"><div class="pgt-stat-l">Oportunidades</div><div class="pgt-stat-v">' + grandCount + '</div></div>'
      + '<div class="pgt-stat"><div class="pgt-stat-l">Importe</div><div class="pgt-stat-v">' + fmtEjecutivo(grandImporte) + '</div></div>'
      + '<div class="pgt-stat"><div class="pgt-stat-l">Probabilidad Promedio</div><div class="pgt-stat-v" style="color:#0F6E56">' + grandProbAvg.toFixed(2) + '%</div></div>'
      + '</div></div>';
  }

  /* ════════════════════════════════════════════════════════════
     VISTA · DIVERSIFICACIÓN (selector propio de categoría NO AGRO|AGRO y
     de año 2026|2027). AGRO/NO AGRO se lee directamente de r.agro, sin
     reclasificar registros. "Activo" aquí excluye Perdido, Cancelado y
     Postpuesto (más estricto que activeRows(), que sólo excluye
     Perdido/Cancelado — regla propia de este tab).
     ════════════════════════════════════════════════════════════ */
  var DIV_YEARS = YEARS_ALLOWED;
  var _pipeDivYear = DIV_YEARS[0];
  var DIV_AGRO_TYPES = ['NO AGRO', 'AGRO'];
  var _pipeDivAgro = DIV_AGRO_TYPES[0];
  var DIV_AGRO_META = {
    'NO AGRO': { icon: 'inventory_2' },
    'AGRO': { icon: 'eco' }
  };

  var DIV_SECTOR_COLOR = {
    'Centros logísticos / CEDI': '#1E3A5F',
    'Cárnicos': '#D97706',
    'Lácteos / derivados': '#3EC6AC'
  };
  var DIV_SECTOR_ICON = {
    'Centros logísticos / CEDI': 'warehouse',
    'Cárnicos': 'kebab_dining',
    'Lácteos / derivados': 'water_drop'
  };
  function divSectorColor(s) { return DIV_SECTOR_COLOR[s] || '#7B8DB0'; }
  function divSectorIcon(s) { return DIV_SECTOR_ICON[s] || 'category'; }
  /* Deriva el sector comercial NO AGRO a partir de PRODUCTO — la base no
     trae una columna de sector propia. Sólo agrupa sinónimos observados;
     cualquier producto no reconocido conserva su propio nombre como sector. */
  function sectorFromProducto(producto) {
    var p = normSearch(producto);
    if (!p) return 'Otros sectores';
    if (p.indexOf('logist') >= 0) return 'Centros logísticos / CEDI';
    if (p.indexOf('carnic') >= 0) return 'Cárnicos';
    if (p.indexOf('lacte') >= 0 || p.indexOf('queso') >= 0) return 'Lácteos / derivados';
    return producto.charAt(0).toUpperCase() + producto.slice(1).toLowerCase();
  }

  var DIV_AGRO_CAT_COLOR = {
    'Aguacate': '#3EC6AC',
    'Plátano': '#D97706',
    'Arándanos': '#4FA8E0',
    'Flores': '#D85A30',
    'Otros': '#7B8DB0'
  };
  var DIV_AGRO_CAT_ICON = {
    'Aguacate': 'eco',
    'Plátano': 'nutrition',
    'Arándanos': 'water_drop',
    'Flores': 'local_florist',
    'Otros': 'category'
  };
  function stripAccents(s) { return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,''); }
  /* Categoría AGRO — sólo Aguacate/Plátano/Arándanos/Flores; cualquier otro
     producto (Rambutan, Gulupa, Frutas, Limón, Fresas, etc.) cae en Otros. */
  function agroCategoryFromProducto(producto) {
    var p = stripAccents(normSearch(producto));
    if (p.indexOf('aguacat') >= 0) return 'Aguacate';
    if (p.indexOf('platano') >= 0) return 'Plátano';
    if (p.indexOf('arandan') >= 0) return 'Arándanos';
    if (p.indexOf('flor') >= 0) return 'Flores';
    return 'Otros';
  }
  function divCategoryFromProducto(producto, agro) { return agro === 'AGRO' ? agroCategoryFromProducto(producto) : sectorFromProducto(producto); }
  function divCategoryColor(cat, agro) { return agro === 'AGRO' ? (DIV_AGRO_CAT_COLOR[cat] || '#7B8DB0') : divSectorColor(cat); }
  function divCategoryIcon(cat, agro) { return agro === 'AGRO' ? (DIV_AGRO_CAT_ICON[cat] || 'category') : divSectorIcon(cat); }

  function divRowsYear(y) { return rows.filter(function(r){ return r.anio === y; }); }
  function divActiveRows(y) { return divRowsYear(y).filter(function(r){ return r.estado!=='Perdido' && r.estado!=='Cancelado' && r.estado!=='Postpuesto'; }); }
  function divActiveByAgro(y, agro) { return divActiveRows(y).filter(function(r){ return r.agro === agro; }); }

  function renderDivAgroSel() {
    var el = document.getElementById('pipeDivAgroSel');
    if (!el) return;
    el.innerHTML = '<div class="ym-years" role="tablist" aria-label="Categoría">'
      + DIV_AGRO_TYPES.map(function(a) {
          return '<button type="button" class="ym-year' + (a===_pipeDivAgro?' active':'') + '" data-agro="' + a + '" role="tab" aria-selected="' + (a===_pipeDivAgro) + '">'
            + '<span class="material-symbols-rounded" aria-hidden="true">' + DIV_AGRO_META[a].icon + '</span><span>' + a + '</span></button>';
        }).join('')
      + '</div>';
  }
  var pipeDivAgroSelEl = document.getElementById('pipeDivAgroSel');
  if (pipeDivAgroSelEl) pipeDivAgroSelEl.addEventListener('click', function(e) {
    var b = e.target.closest('.ym-year'); if (!b) return;
    var a = b.dataset.agro;
    if (a && a !== _pipeDivAgro) { _pipeDivAgro = a; renderDivAll(); }
  });

  function renderDivYearSel() {
    var el = document.getElementById('pipeDivYearSel');
    if (!el) return;
    el.innerHTML = '<div class="ym-years" role="tablist" aria-label="Año">'
      + DIV_YEARS.map(function(y) {
          return '<button type="button" class="ym-year' + (y===_pipeDivYear?' active':'') + '" data-year="' + y + '" role="tab" aria-selected="' + (y===_pipeDivYear) + '">'
            + '<span class="material-symbols-rounded" aria-hidden="true">event</span><span>' + y + '</span></button>';
        }).join('')
      + '</div>';
  }
  var pipeDivYearSelEl = document.getElementById('pipeDivYearSel');
  if (pipeDivYearSelEl) pipeDivYearSelEl.addEventListener('click', function(e) {
    var b = e.target.closest('.ym-year'); if (!b) return;
    var y = Number(b.dataset.year);
    if (y !== _pipeDivYear) { _pipeDivYear = y; renderDivAll(); }
  });

  /* Umbral mínimo de probabilidad para el KPI ponderado — varía por año porque
     el máximo de probabilidad disponible entre las oportunidades NO AGRO
     activas difiere de un año a otro (60% en 2026, 40% en 2027). */
  var DIV_WEIGHTED_THRESHOLD = { 2026: 0.6, 2027: 0.4 };
  function divWeightedThreshold(y) { return DIV_WEIGHTED_THRESHOLD[y] != null ? DIV_WEIGHTED_THRESHOLD[y] : 0.6; }

  function renderDivKpis() {
    var y = _pipeDivYear, agro = _pipeDivAgro;
    var agroActive = divActiveByAgro(y, agro);
    var totalActive = divActiveRows(y);
    var agroA = agg(agroActive);
    var totalA = agg(totalActive);
    var participacion = totalA.importe ? (agroA.importe / totalA.importe * 100) : 0;
    var threshold = divWeightedThreshold(y);
    var weighted = agroActive
      .filter(function(r){ return r.probabilidad != null && r.probabilidad >= threshold; })
      .reduce(function(s, r){ return s + (r.dolares||0) * r.probabilidad; }, 0);

    var html = ''
      + kpiCard('#3EC6AC', 'Pipeline ' + agro + ' activo', fmtEjecutivo(agroA.importe), agroA.count + ' oportunidad' + (agroA.count===1?'':'es') + ' &middot; ' + y, null, 'workspaces')
      + kpiCard('#1E3A5F', 'Participaci&oacute;n ' + agro, participacion.toFixed(1) + '%', fmtEjecutivo(agroA.importe) + ' de ' + fmtEjecutivo(totalA.importe) + ' activos', Math.min(participacion,100), 'donut_large')
      + kpiCard('#D97706', 'Pipeline ' + agro + ' ponderado', fmtEjecutivo(weighted), 'Oportunidades &ge;' + Math.round(threshold*100) + '%', null, 'trending_up');
    var el = document.getElementById('pipeDivKpis');
    if (el) el.innerHTML = html;
  }

  /* Lista de barras horizontales compartida por "por sector" y "madurez" —
     mismo lenguaje visual que el embudo de Resumen (fstage-v2/fv2-bar). */
  function divBarListHtml(items, totalImporte) {
    var maxV = Math.max.apply(null, items.map(function(it){ return it.importe; }).concat([1]));
    return items.map(function(it) {
      var pct = totalImporte ? (it.importe/totalImporte*100) : 0;
      var w = it.importe ? Math.max(6, it.importe/maxV*100) : 3;
      return '<div class="div-bar-row" style="--stage-c:' + it.color + '">'
        + '<div class="div-bar-label"><span class="material-symbols-rounded div-bar-icon" aria-hidden="true" style="color:' + it.color + '">' + it.icon + '</span>' + it.label + '</div>'
        + '<div class="div-bar-track"><div class="div-bar-fill" style="width:' + w + '%;background:linear-gradient(90deg,' + it.color + 'b3,' + it.color + ')"></div></div>'
        + '<div class="div-bar-meta">' + fmtEjecutivo(it.importe) + ' <span class="div-bar-pct">&middot; ' + pct.toFixed(1) + '%</span></div>'
        + '</div>';
    }).join('');
  }

  function renderDivSectorChart() {
    var y = _pipeDivYear, agro = _pipeDivAgro;
    var agroActive = divActiveByAgro(y, agro);
    var total = agg(agroActive).importe;
    var byCat = {};
    agroActive.forEach(function(r) {
      var c = divCategoryFromProducto(r.producto, agro);
      byCat[c] = (byCat[c]||0) + (r.dolares||0);
    });
    var items = Object.keys(byCat).map(function(c) {
      return {label:c, importe:byCat[c], color:divCategoryColor(c, agro), icon:divCategoryIcon(c, agro)};
    }).sort(function(a,b){ return b.importe - a.importe; });
    var el = document.getElementById('pipeDivSectorChart');
    if (el) el.innerHTML = items.length ? divBarListHtml(items, total) : emptyState('inbox', 'Sin oportunidades ' + agro, 'No hay oportunidades ' + agro + ' activas en ' + y + '.');
    var lblEl = document.getElementById('pipeDivSectorYearLbl');
    if (lblEl) lblEl.textContent = y;
    var titleEl = document.getElementById('pipeDivSectorTitle');
    if (titleEl) titleEl.textContent = 'Pipeline ' + agro + ' por sector';
  }

  function renderDivMaturityChart() {
    var y = _pipeDivYear, agro = _pipeDivAgro;
    var agroActive = divActiveByAgro(y, agro);
    var total = agg(agroActive).importe;
    var byEstado = {};
    agroActive.forEach(function(r) { byEstado[r.estado] = (byEstado[r.estado]||0) + (r.dolares||0); });
    var items = PIPE_ESTADOS.filter(function(e){ return byEstado[e] > 0; }).map(function(e) {
      return {label:e, importe:byEstado[e], color:PIPE_ESTADO_COLOR[e], icon:PIPE_ESTADO_ICON[e]};
    }).sort(function(a,b){ return b.importe - a.importe; });
    var el = document.getElementById('pipeDivMaturityChart');
    if (el) el.innerHTML = items.length ? divBarListHtml(items, total) : emptyState('inbox', 'Sin oportunidades ' + agro, 'No hay oportunidades ' + agro + ' activas en ' + y + '.');
    var lblEl = document.getElementById('pipeDivMaturityYearLbl');
    if (lblEl) lblEl.textContent = y;
    var titleEl = document.getElementById('pipeDivMaturityTitle');
    if (titleEl) titleEl.textContent = 'Madurez del pipeline ' + agro;
  }

  function divProbChipStyle(p) {
    if (p == null) return {bg:'#f1f5f9', color:'#7B8DB0'};
    if (p >= 0.8) return {bg:'rgba(15,110,86,.14)', color:'#0F6E56'};
    if (p >= 0.6) return {bg:'rgba(62,198,172,.14)', color:'#0F6E56'};
    if (p >= 0.4) return {bg:'#fef3c7', color:'#B45309'};
    return {bg:'#f1f5f9', color:'#7B8DB0'};
  }

  function renderDivTable() {
    var y = _pipeDivYear, agro = _pipeDivAgro;
    var titleEl = document.getElementById('pipeDivTableTitle');
    if (titleEl) titleEl.textContent = 'Oportunidades ' + agro + ' · ' + y;
    var agroActive = divActiveByAgro(y, agro).slice().sort(function(a,b){ return (b.dolares||0)-(a.dolares||0); });
    var body = '';
    agroActive.forEach(function(r) {
      var cat = divCategoryFromProducto(r.producto, agro);
      var sc = divCategoryColor(cat, agro);
      var probPct = r.probabilidad != null ? (r.probabilidad*100).toFixed(0)+'%' : '—';
      var pStyle = divProbChipStyle(r.probabilidad);
      var mesLbl = r.mesCierre != null ? meses[r.mesCierre-1] + ' ' + r.anio : '—';
      body += '<tr>'
        + '<td style="font-weight:700">' + r.cliente + '</td>'
        + '<td><span class="pipe-mini-badge" style="background:' + sc + '22;color:' + sc + '">' + cat + '</span></td>'
        + '<td class="r" style="font-weight:700">' + fmtEjecutivo(r.dolares) + '</td>'
        + '<td><span class="pipe-mini-badge" style="background:' + pStyle.bg + ';color:' + pStyle.color + '">' + probPct + '</span></td>'
        + '<td><span class="pipe-mini-badge" style="background:' + PIPE_ESTADO_BG[r.estado] + ';color:' + PIPE_ESTADO_COLOR[r.estado] + '"><span class="material-symbols-rounded" aria-hidden="true">' + PIPE_ESTADO_ICON[r.estado] + '</span>' + r.estado + '</span></td>'
        + '<td>' + mesLbl + '</td>'
        + '</tr>';
    });
    if (!body) body = '<tr><td colspan="6" style="text-align:center;color:var(--ts);padding:20px">Sin oportunidades ' + agro + ' activas en ' + y + '</td></tr>';
    var bodyEl = document.getElementById('pipeDivTableBody');
    if (bodyEl) bodyEl.innerHTML = body;
  }

  function renderDivAll() {
    renderDivAgroSel();
    renderDivYearSel();
    renderDivKpis();
    renderDivSectorChart();
    renderDivMaturityChart();
    renderDivTable();
  }

  /* ── Orquestador ── */
  function renderPipeAll() {
    renderHero();
    renderCoverPipelineKpi();
    renderResumenKpis();
    renderFunnel();
    renderStageDetail();
    renderProbChips();
    renderEstadoChips();
    renderForecastAll();
    renderDivAll();
    renderClienteTabs();
    renderClienteGroups();
  }

  _pipeStageSel = pickDefaultStage();
  var forecastYM = createYearMonthSegment('pfYearMonth', function(){ renderForecastAll(); });
  var clientesYM = createYearMonthSegment('pipeClienteYM', function(){ renderClienteTabs(); renderClienteGroups(); });

  setupCollapsiblePanel('pfFilterPanel', 'pfFilterToggle', 'pfFilterBody', 'pfFilterClear', function() {
    _pipeProbSel = new Set(['all']);
    _pipeEstadoSel = new Set(['all']);
    forecastYM.filter.meses = new Set(forecastYM.availableMonths());
    forecastYM.render();
    renderProbChips();
    renderEstadoChips();
    renderForecastAll();
  });
  setupCollapsiblePanel('pipeClienteFilterPanel', 'pipeClienteFilterToggle', 'pipeClienteFilterBody', 'pipeClienteFilterClear', function() {
    clientesYM.filter.meses = new Set(clientesYM.availableMonths());
    clientesYM.render();
    renderClienteTabs();
    renderClienteGroups();
  });

  renderPipeAll();
})();
