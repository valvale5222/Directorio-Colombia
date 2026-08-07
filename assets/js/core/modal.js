// Motor de modal genérico compartido por Ventas y Clientes.

import { cmp } from './utils.js';

let _mci = null; // instancia de Chart.js activa dentro del modal genérico, si aplica

export function setModalChartInstance(chart) {
  _mci = chart;
}

export function openModal(title, html, subtitle) {
  document.getElementById('modalTitle').textContent = title;
  const sub = document.getElementById('modalSubtitle');
  if (sub) { sub.textContent = subtitle || ''; sub.style.display = subtitle ? 'block' : 'none'; }
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalBg').classList.add('open');
}

export function closeModal() {
  if (_mci) { _mci.destroy(); _mci = null; }
  // Resetea el estado de flip para que el próximo modal siempre muestre la cara frontal.
  const inner = document.getElementById('mdlFlipInner');
  if (inner) inner.classList.remove('is-flipped');
  document.getElementById('modalBg').classList.remove('open');
}

// Invocado desde onclick="closeModal()" en index.html (botón × y click fuera del modal).
window.closeModal = closeModal;

// Motor genérico de "tabla en modal" con búsqueda, orden y paginación —
// usado por los modales de detalle de Clientes (activos/nuevos/segmentos).
export function mkModal(cid) {
  return `<div id="${cid}">
    <input class="msearch" placeholder="Buscar cliente…">
    <div style="overflow-x:auto"><table class="mtbl"><thead></thead><tbody></tbody></table></div>
    <div class="mpager"><button class="pp">← Anterior</button><span class="pgi"></span><button class="pn">Siguiente →</button></div>
  </div>`;
}

export function wireTable(cid, headers, rows, totRow) {
  let sc = -1, sa = true, pg = 0, q = '';
  const PG = 15;
  function renderT() {
    const el = document.getElementById(cid);
    if (!el) return;
    const fq = q.toLowerCase();
    let filtered = rows.filter(r => String(r[0]).toLowerCase().includes(fq));
    if (sc >= 0) {
      filtered = [...filtered].sort((a, b) => {
        const c = cmp(a[sc], b[sc]);
        return sa ? c : -c;
      });
    }
    const maxP = Math.max(0, Math.ceil(filtered.length / PG) - 1);
    if (pg > maxP) pg = maxP;
    const pr = filtered.slice(pg * PG, (pg + 1) * PG);
    let thead = '<tr>' + headers.map((hd, i) => {
      const sorted = sc === i;
      const ic = sorted ? (sa ? '▲' : '▼') : '↕';
      return `<th class="${hd.r ? 'r' : ''} ${sorted ? 'sorted' : ''}" data-col="${i}">${hd.l} <span class="sic">${ic}</span></th>`;
    }).join('') + '</tr>';
    let tbody = pr.map(r => '<tr>' + headers.map((hd, i) => {
      const v = r[i];
      return `<td class="${hd.r ? 'r' : ''}">${hd.fn ? hd.fn(v, r) : v}</td>`;
    }).join('') + '</tr>').join('');
    if (!pr.length) tbody = `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--ts);padding:18px">Sin resultados</td></tr>`;
    let tfoot = '';
    if (totRow && !fq) {
      tfoot = '<tr class="mtr-tot">' + totRow.map((v, i) => `<td class="${headers[i] && headers[i].r ? 'r' : ''}">${v}</td>`).join('') + '</tr>';
    }
    el.querySelector('.mtbl thead').innerHTML = thead;
    el.querySelector('.mtbl tbody').innerHTML = tbody + tfoot;
    el.querySelector('.pgi').textContent = `Pág. ${pg + 1}/${maxP + 1} · ${filtered.length} clientes`;
    el.querySelector('.pp').disabled = pg === 0;
    el.querySelector('.pn').disabled = pg >= maxP;
  }
  setTimeout(() => {
    const el = document.getElementById(cid);
    if (!el) return;
    el.querySelector('.msearch').oninput = e => { q = e.target.value; pg = 0; renderT(); };
    // Event delegation en el <thead>: los <th> se destruyen y recrean en cada
    // renderT(), pero el nodo <thead> persiste, así que el listener sigue
    // funcionando sin necesidad de volver a enlazarlo tras cada render.
    el.querySelector('.mtbl thead').addEventListener('click', e => {
      const th = e.target.closest('th[data-col]');
      if (!th) return;
      const col = +th.dataset.col;
      if (sc === col) sa = !sa; else { sc = col; sa = true; }
      renderT();
    });
    el.querySelector('.pp').onclick = () => { pg--; renderT(); };
    el.querySelector('.pn').onclick = () => { pg++; renderT(); };
    renderT();
  }, 20);
}
