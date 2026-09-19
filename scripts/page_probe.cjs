/* 逐页探针：QA 分档与作者单页自查共用同一套测量，避免两份实现漂移。
   这里只做测量与取证，不作审美判定，也不产出任何可被当成验收证据的清单。 */
'use strict';
const path = require('node:path');
const bookends = require('./check_bookends.cjs');
const geometry = require('./browser_geometry_audit.cjs');
const criticalContent = require('./critical_content.cjs');
const visualPolicy = require('./browser_visual_policy.cjs');
const fontAudit = require('./browser_font_audit.cjs');

/* 在真实页面上执行的 DOM 测量。自包含（不闭包外部变量），供 Playwright 序列化。 */
function inspectDom(s) {
  const box = s.getBoundingClientRect(), bad = [], tiny = [], smallData = [], unreadable = [], scaledSvg = [], logicalScale = box.width / s.offsetWidth;
  for (const e of s.querySelectorAll('*')) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || !r.height || cs.visibility === 'hidden') continue;
    if (r.left < box.left - 1 || r.top < box.top - 1 || r.right > box.right + 1 || r.bottom > box.bottom + 1) bad.push({tag: e.tagName, text: (e.textContent || '').slice(0, 80)});
    if (e.children.length === 0 && (e.textContent || '').trim() && parseFloat(cs.fontSize) < 12) tiny.push({text: e.textContent.slice(0, 40), font: cs.fontSize});
    let effective = parseFloat(cs.fontSize); if (e.tagName.toLowerCase() === 'text' && e.getScreenCTM) { const m = e.getScreenCTM(); effective *= Math.hypot(m.c, m.d) / logicalScale; }
    if (e.children.length === 0 && (e.textContent || '').trim() && effective < 10 && !e.closest('[data-decorative="true"]')) unreadable.push({text: e.textContent.slice(0, 40), effectiveFont: effective});
    if (e.tagName.toLowerCase() === 'text' && e.getScreenCTM) { const m = e.getScreenCTM(), effective = parseFloat(cs.fontSize) * Math.hypot(m.c, m.d) / logicalScale; if (effective < 13.5) smallData.push({text: e.textContent.slice(0, 40), effectiveFont: effective}); }
    if (['TD', 'TH'].includes(e.tagName) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) bad.push({tag: e.tagName, text: e.textContent.slice(0, 80), type: 'cell-overflow'});
  }
  /* 图表按真实逻辑像素渲染，靠 CSS 缩放它等于改掉内部每一个字号与偏移。
     配方图的渲染器会写下 data-actual-size，可以直接逐像素对账；手绘 SVG 没有这个属性，退回 viewBox。
     preserveAspectRatio 默认等比，决定字号的是较小的那一维，所以取两维缩放比的较小值。 */
  for (const e of s.querySelectorAll('.slide__body svg, .slide__body canvas')) {
    if (e.classList.contains('table-bar') || e.closest('[data-decorative="true"]')) continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const declared = /^(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)$/.exec(e.getAttribute('data-actual-size') || '');
    const view = (e.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const intrinsic = declared ? [Number(declared[1]), Number(declared[2])] : (view.length === 4 && view.every(Number.isFinite) ? [view[2], view[3]] : null);
    if (!intrinsic || !intrinsic[0] || !intrinsic[1]) continue;
    const rendered = [r.width / logicalScale, r.height / logicalScale];
    const scale = Math.min(rendered[0] / intrinsic[0], rendered[1] / intrinsic[1]);
    if (Math.abs(scale - 1) > 0.01) scaledSvg.push({source: declared ? 'data-actual-size' : 'viewBox', intrinsic: intrinsic.map(v => Math.round(v * 10) / 10), rendered: rendered.map(v => Math.round(v * 10) / 10), scale: Math.round(scale * 1000) / 1000});
  }
  const exhibits = [...s.querySelectorAll('svg,canvas,img,table')].filter(e => {
    const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[data-decorative="true"]');
  }).map((e, j) => {
    const id = 'p' + ([...s.parentElement.querySelectorAll('.slide')].indexOf(s) + 1) + '-ex' + j;
    e.setAttribute('data-deck-exhibit-id', id);
    return {id, tag: e.tagName, labels: [...e.querySelectorAll('text')].map(t => t.textContent.trim()).filter(Boolean)};
  });
  const textEvidence = [], walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT); let node;
  while (node = walker.nextNode()) {
    const text = node.nodeValue.trim(), parent = node.parentElement; if (!text || !parent || parent.closest('script,style,[data-decorative="true"]')) continue;
    const r = parent.getBoundingClientRect(), cs = getComputedStyle(parent); if (r.width && r.height && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0) textEvidence.push(text);
  }
  // 母版与组件合规提示：边界显式声明、双层边界、边条内边距（仅提示，不代替目视）
  const headerEl = s.querySelector('.slide__header'), frame = {boundary: s.getAttribute('data-frame-boundary'), ruleVisible: false, doubleBorder: []};
  if (headerEl) {
    const ac = getComputedStyle(headerEl, '::after').content;
    if (ac && ac !== 'none') {
      frame.ruleVisible = true;
      const body = s.querySelector('.slide__body');
      if (body) {
        const bodyTop = body.getBoundingClientRect().top;
        for (const e of body.querySelectorAll('*')) {
          const r = e.getBoundingClientRect(); if (r.height < 3 || Math.abs(r.top - bodyTop) > 12) continue;
          const cs = getComputedStyle(e);
          if (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none' && !/rgba?\([^)]*,\s*0\)|transparent/i.test(cs.borderTopColor)) {
            frame.doubleBorder.push((e.tagName + (e.className && typeof e.className === 'string' ? '.' + String(e.className).trim().replace(/\s+/g, '.').slice(0, 40) : '')).toLowerCase()); break;
          }
        }
      }
    }
  }
  const notePad = [], noteSeen = new Set();
  for (const e of s.querySelectorAll('*')) {
    if (noteSeen.has(e)) continue;
    const isNote = e.classList && e.classList.length > 0 && /annotation|decision-strip|evidence-note|callout|takeaway|insight/i.test(String(e.className));
    const leaf = !e.children.length && (e.textContent || '').trim();
    if (!isNote && !leaf) continue; if (e.closest('table,svg,[data-decorative="true"]')) continue;
    const cs = getComputedStyle(e);
    if (parseFloat(cs.borderLeftWidth) >= 2 && cs.borderLeftStyle !== 'none' && parseFloat(cs.paddingLeft) < 6 && e.getBoundingClientRect().height > 10) { noteSeen.add(e); notePad.push({cls: String(e.className).slice(0, 40), pad: cs.paddingLeft, text: (e.textContent || '').trim().slice(0, 40)}); }
  }
  return {
    exhibits, textEvidence, unreadableText: unreadable, form: s.dataset.form || null, visual: s.dataset.visual || '', proves: s.dataset.proves || '', densityProfile: s.dataset.densityProfile || '',
    title: s.querySelector('.slide__title,.cover-title,.divider-name')?.textContent || '',
    overflow: bad, tinyText: tiny, smallDataText: smallData, scaledSvg,
    charts: [...s.querySelectorAll('.chart')].map(e => ({width: e.clientWidth, height: e.clientHeight, rendered: !!e.querySelector('svg,canvas'), error: e.dataset.chartError || null, risks: e.dataset.chartRisks || null})),
    // 表格内的数据条 sparkline 也是 svg；不排除它，"整页图被换成带数据条的表"就会漏判。
    shapes: {svg: s.querySelectorAll('.slide__body svg:not(.table-bar)').length, sparklines: s.querySelectorAll('.slide__body svg.table-bar').length, tables: s.querySelectorAll('.slide__body table').length},
    textLength: s.innerText.length, frame, notePad
  };
}

