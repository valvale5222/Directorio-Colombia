// Proyectos en Curso — construye las 3 pestañas (Dream Berries, Cartama,
// Packing de Aguacate) a partir de data/proyectos.json, transcripción directa
// del PDF "DIRECTORIO OPERACIONES COLOMBIA rev3" (isométricos, planos, KPIs
// de avance, staff, contratistas, equipos críticos, riesgos y anexo fotográfico).

import { getProyectos } from '../core/data.js';

let PROYECTOS = [];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ESTADO_BADGE = {
  'En Ejecución': 'sb-ok', 'A tiempo': 'sb-ok', 'Aprobado': 'sb-ok',
  'En riesgo': 'sb-crit',
  'Stand By': 'sb-warn', 'Pendiente': 'sb-warn',
  'Por definir': 'sb-info', 'Con Orden': 'sb-info',
};
function badgeEstado(estado) {
  const cls = ESTADO_BADGE[estado] || 'sb-info';
  return `<span class="${cls}">${esc(estado)}</span>`;
}

function kpi(label, val, sub) {
  return `<div class="od-kpi"><span class="od-kl">${esc(label)}</span><span class="od-kv">${esc(val)}</span><span class="od-ks">${esc(sub)}</span></div>`;
}

function gallery(p) {
  if (!p.img.fotos.length) return '';
  return `<div class="od-card">
    <h4>Anexo Fotogr&aacute;fico</h4>
    <div class="py-gallery">
      ${p.img.fotos.map((f, i) => `<div class="py-gallery-item" onclick="pyOpenImg('${f}','Anexo fotográfico — ${esc(p.nombre)} (${i + 1}/${p.img.fotos.length})')">
        <img src="${f}" alt="Anexo fotogr&aacute;fico ${esc(p.nombre)} ${i + 1}" loading="lazy">
      </div>`).join('')}
    </div>
  </div>`;
}

