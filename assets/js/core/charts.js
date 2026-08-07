// Configuración global de Chart.js — se aplica una sola vez en el bootstrap.

export function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Inter','Segoe UI',sans-serif";
  Chart.defaults.font.size = 10;
  Chart.defaults.color = '#7b8db0';
}
