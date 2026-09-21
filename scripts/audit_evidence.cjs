/* 将真实渲染产物绑定到媒介、页身份、内容和公共依赖；不证明审查者已经看过。 */
const path = require('node:path');
const {hash, fileHash, stable} = require('./report_contract.cjs');

/* 在浏览器里按"这条规则可能作用到哪些页"分桶，得到页级失效半径。
   判据只能保守：只要不能证明一条规则只落在某一页内，就归全局。
   作用域判错会让没重看过的页面被当成已审查，所以宁可多失效，不可少失效。 */
function captureDocument() {
  const slides = [...document.querySelectorAll('.slide')], buckets = slides.map(() => []), globalStyles = [];
  const scopeOf = selectorText => {
    const parts = String(selectorText || '').split(',').map(t => t.trim()).filter(Boolean);
    if (!parts.length) return null;
    const hit = new Set();
    for (const part of parts) {
      if (part.includes('::')) return null;
      let found;
      try { found = [...document.querySelectorAll(part)]; } catch { return null; }
      if (!found.length) return null;
      for (const el of found) {
        // 命中的元素必须落在某一张幻灯片内；html/body/外层容器命中的是全部页面，按全局处理。
        const index = slides.findIndex(s => s === el || s.contains(el));
        if (index < 0) return null;
        hit.add(index);
      }
    }
    return [...hit];
  };
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { globalStyles.push('OPAQUE_STYLESHEET:' + (sheet.href || 'inline')); continue; }
    for (const rule of rules) {
      // @media/@font-face/@keyframes/@page 以及任何非普通规则都可能跨页生效。
      if (rule.type !== CSSRule.STYLE_RULE) { globalStyles.push(rule.cssText); continue; }
      const targets = scopeOf(rule.selectorText);
      if (!targets) globalStyles.push(rule.cssText);
      else for (const index of targets) buckets[index].push(rule.cssText);
    }
  }
  const pages = slides.map((s, i) => {
    const copy = s.cloneNode(true); copy.classList.remove('active');
    for (const e of copy.querySelectorAll('[data-deck-exhibit-id]')) e.removeAttribute('data-deck-exhibit-id');
    return {page: i + 1, pageId: s.dataset.pageId || 'page-' + (i + 1), content: copy.outerHTML, styles: buckets[i]};
  });
  // 字体子集字节会随任意一次改字而变，全部页面跟着失效；这里沿用原有的归一化，字体的身份由 deck-font-manifest 承担。
  const styles = globalStyles.join('\n')
    .replace(/data:font\/[^;]+;base64,[A-Za-z0-9+/=]+/g, 'FONT-SUBSET')
    .replace(/unicode-range\s*:[^;}]+;?/gi, '');
  const scripts = [...document.scripts].filter(e => !['deck-task-contract', 'deck-font-manifest', 'deck-pdf-payload'].includes(e.id)).map(e => e.outerHTML);
  const manifest = JSON.parse(document.getElementById('deck-font-manifest')?.textContent || '{}');
  const fonts = {...manifest, faces: (manifest.faces || []).map(({subset_sha256, subset_bytes, sample, ...face}) => face)};
  return {pages, dependencies: {styles, scripts, fonts, ratio: document.body.dataset.ratio}};
}
function manifest(snapshot, rows, pdfRows, artifacts, task, directory, environment) {
  // pages/blueprint 绑定输入记录；v4 的逐页 contentHash 已在 section 中，由 pageSha256 捕捉。
  // 改一页不连带作废其他页。全局分析/证据/视觉结论从不由继承准备工具代填。
  const deckTask = task ? Object.fromEntries(Object.entries(task).filter(([key]) => !['pages', 'blueprint'].includes(key))) : null;
  const dependenciesSha256 = hash(stable({dependencies: snapshot.dependencies, task: deckTask, environment}));
  if (new Set(snapshot.pages.map(p => p.pageId)).size !== snapshot.pages.length) throw Error('data-page-id重复，无法绑定页身份');
  const entries = [];
  for (const source of snapshot.pages) {
    if (!/^[\w-]+$/.test(source.pageId)) throw Error('data-page-id须为字母数字下划线或连字符');
    if (!Array.isArray(source.styles)) throw Error('证据快照缺少逐页样式作用域，无法计算页级失效半径');
    const common = {page: source.page, pageId: source.pageId, pageSha256: hash(source.content), pageStyleSha256: hash(stable(source.styles)), dependenciesSha256};
    for (const medium of ['html', 'pdf']) {
      const file = medium === 'html' ? path.resolve(directory, rows[source.page - 1].screenshot) : pdfRows.find(p => p.page === source.page)?.path;
      if (!file) continue;
      entries.push({...common, id: medium + ':' + source.pageId, medium, path: path.relative(directory, file), sha256: fileHash(file), sourceSha256: artifacts[medium].sha256});
    }
  }
  return {version: 1, entries, dependenciesSha256, scope: '真实HTML截图和实际PDF栅格图；归属与字节可核对，目视审查另记'};
}
module.exports = {captureDocument, manifest};
