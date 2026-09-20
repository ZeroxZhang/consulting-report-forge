'use strict';
/* 网格是几何权威：JS 常量、CSS 变量、形式槽位三处必须同步，任何一处单独改动都会在这里失败。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const grid = require('../assets/deck-grid.js');
const forms = require('../assets/deck-forms.js');

const ratios = Object.keys(grid.RATIOS);
let checks = 0;
const ok = (label, condition) => { assert.ok(condition, label); checks += 1; };

/* —— 1. 整数与整除：栏宽 / 行高必须正好铺满版心，否则模块坐标会落在网格线之间 —— */
for (const id of ratios) {
  const r = grid.ratioOf(id), area = grid.content(id), body = grid.body(id);
  ok(id + ' 栏宽铺满版心', grid.span(grid.COLUMNS, r.columnWidth, r.gutter) === area.width);
  ok(id + ' 行高铺满正文区', body.height === grid.span(grid.ROWS, r.rowHeight, r.gutter));
  ok(id + ' 三段带高等于版心高', r.titleBand + body.height + r.sourceBand === area.height);
  ok(id + ' 正文区起点 = 上边距 + 标题带', body.y === r.pad.top + r.titleBand);
  ok(id + ' 正文区在版心内', body.y + body.height <= r.pad.top + area.height);
  ok(id + ' 画幅尺寸与版心一致', area.width === r.canvas.width - r.pad.left - r.pad.right);
  [r.columnWidth, r.rowHeight, r.gutter, r.titleBand, r.sourceBand, grid.LINES.body, grid.LINES.note, grid.MODULE.pad, grid.MODULE.titleBand, grid.MODULE.unitBand]
    .forEach(value => ok(id + ' 常量 ' + value + ' 为整数', Number.isInteger(value)));
}

/* —— 2. 模块几何：第 1 栏贴左边界、第 12 栏贴右边界、第 6 行贴底 —— */
for (const id of ratios) {
  const area = grid.content(id), body = grid.body(id), r = grid.ratioOf(id);
  const full = grid.box({c: 1, r: 1, w: 12, h: 6}, id);
  ok(id + ' 满幅模块 = 正文区', full.x === body.x && full.y === body.y && full.width === body.width && full.height === body.height);
  const last = grid.box({c: 12, r: 6, w: 1, h: 1}, id);
  ok(id + ' 末格贴右缘', last.x + last.width === area.x + area.width);
  ok(id + ' 末格贴底缘', last.y + last.height === body.y + body.height);
  const third = grid.box({c: 3, r: 2, w: 1, h: 1}, id);
  ok(id + ' 单栏模块宽 = 栏宽', third.width === r.columnWidth);
  ok(id + ' 单行模块高 = 行高', third.height === r.rowHeight);
  const second = grid.box({c: 2, r: 1, w: 1, h: 1}, id);
  ok(id + ' 相邻模块间距 = 间距', third.x - (second.x + r.columnWidth) === r.gutter);
  ok(id + ' 相邻行间距 = 间距', grid.box({c: 1, r: 3, w: 1, h: 1}, id).y - (grid.box({c: 1, r: 2, w: 1, h: 1}, id).y + r.rowHeight) === r.gutter);
}

/* —— 3. 容量核算：只增不减，且标题带/单位行确实吃掉一行 —— */
for (const id of ratios) {
  for (let h = 1; h <= grid.ROWS; h++) {
    const cap = grid.capacity(h, id);
    ok(id + ' h=' + h + ' 容量单调', h === 1 || cap.body.plain >= grid.capacity(h - 1, id).body.plain);
    ok(id + ' h=' + h + ' 标题不增行', cap.body.titled <= cap.body.plain);
    ok(id + ' h=' + h + ' 单位行不增行', cap.body.titledUnit <= cap.body.titled);
    ok(id + ' h=' + h + ' 注释行不小于正文行', cap.note.titledUnit >= cap.body.titledUnit);
  }
  /* 1 行模块带标题就放不下整行正文的结论必须成立：它是"这一格只能放数字或一行标签"的算术依据。
     不带标题时各画幅行高不同（16:9 行 71 装 1 行、4:3 行 80 装 2 行），所以只断言"至少一行"。 */
  ok(id + ' h=1 无标题至少一行', grid.capacity(1, id).body.plain >= 1);
  ok(id + ' h=1 带标题放不下正文', grid.capacity(1, id).body.titled === 0);
}

