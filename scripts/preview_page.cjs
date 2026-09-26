/* 作者单页自查入口：出图 + 便宜检查，供 S3/S4 边做边看。
   它不生成 audit.json、证据清单或任何验收结论——迭代产物在物理上不能冒充验收证据。 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), {pathToFileURL} = require('node:url');
const pageProbe = require('./page_probe.cjs');
const fontAudit = require('./browser_font_audit.cjs');
const criticalContent = require('./critical_content.cjs');
function playwright() { try { return require('playwright'); } catch { const name = process.env.PLAYWRIGHT_MODULE; if (!name) throw Error('单页预览需要与QA相同的Playwright/Chrome；设置PLAYWRIGHT_MODULE或安装运行依赖'); return require(name); } }
function usage() { return '用法：node scripts/preview_page.cjs deck.html <页码,页码|--all> [--out 目录] [--json]'; }
function args(argv) {
  const out = {out: 'renders', json: false, all: false, pages: []};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--all') { out.all = true; continue; }
    if (value === '--json') { out.json = true; continue; }
    if (value === '--out') { out.out = argv[++i]; continue; }
    if (value === '--pages') { out.pages.push(...String(argv[++i] || '').split(',').map(v => Number(v.trim()))); continue; }
    if (value.startsWith('--')) throw Error('未知参数: ' + value + '；' + usage());
    if (!out.file) { out.file = value; continue; }
    out.pages.push(Number(value));
  }
  if (!out.file) throw Error(usage());
  if (!out.all && !out.pages.length) throw Error('需要页码或 --all；' + usage());
  return out;
}
async function preview(options = {}) {
  const input = path.resolve(options.file || ''), out = path.resolve(options.out || 'renders');
  if (!fs.statSync(input, {throwIfNoEntry: false})?.isFile()) throw Error('需要 deck.html 文件');
  fs.mkdirSync(out, {recursive: true});
  const browser = await playwright().chromium.launch({channel: process.env.CHROME_CHANNEL || 'chrome', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1400, height: 820}}), problems = [];
    page.on('pageerror', e => problems.push(e.message));
    page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
    await fontAudit.attach(page);
    await page.goto(pathToFileURL(input).href, {waitUntil: 'networkidle'});
    await page.evaluate(() => window.deckReady || document.fonts.ready);
    const total = await page.locator('.slide').count();
    if (!total) throw Error('没有幻灯片');
    const modern = await page.evaluate(() => document.documentElement.dataset.reliabilityVersion === '2');
    const readingShadow=await page.evaluate(()=>JSON.parse(document.getElementById('deck-task-contract')?.textContent||'null')?.version===3);
    const requested = options.all ? Array.from({length: total}, (_, i) => i + 1) : [...new Set(options.pages)];
    const outOfRange = requested.filter(n => !Number.isInteger(n) || n < 1 || n > total);
    if (outOfRange.length) problems.push('页码无效或超出范围，已跳过：' + outOfRange.join(','));
    const targets = requested.filter(n => Number.isInteger(n) && n >= 1 && n <= total).sort((a, b) => a - b);
    if (!targets.length) throw Error('没有可预览的页码；本稿共 ' + total + ' 页');
    const rows = [];
    for (const number of targets) {
      const row = await pageProbe.collect(page, number - 1, {modern,readingShadow});
      row.screenshot = pageProbe.screenshotName(number);
      await page.locator('.slide.active').screenshot({path: path.join(out, row.screenshot)});
      row.review = pageProbe.summarize(row);
      rows.push(row);
    }
    // 关键语义只在作者显式声明时核对；打印与 PDF 位置属于冒烟/验收档，不在这里重复。
    // 本次只看部分页时按范围核对：范围外的关键语义列入 uncovered，不当阻塞报出来。
    const contract = modern ? require('./report_contract.cjs').read(fs.readFileSync(input, 'utf8')) : null;
    const critical = criticalContent.verifyScoped(contract, rows);
    const criticalErrors = critical.errors.map(message => ({page: 0, message}));
    const flatten = (key, code) => rows.flatMap(r => (r.review[key] || []).map(item => ({page: r.page, code, ...item})));
    return {
      file: input, out, total, partial: await page.evaluate(() => Number(document.documentElement.dataset.assemblyPartial) || null),
      pages: rows.map(r => r.page), shots: rows.map(r => r.screenshot),
      uncovered: critical.uncovered,
      errors: [...flatten('errors').map(e => ({page: e.page, code: e.code, detail: e.message || e.text || e.error || ''})), ...criticalErrors.map(c => ({page: 0, code: 'CRITICAL', detail: c.message})), ...problems.map(p => ({page: 0, code: 'RUNTIME', detail: p}))],
      warnings: flatten('warnings').map(w => ({page: w.page, code: w.code, detail: w.message || w.text || ''})),
      manual: flatten('manual', 'MANUAL').map(m => ({page: m.page, code: m.code, detail: m.message || ''}))
    };
  } finally { await browser.close(); }
}
function report(summary, json) {
  if (json) { console.log(JSON.stringify(summary, null, 2)); return; }
  console.log('单页自查：' + summary.file + '（共 ' + summary.total + ' 页，本次看 ' + summary.pages.length + ' 页）');
  if (summary.partial) console.log('  ⚠ 这是只装了前 ' + summary.partial + ' 页正文的制作期切片，不能当作交付成稿。');
  for (const shot of summary.shots) console.log('  截图 ' + path.join(summary.out, shot));
  // 范围外的关键语义是"这次没看"，不是"没落实"；整册验收会核对，这里只交代清楚。
  if (summary.uncovered?.length) console.log('  本次未覆盖的关键语义（在未装配的页上，整册验收时才核对）：' + summary.uncovered.join('、'));
  const list = (title, items) => {
    if (!items.length) return;
    console.log(title + '（' + items.length + '）：');
    for (const item of items.slice(0, 12)) console.log('  第' + item.page + '页 ' + item.code + (item.detail ? ' ' + item.detail : ''));
    if (items.length > 12) console.log('  …另有 ' + (items.length - 12) + ' 条');
  };
  list('阻塞', summary.errors);
  list('需目视判断', summary.warnings);
  list('必须实际看图', summary.manual);
  console.log('以上只覆盖可自动测量的部分；这一页是否成立，仍然要打开截图自己看。');
}
if (require.main === module) {
  try {
    const options = args(process.argv.slice(2));
    preview(options)
      .then(summary => { report(summary, options.json); if (summary.errors.length) process.exitCode = 1; })
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {preview, args};
