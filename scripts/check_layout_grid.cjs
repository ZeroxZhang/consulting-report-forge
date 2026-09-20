/* 布局目录 × CSS 的像素核对。
   目录里的 c/r/w/h 只是算术；真正决定成品长什么样的是 assets/consulting-layouts.css 里
   由 scripts/build_layout_css.cjs 生成的那段落位规则。两者一旦漂移，作者按目录选布局、
   QA 按目录量矩形，就会同时错得很一致，谁都发现不了。
   这里刻意不注入任何内联样式：页面只写 data-layout 与按序的 data-module，走的正是作者走的
   那条路——所以这个脚本验的不只是算术，是"作者照目录写标签，成品真的落在格线上"。
   跑法：node scripts/check_layout_grid.cjs [16x9|4x3|both]（默认 both）
   需要本机 Chrome；不属于 npm test —— 它是改布局 CSS 后的定点核对，不是每次提交的回归。 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const grid = require(path.join(ROOT, 'assets', 'deck-grid.js'));
const layouts = require('./layout_contract.cjs');
const TOLERANCE = 0.35;
// 临时页放在系统临时目录：核对是定点动作，不该在仓库里留下文件。
const SCRATCH = path.join(os.tmpdir(), 'deck-layout-grid-check.html');

function buildHtml(refs) {
  const engine = fs.readFileSync(path.join(ROOT, 'assets', 'deck_engine.html'), 'utf8');
  const geometryCss = fs.readFileSync(path.join(ROOT, 'assets', 'deck-geometry.css'), 'utf8');
  const layoutCss = fs.readFileSync(path.join(ROOT, 'assets', 'consulting-layouts.css'), 'utf8');
  // 每格塞一个空展品：这里量的是格子本身，不是格子里装了什么。
  // 不给任何内联几何——落位必须由 data-layout + data-module 顺序从 CSS 里取到，否则这个核对就没意义。
  const slides = refs.map(ref => {
    const layout = layouts.get(ref);
    const modules = layout.modules.map(m => `<div data-module="${m.slot}"></div>`).join('');
    return `<section class="slide reading active" data-layout="${ref}" data-form="html.text" data-frame-boundary="line" data-page-role="analysis" data-density-profile="balanced" data-proves="grid-check">
  <header class="slide__header"><h1 class="slide__title">网格核对：${layout.name}</h1></header>
  <div class="slide__body">${modules}</div>
  <div class="source">来源：网格核对</div>
</section>`;
  }).join('\n');
  return engine
    .replace('</head>', `<style id="deck-geometry">${geometryCss}</style><style id="deck-layouts">${layoutCss}</style></head>`)
    .replace(/<section [^>]*class="slide[\s\S]*?<\/section>/g, '')
    .replace('</body>', slides + '</body>');
}

/* 在真实页面上量：逻辑坐标 = 视口坐标 / 缩放比。目录与 CSS 的差异只会出现在这里。 */
function measureInPage(expected) {
  const out = [];
  const slides = [...document.querySelectorAll('.slide')];
  expected.forEach((item, index) => {
    const slide = slides[index];
    if (!slide) { out.push({ref: item.ref, error: 'slide missing'}); return; }
    const sr = slide.getBoundingClientRect();
    const sx = sr.width / slide.offsetWidth, sy = sr.height / slide.offsetHeight;
    const nodes = [...slide.querySelectorAll('[data-module]')];
    const rows = [];
    if (nodes.length !== item.boxes.length) out.push({ref: item.ref, error: 'count ' + nodes.length + '≠' + item.boxes.length});
    nodes.forEach((node, i) => {
      const want = item.boxes[i];
      if (!want) return;
      if (node.dataset.module !== want.slot) { rows.push({i, error: 'slot ' + node.dataset.module + '≠' + want.slot}); return; }
      const r = node.getBoundingClientRect();
      const got = {x: (r.left - sr.left) / sx, y: (r.top - sr.top) / sy, width: r.width / sx, height: r.height / sy};
      const delta = {x: got.x - want.box.x, y: got.y - want.box.y, width: got.width - want.box.width, height: got.height - want.box.height};
      const rounded = Object.fromEntries(Object.entries(delta).map(([k, v]) => [k, Math.round(v * 100) / 100]));
      rows.push({i, slot: want.slot, worst: Math.max(...Object.values(delta).map(Math.abs)), delta: rounded, want: want.box, got});
    });
    out.push({ref: item.ref, name: item.name, slideSize: {w: slide.offsetWidth, h: slide.offsetHeight}, scale: {sx, sy}, rows});
  });
  return out;
}

async function sweep(chromium, ratio, refs) {
  const page = await chromium.newPage({viewport: {width: 1400, height: 820}});
  await page.goto('file://' + SCRATCH, {waitUntil: 'domcontentloaded'});
  if (ratio === '4x3') await page.evaluate(() => document.body.setAttribute('data-ratio', '4x3'));
  await page.evaluate(() => document.fonts.ready);
  const expected = refs.map(ref => ({ref, name: layouts.get(ref).name, boxes: layouts.measure(ref, ratio).modules.map(m => ({slot: m.slot, box: m.box}))}));
  const report = await page.evaluate(measureInPage, expected);
  await page.close();

  const bad = [];
  let worst = 0;
  for (const item of report) {
    if (item.error) { bad.push(item.ref + '：' + item.error); continue; }
    for (const row of item.rows) {
      if (row.error) { bad.push(item.ref + ' #' + row.i + ' ' + row.error); continue; }
      worst = Math.max(worst, row.worst);
      if (row.worst > TOLERANCE) bad.push(item.ref + ' 第 ' + (row.i + 1) + ' 格（' + row.slot + '）偏差 ' + Math.round(row.worst * 100) / 100 + 'px：期望 ' + JSON.stringify(row.want) + '，实际 ' + JSON.stringify(row.got));
    }
  }
  return {ratio, layouts: report.length, maxDeviation: Math.round(worst * 1000) / 1000, tolerance: TOLERANCE, pass: !bad.length, bad};
}

(async () => {
  const requested = process.argv[2] || 'both';
  const ratios = requested === 'both' ? ['16x9', '4x3'] : [requested];
  for (const ratio of ratios) {
    if (!grid.RATIOS || !grid.RATIOS[ratio]) throw new Error('未知比例 ' + ratio + '（可用：16x9、4x3 或 both）');
  }
  const refs = layouts.list().map(l => l.id);
  // 目录里每一条都得能渲染；渲染不成就是目录本身坏了，先在这里拦住。
  const catalog = layouts.catalogErrors();
  if (catalog.length) throw new Error('布局目录自检未通过，先修目录再核对网格：\n  ' + catalog.join('\n  '));

  fs.writeFileSync(SCRATCH, buildHtml(refs));
  const {chromium} = require(path.join(ROOT, 'node_modules', 'playwright'));
  const browser = await chromium.launch({channel: process.env.CHROME_CHANNEL || 'chrome', headless: true});
  let failed = false;
  try {
    for (const ratio of ratios) {
      const result = await sweep(browser, ratio, refs);
      console.log(JSON.stringify(result, null, 2));
      if (!result.pass) failed = true;
    }
  } finally {
    await browser.close();
    fs.rmSync(SCRATCH, {force: true});
  }
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
