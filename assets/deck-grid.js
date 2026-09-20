/* 版心与模块网格：本技能几何的唯一权威来源。
   CSS 侧镜像在 assets/deck-geometry.css 的 --grid-* 变量，scripts/test_deck_grid.cjs 守两边漂移。

   两种画幅共用同一套 12 栏 × 6 行拓扑，所以布局目录（assets/layout-atlas/catalog.json）里的
   {c, r, w, h} 与画幅无关——换画幅只换像素换算，不换布局。这一点决定了"同一份布局目录
   能同时服务 16:9 与 4:3"，也决定了容量核算必须按画幅分别给出。

   为什么是整数：模块必须能落在网格线上，作者才能拿"第几栏第几行"说话，门禁也才能拿坐标对账。
   见 references/consulting-page-system.md 的「版心与模块网格」。 */
'use strict';

const COLUMNS = 12;
const ROWS = 6;
const DEFAULT_RATIO = '16x9';

/* 像素常量都是整数，且整除版心：16:9 下 12×89 + 11×12 = 1200、6×71 + 5×12 = 486；
   4:3 下 12×64 + 11×16 = 944、6×80 + 5×16 = 560。改动任一项都要重算，不要只改一个数。 */
const RATIOS = {
  '16x9': {
    canvas: { width: 1280, height: 720 },
    pad: { top: 32, left: 40, right: 40, bottom: 26 },
    columnWidth: 89, rowHeight: 71, gutter: 12,
    titleBand: 128,   // 标题带：1 行标题 87px、2 行标题 112px 都装得下，正文起点因此恒定
    sourceBand: 48
  },
  '4x3': {
    canvas: { width: 1024, height: 768 },
    pad: { top: 32, left: 40, right: 40, bottom: 26 },
    columnWidth: 64, rowHeight: 80, gutter: 16,
    titleBand: 120,
    sourceBand: 30
  }
};

/* 行高是容量核算的分母，必须是整数：正文行 24px（17px 字号）、注释行 22px（15px 字号）。
   consulting-layouts.css 把 reading 模式的行高钉到这两个值，改字号就要回来改这里。 */
const LINES = { body: 24, note: 22 };
/* 模块内边距 12；模块标题带 33 = h2 19px×1.3 (24.7) + 下边距 8；单位行 26 = 13px×1.4 (18) + 下边距 8。
   三项都由 consulting-layouts.css 的网格块把行高钉成整数，容量核算才是算术而不是估算。 */
const MODULE = { pad: 12, titleBand: 33, unitBand: 26 };

/* 模块槽位：一个模块能装什么，是布局对内容的约束，也是"一页多种表达"的落点。
   head/source 不是内容槽，它们由版心固定占用，不接受形式声明。
   panel 是并列布局的通用格：当布局的论证不依赖某一格的具体形式时，用它而不是硬指定 chart，
   否则作者会被迫把表格塞进图表位。它的代价是约束变弱，所以只用在模块彼此等价的并列型布局上。 */
const SLOTS = ['head', 'chart', 'diagram', 'table', 'kpi', 'timeline', 'text', 'annotation', 'panel', 'source'];

/* 槽位 ↔ 形式是逐形式判定的，不按族：同族里 kit.bullet（SVG 子弹图）进 chart 槽，
   html.kpi（卡片组）只进 kpi 槽——按族判会把这两件事混成一件。 */
const FORM_SLOTS = {  'kit.waterfall': ['chart'], 'kit.dumbbell': ['chart'], 'kit.slope': ['chart'],
  'kit.bullet': ['chart', 'kpi'], 'kit.heatmap': ['chart', 'table'], 'kit.mekko': ['chart'],
  'kit.stacked': ['chart'], 'kit.shareBar': ['chart'], 'kit.tree': ['diagram'],
  'kit.swimlane': ['timeline', 'diagram'], 'kit.processFlow': ['diagram', 'timeline'],
  'kit.comparisonTable': ['table'],
  'recipe.rankedBar': ['chart'], 'recipe.groupedBar': ['chart'], 'recipe.timeSeries': ['chart'],
  'recipe.composition': ['chart'], 'recipe.histogram': ['chart'], 'recipe.scatter': ['chart'],
  'recipe.heatmap': ['chart', 'table'], 'recipe.sankey': ['chart', 'diagram'], 'recipe.tree': ['diagram'],
  'precision.columns': ['chart', 'table'], 'precision.stacked': ['chart', 'table'],
  'precision.waterfall': ['chart'],
  'diagram.mechanism': ['diagram'], 'diagram.process': ['diagram', 'timeline'],
  'diagram.swimlane': ['timeline', 'diagram'], 'diagram.hierarchy': ['diagram'],
  'diagram.condition': ['diagram'],
  'html.table': ['table'], 'html.matrix': ['table'], 'html.kpi': ['kpi'],
  'html.text': ['text', 'annotation'], 'html.finding': ['text', 'annotation'],
  // 自定义构图不受槽位限制：它就是"表内形式都不适配"时的出口，几何由作者负责。
  'svg.custom': SLOTS.filter(slot => slot !== 'head' && slot !== 'source')
};

