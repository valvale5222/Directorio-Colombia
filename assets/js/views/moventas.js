// Mano de Obra (sub-vista de Ventas, hoy sin botón de acceso en la navegación —
// se conserva funcional igual que en el original, sin conectarla a ningún tab).

const moTabsEl = document.getElementById('moTabs');
if (moTabsEl) {
  const moSwitchTab = (tab) => {
    document.querySelectorAll('#moTabs .mo3-tab-btn').forEach(t => t.classList.toggle('active', t.dataset.motab === tab));
    document.querySelectorAll('#moventas .mo3-view').forEach(v => v.classList.toggle('active', v.dataset.motab === tab));
  };
  moTabsEl.addEventListener('click', (e) => {
    const t = e.target.closest('.mo3-tab-btn');
    if (!t || !t.dataset.motab) return;
    moSwitchTab(t.dataset.motab);
  });

  const srcImg = document.getElementById('coverImg');
  const frameBg = document.getElementById('moFrameBg');
  if (srcImg && frameBg && srcImg.style.backgroundImage) {
    frameBg.style.backgroundImage = srcImg.style.backgroundImage;
  }
}