/* —— 4. CSS 镜像：--grid-* 变量必须等于 JS 常量，防止样式与核算各说各话 —— */
const css = fs.readFileSync(path.join(__dirname, '../assets/deck-geometry.css'), 'utf8');
const cssVars = block => Object.fromEntries([...block.matchAll(/--grid-([a-z-]+)\s*:\s*([^;}]+)/g)].map(m => [m[1], m[2].trim()]));
const rootBlock = css.match(/:root\{[^}]*\}/)[0];
const wideBlock = css.match(/body\[data-ratio="4x3"\]\{[^}]*\}/)[0];
const px = value => Number(String(value).replace('px', ''));
const wide = grid.ratioOf('16x9'), tall = grid.ratioOf('4x3');
const mirror = [
  ['root', cssVars(rootBlock), wide], ['4x3', cssVars(wideBlock), tall]
];
for (const [label, vars, r] of mirror) {
  ok(label + ' --grid-gutter', px(vars.gutter) === r.gutter);
  ok(label + ' --grid-column-width', px(vars['column-width']) === r.columnWidth);
  ok(label + ' --grid-row-height', px(vars['row-height']) === r.rowHeight);
  ok(label + ' --grid-title-band', px(vars['title-band']) === r.titleBand);
  ok(label + ' --grid-body-height', px(vars['body-height']) === grid.body(label === 'root' ? '16x9' : '4x3').height);
}
ok('根变量 --grid-columns', px(cssVars(rootBlock).columns) === grid.COLUMNS);
ok('根变量 --grid-rows', px(cssVars(rootBlock).rows) === grid.ROWS);
ok('根变量 --grid-line', px(cssVars(rootBlock).line) === grid.LINES.body);
ok('根变量 --grid-note-line', px(cssVars(rootBlock)['note-line']) === grid.LINES.note);
ok('根变量 --grid-module-pad', px(cssVars(rootBlock)['module-pad']) === grid.MODULE.pad);
ok('根变量 --grid-module-title', px(cssVars(rootBlock)['module-title']) === grid.MODULE.titleBand);
ok('根变量 --grid-module-unit', px(cssVars(rootBlock)['module-unit']) === grid.MODULE.unitBand);
/* 网格只在 layout 页生效：历史页保持 fr 分栏，重新打包不会变形。 */
const layouts = fs.readFileSync(path.join(__dirname, '../assets/consulting-layouts.css'), 'utf8');
ok('网格块以 reading[data-layout] 限定', /\.slide\.reading\[data-layout\]\s*\.slide__body\{/.test(layouts));
ok('标题带与正文区用 flex 基准而非 display', !/\.slide\.reading\[data-layout\]\s*\{[^}]*display:/.test(layouts));

/* —— 5. 形式槽位：每个形式都得有明确的槽位归属，缺一个就会让布局声明无从校验 —— */
for (const form of forms.list()) {
  ok(form + ' 已登记槽位', Array.isArray(grid.FORM_SLOTS[form]) && grid.FORM_SLOTS[form].length > 0);
  grid.FORM_SLOTS[form].forEach(slot => ok(form + ' 槽位 ' + slot + ' 合法', grid.SLOTS.includes(slot)));
}
ok('槽位表无多余条目', Object.keys(grid.FORM_SLOTS).every(form => forms.list().includes(form)));
ok('head/source 不接受任何形式', forms.list().every(form => !grid.FORM_SLOTS[form].includes('head') && !grid.FORM_SLOTS[form].includes('source')));
ok('表格进 table 槽', grid.slotAccepts('table', 'html.table') && !grid.slotAccepts('chart', 'html.table'));
ok('卡片组进 kpi 槽', grid.slotAccepts('kpi', 'html.kpi') && !grid.slotAccepts('chart', 'html.kpi'));
ok('子弹图可进 chart 槽', grid.slotAccepts('chart', 'kit.bullet') && grid.slotAccepts('kpi', 'kit.bullet'));
ok('自定义构图不受槽位限制', grid.SLOTS.filter(s => s !== 'head' && s !== 'source').every(slot => grid.slotAccepts(slot, 'svg.custom')));

/* —— 6. 几何校验：越界与重叠必须报错，否则模块坐标这个合同形同虚设 —— */
assert.deepEqual(grid.boundsErrors([{c: 1, r: 1, w: 12, h: 6}]), []);
ok('越界报错', grid.boundsErrors([{c: 10, r: 1, w: 4, h: 2}]).some(e => /横向越界/.test(e)));
ok('越行报错', grid.boundsErrors([{c: 1, r: 5, w: 2, h: 3}]).some(e => /纵向越界/.test(e)));
ok('非整数报错', grid.boundsErrors([{c: 1.5, r: 1, w: 2, h: 2}]).length > 0);
assert.deepEqual(grid.overlapErrors([{c: 1, r: 1, w: 6, h: 6}, {c: 7, r: 1, w: 6, h: 6}]), []);
ok('重叠报错', grid.overlapErrors([{c: 1, r: 1, w: 8, h: 4}, {c: 5, r: 1, w: 8, h: 4}]).length > 0);
assert.deepEqual(grid.overlapErrors([{c: 1, r: 1, w: 6, h: 3}, {c: 1, r: 4, w: 6, h: 3}]), []);
ok('满幅覆盖无缺口', grid.zeroGapErrors([{c: 1, r: 1, w: 12, h: 6}]).length === 0);
ok('缺口被报出', grid.zeroGapErrors([{c: 1, r: 1, w: 6, h: 6}]).some(e => /只覆盖 36\/72 格/.test(e)));
ok('覆盖计数正确', grid.coverage([{c: 1, r: 1, w: 6, h: 6}, {c: 7, r: 1, w: 6, h: 3}]).cells === 54);

console.log(JSON.stringify({
  pass: true, checks, ratios,
  grid: Object.fromEntries(ratios.map(id => [id, {
    columnWidth: grid.ratioOf(id).columnWidth, rowHeight: grid.ratioOf(id).rowHeight, gutter: grid.ratioOf(id).gutter,
    body: grid.body(id).height, titleBand: grid.ratioOf(id).titleBand, sourceBand: grid.ratioOf(id).sourceBand
  }])),
  capacity16x9: Array.from({length: grid.ROWS}, (_, i) => grid.capacity(i + 1, '16x9').body)
}));
