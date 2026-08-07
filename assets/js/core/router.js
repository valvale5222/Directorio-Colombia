// Router de pestañas — activa una sección y, si corresponde, dispara la
// inicialización perezosa de sus gráficos (solo la primera vez que se visita).

import { vtSwitchTab, animVtHero } from '../views/ventas.js';
import { goObjTab } from '../views/objetivos.js';
import { pipeGoTab } from '../views/pipeline.js';
import { renderTreemap, initClientesCharts } from '../views/clientes.js';
import { initParticipacionCharts } from '../views/participacion.js';

export function go(s, sub) {
  document.querySelectorAll('.section').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  const secEl = document.getElementById(s);
  if (secEl) secEl.classList.add('active');
  const tabEl = document.querySelector('.tab[data-s="' + s + '"]');
  if (tabEl) tabEl.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (sub) {
    if (s === 'ventas') vtSwitchTab(sub);
    if (s === 'objetivos') goObjTab(sub);
    if (s === 'pipeline') pipeGoTab(sub);
  }
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    if (s === 'clientes') { renderTreemap(); initClientesCharts(); }
    if (s === 'ventas') animVtHero();
    if (s === 'participacion') initParticipacionCharts();
  }, 80);
}

export function initRouter() {
  window.go = go;
  document.querySelectorAll('.tab').forEach(t => { t.onclick = () => go(t.dataset.s); });
}
