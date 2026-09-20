#!/usr/bin/env node
/* 由布局目录生成 assets/layout-atlas.html。
   为什么是生成而不是手写：图谱上每一个数字——模块的栏行、像素矩形、可用行数、每格可填的形式——
   都来自 assets/layout-atlas/catalog.json 与 assets/deck-grid.js。手写的图谱会与目录平行维护，
   然后腐烂：上一版图谱的形式表就比词汇表少了 2 条，谁都发现不了。所以图谱降级为视图，
   目录升为唯一权威，`--check` 负责在两者漂移时报错。

   跑法：
     node scripts/build_layout_atlas.cjs          写入 assets/layout-atlas.html
     node scripts/build_layout_atlas.cjs --check  只比对，漂移则退出码 1（CI / npm test 用） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const grid = require(path.join(ROOT, 'assets', 'deck-grid.js'));
const forms = require(path.join(ROOT, 'assets', 'deck-forms.js'));
const layouts = require('./layout_contract.cjs');

const TARGET = path.join(ROOT, 'assets', 'layout-atlas.html');

/* 图谱要展示的槽位语义。槽位本身来自 deck-grid.js，这里只补"它意味着什么"，
   因为图谱是给作者选型看的，光有 slot 名字不够。 */
const SLOT_NOTES = {
  chart: '把数据变成图形。带坐标轴的图必须有足够的格。',
  diagram: '表达机制、流程、层级或条件，不承担精确读数。',
  table: '精确查数。读者要能逐个核对数字时用它，不要用图替代。',
  kpi: '少量关键指标。卡片形态，读数优先于趋势。',
  timeline: '时间轴、阶段与泳道。顺序本身就是论点。',
  text: '结构化文字：短判断、清单、条目。',
  annotation: '贴着展品的解读、口径、结论块。',
  panel: '通用并列格：接受任何已登记形式。论证不依赖某一格具体形式时用它。',
  head: '页标题带，由版心固定占用，不接受形式声明。',
  source: '来源带，由版心固定占用，不接受形式声明。'
};

function data() {
  const catalog = layouts.catalog();
  const errors = layouts.catalogErrors(catalog);
  if (errors.length) throw new Error('布局目录自检未通过，先修目录：\n  ' + errors.join('\n  '));

  const ratios = {};
  for (const id of Object.keys(grid.RATIOS)) {
    const r = grid.RATIOS[id];
    ratios[id] = {
      id, canvas: r.canvas, pad: r.pad, titleBand: r.titleBand, sourceBand: r.sourceBand,
      columnWidth: r.columnWidth, rowHeight: r.rowHeight, gutter: r.gutter,
      content: grid.content(id), body: grid.body(id),
      // 容量表：h 行模块在三种装法下各放得下几行正文 / 注释。
      capacity: [1, 2, 3, 4, 5, 6].map(h => Object.assign({ h }, grid.capacity(h, id)))
    };
  }

  return {
    source: 'assets/layout-atlas/catalog.json',
    schema: catalog.schema,
    provenance: catalog.provenance,
    grid: { columns: grid.COLUMNS, rows: grid.ROWS, slots: grid.SLOTS, module: grid.MODULE, lines: grid.LINES, defaultRatio: grid.DEFAULT_RATIO },
    ratios,
    masters: catalog.masters,
    slotNotes: SLOT_NOTES,
    forms: {
      families: forms.familyLabels,
      all: forms.list().map(id => Object.assign({ id }, forms.get(id))),
      slotForms: Object.fromEntries(grid.SLOTS.map(slot => [slot, forms.list().filter(form => grid.slotAccepts(slot, form))]))
    },
    // 几何在这里算完再交给浏览器：图谱里不该有第二份 grid.box 实现，否则它自己就成了漂移源。
    layouts: catalog.layouts.map(layout => {
      const measured = {};
      for (const id of Object.keys(grid.RATIOS)) {
        const m = layouts.measure(layout.id, id);
        measured[id] = {
          fillRatio: m.fillRatio,
          modules: m.modules.map(mod => ({ box: mod.box, lines: mod.lines, accepts: mod.accepts, style: mod.style }))
        };
      }
      return Object.assign({}, layout, { measured });
    })
  };
}

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(payload) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>单页布局图谱 · consulting-report-forge</title>
<link rel="stylesheet" href="fonts/deck-fonts.css">
<style>
/* ══════════════════════════════════════════════════════════════
   单页布局图谱 —— 本文件由 scripts/build_layout_atlas.cjs 生成，请勿手改。
   改布局 → 改 assets/layout-atlas/catalog.json → 重新生成。
   目录里的 c/r/w/h 是唯一事实，线框里的矩形、逐格表的尺寸与容量全部由它算出。
   ══════════════════════════════════════════════════════════════ */