function renderProyecto(p) {
  return `
  <div class="py-sub-hero">
    <div class="py-sub-hero-l">
      <span class="py-sub-emoji" aria-hidden="true">${p.emoji}</span>
      <div>
        <div class="py-sub-name">${esc(p.nombre)} <span class="py-sub-subtitle">&mdash; ${esc(p.subtitulo)}</span></div>
        <div class="py-sub-meta">Cliente: <strong>${esc(p.cliente)}</strong> &middot; Ubicaci&oacute;n: ${esc(p.ubicacion)}${p.sector ? ` &middot; Sector: ${esc(p.sector)}` : ''}</div>
      </div>
    </div>
    <div class="py-sub-hero-r">
      <span class="sb-info">${esc(p.estado)}</span>
      <span class="py-sub-corte">Corte de informe: ${esc(p.corte)}</span>
    </div>
  </div>

  <div class="od-hero" style="background:linear-gradient(135deg,#071430 0%,#0d2a56 60%,#071430 100%)">
    ${kpi('Avance Real', p.avance.real, p.avance.programado)}
    ${kpi('Desviación de Cronograma', p.avance.desviacionCronograma, p.avance.desviacionNota)}
    ${kpi('Margen Estimado (Contractual)', p.avance.margenEstimado, p.avance.margenEstimadoNota)}
    ${kpi('Margen Actual Proyectado', p.avance.margenActual, p.avance.margenActualNota)}
    ${kpi('Días en Obra', p.avance.diasEnObra, p.avance.diasEnObraNota)}
    ${p.avance.avanceLlegadaEquipos ? kpi('Avance Llegada de Equipos', p.avance.avanceLlegadaEquipos, p.avance.avanceLlegadaEquiposNota) : ''}
  </div>

  <div class="grid2">
    <div class="card py-img-card">
      <div class="card-h"><span class="material-symbols-rounded ic" aria-hidden="true">view_in_ar</span>Isom&eacute;trico del Proyecto</div>
      <img src="${p.img.isometrico}" alt="Isom&eacute;trico ${esc(p.nombre)}" loading="lazy" onclick="pyOpenImg('${p.img.isometrico}','Isométrico del Proyecto — ${esc(p.nombre)}')">
    </div>
    <div class="card py-img-card">
      <div class="card-h"><span class="material-symbols-rounded ic" aria-hidden="true">layers</span>Plano del Proyecto &mdash; Vista de Planta</div>
      <img src="${p.img.plano}" alt="Plano ${esc(p.nombre)}" loading="lazy" onclick="pyOpenImg('${p.img.plano}','Plano del Proyecto — Vista de Planta — ${esc(p.nombre)}')">
    </div>
  </div>

  <div class="grid2">
    <div class="od-card">
      <h4>Datos Generales del Contrato</h4>
      <table class="sc"><tbody>
        <tr><td>Valor del Contrato</td><td class="r"><strong>${esc(p.contrato.valor)}</strong></td></tr>
        <tr><td>Modalidad</td><td class="r">${esc(p.contrato.modalidad)}</td></tr>
        <tr><td>Interventor&iacute;a</td><td class="r">${esc(p.contrato.interventoria)}</td></tr>
        <tr><td>Duraci&oacute;n (Curva S)</td><td class="r">${esc(p.avance.curvaSDuracion)}</td></tr>
      </tbody></table>
    </div>
    <div class="od-card">
      <h4>Fechas Clave del Contrato</h4>
      <table class="sc"><tbody>
        <tr><td>Firma de Contrato</td><td class="r">${esc(p.fechasClave.firmaContrato)}</td></tr>
        <tr><td>Inicio de Obra</td><td class="r">${esc(p.fechasClave.inicioObra)}</td></tr>
        <tr><td>Fin Programado</td><td class="r">${esc(p.fechasClave.finProgramado)}</td></tr>
        <tr><td>Fin Proyectado</td><td class="r">${esc(p.fechasClave.finProyectado)}</td></tr>
        <tr><td>D&iacute;as Transcurridos</td><td class="r">${esc(p.fechasClave.diasTranscurridos)}</td></tr>
      </tbody></table>
    </div>
  </div>

  <div class="od-card">
    <h4>Staff del Proyecto</h4>
    <div class="py-staff-grid">
      <div>
        <div class="py-staff-lbl">Supervisores de Proyecto</div>
        ${p.staff.supervisoresProyecto.map(s => `<div class="py-staff-row">${s.rol ? `<span class="py-staff-role">${esc(s.rol)}</span>` : ''}<span>${esc(s.nombre)}</span></div>`).join('')}
      </div>
      <div>
        <div class="py-staff-lbl">Supervisores de SST</div>
        ${p.staff.supervisoresSst.map(s => `<div class="py-staff-row">${s.rol ? `<span class="py-staff-role">${esc(s.rol)}</span>` : ''}<span>${esc(s.nombre)}</span></div>`).join('')}
      </div>
    </div>
  </div>

  ${p.hitos.length ? `<div class="od-card"><h4>Pr&oacute;ximos Hitos / Decisiones del Directorio</h4>
    <ul class="py-hitos">${p.hitos.map(h => `<li><strong>${esc(h.fecha)}</strong>${esc(h.texto)}</li>`).join('')}</ul>
  </div>` : ''}

  <div class="kpis k4">
    <div class="kpi"><div class="lbl">D&iacute;as sin accidentes</div><div class="val">${esc(p.sst.diasSinAccidentes)}</div></div>
    <div class="kpi"><div class="lbl">Incidentes del mes</div><div class="val">${esc(p.sst.incidentesMes)}</div></div>
    <div class="kpi"><div class="lbl">Charlas de seguridad</div><div class="val">${esc(p.sst.charlasSeguridad)}</div></div>
    <div class="kpi"><div class="lbl">Cumplimiento EPP</div><div class="val">${esc(p.sst.cumplimientoEpp)}</div></div>
  </div>

  <div class="od-card">
    <h4>Estado de Pagos / Facturaci&oacute;n</h4>
    <table class="sc"><tbody>
      <tr><td>Anticipo Pagado</td><td class="r">${esc(p.pagos.anticipoPagado)}</td></tr>
      <tr><td>Facturado a la Fecha</td><td class="r">${esc(p.pagos.facturadoFecha)}</td></tr>
      <tr><td>Pendiente por Facturar</td><td class="r">${esc(p.pagos.pendienteFacturar)}</td></tr>
      <tr><td>Retenci&oacute;n en Garant&iacute;a</td><td class="r">${esc(p.pagos.retencionGarantia)}</td></tr>
    </tbody></table>
  </div>

  <div class="od-card">
    <h4>Contratistas</h4>
    <table class="sc"><thead><tr><th>Contratista</th><th>Alcance</th><th>Estado</th></tr></thead>
    <tbody>${p.contratistas.map(c => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.alcance)}</td><td>${badgeEstado(c.estado)}</td></tr>`).join('')}</tbody></table>
  </div>

  <div class="od-card">
    <h4>Personal en Obra</h4>
    <div class="py-note">${esc(p.personal.corteSemana)}</div>
    <div class="kpis k3">
      <div class="kpi"><div class="lbl">Personal directo Friopacking</div><div class="val">${esc(p.personal.resumen.directoFriopacking)}</div></div>
      <div class="kpi"><div class="lbl">Personal contratistas</div><div class="val">${esc(p.personal.resumen.contratistas)}</div></div>
      <div class="kpi"><div class="lbl">Total en obra</div><div class="val">${esc(p.personal.resumen.totalEnObra)}</div></div>
    </div>
    ${p.personal.especialidades.length ? `<table class="sc"><thead><tr><th>Especialidad</th><th class="r">Semana Actual</th><th class="r">Pico M&aacute;ximo</th></tr></thead>
      <tbody>${p.personal.especialidades.map(e => `<tr><td>${esc(e.especialidad)}</td><td class="r">${esc(e.semanaActual)}</td><td class="r">${esc(e.picoMaximo)}</td></tr>`).join('')}
      ${p.personal.promedio ? `<tr class="od-tot"><td colspan="2"><strong>Promedio semanal de personal en obra</strong></td><td class="r"><strong>${esc(p.personal.promedio)}</strong></td></tr>` : ''}
      </tbody></table>` : ''}
  </div>

  <div class="od-card">
    <h4>Equipos Cr&iacute;ticos</h4>
    <table class="sc"><thead><tr><th>Equipo</th><th>Fecha OC</th><th>Fecha Est. en Planta</th><th>Estado</th></tr></thead>
    <tbody>${p.equiposCriticos.map(e => `<tr><td>${esc(e.equipo)}</td><td>${esc(e.fechaOc)}</td><td>${esc(e.fechaEstPlanta)}</td><td>${badgeEstado(e.estado)}</td></tr>`).join('')}</tbody></table>
  </div>

  ${p.complicaciones.length ? `<div class="od-card"><h4>Complicaciones Actuales</h4>
    ${p.complicaciones.map(c => `<div class="py-note py-note-${esc(c.nivel).toLowerCase()}"><strong>${esc(c.nivel)}</strong> ${esc(c.texto)}</div>`).join('')}
  </div>` : ''}

  <div class="od-card">
    <h4>Rutas Cr&iacute;ticas y Riesgos</h4>
    <table class="sc"><thead><tr><th>Riesgo / Actividad Cr&iacute;tica</th><th class="r">Prob.</th><th class="r">Impacto</th></tr></thead>
    <tbody>${p.riesgos.map(r => `<tr><td>${esc(r.riesgo)}</td><td class="r">${esc(r.prob)}</td><td class="r">${esc(r.impacto)}</td></tr>`).join('')}</tbody></table>
  </div>

  <div class="od-card">
    <h4>Adicionales del Proyecto</h4>
    ${p.adicionales.length ? `<table class="sc"><thead><tr><th>Descripci&oacute;n</th><th class="r">Costo</th><th>Estado</th></tr></thead>
      <tbody>${p.adicionales.map(a => `<tr><td>${esc(a.descripcion)}</td><td class="r">${esc(a.costo)}</td><td>${badgeEstado(a.estado)}</td></tr>`).join('')}</tbody></table>`
      : `<div class="py-note">Sin adicionales registrados a la fecha de corte.</div>`}
    ${p.adicionalesNota ? `<div class="od-note">${esc(p.adicionalesNota)}</div>` : ''}
  </div>

  ${gallery(p)}
  `;
}

function pyGoTab(key) {
  document.querySelectorAll('#pyTabs .pipe-tab').forEach(t => t.classList.toggle('active', t.dataset.py === key));
  document.querySelectorAll('#pyPanels .pipe-view').forEach(v => v.classList.toggle('active', v.dataset.py === key));
}
window.pyGoTab = pyGoTab;

function pyOpenImg(src, caption) {
  document.getElementById('pyLightboxImg').src = src;
  document.getElementById('pyLightboxImg').alt = caption;
  document.getElementById('pyLightboxCap').textContent = caption;
  document.getElementById('pyLightbox').classList.add('open');
}
window.pyOpenImg = pyOpenImg;

function pyCloseImg() {
  document.getElementById('pyLightbox').classList.remove('open');
  document.getElementById('pyLightboxImg').src = '';
}
window.pyCloseImg = pyCloseImg;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') pyCloseImg();
});

export const ready = (async function init() {
  const data = await getProyectos();
  PROYECTOS = data.proyectos;

  document.getElementById('pyTabs').innerHTML = PROYECTOS.map((p, i) =>
    `<div class="pipe-tab${i === 0 ? ' active' : ''}" data-py="${p.key}" onclick="pyGoTab('${p.key}')"><span class="pipe-tab-emoji" aria-hidden="true">${p.emoji}</span>${esc(p.nombre)}</div>`
  ).join('');

  document.getElementById('pyPanels').innerHTML = PROYECTOS.map((p, i) =>
    `<div class="pipe-view${i === 0 ? ' active' : ''}" data-py="${p.key}">${renderProyecto(p)}</div>`
  ).join('');

  const enProceso = PROYECTOS.filter(p => p.estado === 'En Proceso').length;
  document.getElementById('pyHeroKpis').innerHTML = `
    <div class="pipe-hkpi">
      <span class="pipe-hkpi-ic material-symbols-rounded" aria-hidden="true">apartment</span>
      <div class="pipe-hkpi-l">Proyectos en Curso</div>
      <div class="pipe-hkpi-v">${PROYECTOS.length}</div>
      <div class="pipe-hkpi-s">Fuente: Directorio Operaciones Colombia</div>
    </div>
    <div class="pipe-hkpi">
      <span class="pipe-hkpi-ic material-symbols-rounded" aria-hidden="true">engineering</span>
      <div class="pipe-hkpi-l">En Proceso</div>
      <div class="pipe-hkpi-v">${enProceso}</div>
      <div class="pipe-hkpi-s">Estado reportado a la fecha de corte</div>
    </div>`;
})();
