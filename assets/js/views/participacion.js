// Participación de Mercado — hoy sin botón de acceso en la navegación (sección
// completa y funcional, "huérfana" a propósito, sin conectarla a ningún tab).

import { getParticipacion } from '../core/data.js';
import { fmtEjecutivo } from '../core/utils.js';

let PART_DATA = null;

var PART_STATE = { tab:'evol', period:'2025-2026', evolMode:'lider', evolHighlight:null };
var PART_NEUTRAL_COLORS = ['#94a3b8','#B8C4D0','#7B98B2','#c9b28a','#a78bfa','#f0997b','#64748b','#4b5563'];
var PART_SECTOR_COLOR_MAP = {'agroexportacion':'#3EC6AC','multisector':'#64748B','pesca':'#185FA5','retail':'#d97706'};
var PART_SECTOR_LABEL_COLOR = {'agroexportacion':'#fff','multisector':'#fff','pesca':'#fff','retail':'#fff'};
var PART_REFR_COLOR_MAP = {amoniaco:'#3EC6AC', freon:'#185FA5'};
var PART_SECTOR_ORDER = ['Agroexportación','Multisector','Pesca','Retail'];

function partDisplayName(nm){ return nm; }
function partPeriod(key){ return PART_DATA.find(function(p){ return p.key===key; }); }
function partPeriodIdx(key){ return PART_DATA.findIndex(function(p){ return p.key===key; }); }
function partPct(n){ return (n*100).toFixed(2)+'%'; }
function partPPTxt(n){ var v=n*100; return (v>=0?'+':'')+v.toFixed(2)+' pp'; }
function partPctTxt(n){ return (n>=0?'+':'')+n.toFixed(2)+'%'; }
function partPlural(n, word){
  if(n===1) return n+' '+word;
  var plural = /[aeiouáéíóú]$/i.test(word) ? word+'s' : word+'es';
  return n+' '+plural;
}
function partNeutralColor(i){ return PART_NEUTRAL_COLORS[i % PART_NEUTRAL_COLORS.length]; }
function partWithAlpha(hex, alpha){
  var h = hex.replace('#','');
  if(h.length===3) h = h.split('').map(function(c){ return c+c; }).join('');
  var r=parseInt(h.substr(0,2),16), g=parseInt(h.substr(2,2),16), b=parseInt(h.substr(4,2),16);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}