const ratioOf = id => {
  const ratio = RATIOS[id || DEFAULT_RATIO];
  if (!ratio) throw new Error('未知画幅: ' + id + '（可用 ' + Object.keys(RATIOS).join('/') + '）');
  return ratio;
};

/* 跨 n 栏/行的像素尺寸：n×单位 + (n−1)×间距。 */
const span = (n, unit, gutter) => n * unit + (n - 1) * gutter;

const content = ratioId => {
  const r = ratioOf(ratioId);
  return {
    x: r.pad.left, y: r.pad.top,
    width: r.canvas.width - r.pad.left - r.pad.right,
    height: r.canvas.height - r.pad.top - r.pad.bottom
  };
};

/* 正文区：标题带之下、来源带之上，就是 6 行网格本身。 */
const body = ratioId => {
  const r = ratioOf(ratioId), box = content(ratioId);
  return {
    x: box.x, y: box.y + r.titleBand, width: box.width,
    height: span(ROWS, r.rowHeight, r.gutter)
  };
};

/* 模块几何：{c,r,w,h} 是 1 起的栏位/行位，输出像素矩形。 */
const box = (module, ratioId) => {
  const r = ratioOf(ratioId), area = body(ratioId);
  const c = module.c, rr = module.r, w = module.w, h = module.h;
  return {
    x: area.x + (c - 1) * (r.columnWidth + r.gutter),
    y: area.y + (rr - 1) * (r.rowHeight + r.gutter),
    width: span(w, r.columnWidth, r.gutter),
    height: span(h, r.rowHeight, r.gutter)
  };
};

const innerHeight = (h, ratioId) => span(h, ratioOf(ratioId).rowHeight, ratioOf(ratioId).gutter) - 2 * MODULE.pad;

/* 容量核算：h 行模块放得下几行字。opts.titled 指模块自带标题（.exhibit h2），opts.unit 指另有单位行。
   这是"先约束后填充"的算术基础——作者在选布局时就能知道这个模块装不装得下他的证据。 */
const lines = (h, ratioId, kind = 'body', opts = {}) => {
  const band = (opts.titled ? MODULE.titleBand : 0) + (opts.unit ? MODULE.unitBand : 0);
  const usable = innerHeight(h, ratioId) - band;
  return Math.max(0, Math.floor(usable / LINES[kind]));
};

const capacity = (h, ratioId) => ({
  module: span(h, ratioOf(ratioId).rowHeight, ratioOf(ratioId).gutter),
  inner: innerHeight(h, ratioId),
  body: {
    plain: lines(h, ratioId, 'body'),
    titled: lines(h, ratioId, 'body', { titled: true }),
    titledUnit: lines(h, ratioId, 'body', { titled: true, unit: true })
  },
  note: {
    plain: lines(h, ratioId, 'note'),
    titled: lines(h, ratioId, 'note', { titled: true }),
    titledUnit: lines(h, ratioId, 'note', { titled: true, unit: true })
  }
});

const slotAccepts = (slot, form) => {
  if (!SLOTS.includes(slot)) return false;
  if (slot === 'panel') return Object.prototype.hasOwnProperty.call(FORM_SLOTS, form);
  const allowed = FORM_SLOTS[form];
  return Array.isArray(allowed) && allowed.includes(slot);
};

/* 几何合法性：越界与重叠。两者都会让"模块坐标"这个合同失去意义，所以都按错误处理。 */
const boundsErrors = modules => {
  const errors = [];
  (modules || []).forEach((m, i) => {
    const at = 'modules[' + i + ']';
    if (!m || typeof m !== 'object') { errors.push(at + ' 须为对象'); return; }
    ['c', 'r', 'w', 'h'].forEach(key => {
      if (!Number.isInteger(m[key]) || m[key] < 1) errors.push(at + ' ' + key + ' 须为 1 起的整数');
    });
    if (Number.isInteger(m.c) && Number.isInteger(m.w) && m.c + m.w - 1 > COLUMNS) errors.push(at + ' 横向越界：占 ' + (m.c + m.w - 1) + ' 栏，画幅只有 ' + COLUMNS + ' 栏');
    if (Number.isInteger(m.r) && Number.isInteger(m.h) && m.r + m.h - 1 > ROWS) errors.push(at + ' 纵向越界：占 ' + (m.r + m.h - 1) + ' 行，画幅只有 ' + ROWS + ' 行');
  });
  return errors;
};