/* 与 QA 同一套翻页方式；深链依赖引擎的 hash 导航，这里沿用键盘以保持状态一致。 */
async function activate(page, index) {
  await page.keyboard.press('Home');
  for (let k = 0; k < index; k++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  await geometry.settle(page);
}

/* 逐页测量。modern 时附带关键内容与视觉禁令检查，与正式审计保持同一判据。 */
async function collect(page, index, {modern = false} = {}) {
  await activate(page, index);
  const slide = page.locator('.slide.active');
  const result = await slide.evaluate(inspectDom);
  result.page = index + 1;
  result.bookends = await slide.evaluate(bookends.inspectPage);
  if (modern) {
    result.critical = await slide.evaluate(criticalContent.inspectSlide);
    result.visualPolicy = await slide.evaluate(visualPolicy.inspectSlide);
  }
  result.relations = await slide.evaluate(geometry.inspectSlide);
  result.fonts = await fontAudit.inspect(page);
  result.layoutSignature = await fontAudit.signature(page);
  return result;
}

function screenshotName(pageNumber) {
  return 'p' + String(pageNumber).padStart(2, '0') + '.png';
}

/* 单页自查的紧凑摘要：只列可执行结论，不冒充验收状态。 */
function summarize(row) {
  const errors = [], warnings = [];
  for (const item of row.overflow || []) errors.push({code: 'OVERFLOW', ...item});
  for (const item of row.unreadableText || []) errors.push({code: 'UNREADABLE-TEXT', ...item});
  for (const chart of row.charts || []) if (!chart.rendered || chart.error) errors.push({code: 'CHART-NOT-RENDERED', ...chart});
  for (const item of row.relations?.errors || []) errors.push({code: item.code || 'GEOMETRY', ...item});
  for (const item of row.visualPolicy?.errors || []) errors.push({code: item.code || 'VISUAL', ...item});
  for (const item of row.visualPolicy?.warnings || []) warnings.push({code: item.code || 'VISUAL-WARN', ...item});
  for (const item of row.tinyText || []) warnings.push({code: 'TINY-TEXT', ...item});
  // 配方图是按真实逻辑像素渲染的，缩放它等于偷偷改字号；手绘图缩不缩是作者的选择，只提示。
  for (const item of row.scaledSvg || []) {
    const detail = '按 ' + item.source + ' ' + item.intrinsic.join('×') + ' 渲染，实际占位 ' + item.rendered.join('×') + '（缩放 ' + item.scale + '）';
    const advice = item.source === 'data-actual-size'
      ? '：配方图不能靠 CSS 缩放，缩放会改掉内部所有字号与偏移。改 exhibits 的 width/height，或改版位比例'
      : '：手绘 SVG 缩放会连带改变内部文字的实际字号，确认是有意的';
    const item2 = {code: 'SVG-SCALED', source: item.source, scale: item.scale, message: detail + advice};
    if (item.source === 'data-actual-size') errors.push(item2); else warnings.push(item2);
  }
  for (const item of row.smallDataText || []) warnings.push({code: 'SMALL-DATA-TEXT', ...item});
  if (row.fonts?.identity === 'FAIL') errors.push({code: 'FONT-IDENTITY', message: fontAudit.describe(row.fonts)});
  if (!row.frame?.boundary) errors.push({code: 'FRAME-BOUNDARY-MISSING', message: '未显式声明 data-frame-boundary'});
  if (row.frame?.ruleVisible && row.frame.doubleBorder.length) warnings.push({code: 'DOUBLE-BORDER', cls: row.frame.doubleBorder[0], message: '标题区隔线与正文首排顶线可能并存'});
  // 需要人工确认的路径原样带出：它们不是通过，也不该在摘要里被压成一句"已检查"。
  const manual = (row.visualPolicy?.findings || []).map(f => ({code: f.code, selector: f.selector, message: f.message}));
  return {errors, warnings, manual};
}

module.exports = {inspectDom, activate, collect, screenshotName, summarize};