/* ── Normalización de sectores (mayúsculas, tildes, espacios) ─── */
function partNormSectorLabel(s){ return (s||'').toString().trim().replace(/\s+/g,' '); }
function partSectorKey(s){
  return partNormSectorLabel(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
}
function partSegByRefr(period, mode){
  var list = period.companies.filter(function(c){
    if(mode==='freon') return c.refr.indexOf('Freón')>=0;
    if(mode==='amoniaco') return c.refr.indexOf('Amoníaco')>=0;
    return true;
  });
  var total = list.reduce(function(s,c){ return s+c.billing; },0);
  return list.map(function(c){ var o=Object.assign({},c); o.segShare = total>0? c.billing/total : 0; return o; })
             .sort(function(a,b){ return b.segShare-a.segShare; });
}
function partCompanyNames(){
  var set={};
  PART_DATA.forEach(function(p){ p.companies.forEach(function(c){ set[c.name]=true; }); });
  return Object.keys(set);
}
function partAvgShare(name){
  var vals = PART_DATA.map(function(p){
    var c = p.companies.find(function(x){ return x.name===name; });
    return c? c.share : 0;
  });
  return vals.reduce(function(s,v){ return s+v; },0)/vals.length;
}
function partTopCompetitors(n){
  return partCompanyNames().filter(function(nm){ return nm!=='Friopacking'; })
    .map(function(nm){ return { name:nm, avg:partAvgShare(nm) }; })
    .sort(function(a,b){ return b.avg-a.avg; })
    .slice(0,n)
    .map(function(x){ return x.name; });
}
function partAllCompetitorNames(){
  return partTopCompetitors(9999);
}

/* ── Hero KPIs (fijos · lectura ejecutiva del periodo 2025–2026, no varían con tabs/filtros) ── */
function partRenderHeroKpis(){
  var chips = [
    {color:'#3EC6AC', lbl:'Participación', val:'44.98%', sub:'2025–2026'},
    {color:'#fff', lbl:'Posición', val:'#1', sub:'13 empresas'},
    {color:'#7dd3fc', lbl:'Líder', val:'Friopacking', sub:'44.98%'},
    {color:'#4ade80', lbl:'Ventaja', val:'+24.92 pp', sub:'↑ vs Energy Project Group', subColor:'#4ade80'}
  ];
  document.getElementById('partHeroKpis').innerHTML = chips.map(function(c){
    return '<div class="part-kpi">'
      +'<div class="part-kpi-lbl">'+c.lbl+'</div>'
      +'<div class="part-kpi-val" style="color:'+c.color+'">'+c.val+'</div>'
      +'<div class="part-kpi-sub"'+(c.subColor? (' style="color:'+c.subColor+'"') : '')+'>'+c.sub+'</div>'
      +'</div>';
  }).join('');
}

/* ── TAB 1: Evolución competitiva ───────────────────────── */
function partEvolSeriesNames(){
  if(PART_STATE.evolMode==='lider') return partTopCompetitors(1);
  if(PART_STATE.evolMode==='top5') return partTopCompetitors(4);
  return partAllCompetitorNames();
}
function partRenderEvolLegend(datasets){
  var hl = PART_STATE.evolHighlight;
  document.getElementById('partEvolLegend').innerHTML = datasets.map(function(ds){
    var isFp = ds.key==='Friopacking';
    var active = hl===ds.key;
    return '<div class="part-h-legend-item'+(active?' active':'')+(isFp?' is-fp':'')+'" data-name="'+ds.key.replace(/"/g,'&quot;')+'">'
      +'<i class="part-h-dot" style="background:'+ds._trueColor+'"></i>'+ds.label+'</div>';
  }).join('');
}
function partRenderEvolChart(){
  var el = document.getElementById('chPartEvol'); if(!el||typeof Chart==='undefined') return;
  var activeIdx = partPeriodIdx(PART_STATE.period);
  var names = partEvolSeriesNames();
  var labels = PART_DATA.map(function(p){ return p.label; });
  var fpData = PART_DATA.map(function(p){
    var c=p.companies.find(function(x){ return x.name==='Friopacking'; });
    return c? +(c.share*100).toFixed(2):0;
  });
  var fpRadius = labels.map(function(_,i){ return i===activeIdx?7:4; });
  var datasets = [{
    key:'Friopacking', label:'Friopacking', data:fpData, borderColor:'#3EC6AC', backgroundColor:'rgba(62,198,172,.12)',
    borderWidth:3, pointRadius:fpRadius, pointHoverRadius:8, pointHoverBorderWidth:2, pointBackgroundColor:'#3EC6AC',
    pointBorderColor:'#fff', pointBorderWidth:1.5, tension:.35, fill:false, order:0, _trueColor:'#3EC6AC'
  }];
  var hl = PART_STATE.evolHighlight;
  names.forEach(function(nm,i){
    var data = PART_DATA.map(function(p){
      var c=p.companies.find(function(x){ return x.name===nm; });
      return c? +(c.share*100).toFixed(2):0;
    });
    var color = i===0? '#1a8fd1' : partNeutralColor(i-1);
    var isHl = hl===nm, dim = hl && !isHl;
    var radius = labels.map(function(_,j){ return j===activeIdx?(isHl?6:2.5):(isHl?4:2); });
    datasets.push({
      key:nm, label:partDisplayName(nm), data:data,
      borderColor: dim? partWithAlpha(color,.22) : color,
      backgroundColor:'transparent',
      borderWidth: isHl?2.5:(i===0?2:1.5),
      borderDash: isHl?[]:(i===0?[]:[4,3]),
      pointRadius:radius, pointBackgroundColor: dim? partWithAlpha(color,.22):color,
      tension:.35, fill:false, order:i+1, _trueColor:color
    });
  });
  if(Chart.getChart(el)) Chart.getChart(el).destroy();
  new Chart(el,{
    type:'line',
    data:{labels:labels, datasets:datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{duration:900, easing:'easeInOutQuart'},
      plugins:{
        legend:{display:false},
        tooltip:{
          mode:'index', intersect:false, backgroundColor:'rgba(9,12,30,.95)', padding:12, cornerRadius:12,
          borderColor:'rgba(62,198,172,.3)', borderWidth:1, titleColor:'rgba(255,255,255,.6)', bodyColor:'rgba(255,255,255,.92)',
          titleFont:{size:11,weight:'700'}, bodyFont:{size:12,weight:'600'}, boxPadding:4,
          callbacks:{ label:function(ctx){ return ctx.dataset.label+': '+ctx.parsed.y.toFixed(2)+'%'; } }
        }
      },
      scales:{
        x:{grid:{display:false}, border:{display:false}, ticks:{font:{size:12,weight:'600'},color:'#0a0a1e'}},
        y:{grid:{color:'rgba(10,10,30,.05)'}, border:{display:false}, min:0, ticks:{font:{size:11},color:'#94a3b8', callback:function(v){ return v+'%'; }}}
      }
    }
  });
  partRenderEvolLegend(datasets);
}
function partRenderEvolPane(){
  var period = partPeriod(PART_STATE.period);
  var ranked = partSegByRefr(period,'global');
  var fp = ranked.find(function(c){ return c.name==='Friopacking'; });
  var fpIdx = ranked.indexOf(fp);

  /* Ranking sincronizado: mismo grupo de empresas que el gráfico según el toggle activo,
     ordenado por su participación real en el periodo seleccionado. */
  var mode = PART_STATE.evolMode;
  var namesInView = partEvolSeriesNames();
  var allowed = {}; namesInView.forEach(function(nm){ allowed[nm]=true; });
  var rankList = ranked.filter(function(c){ return c.name==='Friopacking' || allowed[c.name]; })
                        .filter(function(c){ return c.name==='Friopacking' || c.billing>0; });

  var subTxt = mode==='lider' ? 'Friopacking vs líder' : mode==='top5' ? 'Top 5 empresas' : partPlural(rankList.length,'empresa')+' con información en el periodo';
  document.getElementById('partEvolRankSub').textContent = period.label+' · '+subTxt;

  var listEl = document.getElementById('partEvolRankList');
  listEl.className = mode==='todos' ? 'part-rank-scroll' : '';

  var maxShare = rankList[0].segShare||1;
  var html='';
  rankList.forEach(function(c,i){
    var isFp = c.name==='Friopacking';
    html += '<div class="part-rank-row'+(isFp?' is-fp':'')+'">'
      +'<div class="part-rank-pos">#'+(i+1)+'</div>'
      +'<div class="part-rank-name">'+partDisplayName(c.name)+'</div>'
      +'<div class="part-rank-bar-cell"><div class="part-rank-bar"><div class="part-rank-bar-fill" style="width:'+Math.round(c.segShare/maxShare*100)+'%"></div></div></div>'
      +'<div class="part-rank-val">'+partPct(c.segShare)+'</div>'
      +'</div>';
  });
  listEl.innerHTML = html;

  var second = ranked[1];
  var gap = fp.segShare - second.segShare;
  document.getElementById('partEvolMicro').innerHTML = '<strong>Friopacking</strong> ocupa la posición <strong>#'+(fpIdx+1)+'</strong> en '+period.label+' con una participación estimada de <strong>'+partPct(fp.segShare)+'</strong>, con una ventaja de <strong>'+partPPTxt(gap)+'</strong> sobre '+partDisplayName(second.name)+' (2.º lugar).';

  partRenderHeroKpis(fp, ranked, period, {});
}

/* ── Evolución del mercado de refrigeración (barras apiladas Friopacking vs Resto + tendencia total) ── */
function partRenderMarketChart(){
  var el = document.getElementById('chPartMarket'); if(!el||typeof Chart==='undefined') return;
  var labels = PART_DATA.map(function(p){ return p.label; });
  var values = PART_DATA.map(function(p){ return p.meta.mercadoTotal; });
  var fpValues = PART_DATA.map(function(p){
    var fp = p.companies.find(function(c){ return c.name==='Friopacking'; });
    return fp ? fp.billing : 0;
  });
  var restValues = values.map(function(v,i){ return v-fpValues[i]; });
  var variations = values.map(function(v,i){ return i===0? null : (v-values[i-1])/values[i-1]; });
  var FP_COLOR = '#3EC6AC', REST_COLOR = '#94a3b8';

  var legendEl = document.getElementById('partMarketLegend');
  if(legendEl) legendEl.innerHTML =
      '<div class="part-mkt-legend-item"><i class="part-mkt-legend-dot" style="background:'+FP_COLOR+'"></i>Friopacking</div>'
    +'<div class="part-mkt-legend-item"><i class="part-mkt-legend-dot" style="background:'+REST_COLOR+'"></i>Resto del mercado</div>';

  if(Chart.getChart(el)) Chart.getChart(el).destroy();
  new Chart(el,{
    type:'bar',
    data:{
      labels:labels,
      datasets:[
        {
          type:'bar', label:'Friopacking', data:fpValues, stack:'mkt',
          backgroundColor:FP_COLOR, borderColor:FP_COLOR, borderWidth:1,
          borderRadius:{topLeft:0,topRight:0,bottomLeft:6,bottomRight:6}, maxBarThickness:64, order:3
        },
        {
          type:'bar', label:'Resto del mercado', data:restValues, stack:'mkt',
          backgroundColor:REST_COLOR, borderColor:REST_COLOR, borderWidth:1,
          borderRadius:{topLeft:6,topRight:6,bottomLeft:0,bottomRight:0}, maxBarThickness:64, order:2
        },
        {
          type:'line', label:'Tendencia', data:values,
          borderColor:'#0a0a1e', backgroundColor:'#0a0a1e', borderWidth:3, tension:.35,
          pointRadius:5, pointBackgroundColor:'#0a0a1e', pointBorderColor:'#fff', pointBorderWidth:1.5,
          pointHoverRadius:7, fill:false, order:1
        }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{duration:1000, easing:'easeOutQuart'},
      interaction:{mode:'index', intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(9,12,30,.95)', padding:12, cornerRadius:12,
          borderColor:'rgba(62,198,172,.3)', borderWidth:1, titleColor:'rgba(255,255,255,.6)', bodyColor:'rgba(255,255,255,.92)',
          titleFont:{size:11,weight:'700'}, bodyFont:{size:12,weight:'600'}, boxPadding:4,
          filter:function(ctx){ return ctx.datasetIndex===0 || ctx.datasetIndex===1; },
          callbacks:{
            label:function(ctx){
              var total = values[ctx.dataIndex];
              var val = ctx.parsed.y;
              var pct = total>0 ? (val/total*100) : 0;
              return ctx.dataset.label+'  ·  Importe: '+fmtEjecutivo(val)+'  ·  Participación: '+pct.toFixed(2)+'%';
            },
            footer:function(items){
              var idx = items[0].dataIndex;
              var v = variations[idx];
              var lines = ['Mercado total: '+fmtEjecutivo(values[idx])];
              lines.push(v==null ? 'Sin periodo anterior comparable' : 'Variación: '+partPctTxt(v*100));
              return lines;
            }
          }
        }
      },
      scales:{
        x:{stacked:true, grid:{display:false}, border:{display:false}, ticks:{font:{size:12,weight:'600'},color:'#0a0a1e'}},
        y:{stacked:true, grid:{color:'rgba(10,10,30,.05)'}, border:{display:false}, ticks:{font:{size:11},color:'#94a3b8', callback:function(v){ return fmtEjecutivo(v); }}}
      }
    }
  });
}

/* ── TAB 2 & 3: Por refrigerante / Por sector económico — módulo de inteligencia de mercado ── */
var PART_REFR_SEL = { period:null, cat:null };
var PART_SECTOR_SEL = { period:null, cat:null };
var PART_SECTOR_KEYS = ['agroexportacion','multisector','pesca','retail'];
var PART_REFR_KEYS = ['amoniaco','freon'];

function partArgmaxKey(obj, keys){
  var bestK=keys[0], bestV=-1;
  keys.forEach(function(k){ if((obj[k]||0)>bestV){ bestV=obj[k]; bestK=k; } });
  return bestK;
}
function partResetRefrSel(){
  var p = partPeriod('2025-2026');
  PART_REFR_SEL.period = '2025-2026';
  PART_REFR_SEL.cat = (p.refrTotal.amoniaco>=p.refrTotal.freon) ? 'amoniaco' : 'freon';
}
function partResetSectorSel(){
  var p = partPeriod('2025-2026');
  PART_SECTOR_SEL.period = '2025-2026';
  PART_SECTOR_SEL.cat = partArgmaxKey(p.sectorBlock, PART_SECTOR_KEYS);
}
function partRefrLabel(k){ return k==='freon' ? 'Freón' : 'Amoníaco'; }
function partSectorLabel(k){ return PART_SECTOR_ORDER[PART_SECTOR_KEYS.indexOf(k)] || k; }
function partRefrBillField(key){ return key==='freon' ? 'billFreon' : 'billAmon'; }
function partCompaniesByRefr(period, key){
  var field = partRefrBillField(key);
  var total = period.refrTotal[key] || 0;
  return period.companies.filter(function(c){ return (c[field]||0)>0; })
    .map(function(c){
      var o = Object.assign({}, c);
      o.refrBilling = c[field]||0;
      o.refrShare = total>0 ? o.refrBilling/total : 0;
      return o;
    })
    .sort(function(a,b){ return b.refrShare-a.refrShare; });
}
function partRefrCompanySet(key){
  var field = partRefrBillField(key);
  var seen = {};
  PART_DATA.forEach(function(p){
    p.companies.forEach(function(c){ if((c[field]||0)>0) seen[c.name]=true; });
  });
  function avgShare(nm){
    var sum=0, n=0;
    PART_DATA.forEach(function(p){
      var c = p.companies.find(function(x){ return x.name===nm; });
      var total = p.refrTotal[key]||0;
      if(total>0){ sum += (c? (c[field]||0) : 0)/total; n++; }
    });
    return n? sum/n : 0;
  }
  var others = Object.keys(seen).filter(function(nm){ return nm!=='Friopacking'; })
    .sort(function(a,b){ return avgShare(b)-avgShare(a); });
  return seen['Friopacking'] ? ['Friopacking'].concat(others) : others;
}
function partCompaniesBySector(period, key){
  return period.companies.filter(function(c){ return partSectorKey(c.sector)===key; })
    .slice().sort(function(a,b){ return b.share-a.share; });
}

/* ── Tooltip premium externo (tecnológico, compartido por ambos gráficos) ── */
function partExternalTooltip(context){
  var chart = context.chart;
  var tooltip = context.tooltip;
  var id = chart.canvas.id+'-ttp';
  var el = document.getElementById(id);
  if(!el){
    el = document.createElement('div');
    el.id = id;
    el.className = 'pms-tooltip';
    document.body.appendChild(el);
  }
  if(tooltip.opacity===0){ el.style.opacity = 0; return; }
  var dp = tooltip.dataPoints && tooltip.dataPoints[0];
  if(!dp){ el.style.opacity = 0; return; }
  var ds = dp.dataset;
  var html = '<div class="pms-ttp-period">'+dp.label+'</div>'
    +'<div class="pms-ttp-row"><span class="pms-ttp-dot" style="background:'+ds._trueColor+'"></span>'+ds.label+'</div>';
  if(ds._refrKey) html += '<div class="pms-ttp-sub">'+partRefrLabel(ds._refrKey)+'</div>';
  if(ds._bill) html += '<div class="pms-ttp-sub">'+fmtEjecutivo(ds._bill[dp.dataIndex])+'</div>';
  html += '<div class="pms-ttp-val">'+dp.formattedValue+'%</div>';
  el.innerHTML = html;
  var rect = chart.canvas.getBoundingClientRect();
  el.style.opacity = 1;
  el.style.left = (window.scrollX+rect.left+tooltip.caretX)+'px';
  el.style.top = (window.scrollY+rect.top+tooltip.caretY)+'px';
}

/* ── Plugin: guía discreta del período seleccionado ──────── */
function partGuidePlugin(getIdx){
  return {
    id:'pmsGuide'+Math.random().toString(36).slice(2),
    beforeDatasetsDraw:function(chart){
      var idx = getIdx();
      if(idx==null || idx<0) return;
      var meta = chart.getDatasetMeta(0);
      var bar = meta && meta.data && meta.data[idx];
      if(!bar) return;
      var yScale = chart.scales.y;
      var half = (bar.width||30)/2 + 6;
      var ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(62,198,172,.07)';
      ctx.fillRect(bar.x-half, yScale.top, half*2, yScale.bottom-yScale.top);
      ctx.restore();
    }
  };
}
/* ── Plugin: % dentro del segmento, solo si hay espacio suficiente ── */
function partStackLabelsPlugin(){
  return {
    id:'pmsLabels'+Math.random().toString(36).slice(2),
    afterDatasetsDraw:function(chart){
      var ctx = chart.ctx;
      chart.data.datasets.forEach(function(ds,dsIdx){
        var meta = chart.getDatasetMeta(dsIdx);
        if(meta.hidden) return;
        meta.data.forEach(function(bar,i){
          var val = ds.data[i];
          if(val==null || val<=0) return;
          var h = Math.abs((bar.base||0)-(bar.y||0));
          if(h<22) return;
          ctx.save();
          ctx.fillStyle = ds._labelColor||'#fff';
          ctx.font = '700 11px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(val.toFixed(2)+'%', bar.x, (bar.y+bar.base)/2);
          ctx.restore();
        });
      });
    }
  };
}
function partSideRowsHtml(companies){
  if(!companies.length) return '<tr><td colspan="4" class="pms-empty">Sin empresas registradas en este segmento.</td></tr>';
  var maxShare = companies.reduce(function(m,c){ return Math.max(m,c.share); },0)||1;
  return companies.map(function(c,i){
    var isFp = c.name==='Friopacking';
    var w = Math.round((c.share/maxShare)*100);
    return '<tr class="'+(isFp?'pms-row-fp':'')+'">'
      +'<td class="pms-pos">#'+(i+1)+'</td>'
      +'<td><div class="pms-co-name">'+partDisplayName(c.name)+'</div><div class="pms-co-bar"><div class="pms-co-fill" style="width:'+w+'%"></div></div></td>'
      +'<td class="r">'+fmtEjecutivo(c.billing)+'</td>'
      +'<td class="r">'+partPct(c.share)+'</td>'
      +'</tr>';
  }).join('');
}
function partSideHeroKpis(companies, period){
  var heroList = companies.map(function(c){ var o=Object.assign({},c); o.segShare=c.share; return o; })
    .sort(function(a,b){ return b.segShare-a.segShare; });
  if(heroList.length){
    var heroFp = heroList.find(function(c){ return c.name==='Friopacking'; });
    partRenderHeroKpis(heroFp, heroList, period, {kpi4:'mercado', segTotal: heroList.reduce(function(s,c){return s+c.billing;},0)});
  }
}

/* ══════════ Por refrigerante ══════════ */
function partRenderRefrLegend(){
  var el = document.getElementById('pmsRefrLegend');
  el.innerHTML = PART_REFR_KEYS.map(function(k){
    var active = PART_REFR_SEL.cat===k;
    return '<div class="pms-legend-item'+(active?' active':'')+'" data-cat="'+k+'">'
      +'<i class="pms-legend-dot" style="background:'+PART_REFR_COLOR_MAP[k]+'"></i>'+partRefrLabel(k)+'</div>';
  }).join('');
}
function partRefrSideRowsHtml(companies){
  if(!companies.length) return '<tr><td colspan="4" class="pms-empty">Sin empresas registradas en este segmento.</td></tr>';
  var maxShare = companies.reduce(function(m,c){ return Math.max(m,c.refrShare); },0)||1;
  return companies.map(function(c,i){
    var isFp = c.name==='Friopacking';
    var w = Math.round((c.refrShare/maxShare)*100);
    return '<tr class="'+(isFp?'pms-row-fp':'')+'">'
      +'<td class="pms-pos">#'+(i+1)+'</td>'
      +'<td><div class="pms-co-name">'+partDisplayName(c.name)+'</div><div class="pms-co-bar"><div class="pms-co-fill" style="width:'+w+'%"></div></div></td>'
      +'<td class="r">'+fmtEjecutivo(c.refrBilling)+'</td>'
      +'<td class="r">'+partPct(c.refrShare)+'</td>'
      +'</tr>';
  }).join('');
}
function partRefrExternalTooltip(context){
  var chart = context.chart;
  var tooltip = context.tooltip;
  var id = chart.canvas.id+'-ttp';
  var el = document.getElementById(id);
  if(!el){
    el = document.createElement('div');
    el.id = id;
    el.className = 'pms-tooltip';
    document.body.appendChild(el);
  }
  if(tooltip.opacity===0){ el.style.opacity = 0; return; }
  var dp = tooltip.dataPoints && tooltip.dataPoints[0];
  if(!dp){ el.style.opacity = 0; return; }
  var ds = dp.dataset;
  var html = '<div class="pms-ttp-period">'+dp.label+'</div>'
    +'<div class="pms-ttp-row"><span class="pms-ttp-dot" style="background:'+ds._trueColor+'"></span>'+ds.label+'</div>'
    +'<div class="pms-ttp-sub">Participaci&oacute;n: '+dp.formattedValue+'%</div>'
    +'<div class="pms-ttp-val">Importe: '+fmtEjecutivo(ds._bill[dp.dataIndex])+'</div>';
  el.innerHTML = html;
  var rect = chart.canvas.getBoundingClientRect();
  el.style.opacity = 1;
  el.style.left = (window.scrollX+rect.left+tooltip.caretX)+'px';
  el.style.top = (window.scrollY+rect.top+tooltip.caretY)+'px';
}
function partRenderRefrStack(){
  var el = document.getElementById('chPartRefrStack'); if(!el||typeof Chart==='undefined') return;
  var labels = PART_DATA.map(function(p){ return p.label; });
  var selIdx = partPeriodIdx(PART_REFR_SEL.period);
  var bill = {
    amoniaco: PART_DATA.map(function(p){ return p.refrTotal.amoniaco||0; }),
    freon: PART_DATA.map(function(p){ return p.refrTotal.freon||0; })
  };
  var shareAmon = PART_DATA.map(function(p){
    var total = (p.refrTotal.amoniaco||0)+(p.refrTotal.freon||0);
    return total>0 ? +((p.refrTotal.amoniaco/total)*100).toFixed(2) : 0;
  });
  var data = {
    amoniaco: shareAmon,
    freon: shareAmon.map(function(v){ return +(100-v).toFixed(2); })
  };
  var datasets = PART_REFR_KEYS.map(function(k,ki){
    var isSelCat = PART_REFR_SEL.cat===k;
    var base = PART_REFR_COLOR_MAP[k];
    var bg = PART_DATA.map(function(){ return isSelCat ? base : partWithAlpha(base,.32); });
    var borderW = PART_DATA.map(function(p,i){ return (isSelCat && i===selIdx) ? 2 : 0; });
    var isTop = ki===PART_REFR_KEYS.length-1;
    return {
      key:k, label:partRefrLabel(k), data:data[k], _bill:bill[k], _refrKey:k,
      backgroundColor:bg, hoverBackgroundColor:partWithAlpha(base,.85),
      hoverBorderColor:base, hoverBorderWidth:2,
      borderColor:'#fff', borderWidth:borderW, borderSkipped:false,
      borderRadius:{topLeft:isTop?8:0, topRight:isTop?8:0, bottomLeft:0, bottomRight:0},
      stack:'s1', maxBarThickness:96, _labelColor:'#fff', _trueColor:base
    };
  });
  if(Chart.getChart(el)) Chart.getChart(el).destroy();
  new Chart(el,{
    type:'bar',
    data:{labels:labels, datasets:datasets},
    plugins:[ partGuidePlugin(function(){ return partPeriodIdx(PART_REFR_SEL.period); }), partStackLabelsPlugin() ],
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{duration:1000, easing:'easeOutQuart'},
      interaction:{mode:'nearest', intersect:true},
      onHover:function(evt,elements,chart){ chart.canvas.style.cursor = (elements&&elements.length)?'pointer':'default'; },
      onClick:function(evt,elements,chart){
        if(!elements||!elements.length) return;
        var el0 = elements[0];
        var period = PART_DATA[el0.index].key;
        var cat = chart.data.datasets[el0.datasetIndex].key;
        setTimeout(function(){
          PART_REFR_SEL.period = period;
          PART_REFR_SEL.cat = cat;
          partRenderRefrPane();
        },0);
      },
      plugins:{ legend:{display:false}, tooltip:{ enabled:false, external:partRefrExternalTooltip } },
      scales:{
        x:{stacked:true, grid:{display:false}, border:{display:false}, ticks:{font:{size:12,weight:'700'},color:'#0a0a1e'}},
        y:{stacked:true, min:0, max:100, grid:{color:'rgba(10,10,30,.05)'}, border:{display:false},
           ticks:{font:{size:11},color:'#94a3b8', stepSize:20, callback:function(v){ return v+'%'; }}}
      }
    }
  });
}
function partRenderRefrSide(){
  var period = partPeriod(PART_REFR_SEL.period);
  var cat = PART_REFR_SEL.cat;
  var companies = partCompaniesByRefr(period, cat);
  var fp = companies.find(function(c){ return c.name==='Friopacking'; });

  document.getElementById('pmsRefrSide').innerHTML =
    '<div class="pms-side-head">'
      +'<div class="pms-side-lbl">Refrigerante seleccionado</div>'
      +'<div class="pms-side-seg">'+partRefrLabel(cat)+'</div>'
      +'<div class="pms-side-pct">'+(fp? partPct(fp.refrShare) : '—')+'</div>'
      +'<div class="pms-side-meta"><span class="pms-pill">'+period.label+'</span><span class="pms-count">'+partPlural(companies.length,'empresa')+'</span></div>'
    +'</div>'
    +'<div class="pms-side-title">Participación de Friopacking en '+partRefrLabel(cat).toLowerCase()+'</div>'
    +'<div class="pms-side-body"><table class="pms-tbl">'
      +'<thead><tr><th>#</th><th>Empresa</th><th class="r">Facturación '+partRefrLabel(cat).toLowerCase()+'</th><th class="r">Particip.</th></tr></thead>'
      +'<tbody>'+partRefrSideRowsHtml(companies)+'</tbody>'
    +'</table></div>';

  partRenderRefrLegend();
  partSideHeroKpis(companies, period);
}
function partRenderRefrPane(){
  if(typeof Chart==='undefined') return;
  if(!PART_REFR_SEL.period) partResetRefrSel();
  partRenderRefrStack();
  partRenderRefrSide();
}

/* ══════════ Por sector económico ══════════ */
function partRenderSectorLegend(){
  var el = document.getElementById('pmsSectorLegend');
  el.innerHTML = PART_SECTOR_KEYS.map(function(k,i){
    var active = PART_SECTOR_SEL.cat===k;
    return '<div class="pms-legend-item'+(active?' active':'')+'" data-cat="'+k+'">'
      +'<i class="pms-legend-dot" style="background:'+PART_SECTOR_COLOR_MAP[k]+'"></i>'+PART_SECTOR_ORDER[i]+'</div>';
  }).join('');
}
function partRenderSectorStack(){
  var el = document.getElementById('chPartSectorStack'); if(!el||typeof Chart==='undefined') return;
  var labels = PART_DATA.map(function(p){ return p.label; });
  var selIdx = partPeriodIdx(PART_SECTOR_SEL.period);
  var datasets = PART_SECTOR_KEYS.map(function(k,ki){
    var isSelCat = PART_SECTOR_SEL.cat===k;
    var base = PART_SECTOR_COLOR_MAP[k];
    var bg = PART_DATA.map(function(){ return isSelCat ? base : partWithAlpha(base,.32); });
    var borderW = PART_DATA.map(function(p,i){ return (isSelCat && i===selIdx) ? 2 : 0; });
    var data = PART_DATA.map(function(p){ return +(p.sectorBlock[k]*100).toFixed(2); });
    var isTop = ki===PART_SECTOR_KEYS.length-1;
    return {
      key:k, label:PART_SECTOR_ORDER[ki], data:data, backgroundColor:bg, hoverBackgroundColor:partWithAlpha(base,.85),
      hoverBorderColor:base, hoverBorderWidth:2,
      borderColor:'#fff', borderWidth:borderW, borderSkipped:false,
      borderRadius:{topLeft:isTop?8:0, topRight:isTop?8:0, bottomLeft:0, bottomRight:0},
      stack:'s1', maxBarThickness:96, _labelColor:PART_SECTOR_LABEL_COLOR[k], _trueColor:base
    };
  });
  if(Chart.getChart(el)) Chart.getChart(el).destroy();
  new Chart(el,{
    type:'bar',
    data:{labels:labels, datasets:datasets},
    plugins:[ partGuidePlugin(function(){ return partPeriodIdx(PART_SECTOR_SEL.period); }), partStackLabelsPlugin() ],
    options:{
      responsive:true, maintainAspectRatio:false,
      animation:{duration:1000, easing:'easeOutQuart'},
      interaction:{mode:'nearest', intersect:true},
      onHover:function(evt,elements,chart){ chart.canvas.style.cursor = (elements&&elements.length)?'pointer':'default'; },
      onClick:function(evt,elements,chart){
        if(!elements||!elements.length) return;
        var el0 = elements[0];
        var k = PART_SECTOR_KEYS[el0.datasetIndex];
        var period = PART_DATA[el0.index].key;
        setTimeout(function(){
          PART_SECTOR_SEL.cat = k; PART_SECTOR_SEL.period = period;
          partRenderSectorPane();
        },0);
      },
      plugins:{ legend:{display:false}, tooltip:{ enabled:false, external:partExternalTooltip } },
      scales:{
        x:{stacked:true, grid:{display:false}, border:{display:false}, ticks:{font:{size:12,weight:'700'},color:'#0a0a1e'}},
        y:{stacked:true, min:0, max:100, grid:{color:'rgba(10,10,30,.05)'}, border:{display:false},
           ticks:{font:{size:11},color:'#94a3b8', stepSize:20, callback:function(v){ return v+'%'; }}}
      }
    }
  });
}
function partRenderSectorSide(){
  var period = partPeriod(PART_SECTOR_SEL.period);
  var cat = PART_SECTOR_SEL.cat;
  var companies = partCompaniesBySector(period, cat);
  var pct = period.sectorBlock[cat];

  document.getElementById('pmsSectorSide').innerHTML =
    '<div class="pms-side-head">'
      +'<div class="pms-side-lbl">Sector seleccionado</div>'
      +'<div class="pms-side-seg">'+partSectorLabel(cat)+'</div>'
      +'<div class="pms-side-pct">'+(pct>0? partPct(pct) : '—')+'</div>'
      +'<div class="pms-side-meta"><span class="pms-pill">'+period.label+'</span><span class="pms-count">'+partPlural(companies.length,'empresa')+'</span></div>'
    +'</div>'
    +'<div class="pms-side-title">Empresas que conforman el sector</div>'
    +'<div class="pms-side-body"><table class="pms-tbl">'
      +'<thead><tr><th>#</th><th>Empresa</th><th class="r">Facturación est.</th><th class="r">Particip.</th></tr></thead>'
      +'<tbody>'+partSideRowsHtml(companies)+'</tbody>'
    +'</table></div>';

  partRenderSectorLegend();
  partSideHeroKpis(companies, period);
}
function partRenderSectorPane(){
  if(typeof Chart==='undefined') return;
  if(!PART_SECTOR_SEL.period) partResetSectorSel();
  partRenderSectorStack();
  partRenderSectorSide();
}

/* ── Navegación interna: tabs, periodo, init ─────────────── */
function partSwitchTab(tab, btn){
  PART_STATE.tab = tab;
  document.querySelectorAll('#partTabs .part-tab').forEach(function(t){ t.classList.remove('active'); });
  btn.classList.add('active');
  document.querySelectorAll('#participacion .part-pane').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('partPane-'+tab).classList.add('active');
  var ptabs = document.getElementById('partPeriodTabs');
  if(ptabs) ptabs.style.display = (tab==='evol') ? '' : 'none';
  if(tab==='refr') partResetRefrSel();
  if(tab==='sector') partResetSectorSel();
  partRenderActivePane();
  setTimeout(function(){ window.dispatchEvent(new Event('resize')); },60);
}
function partRenderPeriodTabs(){
  var wrap = document.getElementById('partPeriodTabs');
  wrap.innerHTML = PART_DATA.map(function(p){
    return '<button class="part-ptab'+(p.key===PART_STATE.period?' active':'')+'" data-pkey="'+p.key+'" onclick="partSetPeriod(\''+p.key+'\')">'+p.label+'</button>';
  }).join('');
}
function partSetPeriod(key){
  PART_STATE.period = key;
  document.querySelectorAll('#partPeriodTabs .part-ptab').forEach(function(b){ b.classList.toggle('active', b.dataset.pkey===key); });
  partRenderActivePane();
}
function partRenderActivePane(){
  if(PART_STATE.tab==='evol'){ partRenderEvolChart(); partRenderEvolPane(); partRenderMarketChart(); }
  else if(PART_STATE.tab==='refr'){ partRenderRefrPane(); }
  else if(PART_STATE.tab==='sector'){ partRenderSectorPane(); }
}
function partEvolSetMode(mode, btn){
  PART_STATE.evolMode = mode;
  PART_STATE.evolHighlight = null;
  document.querySelectorAll('#partEvolToggle .tm-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  partRenderEvolChart();
  partRenderEvolPane();
}

var _partInited = false;
export function initParticipacionCharts(){
  if(_partInited) return;
  _partInited = true;
  partRenderPeriodTabs();
  document.querySelectorAll('#partEvolToggle .tm-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ partEvolSetMode(btn.dataset.ev, btn); });
  });
  document.getElementById('partEvolLegend').addEventListener('click', function(e){
    var item = e.target.closest('.part-h-legend-item'); if(!item) return;
    var nm = item.dataset.name;
    PART_STATE.evolHighlight = (PART_STATE.evolHighlight===nm) ? null : nm;
    partRenderEvolChart();
  });
  document.getElementById('pmsRefrLegend').addEventListener('click', function(e){
    var item = e.target.closest('.pms-legend-item'); if(!item) return;
    PART_REFR_SEL.cat = item.dataset.cat;
    partRenderRefrPane();
  });
  document.getElementById('pmsSectorLegend').addEventListener('click', function(e){
    var item = e.target.closest('.pms-legend-item'); if(!item) return;
    PART_SECTOR_SEL.cat = item.dataset.cat;
    partRenderSectorPane();
  });
  partRenderActivePane();
}

// partSetPeriod se invoca desde onclick generado dinámicamente por partRenderPeriodTabs,
// igual que partSwitchTab desde los botones estáticos de participacion.html.
window.partSwitchTab = partSwitchTab;
window.partSetPeriod = partSetPeriod;

export const ready = (async function init() {
  PART_DATA = await getParticipacion();
})();