:root{
  --brand:#000080;--ink:#172C3B;--gray-1:#445563;--gray-2:#50606E;--gray-3:#BFCBD2;--gray-4:#F2F5F7;
  --font-title:'Deck Playfair Display','Deck Noto Serif SC',serif;
  --font-body:'Deck Inter','Deck Noto Sans SC',sans-serif;
  /* 槽位配色：与成稿的图表分类色同源，保证图谱里认得出的颜色在成稿里也认得出。 */
  --s-chart:#000080;--s-table:#007A78;--s-diagram:#8652A0;--s-kpi:#9C5C14;
  --s-timeline:#1F6FB2;--s-text:#50606E;--s-annotation:#9B4566;--s-panel:#445563;
  /* 图谱自身界面用中性灰，刻意不用 brand 蓝，避免与舞台内页面的强调色混淆。 */
  --ui-bg:#F4F5F6;--ui-panel:#FFFFFF;--ui-line:#DCE0E3;--ui-line-soft:#E9ECEE;
  --ui-ink:#252E36;--ui-muted:#6C7780;--ui-hi:#E7EBEE;--ui-sel:#DDE3E7;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{font-family:var(--font-body);color:var(--ui-ink);background:var(--ui-bg);
  display:grid;grid-template-columns:280px minmax(0,1fr);overflow:hidden}

