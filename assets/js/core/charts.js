// Configuración global de Chart.js — se aplica una sola vez en el bootstrap.

// `chart.options` es un árbol resuelto en vivo por Chart.js (con getters de
// "route" hacia Chart.defaults para valores no seteados); recorrerlo entero
// y leer cada propiedad dispara esos resolvers como si fuera tiempo de
// render y puede acabar invocando callbacks de escala (p.ej. `ticks.callback`)
// fuera de contexto — eso rompía el boot completo. Por eso el flip de color
// al cambiar de tema se limita a `chart.data.datasets`, que son objetos
// planos definidos por cada vista (no pasan por el sistema de defaults).
const DARK_FLIP = { '#0a0a1e': '#e7ebf6', '#3d4a6a': '#c3cbe6' };
const LIGHT_FLIP = Object.fromEntries(Object.entries(DARK_FLIP).map(([k, v]) => [v, k]));
const DATASET_COLOR_KEYS = ['borderColor', 'backgroundColor', 'pointBackgroundColor', 'pointBorderColor'];

function flip(value, toDark) {
  const map = toDark ? DARK_FLIP : LIGHT_FLIP;
  return typeof value === 'string' && map[value] ? map[value] : value;
}

export function syncChartsTheme(theme) {
  if (typeof Chart === 'undefined') return;
  const toDark = theme === 'dark';
  Object.values(Chart.instances || {}).forEach((chart) => {
    (chart.data?.datasets || []).forEach((ds) => {
      DATASET_COLOR_KEYS.forEach((key) => {
        if (typeof ds[key] === 'string') ds[key] = flip(ds[key], toDark);
        else if (Array.isArray(ds[key])) ds[key] = ds[key].map((c) => flip(c, toDark));
      });
    });
    chart.update();
  });
}

export function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Inter','Segoe UI',sans-serif";
  Chart.defaults.font.size = 10;
  Chart.defaults.color = '#7b8db0';

  window.addEventListener('themechange', (e) => syncChartsTheme(e.detail.theme));
}