const overlapErrors = modules => {
  const errors = [], list = (modules || []).filter(m => m && typeof m === 'object');
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (![a.c, a.r, a.w, a.h, b.c, b.r, b.w, b.h].every(Number.isInteger)) continue;
    const apart = a.c + a.w <= b.c || b.c + b.w <= a.c || a.r + a.h <= b.r || b.r + b.h <= a.r;
    if (!apart) errors.push('modules[' + i + '] 与 modules[' + j + '] 重叠：模块必须互斥，读者才能把一个格读成一个意思');
  }
  return errors;
};

/* 整页占位：模块并集覆盖了 12×6 的多少格。留白是决定，"没占满"必须是知情的。 */
const coverage = modules => {
  const cells = new Set();
  (modules || []).forEach(m => {
    if (![m && m.c, m && m.r, m && m.w, m && m.h].every(Number.isInteger)) return;
    for (let c = m.c; c < m.c + m.w; c++) for (let r = m.r; r < m.r + m.h; r++) cells.add(c + ':' + r);
  });
  return { cells: cells.size, total: COLUMNS * ROWS, ratio: cells.size / (COLUMNS * ROWS) };
};

const zeroGapErrors = (modules, label = '本页') => {
  const list = (modules || []).filter(m => m && Number.isInteger(m.c));
  if (!list.length) return [];
  const cover = coverage(list);
  if (cover.cells === cover.total) return [];
  return [label + ' 的模块只覆盖 ' + cover.cells + '/' + cover.total + ' 格（' + Math.round(cover.ratio * 100)
    + '%）：未覆盖的格就是读者看到的空白，布局必须把每一格交代清楚——要么被模块占用，要么声明为有意的 open 留白'];
};

/* 留白只有两种身份：被模块占用，或被声明为有意留白（fill:"open" + openWhy）。
   这一条是"不该存在的留白"的机器判据——没声明的空就是错，声明过的空才是设计。 */
const fillErrors = (layout, label = '') => {
  const at = (label || layout && layout.id || '布局') + ' ';
  const errors = [], modules = (layout && layout.modules) || [];
  const fill = layout && layout.fill;
  if (!['tiled', 'open'].includes(fill)) {
    errors.push(at + 'fill 须为 tiled（模块铺满网格）或 open（有意留白）');
    return errors;
  }
  const cover = coverage(modules);
  const percent = Math.round(cover.ratio * 100);
  if (fill === 'tiled' && cover.cells !== cover.total) {
    errors.push(at + 'fill="tiled" 但模块只覆盖 ' + cover.cells + '/' + cover.total + ' 格（' + percent
      + '%）：要么补齐模块，要么改声明 fill="open" 并写 openWhy 说明留白为什么服务阅读');
  }
  if (fill === 'open') {
    const why = String((layout && layout.openWhy) || '').replace(/\s+/g, ' ').trim();
    if (why.length < 12) errors.push(at + 'fill="open" 必须写 openWhy（≥12字）：说明这块留白承担什么，不能只写“呼吸感”');
    if (cover.ratio >= 1) errors.push(at + 'fill="open" 但模块已铺满网格：声明与事实不符，改回 tiled');
  }
  return errors;
};

/* 深模块才装得下图：带坐标轴、刻度与图例的表达（precision.* ≥400×260）在过小的格里必然失真。
   这不是形式选得对不对，而是"这个格物理上放不下"——放在选型之前就该知道。
   判定看槽位而不是看作者写没写 accepts：只要这一格在物理上容得下精确展品，就得提醒它容不下。 */
const PRECISE_FORMS = ['precision.columns', 'precision.stacked', 'precision.waterfall'];
const MIN_PRECISE = { width: 400, height: 260 };
const sizeWarnings = (modules, ratioId) => {
  const warnings = [];
  (modules || []).forEach((m, i) => {
    if (!m || !SLOTS.includes(m.slot)) return;
    if (!PRECISE_FORMS.some(form => slotAccepts(m.slot, form))) return;
    const rect = box(m, ratioId), inner = { width: rect.width - 2 * MODULE.pad, height: rect.height - 2 * MODULE.pad };
    if (inner.width < MIN_PRECISE.width || inner.height < MIN_PRECISE.height) {
      warnings.push('modules[' + i + '] 内区 ' + inner.width + '×' + inner.height + ' 小于精确展品下限 '
        + MIN_PRECISE.width + '×' + MIN_PRECISE.height + '：这一格装不下带坐标轴的精确展品，'
        + '只放配方图、卡片或自定义构图；要精确展品就换一条给它更大格子的布局');
    }
  });
  return warnings;
};

module.exports = {
  COLUMNS, ROWS, DEFAULT_RATIO, RATIOS, LINES, MODULE, SLOTS, FORM_SLOTS,
  ratioOf, span, content, body, box, innerHeight, lines, capacity, slotAccepts,
  boundsErrors, overlapErrors, coverage, zeroGapErrors, fillErrors, sizeWarnings
};
