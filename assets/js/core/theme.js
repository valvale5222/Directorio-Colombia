// Toggle manual de modo claro/oscuro. El atributo data-theme ya se fija
// inline en el <head> de index.html (antes de pintar) para evitar el
// flash del tema equivocado; este módulo solo conecta el botón y
// notifica a quien necesite reaccionar (ver core/charts.js).

const KEY = 'dc-theme';

// Para colores fijos (gráficos Chart.js) que las vistas deben elegir al
// crear el chart según el tema activo — ver core/charts.js para el porqué
// de no re-colorear esos mismos charts dinámicamente en cada toggle.
export function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) {
    const icon = btn.querySelector('.material-symbols-rounded');
    if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

export function initTheme() {
  apply(document.documentElement.getAttribute('data-theme') || 'light');
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(KEY, next);
    apply(next);
  });
}
