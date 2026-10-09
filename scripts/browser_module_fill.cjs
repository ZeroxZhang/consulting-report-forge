/* 正文模块与每栏的实测空白诊断。自包含以供 Playwright evaluate；不生成审美 PASS。 */
'use strict';
function inspectSlide(slide) {
  const limitation = '仅测量当前媒介的可见 HTML 文字行框与整体媒体矩形；占用率不是默认字号/默认间距下的填充率。SVG/位图内部、复杂裁切/遮挡、旋转与未识别子模块须结合 HTML/PDF 实际审查；无候选不证明通过。';
  const body = slide.querySelector('.slide__body');
  if (!body || ['cover', 'references', 'back-cover', 'divider'].includes(slide.dataset.pageRole)) return {version: 1, regions: [], limitation};
  const sr = slide.getBoundingClientRect(), sx = sr.width / (slide.offsetWidth || sr.width) || 1, sy = sr.height / (slide.offsetHeight || sr.height) || 1;
  const round = n => Math.round(n * 100) / 100;
  const box = r => ({x: (r.left - sr.left) / sx, y: (r.top - sr.top) / sy, width: r.width / sx, height: r.height / sy});
  const rounded = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round(v)]));
  const selector = el => {
    const parts = [];
    for (let n = el; n && n !== slide; n = n.parentElement) {
      if (!n.parentElement) break;
      parts.unshift(n.localName + ':nth-child(' + (Array.prototype.indexOf.call(n.parentElement.children, n) + 1) + ')');
    }
    return ':scope' + (parts.length ? ' > ' + parts.join(' > ') : '');
  };
  const shown = (el, needsBox = true) => {
    if (!el || needsBox && !el.getClientRects().length || getComputedStyle(el).visibility !== 'visible') return false;
    for (let n = el; n && n !== slide.parentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      // contents 不生成盒；盒级 opacity/filter/裁切不会作用于其实际可见的子节点。
      if (s.display === 'none' || s.display !== 'contents' && (+s.opacity === 0 || s.contentVisibility === 'hidden' || /opacity\(\s*0(?:\.0+)?%?\s*\)/.test(s.filter || ''))) return false;
    }
    return true;
  };
  const intersect = (a, b) => {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return {x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y)};
  };
  const contentBox = el => {
    const r = box(el.getBoundingClientRect()), cs = getComputedStyle(el);
    const amount = name => parseFloat(cs[name]) || 0;
    const left = amount('borderLeftWidth') + amount('paddingLeft'), right = amount('borderRightWidth') + amount('paddingRight');
    const top = amount('borderTopWidth') + amount('paddingTop'), bottom = amount('borderBottomWidth') + amount('paddingBottom');
    return {x: r.x + left, y: r.y + top, width: Math.max(0, r.width - left - right), height: Math.max(0, r.height - top - bottom)};
  };
  const mediaSelector = 'svg,img,canvas,video,object,iframe,table';
  const layoutSelector = '.layout-split,.layout-three,.layout-paired,.layout-stack,.evidence-grid,.proof-layout,.precision-row,.kpi-grid';
  const explicitSelector = '[data-fill-region],[data-fill-column],[data-module],[data-panel-id],.module,.panel,.card,.kpi-card,.exhibit,.finding,.annotation,.evidence-note,.decision-strip';
  const roots = new Map([[body, 'body']]);
  const addRoot = (el, kind) => {
    if (!body.contains(el) || el.closest(mediaSelector) || !shown(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (!roots.has(el) || el.hasAttribute('data-fill-column')) roots.set(el, el.hasAttribute('data-fill-column') ? 'column' : kind);
  };
  for (const el of body.querySelectorAll(explicitSelector)) addRoot(el, 'module');
  // 这些是仓库真实布局组件；不将每个普通文字父框猜作一栏。
  for (const layout of [body, ...body.querySelectorAll(layoutSelector)]) if (layout.matches(layoutSelector)) {
    const stacked = layout.matches('.layout-stack');
    for (const child of layout.children) addRoot(child, stacked ? 'module' : 'column');
  }
  for (const child of body.children) if (child.matches('div,section,article,aside,main') && !child.matches(layoutSelector)) addRoot(child, 'module');
  const ordered = [body, ...body.querySelectorAll('*')].filter(el => roots.has(el) && shown(el));
  const atoms = [], unsupported = new Set();
  const mediaRoots = [...body.querySelectorAll(mediaSelector)].filter(el => shown(el) && !el.parentElement.closest(mediaSelector) && !el.closest('[data-decorative="true"]'));
  for (const el of mediaRoots) atoms.push({el, kind: 'media', rect: box(el.getBoundingClientRect())});
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!node.textContent.trim() || !shown(el, false) || el.closest(mediaSelector + ',script,style,[data-decorative="true"]')) continue;
    // display:contents 没有父元素矩形，但直接文字仍有真实行框；不能据父框消失把文字漏掉。
    const cs = getComputedStyle(el), color = cs.webkitTextFillColor || cs.color;
    if (color === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color) || /\/\s*0(?:\.0+)?%?\s*\)$/.test(color)) continue;
    const range = document.createRange();
    // 两侧源码缩进不是内容；不把纯空白字符撑出的范围计入占用。
    const first = node.textContent.search(/\S/), last = node.textContent.search(/\s*$/);
    range.setStart(node, first); range.setEnd(node, last);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) atoms.push({el, kind: 'text', rect: box(r)});
  }
  const clipping = el => {
    const out = [];
    for (let n = el; n && n !== slide.parentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'contents') continue;
      const x = /^(hidden|clip|scroll|auto)$/.test(s.overflowX), y = /^(hidden|clip|scroll|auto)$/.test(s.overflowY);
      if (s.clipPath !== 'none' || s.maskImage && s.maskImage !== 'none') unsupported.add(selector(n) + ':复杂裁切/遮罩');
      if (s.transform !== 'none') {
        const m = new DOMMatrix(s.transform);
        if (!m.is2D || Math.abs(m.b) > .001 || Math.abs(m.c) > .001) unsupported.add(selector(n) + ':旋转/倾斜几何');
      }
      if (x || y) {
        const r = box(n.getBoundingClientRect());
        // overflow 裁切到 padding box；内容区与 overflow 边界是两个不同判据。
        const l = parseFloat(s.borderLeftWidth) || 0, t = parseFloat(s.borderTopWidth) || 0;
        out.push({x, y, selector: selector(n), rect: {x: r.x + l, y: r.y + t, width: Math.max(0, r.width - l - (parseFloat(s.borderRightWidth) || 0)), height: Math.max(0, r.height - t - (parseFloat(s.borderBottomWidth) || 0))}});
      }
    }
    return out;
  };
  for (const atom of atoms) atom.clips = clipping(atom.el);
  const project = (rects, region, axis) => {
    const key = axis === 'x' ? 'x' : 'y', dim = axis === 'x' ? 'width' : 'height', size = region[dim];
    const intervals = rects.map(r => [Math.max(0, r[key] - region[key]), Math.min(size, r[key] + r[dim] - region[key])]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of intervals) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1] + .5) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    const gaps = []; let end = 0;
    for (const [a, b] of merged) { if (a > end) gaps.push({from: end, to: a, size: a - end}); end = b; }
    if (end < size) gaps.push({from: end, to: size, size: size - end});
    const thirds = Array.from({length: 3}, (_, i) => ({index: i, from: size * i / 3, to: size * (i + 1) / 3, empty: !merged.some(([a, b]) => b > size * i / 3 + .5 && a < size * (i + 1) / 3 - .5)}));
    return {measuredCoverage: size > 0 ? round(merged.reduce((n, [a, b]) => n + b - a, 0) / size) : null, largestGap: gaps.sort((a, b) => b.size - a.size)[0] || {from: 0, to: 0, size: 0}, thirds};
  };
  const location = (axis, from, to, size) => {
    if (from <= .5 && to >= size - .5) return 'whole';
    if (from <= .5) return axis === 'x' ? 'left' : 'top';
    if (to >= size - .5) return axis === 'x' ? 'right' : 'bottom';
    return 'middle';
  };
  const regions = ordered.map(root => {
    const id = selector(root), content = contentBox(root), own = atoms.filter(a => root.contains(a.el)), findings = [], seen = new Set();
    const parent = (() => { for (let p = root.parentElement; p && p !== slide; p = p.parentElement) if (roots.has(p)) return selector(p); })();
    const declared = root.closest('[data-fill-max-gap]'), rawMax = declared && body.contains(declared) ? Number(declared.getAttribute('data-fill-max-gap')) : NaN;
    const maxGap = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 48;
    const clipped = own.map(atom => {
      let visible = {...atom.rect};
      const targets = [{x: true, y: true, rect: content, selector: id, boundary: 'content'}, ...atom.clips.map(c => ({...c, boundary: 'overflow'}))];
      for (const target of targets) {
        for (const axis of ['x', 'y']) if (target[axis]) {
          const dim = axis === 'x' ? 'width' : 'height', start = atom.rect[axis], end = start + atom.rect[dim], lower = target.rect[axis], upper = lower + target.rect[dim];
          for (const side of [start < lower - 1 ? 'start' : null, end > upper + 1 ? 'end' : null].filter(Boolean)) {
            const position = axis === 'x' ? (side === 'start' ? 'left' : 'right') : (side === 'start' ? 'top' : 'bottom');
            const key = selector(atom.el) + '|' + target.selector + '|' + target.boundary + '|' + axis + '|' + position;
            if (!seen.has(key)) {
              seen.add(key); findings.push({ruleId: 'D3', axis, position, selector: selector(atom.el), boundarySelector: target.selector, boundary: target.boundary, bounds: rounded(atom.rect), requiresReview: true});
            }
          }
          const a = Math.max(visible[axis], lower), b = Math.min(visible[axis] + visible[dim], upper);
          visible[axis] = a; visible[dim] = Math.max(0, b - a);
        }
      }
      return visible;
    }).filter(r => r.width > 0 && r.height > 0);
    const x = project(clipped, content, 'x'), y = project(clipped, content, 'y');
    for (const [axis, value, size] of [['x', x, content.width], ['y', y, content.height]]) {
      const gap = value.largestGap;
      if (gap.size > maxGap + 1) findings.push({ruleId: 'D1', axis, position: location(axis, gap.from, gap.to, size), from: round(gap.from), to: round(gap.to), size: round(gap.size), maxGap, requiresReview: true});
      for (const band of value.thirds) if (size > 0 && band.empty) findings.push({ruleId: 'D2', axis, position: (axis === 'x' ? ['left', 'middle', 'right'] : ['top', 'middle', 'bottom'])[band.index], from: round(band.from), to: round(band.to), requiresReview: true});
    }
    // 预留声明只供审查者核对设计功能，不删掉候选，更不能豁免裁切。
    const reserved = [root, ...root.querySelectorAll('[data-fill-reserve]')].filter(el => el.hasAttribute('data-fill-reserve') && shown(el)).map(el => ({selector: selector(el), reason: el.getAttribute('data-fill-reserve').trim(), bounds: rounded(intersect(content, box(el.getBoundingClientRect()))), requiresReview: true}));
    return {id, selector: id, kind: roots.get(root), ...(parent ? {parentId: parent} : {}), bounds: rounded(box(root.getBoundingClientRect())), measurements: {
      method: 'measured-line-and-media-projections', contentBounds: rounded(content), textFragments: own.filter(a => a.kind === 'text').length, mediaObjects: own.filter(a => a.kind === 'media').length,
      measuredVerticalCoverage: y.measuredCoverage, measuredHorizontalCoverage: x.measuredCoverage, baselineFillRatio: null,
      maxGap, maxGapSource: Number.isFinite(rawMax) && rawMax > 0 ? 'declared-data-fill-max-gap' : 'diagnostic-default-48px',
      horizontal: {...x, largestGap: rounded(x.largestGap)}, vertical: {...y, largestGap: rounded(y.largestGap)}
    }, findings, reserved};
  });
  return {version: 1, regions, limitation: limitation + (unsupported.size ? ' 本页需补查：' + [...unsupported].join('；') : '')};
}
module.exports = {inspectSlide};
