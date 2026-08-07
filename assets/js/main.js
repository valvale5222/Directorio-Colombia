// Bootstrap de la app: inyecta el HTML de cada vista y solo después carga
// sus módulos JS — evita que un módulo intente leer un elemento que todavía
// no existe en el DOM (las vistas se cargan siempre completas, igual que el
// original: se ocultan/muestran con CSS, no se desmontan al cambiar de tab).

import { applyChartDefaults, syncChartsTheme } from './core/charts.js';
import { closeModal } from './core/modal.js';
import { initTheme } from './core/theme.js';

const VIEWS = ['portada', 'resumen', 'ventas', 'moventas', 'pipeline', 'clientes', 'participacion', 'objetivos', 'organigrama'];

async function loadPartials() {
  await Promise.all(VIEWS.map(async (v) => {
    const res = await fetch(`views/${v}.html`);
    document.getElementById(v).innerHTML = await res.text();
  }));
}

async function boot() {
  initTheme();
  applyChartDefaults();
  await loadPartials();

  const [, , organigrama, ventas, pipeline, clientes, participacion, objetivos] = await Promise.all([
    import('./views/portada.js'),
    import('./views/moventas.js'),
    import('./views/organigrama.js'),
    import('./views/ventas.js'),
    import('./views/pipeline.js'),
    import('./views/clientes.js'),
    import('./views/participacion.js'),
    import('./views/objetivos.js'),
  ]);
  await Promise.all([organigrama.ready, ventas.ready, pipeline.ready, clientes.ready, participacion.ready, objetivos.ready]);
  syncChartsTheme(document.documentElement.getAttribute('data-theme'));

  const { initRouter, go } = await import('./core/router.js');
  initRouter();
  go('portada');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); window.closeOrgModal?.(); }
});

boot();
