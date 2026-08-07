// Objetivos 5 — Render + Navegación
import { getObjetivos } from '../core/data.js';

var statusStyles = {
  ok:   {bg:'#dcfce7', color:'#16a34a', dot:'#16a34a'},
  warn: {bg:'#fef9c3', color:'#ca8a04', dot:'#ca8a04'},
  crit: {bg:'#fee2e2', color:'#dc2626', dot:'#dc2626'}
};

function buildCard(o, idx) {
  var ss = statusStyles[o.status] || statusStyles.warn;
  var fillPct = Math.min(o.pct, 100);
  var gradient = 'linear-gradient(90deg,' + o.colorDark + ',' + o.color + ')';
  var statsHtml = o.stats.slice(1, 4).map(function(s) {
    return '<div class="o5-stat">'
      + '<span class="o5-stat-val ' + (s.cls || '') + '">' + s.val + '</span>'
      + '<span class="o5-stat-lbl">' + s.lbl + '</span>'
      + '</div>';
  }).join('');
  return '<div class="obj5" style="animation-delay:' + (idx * 0.07) + 's" onclick="odOpen(' + o.id + ')">'
    + '<div class="o5h" style="background:' + o.colorBg + ';--accent:' + o.color + '">'
    + '<div class="o5h-top">'
    + '<span class="o5h-eye" style="color:' + o.colorDark + '">Objetivo ' + o.num + ' &middot; ' + o.cat + '</span>'
    + '<span class="o5f-chip" style="background:' + ss.bg + ';color:' + ss.color + '">'
    + '<span class="o5f-dot" style="background:' + ss.dot + '"></span>' + o.stxt + '</span>'
    + '</div>'
    + '<div class="o5h-row">'
    + '<div class="o5h-icon" style="background:' + o.color + '">' + o.icon + '</div>'
    + '<span class="o5h-name" style="color:' + o.colorDark + '">' + o.name + '</span>'
    + '</div></div>'
    + '<div class="o5-body">'
    + '<div class="o5-achv-row">'
    + '<div class="o5-achv-main">'
    + '<span class="o5-achv-val ' + (o.stats[0].cls || '') + '" style="color:' + o.color + '">' + o.stats[0].val + '</span>'
    + '<span class="o5-achv-lbl">' + o.stats[0].lbl + '</span>'
    + '</div>'
    + '<div class="o5-achv-meta">'
    + '<span class="o5-meta-val">' + o.metaLabel + '</span>'
    + '<span class="o5-meta-lbl">Meta</span>'
    + '</div></div>'
    + '<div class="o5-prog">'
    + '<div class="o5-prog-track">'
    + '<div class="o5-prog-fill" style="background:' + gradient + ';width:0" data-w="' + fillPct.toFixed(1) + '%"></div>'
    + '</div>'
    + '<div class="o5-prog-foot">'
    + '<span class="o5-prog-lbl">Progreso</span>'
    + '<span class="o5-prog-pct" style="color:' + o.color + '">' + o.pctLabel + '%</span>'
    + '</div></div>'
    + '<div class="o5-stats">' + statsHtml + '</div>'
    + '</div></div>';
}

export function objTab(name, btn) {
  var pane = document.getElementById('objPane-' + name);
  // Único tab existente: cualquier nombre desconocido (p. ej. un deep-link
  // heredado hacia el antiguo tab "plan") cae de vuelta a Objetivos 2026.
  if (!pane) {
    name = 'o2026';
    btn = document.querySelector('#objetivos .obj-tab[data-otab="o2026"]');
    pane = document.getElementById('objPane-o2026');
  }
  document.querySelectorAll('#objetivos .obj-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('#objetivos .obj-pane').forEach(function(p) { p.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  pane.classList.add('active');
  if (name === 'o2026') {
    setTimeout(function() {
      document.querySelectorAll('.o5-prog-fill').forEach(function(bar) {
        bar.style.transition = 'none';
        bar.style.width = '0';
        setTimeout(function() {
          bar.style.transition = 'width 1.1s cubic-bezier(.4,0,.2,1)';
          bar.style.width = bar.getAttribute('data-w');
        }, 60);
      });
    }, 80);
  }
}

export function goObjTab(name) {
  var btn = document.querySelector('#objetivos .obj-tab[data-otab="' + name + '"]');
  objTab(name, btn);
}

export function odOpen(id) {
  var el = document.getElementById('od-' + id);
  if (!el) return;
  document.querySelectorAll('.od').forEach(function(d) { d.classList.remove('open'); });
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(function() {
    el.querySelectorAll('.od-hero-prog-fill').forEach(function(bar) {
      bar.style.width = bar.getAttribute('data-w') || '0%';
    });
  }, 320);
}

export function odClose() {
  document.querySelectorAll('.od').forEach(function(d) { d.classList.remove('open'); });
  document.body.style.overflow = '';
  document.querySelectorAll('.od-hero-prog-fill').forEach(function(bar) {
    bar.style.transition = 'none';
    bar.style.width = '0';
    setTimeout(function() { bar.style.transition = ''; }, 50);
  });
}

window.objTab = objTab;
window.odOpen = odOpen;
window.odClose = odClose;

export const ready = (async function init() {
  var OBJ5 = await getObjetivos();

  document.getElementById('obj5Grid').innerHTML = OBJ5.map(function(o, i){ return buildCard(o, i); }).join('');

  setTimeout(function() {
    document.querySelectorAll('.o5-prog-fill').forEach(function(bar) {
      bar.style.width = bar.getAttribute('data-w');
    });
  }, 120);
})();
