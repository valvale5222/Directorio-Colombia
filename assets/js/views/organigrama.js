// Organigrama — construye el árbol jerárquico (Vista General) y los paneles
// departamentales a partir de data/organigrama.json, y maneja el modal de
// detalle de persona (#orgModalOverlay vive en index.html a nivel de app).

import { getOrganigrama } from '../core/data.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

let PERSONAS = [], DEPTOS = [], BY_ID = {}, DEPTO_BY_KEY = {}, EMPRESA = '';

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MESES[m - 1]} ${y}`;
}

function directosDe(id) {
  return PERSONAS.filter(p => p.reportaA === id);
}

// Dentro de un departamento, el "coordinador" es quien reporta a alguien
// fuera del propio departamento; el resto reporta a ese coordinador. Se
// detecta así (en vez de hardcodear ids) para no romper si cambia el equipo.
function jerarquiaInterna(personas) {
  const ids = new Set(personas.map(p => p.id));
  const coord = personas.find(p => !ids.has(p.reportaA));
  const subs = personas.filter(p => p.id !== coord.id);
  return { coord, subs };
}

// Cadena de jefes (raíz → jefe directo, sin incluir a la persona) para el
// breadcrumb de cada panel departamental. Las áreas de soporte sin persona
// asignada (esArea) no tienen reportaA real, así que se ubican en el árbol
// vía grupoDe sin aparecer como "reporte" en el modal de nadie.
function cadenaAscendente(id) {
  const chain = [];
  let ancla = BY_ID[id] ? (BY_ID[id].reportaA || BY_ID[id].grupoDe) : null;
  while (ancla) {
    const jefe = BY_ID[ancla];
    if (!jefe) break;
    chain.unshift(jefe);
    ancla = jefe.reportaA || jefe.grupoDe;
  }
  return chain;
}

// Agrupa un conjunto de personas por un campo (área, sede…) preservando el
// orden de primera aparición — así el orden del JSON controla el orden visual.
function agrupar(personas, campo) {
  const grupos = new Map();
  personas.forEach(p => {
    const k = p[campo] || '—';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  });
  return grupos;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function iniciales(nombre) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Fallback de foto: ícono para áreas de soporte sin persona (esArea), o
// iniciales para personas reales sin foto todavía cargada (foto null).
function fotoBlock(p) {
  if (p.foto) return `<img src="${p.foto}" alt="${esc(p.nombre)}" loading="lazy">`;
  if (p.esArea) return `<span class="og-avatar-fb"><span aria-hidden="true">${p.icono || '🏢'}</span></span>`;
  return `<span class="og-avatar-fb">${esc(iniciales(p.nombre))}</span>`;
}

/* ── Mini-card (Vista General) ──────────────────────────────────────── */
function miniCard(p) {
  return `<div class="og-mini" data-dept="${p.depto}" onclick="openOrgPerson('${p.id}')">
    <span class="og-sheen" aria-hidden="true"></span>
    <div class="og-mini-photo">${fotoBlock(p)}</div>
    <div class="og-mini-info">
      <div class="og-mini-name">${esc(p.nombre)}</div>
      <div class="og-mini-role">${esc(p.cargo)}</div>
    </div>
  </div>`;
}

/* ── Card completa (paneles departamentales) — el modo `simple` (Back
   Office y Planner Comercial) quita fecha de ingreso y "Ver detalle": son
   áreas/roles de soporte sin ficha de detalle propia en estos tabs. ───── */
function fullCard(p, opts = {}) {
  return `<div class="og-card${opts.simple ? ' og-card--static' : ''}" data-dept="${p.depto}"${opts.simple ? '' : ` onclick="openOrgPerson('${p.id}')"`}>
    <div class="og-card-body">
      <div class="og-card-photo">${fotoBlock(p)}</div>
      <div class="og-card-name">${esc(p.nombre)}</div>
      <div class="og-card-role">${esc(p.cargo)}</div>
      ${opts.simple ? '' : `<div class="og-card-meta"><span class="material-symbols-rounded" aria-hidden="true">event</span>${p.ingreso ? fmtFecha(p.ingreso) : 'Fecha no registrada'}</div>`}
    </div>
    ${opts.simple ? '' : `<div class="og-card-footer">Ver detalle <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></div>`}
  </div>`;
}

function bcCard(p) {
  return `<div class="og-bc-card" onclick="openOrgPerson('${p.id}')">
    <div class="og-bc-photo">${fotoBlock(p)}</div>
    <div class="og-bc-info"><div class="og-bc-name">${esc(p.nombre)}</div><div class="og-bc-role">${esc(p.cargo)}</div></div>
  </div>`;
}

function cuerpoAgrupado(personas, campo, opts = {}) {
  const grupos = agrupar(personas, campo);
  return [...grupos].map(([label, items]) => `
    <div class="og-section-label"><span class="txt">${esc(label)}</span></div>
    <div class="og-grid">${items.map(p => fullCard(p, opts)).join('')}</div>`).join('');
}

/* ── Área plegable (Vista General) — tira horizontal de secciones que se
   abren/cierran bajo demanda, en vez de mostrar todo el detalle siempre
   expandido. Se apoya en <details>/<summary> nativos (sin JS de estado). */
function accordionArea(deptKey, label, icon, count, bodyHtml, extra = '') {
  return `<details class="og-area-acc${extra ? ' ' + extra : ''}" data-dept="${deptKey}">
    <summary>
      <span class="og-area-acc-ic" aria-hidden="true">${icon}</span>
      <span class="txt">${esc(label)}</span>
      <span class="og-col-count">${count}</span>
      <span class="material-symbols-rounded og-area-acc-chev" aria-hidden="true">expand_more</span>
    </summary>
    <div class="og-area-acc-body">${bodyHtml}</div>
  </details>`;
}

/* ── Card jerárquica (Vista General) — usada tanto para la rama lateral de
   Soporte (Valeria) como para la fila de pares bajo Gerencia General. */
function heroCardHtml(persona, { tagIcon, tagLabel, soporte, estatico, dept, cargo, onId }) {
  const clases = ['og-hero', 'og-hero--sub', 'og-hero--peer', soporte ? 'og-hero--soporte' : '', estatico ? 'og-hero--static' : ''].filter(Boolean).join(' ');
  return `<div class="${clases}" data-dept="${dept}"${estatico ? '' : ` onclick="openOrgPerson('${onId}')"`}>
    <span class="og-sheen" aria-hidden="true"></span>
    <div class="og-hero-photo">${fotoBlock(persona)}</div>
    <div class="og-hero-body">
      <div class="og-tag${soporte ? ' og-tag--soporte' : ''}"><span aria-hidden="true">${tagIcon}</span>${esc(tagLabel)}</div>
      <div class="og-hero-name">${esc(persona.nombre)}</div>
      <div class="og-hero-role">${esc(cargo)}</div>
    </div>
  </div>`;
}

// Par simple (sin equipo plegable debajo): Vivian y Mario, y la rama lateral
// de Valeria — esta última sin el conector vertical propio de la fila.
function peerSlot(persona, opts) {
  const wrapClass = opts.branch ? 'og-branch-slot' : `og-peer-slot${opts.soporte ? ' og-peer-slot--soporte' : ''}`;
  return `<div class="${wrapClass}">${heroCardHtml(persona, opts)}</div>`;
}

// Par plegable (Eduardo Narro, Back Office): la card se mantiene clicable
// para abrir su ficha (si aplica); un botón discreto aparte —independiente
// del click de la card— despliega el equipo/áreas debajo, en <details>
// nativo para no requerir estado en JS. Al abrirse, el slot toma el ancho
// completo de la fila (:has()) para que el equipo se reorganice en horizontal
// sin invadir a los demás pares.
function peerAccSlot(persona, opts) {
  return `<div class="og-peer-slot og-peer-slot--acc${opts.soporte ? ' og-peer-slot--soporte' : ''}">
    ${heroCardHtml(persona, opts)}
    <details class="og-peer-toggle" data-dept="${opts.dept}">
      <summary class="og-peer-toggle-btn" aria-label="Mostrar equipo de ${esc(persona.nombre)}">
        <span class="material-symbols-rounded" aria-hidden="true">expand_more</span>
      </summary>
      <div class="og-peer-toggle-body">${opts.bodyHtml}</div>
    </details>
  </div>`;
}

/* ── Vista General: Misael a la cabeza, con Valeria (Soporte) como rama
   lateral a su derecha. Debajo, una sola fila con los 4 pares que reportan
   a Gerencia General: Eduardo Narro, Vivian, Mario y Back Office. Eduardo y
   Back Office son plegables — su equipo/áreas quedan ocultos hasta que se
   despliegan, en vez de mostrarse siempre expandidos. ─────────────────── */
function renderGeneral() {
  const gg = BY_ID['misael-estrada'];
  const gp = BY_ID['eduardo-narro'];
  const vivian = BY_ID['vivian-castrillon'];
  const mario = BY_ID['mario-parra'];
  const valeria = BY_ID['valeria-rodriguez'];
  const comercialDept = DEPTO_BY_KEY['comercial'];
  const boDept = DEPTO_BY_KEY['backoffice'];

  // Áreas de Eduardo Narro, agrupadas para su tira horizontal plegable.
  const opsPersonas = PERSONAS.filter(p => p.depto === 'operaciones');
  const sstPersonas = PERSONAS.filter(p => p.depto === 'sst');
  const boPersonas = PERSONAS.filter(p => p.depto === 'backoffice');

  const opsGrupos = agrupar(opsPersonas, 'area');
  const accOps = (label) => {
    const items = opsGrupos.get(label) || [];
    return items.length ? accordionArea('operaciones', label, '⚙️', items.length, items.map(miniCard).join('')) : '';
  };

  const { coord: sstCoord, subs: sstSubs } = jerarquiaInterna(sstPersonas);
  const areaSst = accordionArea('sst', 'SSOMA', '🦺', sstPersonas.length, `${miniCard(sstCoord)}
    <div class="og-subtree">
      <div class="og-connector" style="height:14px"></div>
      <div class="og-subtree-branch">${sstSubs.map(s => `<div class="og-subcol">${miniCard(s)}</div>`).join('')}</div>
    </div>`, 'og-area-acc--special');

  // Orden pedido: Logística, Servicio Técnico, SSOMA, Operaciones.
  const areasOperaciones = [accOps('Logística'), accOps('Servicio Técnico'), areaSst, accOps('Operaciones')].join('');

  // Back Office: Gestión Administrativa por país, cada uno plegable también.
  const areasBackoffice = [...agrupar(boPersonas, 'sede')].map(([label, items]) =>
    accordionArea('backoffice', `Gestión Administrativa ${label}`, '🏢', items.length, items.map(miniCard).join(''))
  ).join('');

  const peerEduardo = peerAccSlot(gp, {
    tagIcon: '👑', tagLabel: 'Dirección', dept: 'direccion', cargo: gp.cargo, onId: gp.id,
    bodyHtml: areasOperaciones,
  });
  const peerVivian = peerSlot(vivian, { tagIcon: comercialDept.icon, tagLabel: comercialDept.nombre, dept: 'comercial', cargo: vivian.cargo, onId: vivian.id });
  const peerMario = peerSlot(mario, { tagIcon: '🧩', tagLabel: 'Soporte', soporte: true, dept: 'ingenieria', cargo: mario.cargo, onId: mario.id });
  const peerBackoffice = peerAccSlot({ esArea: true, icono: boDept.icon, nombre: boDept.nombre }, {
    tagIcon: '🧩', tagLabel: 'Soporte', soporte: true, estatico: true, dept: 'backoffice', cargo: 'Áreas de soporte',
    bodyHtml: areasBackoffice,
  });

  const peerValeria = peerSlot(valeria, { tagIcon: '🧩', tagLabel: 'Soporte', soporte: true, estatico: true, dept: 'planner', cargo: valeria.cargo, branch: true });

  return `<div class="og-tree">
    <div class="og-top-row">
      <div class="og-hero og-hero--pulse" data-dept="direccion" onclick="openOrgPerson('${gg.id}')">
        <span class="og-sheen" aria-hidden="true"></span>
        <div class="og-hero-photo">${fotoBlock(gg)}</div>
        <div class="og-hero-body">
          <div class="og-tag"><span class="material-symbols-rounded" aria-hidden="true">workspace_premium</span>Dirección</div>
          <div class="og-hero-name">${esc(gg.nombre)}</div>
          <div class="og-hero-role">${esc(gg.cargo)}</div>
        </div>
      </div>
      <div class="og-top-branch">
        <span class="og-top-branch-line"></span>
        ${peerValeria}
      </div>
    </div>
    <div class="og-connector"></div>
    <div class="og-connector-dot"></div>
    <div class="og-peer-row">
      ${peerEduardo}
      ${peerVivian}
      ${peerMario}
      ${peerBackoffice}
    </div>
  </div>`;
}

/* ── Panel departamental ─────────────────────────────────────────────── */
function renderDepto(d) {
  const personas = PERSONAS.filter(p => p.depto === d.key);
  const ancestros = cadenaAscendente(personas[0].id);
  // Back Office y Planner Comercial: cards informativas, sin fecha de
  // ingreso ni "Ver detalle" — son áreas/roles de soporte sin ficha propia.
  const opts = { simple: d.key === 'backoffice' || d.key === 'planner' };

  let cuerpo;
  if (d.agrupaPor) {
    cuerpo = cuerpoAgrupado(personas, d.agrupaPor, opts);
  } else {
    const tieneSubjerarquia = personas.some(p => personas.some(q => q.id === p.reportaA));
    if (tieneSubjerarquia) {
      const { coord, subs } = jerarquiaInterna(personas);
      cuerpo = `<div class="og-dept-tree" data-dept="${d.key}">
        ${fullCard(coord, opts)}
        <div class="og-connector" style="height:20px;margin-top:12px"></div>
        <div class="og-dept-fan">
          ${subs.map(s => `<div class="og-fan-col">${fullCard(s, opts)}</div>`).join('')}
        </div>
      </div>`;
    } else {
      cuerpo = `<div class="og-grid" data-dept="${d.key}">${personas.map(p => fullCard(p, opts)).join('')}</div>`;
    }
  }

  return `<div class="og-dept-wrap">
    <div class="og-breadcrumb">
      ${ancestros.map((a, i) => `${bcCard(a)}${i < ancestros.length - 1 ? '<span class="material-symbols-rounded og-bc-arrow" aria-hidden="true">chevron_right</span>' : ''}`).join('')}
    </div>
    <div class="og-dept-head" data-dept="${d.key}">
      <div class="og-dept-icon"><span aria-hidden="true">${d.icon}</span></div>
      <div class="og-dept-titles">
        <div class="og-dept-name">${d.nombre}${d.soporte ? '<span class="og-soporte-badge">Soporte</span>' : ''}</div>
        <div class="og-dept-desc">${d.descripcion}</div>
      </div>
      <div class="og-dept-line"></div>
    </div>
    ${cuerpo}
  </div>`;
}

/* ── Tabs internas del módulo ────────────────────────────────────────── */
function switchOrgTab(key) {
  document.querySelectorAll('#ogTabs .og-tab').forEach(t => t.classList.toggle('active', t.dataset.k === key));
  document.querySelectorAll('#ogPanels .og-panel').forEach(p => p.classList.toggle('active', p.dataset.k === key));
}
window.switchOrgTab = switchOrgTab;

/* ── Modal de persona ────────────────────────────────────────────────── */
function openOrgPerson(id) {
  const p = BY_ID[id];
  if (!p) return;
  const d = DEPTO_BY_KEY[p.depto];
  const jefe = p.reportaA ? BY_ID[p.reportaA] : null;
  const jefeTexto = !jefe && p.reportaA && p.reportaA !== '-' ? p.reportaA : null;
  const directos = directosDe(id);

  const html = `
    <button class="og-modal-close" onclick="closeOrgModal()" aria-label="Cerrar"><span class="material-symbols-rounded" aria-hidden="true">close</span></button>
    <div class="og-modal-hdr" data-dept="${p.depto}">
      <div class="og-modal-photo">${fotoBlock(p)}</div>
      <div class="og-modal-hdr-info">
        <div class="og-tag"><span aria-hidden="true">${d.icon}</span>${d.nombre}</div>
        <div class="og-modal-name">${esc(p.nombre)}</div>
        <div class="og-modal-role-txt">${esc(p.cargo)}</div>
      </div>
    </div>
    <div class="og-modal-body" data-dept="${p.depto}">
      ${p.esArea ? '' : `<button class="og-costo-btn" onclick="openOrgCosto('${p.id}')">
        <span class="material-symbols-rounded" aria-hidden="true">payments</span>Costo de empresa
      </button>`}
      <table class="og-modal-info-tbl">
        ${p.area ? `<tr>
          <td class="og-mi-lbl"><span class="material-symbols-rounded" aria-hidden="true">apartment</span>Área</td>
          <td class="og-mi-val">${esc(p.area)}</td>
        </tr>` : ''}
        ${p.sede ? `<tr>
          <td class="og-mi-lbl"><span class="material-symbols-rounded" aria-hidden="true">location_on</span>Sede</td>
          <td class="og-mi-val">${esc(p.sede)}</td>
        </tr>` : ''}
        ${p.esArea ? '' : `<tr>
          <td class="og-mi-lbl"><span class="material-symbols-rounded" aria-hidden="true">event</span>Ingreso</td>
          <td class="og-mi-val">${p.ingreso ? fmtFecha(p.ingreso) : 'No registrada'}</td>
        </tr>`}
        <tr>
          <td class="og-mi-lbl"><span class="material-symbols-rounded" aria-hidden="true">supervisor_account</span>Reporta a</td>
          <td class="og-mi-val">${jefe ? `<span class="og-mi-link" onclick="openOrgPerson('${jefe.id}')">${esc(jefe.nombre)}</span> · ${esc(jefe.cargo)}` : (jefeTexto ? esc(jefeTexto) : '—')}</td>
        </tr>
        ${p.reportaGrupo ? `<tr>
          <td class="og-mi-lbl"><span class="material-symbols-rounded" aria-hidden="true">corporate_fare</span>Reporta a (Grupo)</td>
          <td class="og-mi-val">${esc(p.reportaGrupo)}</td>
        </tr>` : ''}
        ${directos.length ? `<tr>
          <td class="og-mi-lbl"><span class="material-symbols-rounded" aria-hidden="true">groups</span>Equipo a cargo</td>
          <td class="og-mi-val">${directos.map(x => `<span class="og-mi-link" onclick="openOrgPerson('${x.id}')">${esc(x.nombre)}</span>`).join(', ')}</td>
        </tr>` : ''}
      </table>
    </div>`;

  document.getElementById('orgModalContent').innerHTML = html;
  document.getElementById('orgModalContent').setAttribute('data-dept', p.depto);
  document.getElementById('orgModalOverlay').classList.add('open');
}
window.openOrgPerson = openOrgPerson;

/* ── Costo de empresa — placeholder a la espera de datos reales ─────── */
function openOrgCosto(fromId) {
  const html = `
    <button class="og-modal-close" onclick="closeOrgModal()" aria-label="Cerrar"><span class="material-symbols-rounded" aria-hidden="true">close</span></button>
    <div class="og-modal-hdr">
      <button class="og-modal-back" onclick="openOrgPerson('${fromId}')" aria-label="Volver al perfil"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></button>
      <div class="og-modal-hdr-info">
        <div class="og-tag"><span class="material-symbols-rounded" aria-hidden="true">payments</span>${esc(EMPRESA)}</div>
        <div class="og-modal-name">Costo de empresa</div>
      </div>
    </div>
    <div class="og-modal-body">
      <div class="og-costo-empty">
        <span class="material-symbols-rounded" aria-hidden="true">hourglass_top</span>
        <p>El costo de empresa reúne remuneración, beneficios, aportes y demás costos asociados a cada colaborador. Todavía no hay información cargada — estará disponible próximamente.</p>
      </div>
    </div>`;
  document.getElementById('orgModalContent').innerHTML = html;
  document.getElementById('orgModalContent').removeAttribute('data-dept');
}
window.openOrgCosto = openOrgCosto;

export function closeOrgModal() {
  document.getElementById('orgModalOverlay').classList.remove('open');
}
window.closeOrgModal = closeOrgModal;

/* ── Init ────────────────────────────────────────────────────────────── */
export const ready = (async function init() {
  const data = await getOrganigrama();
  EMPRESA = data.empresa;
  PERSONAS = data.personas;
  DEPTOS = data.departamentos;
  BY_ID = Object.fromEntries(PERSONAS.map(p => [p.id, p]));
  DEPTO_BY_KEY = Object.fromEntries(DEPTOS.map(d => [d.key, d]));

  const tabDepts = DEPTOS.filter(d => d.key !== 'direccion');
  const colaboradores = PERSONAS.filter(p => !p.esArea).length;

  const tabsHtml = [
    `<button class="og-tab active" data-k="general" onclick="switchOrgTab('general')"><span class="og-tab-emoji" aria-hidden="true">🧭</span>Vista General<span class="og-tab-badge">11</span></button>`,
    ...tabDepts.map(d => `<button class="og-tab" data-k="${d.key}" onclick="switchOrgTab('${d.key}')"><span class="og-tab-emoji" aria-hidden="true">${d.icon}</span>${d.nombre}<span class="og-tab-badge">${d.count}</span></button>`),
  ].join('');
  document.getElementById('ogTabs').innerHTML = tabsHtml;

  const panelsHtml = [
    `<div class="og-panel active" data-k="general">${renderGeneral()}</div>`,
    ...tabDepts.map(d => `<div class="og-panel" data-k="${d.key}">${renderDepto(d)}</div>`),
  ].join('');
  document.getElementById('ogPanels').innerHTML = panelsHtml;

  document.getElementById('ogHeroRight').textContent = `11 colaboradores · ${tabDepts.length} áreas · Planilla Colombia`;
})();