/* —— 左栏：母版 → 布局的树 —— */
.side{background:var(--ui-panel);border-right:1px solid var(--ui-line);display:flex;flex-direction:column;min-height:0}
.side__head{padding:16px 18px 12px;border-bottom:1px solid var(--ui-line-soft)}
.side__title{font-family:var(--font-title);font-size:19px;font-weight:700;color:var(--brand);margin:0 0 4px}
.side__sub{font-size:12px;color:var(--ui-muted);line-height:1.5}
.side__stats{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.stat{font-size:11px;color:var(--ui-muted);background:var(--ui-hi);border-radius:2px;padding:2px 7px}
.stat b{color:var(--ui-ink);font-weight:600}
.side__search{padding:10px 14px;border-bottom:1px solid var(--ui-line-soft)}
.side__search input{width:100%;font:inherit;font-size:13px;padding:6px 9px;border:1px solid var(--ui-line);border-radius:3px;background:var(--ui-bg)}
.side__search input:focus{outline:2px solid var(--ui-sel);outline-offset:-1px}
.side__list{flex:1;overflow-y:auto;padding:6px 0 20px}
.grp{margin:10px 0 2px;padding:0 18px;font-size:11px;letter-spacing:.08em;color:var(--ui-muted);text-transform:uppercase}
.grp span{float:right;letter-spacing:0;text-transform:none}
.item{display:block;width:100%;text-align:left;border:0;background:none;font:inherit;cursor:pointer;
  padding:7px 18px 7px 16px;border-left:3px solid transparent;color:var(--ink)}
.item:hover{background:var(--ui-hi)}
.item[aria-current="true"]{background:var(--ui-sel);border-left-color:var(--brand)}
.item__id{font-size:11px;color:var(--ui-muted);font-variant-numeric:tabular-nums;margin-right:6px}
.item__name{font-size:13.5px}
.item__use{display:block;font-size:11.5px;color:var(--ui-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side__foot{border-top:1px solid var(--ui-line-soft);padding:10px 18px;font-size:11.5px}
.side__foot a{color:var(--ui-muted);text-decoration:none;display:inline-block;margin-right:12px}
.side__foot a:hover{color:var(--brand);text-decoration:underline}

/* —— 主区 —— */
.main{display:flex;flex-direction:column;min-width:0;min-height:0}
.bar{display:flex;align-items:center;gap:14px;padding:9px 18px;background:var(--ui-panel);
  border-bottom:1px solid var(--ui-line);flex-wrap:wrap;flex:0 0 auto}
.bar__id{font-family:var(--font-title);font-weight:700;font-size:17px;color:var(--brand)}
.bar__name{font-size:14px}
.bar__tag{font-size:11px;color:var(--ui-muted);background:var(--ui-hi);border-radius:2px;padding:2px 7px}
.bar__sp{flex:1}
.seg{display:inline-flex;border:1px solid var(--ui-line);border-radius:3px;overflow:hidden}
.seg button{font:inherit;font-size:12px;padding:4px 10px;border:0;background:var(--ui-panel);color:var(--ui-muted);cursor:pointer}
.seg button+button{border-left:1px solid var(--ui-line)}
.seg button[aria-pressed="true"]{background:var(--ui-sel);color:var(--ink);font-weight:600}
.bar label.tog{font-size:12px;color:var(--ui-muted);display:inline-flex;align-items:center;gap:5px;cursor:pointer}
.bar__lab{font-size:11px;color:var(--ui-muted);letter-spacing:.06em}

.scroll{flex:1;overflow-y:auto;min-height:0;padding:20px 22px 60px}
.stagebox{background:var(--ui-panel);border:1px solid var(--ui-line);border-radius:4px;padding:12px;
  display:flex;justify-content:center;margin-bottom:16px}
.stage{display:block;width:100%;max-width:1280px;height:auto;box-shadow:0 1px 3px rgba(23,44,59,.10)}

/* —— 详情：契约 + 逐格表 —— */
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-bottom:16px}
@media (max-width:1120px){.cols{grid-template-columns:minmax(0,1fr)}}
.card{background:var(--ui-panel);border:1px solid var(--ui-line);border-radius:4px;padding:14px 16px}
.card h3{margin:0 0 10px;font-size:11px;letter-spacing:.08em;color:var(--ui-muted);font-weight:600;text-transform:uppercase}
.field{margin-bottom:11px}
.field:last-child{margin-bottom:0}
.field dt{font-size:11.5px;color:var(--ui-muted);margin-bottom:2px}
.field dd{margin:0;font-size:13.5px;line-height:1.62}
.field dd.warn{color:#8A3620}
.field dd.constraint{background:#FBF1DC;border-left:3px solid #805B18;padding:6px 10px;font-size:13px}
.field dd .skeleton{display:block;white-space:pre;overflow-x:auto;font-size:11.5px;line-height:1.7;
  background:var(--ui-hi);border-radius:3px;padding:8px 10px;margin-bottom:4px}
.badge{display:inline-block;font-size:11px;border-radius:2px;padding:2px 7px;margin-left:6px;vertical-align:1px}
.badge.tiled{background:#E8F2EC;color:#276749}
.badge.open{background:#FBF1DC;color:#805B18}

table.grid{width:100%;border-collapse:collapse;font-size:12.5px}
table.grid th{text-align:left;font-weight:600;color:var(--ui-muted);font-size:11px;letter-spacing:.04em;
  border-bottom:1px solid var(--ui-line);padding:5px 7px}
table.grid td{border-bottom:1px solid var(--ui-line-soft);padding:6px 7px;vertical-align:top;line-height:1.5}
table.grid tr:last-child td{border-bottom:0}
table.grid td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
table.grid .slot{display:inline-block;font-size:11px;font-weight:600;color:#fff;border-radius:2px;padding:1px 6px}
table.grid .role{font-size:11px;color:var(--ui-muted)}
table.grid .acc{font-size:11.5px;color:var(--ui-muted);line-height:1.5}
table.grid tr.primary-row td{background:#F7F8FA}
.swatch{display:inline-block;width:8px;height:8px;border-radius:1px;margin-right:6px;vertical-align:0}

/* —— 总览 —— */
.wall{margin-bottom:26px}
.wall h3{font-size:12px;letter-spacing:.06em;color:var(--ui-muted);margin:0 0 4px;font-weight:600}
.wall p{margin:0 0 12px;font-size:12.5px;color:var(--ui-muted);line-height:1.6}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:14px}
.tile{border:1px solid var(--ui-line);border-radius:4px;background:var(--ui-panel);padding:10px;cursor:pointer;
  text-align:left;font:inherit;color:inherit;display:block}
.tile:hover{border-color:var(--brand);box-shadow:0 2px 8px rgba(23,44,59,.10)}
.tile svg{display:block;width:100%;height:auto;margin-bottom:8px}
.tile__id{font-size:11px;color:var(--ui-muted);font-variant-numeric:tabular-nums;margin-right:6px}
.tile__name{font-size:13.5px;font-weight:600}
.tile__use{display:block;font-size:11.5px;color:var(--ui-muted);margin-top:3px;line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* —— 方法 —— */
.method{background:var(--ui-panel);border:1px solid var(--ui-line);border-radius:4px;padding:18px 20px;margin-top:8px}
.method h2{font-family:var(--font-title);font-size:17px;color:var(--brand);margin:0 0 4px}
.method h4{font-size:12.5px;margin:20px 0 7px;color:var(--ink)}
.method p{font-size:13px;line-height:1.7;color:var(--gray-1);margin:0 0 8px}
.method code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--ui-hi);padding:1px 5px;border-radius:2px}
.hint{font-size:12px;color:var(--ui-muted);line-height:1.6}
</style>
</head>
<body>
<aside class="side">
  <div class="side__head">
    <h1 class="side__title">单页布局图谱</h1>
    <div class="side__sub">先定这是哪种页，再选布局，最后决定每一格填什么。</div>
    <div class="side__stats">
      <span class="stat"><b id="n-layouts"></b> 条布局</span>
      <span class="stat"><b id="n-families"></b> 族</span>
      <span class="stat"><b id="n-masters"></b> 母版</span>
      <span class="stat"><b>12×6</b> 网格</span>
    </div>
  </div>
  <div class="side__search"><input id="q" type="search" placeholder="搜编号 / 名称 / 用途，如 泳道、L25"></div>
  <div class="side__list" id="list"></div>
  <div class="side__foot">
    <a href="#" data-view="overview">总览</a>
    <a href="#method">网格与容量</a>
    <a href="#" id="link-catalog">目录 JSON</a>
  </div>
</aside>

<main class="main">
  <div class="bar">
    <span class="bar__id" id="bar-id">总览</span>
    <span class="bar__name" id="bar-name"></span>
    <span class="bar__tag" id="bar-tag"></span>
    <span class="bar__sp"></span>
    <span class="bar__lab">画幅</span>
    <div class="seg" id="ratio">
      <button data-ratio="16x9" aria-pressed="true">16:9 · 1280×720</button>
      <button data-ratio="4x3" aria-pressed="false">4:3 · 1024×768</button>
    </div>
    <span class="bar__lab">视图</span>
    <div class="seg" id="mode">
      <button data-mode="wire" aria-pressed="true">结构线框</button>
      <button data-mode="capacity" aria-pressed="false">容量</button>
    </div>
    <label class="tog"><input type="checkbox" id="togGrid" checked>网格线</label>
    <label class="tog"><input type="checkbox" id="togSafe" checked>版心</label>
    <div class="seg">
      <button id="btnPrev">← 上一条</button>
      <button id="btnNext">下一条 →</button>
    </div>
  </div>
  <div class="scroll" id="scroll"></div>
</main>

<script type="application/json" id="atlas-data">
${JSON.stringify(payload)}
</script>
<script>
'use strict';
const D = JSON.parse(document.getElementById('atlas-data').textContent);
const SLOT_COLOR = {chart:'#000080',table:'#007A78',diagram:'#8652A0',kpi:'#9C5C14',
  timeline:'#1F6FB2',text:'#50606E',annotation:'#9B4566',panel:'#445563'};
const FORM_LABEL = Object.fromEntries(D.forms.all.map(f => [f.id, f.label || f.id]));
const FAMILY_LABEL = D.forms.families;
const slotColor = slot => SLOT_COLOR[slot] || '#667586';
const byId = Object.fromEntries(D.layouts.map(l => [l.id, l]));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* 可填形式：目录写了 accepts 就按 accepts 收窄，没写就是整个槽位能装的形式。
   这正是作者选型时要看的那句话——"这一格我能放什么"。 */
const acceptsText = (mod, accepts, slot) => {
  if (accepts && accepts.length) {
    return accepts.map(t => t.indexOf('family:') === 0 ? (FAMILY_LABEL[t.slice(7)] || t) + '（整族）' : (FORM_LABEL[t] || t)).join('、');
  }
  const pool = D.forms.slotForms[slot] || [];
  return pool.length ? '槽位通用：' + pool.map(f => FORM_LABEL[f] || f).join('、') : '槽位不接受形式声明';
};

const state = {ratio:'16x9', mode:'wire', grid:true, safe:true, current:null, view:'detail', master:'all', query:''};

/* —— 线框：每个模块按目录算出的矩形落位，槽位决定颜色 —— */
function wireframe(layout, opts) {
  const o = opts || {};
  const R = D.ratios[state.ratio], W = R.canvas.width, H = R.canvas.height;
  const M = layout.measured[state.ratio];
  const c = R.content, body = R.body;
  const hatch = 'hatch-' + layout.id + '-' + state.ratio;
  const parts = [];
  parts.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#FFFFFF"/>');
  // 网格线：12 栏 × 6 行。模块必须落在这些线上，所以先把线画出来。
  if (state.grid && !o.mini) {
    const g = [];
    for (let i = 0; i <= D.grid.columns; i++) {
      const x = body.x + i * R.columnWidth + i * R.gutter - (i ? R.gutter / 2 : 0);
      g.push('<line x1="' + x + '" y1="' + body.y + '" x2="' + x + '" y2="' + (body.y + body.height) + '"/>');
    }
    for (let j = 0; j <= D.grid.rows; j++) {
      const y = body.y + j * R.rowHeight + j * R.gutter - (j ? R.gutter / 2 : 0);
      g.push('<line x1="' + body.x + '" y1="' + y + '" x2="' + (body.x + body.width) + '" y2="' + y + '"/>');
    }
    // 线画在格间空隙的中线上：模块矩形之间本来就有 gutter，中线才是"格线"。
    parts.push('<g stroke="#E2E7EA" stroke-width="1" stroke-dasharray="3 4">' + g.join('') + '</g>');
  }
  if (state.safe && !o.mini) {
    parts.push('<rect x="' + c.x + '" y="' + c.y + '" width="' + c.width + '" height="' + c.height + '" fill="none" stroke="#BFCBD2" stroke-width="1"/>');
  }
  // 标题带与来源带：它们不是模块，但占掉正文以外的全部高度，必须画出来才对得上账。
  parts.push('<rect x="' + c.x + '" y="' + c.y + '" width="' + c.width + '" height="' + R.titleBand + '" fill="#F2F5F7" stroke="#DCE0E3"/>');
  if (!o.mini) parts.push('<text x="' + (c.x + 10) + '" y="' + (c.y + 26) + '" font-size="15" fill="#6C7780">标题带 · ' + R.titleBand + 'px（1 行 87 / 2 行 112 都装得下，正文起点恒定）</text>');
  const srcY = body.y + body.height;
  parts.push('<rect x="' + c.x + '" y="' + srcY + '" width="' + c.width + '" height="' + R.sourceBand + '" fill="#F2F5F7" stroke="#DCE0E3"/>');
  if (!o.mini) parts.push('<text x="' + (c.x + 10) + '" y="' + (srcY + R.sourceBand / 2 + 5) + '" font-size="13" fill="#6C7780">来源带 · ' + R.sourceBand + 'px</text>');

  layout.modules.forEach((m, i) => {
    const box = M.modules[i].box, color = slotColor(m.slot);
    const primary = m.role === 'primary';
    parts.push('<rect x="' + box.x + '" y="' + box.y + '" width="' + box.width + '" height="' + box.height
      + '" fill="' + color + '" fill-opacity="' + (primary ? '.10' : '.055') + '" stroke="' + color
      + '" stroke-width="' + (primary ? 2 : 1.2) + '"' + (m.slot === 'panel' ? ' stroke-dasharray="6 4"' : '') + '/>');
    if (m.slot === 'panel') parts.push('<rect x="' + (box.x + 5) + '" y="' + (box.y + 5) + '" width="' + (box.width - 10) + '" height="' + (box.height - 10) + '" fill="none" stroke="' + color + '" stroke-opacity=".35" stroke-dasharray="2 3"/>');
    if (o.mini) return;
    const pad = D.grid.module.pad, tx = box.x + pad, ty = box.y + pad;
    parts.push('<text x="' + tx + '" y="' + (ty + 17) + '" font-size="18" font-weight="600" fill="#172C3B">' + esc(m.title) + '</text>');
    parts.push('<text x="' + tx + '" y="' + (ty + 36) + '" font-size="12" fill="' + color + '">'
      + esc(m.slot) + ' · ' + esc(m.role) + ' · 第 ' + (i + 1) + ' 格 · ' + m.w + '栏×' + m.h + '行 · '
      + box.width + '×' + box.height + 'px</text>');
    if (state.mode === 'capacity') {
      const cap = M.modules[i].lines;
      // 矮格（h=1）塞不下三行标注，压成一行；标注溢出模块就成了图谱自己在违反它要教的事。
      if (cap.inner < 100) {
        parts.push('<text x="' + tx + '" y="' + (ty + 58) + '" font-size="11.5" fill="#50606E">内区 '
          + cap.inner + 'px，正文 ' + cap.body.plain + ' / 注释 ' + cap.note.plain + ' 行</text>');
      } else {
        parts.push('<text x="' + tx + '" y="' + (ty + 58) + '" font-size="12" fill="#50606E">内区 ' + cap.inner + 'px 高，可放：</text>');
        ['正文 ' + cap.body.plain + ' 行 / 带标题 ' + cap.body.titled + ' / 带标题与单位 ' + cap.body.titledUnit,
          '注释 ' + cap.note.plain + ' / ' + cap.note.titled + ' / ' + cap.note.titledUnit]
          .forEach((line, k) => parts.push('<text x="' + tx + '" y="' + (ty + 76 + k * 17) + '" font-size="12" fill="#50606E">' + esc(line) + '</text>'));
      }
    }
  });
  // 未铺满的格：留白要么被声明，要么就是漏洞。这里把没被占的格点出来。
  if (layout.fill === 'open' && !o.mini) {
    const used = new Set();
    layout.modules.forEach(m => { for (let dc = 0; dc < m.w; dc++) for (let dr = 0; dr < m.h; dr++) used.add((m.c + dc) + ',' + (m.r + dr)); });
    for (let rr = 1; rr <= D.grid.rows; rr++) for (let cc = 1; cc <= D.grid.columns; cc++) {
      if (used.has(cc + ',' + rr)) continue;
      const x = body.x + (cc - 1) * (R.columnWidth + R.gutter), y = body.y + (rr - 1) * (R.rowHeight + R.gutter);
      parts.push('<rect x="' + x + '" y="' + y + '" width="' + R.columnWidth + '" height="' + R.rowHeight + '" fill="url(#' + hatch + ')" stroke="none"/>');
    }
  }
  // 图案 id 必须逐图唯一：总览里一页几十个 SVG，同名 id 会让 url(#…) 全部指向文档里第一个，
  // 那一张一旦被重绘，其余的留白就悄悄变成实心。
  const defs = '<defs><pattern id="' + hatch + '" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">'
    + '<line x1="0" y1="0" x2="0" y2="8" stroke="#BFCBD2" stroke-width="1"/></pattern></defs>';
  return '<svg class="stage" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(layout.id + ' ' + layout.name) + ' 结构线框">'
    + defs + parts.join('') + '</svg>';
}

/* 页面骨架：作者真正要抄的那几行。刻意不给 grid-column / grid-row——
   几何由 data-layout 从 CSS 取，写进页面只会与目录漂移。 */
function skeleton(layout) {
  /* 换行一律双写反斜杠。本函数是外层模板字面量的一部分，单写的转义序列会在生成期就展开成
     真换行，落进页面里的单引号字符串就是语法错误；注释里同样不能出现单写的转义序列。 */
  return '<section class="slide reading" data-layout="' + layout.id + '" data-form="…">\\n'
    + '  <div class="slide__body">\\n'
    + layout.modules.map(m => '    <div data-module="' + m.slot + '">' + m.title + '</div>').join('\\n')
    + '\\n  </div>\\n</section>';
}

/* —— 详情 —— */
function detail(layout) {
  const R = D.ratios[state.ratio], M = layout.measured[state.ratio];
  const fill = layout.fill === 'open'
    ? '<span class="badge open">有意留白 ' + Math.round(M.fillRatio * 100) + '%</span>'
    : '<span class="badge tiled">铺满 ' + Math.round(M.fillRatio * 100) + '%</span>';
  const rows = layout.modules.map((m, i) => {
    const box = M.modules[i].box, cap = M.modules[i].lines;
    return '<tr' + (m.role === 'primary' ? ' class="primary-row"' : '') + '>'
      + '<td class="num">' + (i + 1) + '</td>'
      + '<td><b>' + esc(m.title) + '</b>' + (m.style ? '<br><span class="role">样式 ' + esc(m.style) + '</span>' : '') + '</td>'
      + '<td><span class="slot" style="background:' + slotColor(m.slot) + '">' + esc(m.slot) + '</span><br><span class="role">' + esc(m.role) + '</span></td>'
      + '<td class="num">' + m.c + ',' + m.r + '<br>' + m.w + '×' + m.h + '</td>'
      + '<td class="num">' + box.width + '×' + box.height + '<br><span class="role">内 ' + cap.inner + 'px</span></td>'
      + '<td class="num">' + cap.body.plain + ' / ' + cap.body.titled + ' / ' + cap.body.titledUnit + '<br><span class="role">注释 ' + cap.note.plain + ' / ' + cap.note.titled + ' / ' + cap.note.titledUnit + '</span></td>'
      + '<td class="acc">' + esc(acceptsText(m, M.modules[i].accepts, m.slot)) + '</td></tr>';
  }).join('');
  // 同几何的兄弟布局：几何一样、语义不同，选错就是选错，所以明说。
  const sig = l => l.modules.map(m => [m.c, m.r, m.w, m.h].join(',')).join('|');
  const twins = D.layouts.filter(l => l.id !== layout.id && sig(l) === sig(layout)).map(l => l.id + ' ' + l.name);

  return '<div class="stagebox">' + wireframe(layout) + '</div>'
    + '<div class="cols">'
    + '<div class="card"><h3>这条布局怎么用</h3><dl class="field">'
    + '<div class="field"><dt>用在哪里</dt><dd>' + esc(layout.use) + '</dd></div>'
    + '<div class="field"><dt>阅读路径</dt><dd>' + esc(layout.path) + '</dd></div>'
    + '<div class="field"><dt>代价</dt><dd>' + esc(layout.trade) + '</dd></div>'
    + '<div class="field"><dt>不要这样用</dt><dd class="warn">' + esc(layout.avoid) + '</dd></div>'
    + (layout.constraint ? '<div class="field"><dt>布局约束</dt><dd class="constraint">' + esc(layout.constraint) + '</dd></div>' : '')
    + (layout.fill === 'open' ? '<div class="field"><dt>留白理由</dt><dd>' + esc(layout.openWhy) + '</dd></div>' : '')
    + '</dl></div>'
    + '<div class="card"><h3>选型要看的几件事</h3><dl class="field">'
    + '<div class="field"><dt>所属母版</dt><dd>' + esc(D.masters.find(x => x.id === layout.master).name)
    + ' <span class="role">（' + esc(layout.master) + '）</span></dd></div>'
    + '<div class="field"><dt>族</dt><dd>' + esc(layout.family) + '　' + esc(layout.familyName) + '</dd></div>'
    + '<div class="field"><dt>模块数</dt><dd>' + layout.modules.length + ' 格，主展品在第 ' + (layout.modules.findIndex(m => m.role === 'primary') + 1) + ' 格</dd></div>'
    + '<div class="field"><dt>填充</dt><dd>' + fill + '</dd></div>'
    + '<div class="field"><dt>页面骨架</dt><dd><code class="skeleton">' + esc(skeleton(layout)) + '</code>'
    + '<br><span class="role">照抄这行，把每一格的内容填进对应模块。几何不用你写——'
    + '落位规则由 build_layout_css.cjs 从目录生成。</span></dd></div>'
    + '<div class="field"><dt>画幅</dt><dd>' + esc(R.canvas.width + '×' + R.canvas.height) + '　正文区 ' + R.body.width + '×' + R.body.height
    + '　栏宽 ' + R.columnWidth + '　行高 ' + R.rowHeight + '　间距 ' + R.gutter + '</dd></div>'
    + (twins.length ? '<div class="field"><dt>同几何的其他布局</dt><dd>' + esc(twins.join('、')) + '<br><span class="role">几何相同、语义不同，按论证需要选，不要按长相选。</span></dd></div>' : '')
    + '</dl></div></div>'
    + '<div class="card"><h3>逐格：这一格装什么、装得下多少</h3>'
    + '<table class="grid"><thead><tr><th>#</th><th>模块</th><th>槽位 / 角色</th><th>栏,行<br>跨</th>'
    + '<th>尺寸<br>px</th><th>正文行<br>（素/带标题/带单位）</th><th>可填形式</th></tr></thead><tbody>' + rows + '</tbody></table>'
    + '<p class="hint" style="margin-top:10px">容量按行高算出：正文行 ' + D.grid.lines.body + 'px、注释行 ' + D.grid.lines.note
    + 'px，模块内边距 ' + D.grid.module.pad + 'px、标题带 ' + D.grid.module.titleBand + 'px、单位行 ' + D.grid.module.unitBand
    + 'px。装不下就换布局，不要缩字号。</p></div>';
}

/* —— 总览 —— */
function overview() {
  return D.masters.map(master => {
    const items = D.layouts.filter(l => l.master === master.id);
    if (!items.length) return '';
    return '<section class="wall"><h3>' + esc(master.name) + '（' + esc(master.id) + '） · ' + items.length + ' 条</h3>'
      + '<p>' + esc(master.readerTask) + '　<span class="hint">' + esc(master.notes) + '</span></p><div class="tiles">'
      + items.map(l => '<button class="tile" data-go="' + l.id + '">' + wireframe(l, {mini: true})
        + '<span class="tile__id">' + l.id + '</span><span class="tile__name">' + esc(l.name) + '</span>'
        + '<span class="tile__use">' + esc(l.use) + '</span></button>').join('')
      + '</div></section>';
  }).join('');
}

/* —— 方法：网格算术、容量表、槽位表、填充规则 —— */
function method() {
  const ratioBlocks = Object.values(D.ratios).map(R => {
    const head = '<tr><th>行高 h</th>' + [1,2,3,4,5,6].map(h => '<th>' + h + ' 行<br>' + R.capacity[h-1].module + 'px</th>').join('') + '</tr>';
    const line = (label, pick) => '<tr><td>' + label + '</td>' + R.capacity.map(c => '<td class="num">' + pick(c) + '</td>').join('') + '</tr>';
    return '<h4>' + esc(R.id) + ' · ' + R.canvas.width + '×' + R.canvas.height
      + '　版心 ' + R.content.width + '×' + R.content.height + '　正文区 ' + R.body.width + '×' + R.body.height + '</h4>'
      + '<p>栏：12 × ' + R.columnWidth + ' + 11 × ' + R.gutter + ' = ' + R.body.width
      + '　行：6 × ' + R.rowHeight + ' + 5 × ' + R.gutter + ' = ' + R.body.height
      + '　纵向：标题带 ' + R.titleBand + ' + 正文 ' + R.body.height + ' + 来源带 ' + R.sourceBand + ' = ' + R.content.height + '</p>'
      + '<table class="grid">' + head
      + line('正文行（素）', c => c.body.plain)
      + line('正文行（带模块标题）', c => c.body.titled)
      + line('正文行（带标题 + 单位行）', c => c.body.titledUnit)
      + line('注释行（素）', c => c.note.plain)
      + line('注释行（带模块标题）', c => c.note.titled)
      + line('注释行（带标题 + 单位行）', c => c.note.titledUnit)
      + '</table>';
  }).join('');

  const slotRows = D.grid.slots.map(slot => {
    const pool = D.forms.slotForms[slot] || [];
    return '<tr><td><span class="slot" style="background:' + slotColor(slot) + '">' + slot + '</span></td>'
      + '<td>' + esc(D.slotNotes[slot] || '') + '</td>'
      + '<td class="acc">' + (pool.length ? pool.map(f => esc(FORM_LABEL[f] || f)).join('、') : '不接受形式声明') + '</td></tr>';
  }).join('');

  const masterRows = D.masters.map(m => '<tr><td><b>' + esc(m.name) + '</b><br><span class="role">' + esc(m.id) + '</span></td>'
    + '<td class="acc">' + (m.pageRoles.length ? m.pageRoles.map(esc).join('、') : '（未接入）') + '</td>'
    + '<td>' + esc(m.readerTask) + '</td><td class="acc">' + esc(m.notes) + '</td></tr>').join('');

  const open = D.layouts.filter(l => l.fill === 'open');

  return '<section class="method" id="method">'
    + '<h2>网格与容量</h2>'
    + '<p>布局先约束，内容才好填。目录里每条布局只写模块占第几栏第几行、跨几栏几行（<code>c/r/w/h</code>），'
    + '像素由栅格算出，画幅只换像素不换拓扑——同一份布局目录同时服务 16:9 与 4:3。'
    + '作者选布局时就能知道每一格装得下几行字，不必等排完版才发现放不下。</p>'
    + ratioBlocks
    + '<h4>槽位：一格允许装什么</h4>'
    + '<p>槽位是布局对内容的约束。表格位填不了图，图表位也顶不了表——这不是排版偏好，是"这一格在论证里干什么"。</p>'
    + '<table class="grid"><thead><tr><th>槽位</th><th>它意味着什么</th><th>槽位允许的已登记形式</th></tr></thead><tbody>' + slotRows + '</tbody></table>'
    + '<h4>母版：先定这是哪种页</h4>'
    + '<p>母版决定这一页要替读者完成什么。选布局之前先落母版，落错了母版，布局选得再对也是错的。</p>'
    + '<table class="grid"><thead><tr><th>母版</th><th>页面角色</th><th>读者这一页要拿到什么</th><th>边界</th></tr></thead><tbody>' + masterRows + '</tbody></table>'
    + '<h4>留白：要么铺满，要么说出理由</h4>'
    + '<p>每条布局声明 <code>fill</code>。<code>tiled</code> 表示模块铺满 12×6 的每一格；'
    + '<code>open</code> 表示有意留白，必须在 <code>openWhy</code> 里说清为什么这块空是设计而不是漏洞——'
    + '本轮共 ' + open.length + ' 条声明了留白：'
    + open.map(l => l.id + '（' + Math.round(l.measured['16x9'].fillRatio * 100) + '%）').join('、')
    + '。其余 ' + (D.layouts.length - open.length) + ' 条铺满。没被声明又空着的格，在线框里会被画成斜线。</p>'
    + '</section>';
}

/* —— 渲染与交互 —— */
const scroll = document.getElementById('scroll');
const listEl = document.getElementById('list');

function renderList() {
  const q = state.query.trim().toLowerCase();
  const hit = l => !q || (l.id + ' ' + l.name + ' ' + l.use + ' ' + l.familyName + ' ' + l.master).toLowerCase().indexOf(q) >= 0;
  listEl.innerHTML = D.masters.map(master => {
    const items = D.layouts.filter(l => l.master === master.id && hit(l));
    if (!items.length) return '';
    return '<div class="grp">' + esc(master.name) + '<span>' + items.length + '</span></div>'
      + items.map(l => '<button class="item" data-go="' + l.id + '" aria-current="' + (l.id === state.current) + '">'
        + '<span class="item__id">' + l.id + '</span><span class="item__name">' + esc(l.name) + '</span>'
        + '<span class="item__use">' + esc(l.use) + '</span></button>').join('');
  }).join('');
}

/* keepScroll：切换网格线、容量这类"就地重绘"不该把读者弹回页首，只有换布局/换视图才回到顶部。 */
function render(keepScroll) {
  const top = scroll.scrollTop;
  renderList();
  const bar = document.getElementById('bar-id'), name = document.getElementById('bar-name'), tag = document.getElementById('bar-tag');
  if (state.view === 'overview' || !state.current) {
    bar.textContent = '总览'; name.textContent = state.ratio === '16x9' ? '1280×720' : '1024×768';
    tag.textContent = D.layouts.length + ' 条布局 · 按母版分组';
    scroll.innerHTML = overview() + method();
  } else {
    const layout = byId[state.current];
    bar.textContent = layout.id; name.textContent = layout.name;
    tag.textContent = D.masters.find(m => m.id === layout.master).name + ' · ' + layout.family + ' ' + layout.familyName;
    scroll.innerHTML = detail(layout) + method();
  }
  scroll.scrollTop = keepScroll ? top : 0;
}

function go(id) { state.view = 'detail'; state.current = id; render(); }

/* 侧栏条目与总览磁贴都带 data-go，用同一个委托监听，避免两条路径各接一次而漏掉一条。 */
document.addEventListener('click', event => {
  const target = event.target.closest('[data-go]');
  if (target) go(target.dataset.go);
});
document.querySelector('.side__foot').addEventListener('click', event => {
  const link = event.target.closest('[data-view="overview"]');
  if (link) { event.preventDefault(); state.view = 'overview'; render(); }
});
document.getElementById('ratio').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  state.ratio = button.dataset.ratio;
  [...event.currentTarget.querySelectorAll('button')].forEach(b => b.setAttribute('aria-pressed', b === button));
  render();
});
document.getElementById('mode').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  state.mode = button.dataset.mode;
  [...event.currentTarget.querySelectorAll('button')].forEach(b => b.setAttribute('aria-pressed', b === button));
  render(true);
});
document.getElementById('togGrid').addEventListener('change', e => { state.grid = e.target.checked; render(true); });
document.getElementById('togSafe').addEventListener('change', e => { state.safe = e.target.checked; render(true); });
document.getElementById('q').addEventListener('input', e => { state.query = e.target.value; renderList(); });
const step = delta => {
  const index = D.layouts.findIndex(l => l.id === state.current);
  const next = index < 0 ? (delta > 0 ? 0 : D.layouts.length - 1) : (index + delta + D.layouts.length) % D.layouts.length;
  go(D.layouts[next].id);
};
document.getElementById('btnPrev').addEventListener('click', () => step(-1));
document.getElementById('btnNext').addEventListener('click', () => step(1));
document.addEventListener('keydown', event => {
  if (event.target.tagName === 'INPUT') return;
  if (event.key === 'ArrowLeft') step(-1);
  else if (event.key === 'ArrowRight') step(1);
  else if (event.key === 'Escape') { state.view = 'overview'; render(); }
});
document.getElementById('link-catalog').addEventListener('click', event => {
  event.preventDefault();
  alert('目录唯一权威：' + D.source + '\\n本页由 scripts/build_layout_atlas.cjs 生成，改目录后重新生成即可。');
});

document.getElementById('n-layouts').textContent = D.layouts.length;
document.getElementById('n-families').textContent = new Set(D.layouts.map(l => l.family)).size;
document.getElementById('n-masters').textContent = D.masters.length;
state.current = D.layouts[0].id;
render();
</script>
</body>
</html>
`;
}

const html = render(data());

/* 产物自检：图谱的脚本是拼出来的，最容易出的错不是"内容过期"而是"生成器把 JS 写坏了"——
   外层模板字面量里单写的转义序列会在生成期就展开，落进页面字符串就成语法错误。
   那种产物与目录完全一致（--check 会放行），却打不开。所以写完先过一遍语法。
   用 new vm.Script 而不是把浏览器拖进来：这一关只验语法，不解引用任何东西。 */
function assertParsable(source) {
  for (const [, code] of source.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try {
      new (require('node:vm').Script)(code, {filename: 'layout-atlas.inline.js'});
    } catch (error) {
      throw new Error('生成的图谱脚本语法错误：' + error.message
        + '\n多半是 build_layout_atlas.cjs 模板字面量里有单写的转义序列，双写反斜杠即可。');
    }
  }
  for (const [, json] of source.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(json); } catch (error) { throw new Error('图谱内嵌数据不是合法 JSON：' + error.message); }
  }
}
assertParsable(html);

if (process.argv.includes('--check')) {
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
  if (current !== html) {
    console.error('assets/layout-atlas.html 与布局目录不一致：目录改了但图谱没重新生成。'
      + '\n跑 node scripts/build_layout_atlas.cjs 重新生成（不要手改图谱）。');
    process.exitCode = 1;
  } else {
    console.log('布局图谱与目录一致（' + layouts.list().length + ' 条）。');
  }
} else {
  fs.writeFileSync(TARGET, html);
  console.log('已写入 assets/layout-atlas.html（' + layouts.list().length + ' 条布局，'
    + (html.length / 1024).toFixed(0) + ' KB）。');
}
