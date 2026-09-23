/* 逐页探针：QA 分档与作者单页自查共用同一套测量，避免两份实现漂移。
   这里只做测量与取证，不作审美判定，也不产出任何可被当成验收证据的清单。 */
'use strict';
const path = require('node:path');
const bookends = require('./check_bookends.cjs');
const geometry = require('./browser_geometry_audit.cjs');
const criticalContent = require('./critical_content.cjs');
const visualPolicy = require('./browser_visual_policy.cjs');
const fontAudit = require('./browser_font_audit.cjs');
const deckForms = require('../assets/deck-forms.js');

/* 哪些形式"必须能对账"，由形式目录说了算。曾经在这里硬编码过一份 ['kit.waterfall','precision.waterfall']，
   与目录里那份是两处知识：加第三个瀑布形式时探针不会知道，而且它没法被测到——
   测试只能构造 isWaterfallForm 字段，永远碰不到这个常量本身。现在从目录派生，再由 collect 传进浏览器。 */
const WF_FORMS = deckForms.list().filter(id => (deckForms.get(id).limits || {}).reconciles === true);

/* 在真实页面上执行的 DOM 测量。自包含（不闭包外部变量），供 Playwright 序列化；
   确实需要的外部输入一律走 evaluate 的第二个参数传进来。 */
function inspectDom(s, wfForms) {
  /* 清单必须显式传进来。缺了它 isWaterfallForm 会恒为 false，瀑布判据安安静静地全部失效——
     一个"少传一个参数"不该表现为"这页没问题"。 */
  if (!Array.isArray(wfForms)) throw new Error('inspectDom 需要第二个参数：瀑布形式清单（page_probe.WF_FORMS）');
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
    const form=e.getAttribute('data-form')||null;
    const visiblePart=part=>{if(!part)return false;const r=part.getBoundingClientRect();if(r.width<=0&&r.height<=0)return false;for(let n=part;n&&n!==e.parentElement;n=n.parentElement){const cs=getComputedStyle(n);if(cs.display==='none'||cs.visibility==='hidden'||cs.visibility==='collapse'||Number(cs.opacity)===0)return false;}return true;};
    const colorVisible=value=>!!value&&value!=='none'&&value!=='transparent'&&!/^rgba?\([^)]*,\s*0(?:\.0+)?\)$/.test(value);
    const strokeVisible=part=>{if(!visiblePart(part))return false;const cs=getComputedStyle(part);return colorVisible(cs.stroke)&&Number(cs.strokeOpacity)>0&&parseFloat(cs.strokeWidth)>0;};
    const shapeVisible=part=>{if(!visiblePart(part))return false;const cs=getComputedStyle(part);return colorVisible(cs.fill)&&Number(cs.fillOpacity)>0||strokeVisible(part);};
    const diagram=form?.startsWith('diagram.')?{
      contract:e.getAttribute('data-diagram-contract'),
      nodes:[...e.querySelectorAll('[data-node]')].filter(visiblePart).map(n=>({id:n.getAttribute('data-node'),role:n.getAttribute('data-node-role'),lane:n.getAttribute('data-lane'),stage:n.getAttribute('data-stage'),shape:shapeVisible(n.querySelector('polygon'))?'diamond':shapeVisible(n.querySelector('rect'))&&n.querySelector('rect').getAttribute('rx')==='12'?'round':'rect',label:[...n.querySelectorAll('text')].filter(shapeVisible).map(t=>t.textContent.trim()).join(' ')})),
      edges:[...e.querySelectorAll('[data-edge]')].filter(g=>visiblePart(g)&&strokeVisible(g.querySelector('polyline'))).map(g=>{const line=g.querySelector('polyline'),style=getComputedStyle(line);return {from:g.getAttribute('data-from'),to:g.getAttribute('data-to'),role:g.getAttribute('data-edge-role'),relation:g.getAttribute('data-relation'),evidenceStatus:g.getAttribute('data-evidence-status'),feedback:g.getAttribute('data-feedback')==='true',condition:g.getAttribute('data-condition'),probability:g.hasAttribute('data-probability')?Number(g.getAttribute('data-probability')):undefined,probabilityBasis:g.getAttribute('data-probability-basis'),label:[...g.querySelectorAll('text')].filter(shapeVisible).map(t=>t.textContent.trim()).join(' '),dashed:style.strokeDasharray!=='none',arrow:style.markerEnd!=='none',strokeWidth:parseFloat(style.strokeWidth),lineVisible:true};}),
      laneBands:[...e.querySelectorAll('[data-role="lane-band"] > rect')].filter(shapeVisible).length,
      laneTitles:[...e.querySelectorAll('text[data-role="lane-title"]')].filter(shapeVisible).length,
      stageTitles:[...e.querySelectorAll('text[data-role="stage-title"]')].filter(shapeVisible).length,
      laneTitleText:[...e.querySelectorAll('text[data-role="lane-title"]')].filter(shapeVisible).map(t=>t.textContent.trim()),
      stageTitleText:[...e.querySelectorAll('text[data-role="stage-title"]')].filter(shapeVisible).map(t=>t.textContent.trim())
    }:null;
    return {id, tag: e.tagName, form, capacity:e.getAttribute('data-capacity')||null, diagram, labels: [...e.querySelectorAll('text')].map(t => t.textContent.trim()).filter(Boolean)};
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
  /* 瀑布的账要现场核对，不能只看声明。分派依据是零轴线上的 data-role="reconciliation"——
     它是两个瀑布渲染器在内核报告存在时才写下的标记，别处不会出现。
     不能改用 data-from/data-to 分派：precision 的柱图与堆积图同样会发这两个属性，那样等于
     把不是瀑布的图也当成瀑布来判。（同类教训：本仓库曾因按属性名猜测形式而误判。） */
  const form = s.dataset.form || '';
  const auditAxes = [...s.querySelectorAll('[data-role="reconciliation"]')];
  const waterfall = {
    form, isWaterfallForm: wfForms.indexOf(form) >= 0,
    axes: auditAxes.length,
    /* 多于一条对账零轴意味着这一页有两次体检结论，声明只能写一个，必然对不上。 */
    residual: auditAxes.length === 1 ? (auditAxes[0].getAttribute('data-residual') || '') : null,
    tolerance: auditAxes.length === 1 ? (auditAxes[0].getAttribute('data-tolerance') || '') : null,
    nodes: auditAxes.length === 1 ? Number(auditAxes[0].getAttribute('data-nodes')) : null,
    model: auditAxes.length === 1 ? auditAxes[0].getAttribute('data-waterfall-model') : null,
    bars: auditAxes.length === 1 ? [...(auditAxes[0].closest('svg')?.querySelectorAll('[data-from][data-to]')||[])].filter(e=>e.getAttribute('data-role')==='bar'||e.tagName.toLowerCase()==='rect'&&(e.getAttribute('data-anchor-id')||'').startsWith('bar:')).map(e=>{
      const numeric=key=>e.hasAttribute(key)&&e.getAttribute(key).trim()!==''?Number(e.getAttribute(key)):null;
      return {label:e.getAttribute('data-anchor-label'),type:e.getAttribute('data-semantic')||e.getAttribute('data-anchor-group'),value:e.hasAttribute('data-value')?numeric('data-value'):numeric('data-anchor-value'),from:numeric('data-from'),to:numeric('data-to')};
    }):[]
  };
  const notePad = [], noteSeen = new Set();
  for (const e of s.querySelectorAll('*')) {
    if (noteSeen.has(e)) continue;
    const isNote = e.classList && e.classList.length > 0 && /annotation|decision-strip|evidence-note|callout|takeaway|insight/i.test(String(e.className));
    const leaf = !e.children.length && (e.textContent || '').trim();
    if (!isNote && !leaf) continue; if (e.closest('table,svg,[data-decorative="true"]')) continue;
    const cs = getComputedStyle(e);
    if (parseFloat(cs.borderLeftWidth) >= 2 && cs.borderLeftStyle !== 'none' && parseFloat(cs.paddingLeft) < 6 && e.getBoundingClientRect().height > 10) { noteSeen.add(e); notePad.push({cls: String(e.className).slice(0, 40), pad: cs.paddingLeft, text: (e.textContent || '').trim().slice(0, 40)}); }
  }
  /* 判断／依据／限定不是装饰：三级缺一，这一格就退回散文，而散文数得出字数、数不出依据条数。
     所以这里数的是结构而不是字数——只有结构判得出「这一格是不是只装了三分之一」。 */
  const finding = [...s.querySelectorAll('.finding')].filter(f=>{const r=f.getBoundingClientRect(),cs=getComputedStyle(f);return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden';}).map(f => {
    const txt = el => ((f.querySelector(el) || {}).textContent || '').trim();
    return {
      verdict: txt('.finding__verdict').length,
      limit: txt('.finding__limit').length,
      grounds: [...f.querySelectorAll('.finding__step')].map(st => ({
        label: (((st.querySelector('.finding__label') || {}).textContent) || '').trim(),
        why: (((st.querySelector('.finding__why') || {}).textContent) || '').trim(),
        rank: st.querySelectorAll('.finding__rank i').length
      }))
    };
  });
  return {
    bindings: [...s.querySelectorAll('[data-content-key]')].map(e => {
      const r=e.getBoundingClientRect(); let visible=r.width>0&&r.height>0;
      const reasons=[];
      if(typeof e.checkVisibility==='function'&&!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true}))reasons.push('浏览器判定不可见');
      // 关键文字不能借裁切/遮罩藏起来。图形可裁切，但绑定标签应放到未裁切的文字层。
      for(let p=e;p&&p!==s.parentElement;p=p.parentElement){
        const cs=getComputedStyle(p);
        if(cs.display==='none'||cs.visibility==='hidden'||cs.visibility==='collapse'||Number(cs.opacity)===0||cs.contentVisibility==='hidden')reasons.push('隐藏祖先或节点');
        if(cs.clipPath&&cs.clipPath!=='none'||cs.clip&&cs.clip!=='auto'||cs.maskImage&&cs.maskImage!=='none'||cs.webkitMaskImage&&cs.webkitMaskImage!=='none')reasons.push('关键文字处于裁切或遮罩层');
        if(/opacity\(\s*0(?:\.0+)?%?\s*\)/.test(cs.filter||''))reasons.push('透明滤镜');
      }
      const cs=getComputedStyle(e);
      // SVG 的 fill-opacity/stroke-opacity 可从 g 继承，文字仍在 DOM/PDF 文本层而没有像素。
      // 同时允许无填充但有可见描边的文字，不能仅凭 fill:none 判隐藏。
      const hasPaint=(paint,opacity=1)=>Number(opacity)>0&&paint!=='transparent'&&paint!=='none'&&!/rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(paint)&&!/[\/]\s*0(?:\.0+)?%?\s*\)$/.test(paint);
      const painted=e instanceof SVGElement
        ?hasPaint(cs.fill,cs.fillOpacity)||(parseFloat(cs.strokeWidth)>0&&hasPaint(cs.stroke,cs.strokeOpacity))
        :hasPaint(cs.webkitTextFillColor||cs.color);
      if(!painted)reasons.push('文字透明');
      const box=s.getBoundingClientRect();if(r.right<=box.left||r.left>=box.right||r.bottom<=box.top||r.top>=box.bottom)reasons.push('位于页面之外');
      visible=visible&&!reasons.length;
      return {key:e.dataset.contentKey,text:e.textContent,visible,...(reasons.length?{visibilityReasons:[...new Set(reasons)]}:{})};
    }),
    pageId:s.dataset.pageId||'',pagePlanHash:s.dataset.pagePlanHash||'',contentHash: s.dataset.contentHash || '', semanticType:s.dataset.semanticType || '',
    exhibits, finding, kpiCards:[...s.querySelectorAll('.slide__body .kpi-card')].filter(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden';}).length, textEvidence, unreadableText: unreadable, form: s.dataset.form || null, visual: s.dataset.visual || '', proves: s.dataset.proves || '', densityProfile: s.dataset.densityProfile || '',
    // v3 布局绑定：QA 拿它和 pages.json、布局目录三方对账。
    layout: s.dataset.layout || '', modules: [...s.querySelectorAll('[data-module]')].map(e => e.dataset.module || ''),
    waterfall,
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
  const result = await slide.evaluate(inspectDom, WF_FORMS);
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

/* 瀑布现场的自查判据。声明侧的校验在 check_pages，这里只判"图本身说不说得通"：
   一页只能有一个对账结论；声明是瀑布形式的页，图上必须真的有一条对账零轴。 */
function waterfallErrors(row) {
  const facts = row.waterfall, found = [];
  if (!facts) return found;
  if (facts.axes > 1) found.push({code: 'WF-MULTIPLE-AUDIT', fatal: true, message: '这一页有 ' + facts.axes + ' 条对账零轴：一次体检只能有一个结论，声明也只能写一个'});
  /* 提醒，不是阻塞：这一页可能走的是老 items 路径，本来就没有内核报告，作者没做错什么。
     真正该拦的那一条——"pages.json 声明 verified、图上却没有零轴"——由 verifyDeck 判，那里看得见声明。
     判据落在探针里是为了让单页自查与正式审计同一套结论，不是为了让探针替 declarations 做决定。 */
  if (facts.isWaterfallForm && !facts.axes) found.push({code: 'WF-NOT-RECONCILED', fatal: false, message: '第' + row.page + '页声明为 ' + facts.form + '，但图上没有内核出的对账零轴（data-role="reconciliation"）：这一页的桥没走体检，图上的数字无人核对。若这一页在 pages.json 里声明了 waterfall，装配期会直接拦下；没声明则是老 items 路径，改用内核出图后可消除本条'});
  /* 有差额不是错，藏着不说才是错。声明了对账结论的页由 verifyDeck 与声明逐字对账；
     这里只提醒审稿人这一页必须亲眼核对差额的来路。 */
  if (facts.axes === 1 && facts.residual) found.push({code: 'WF-RESIDUAL', fatal: false, message: '第' + row.page + '页图上有未解释差额 ' + facts.residual + '（容差 ' + facts.tolerance + '）：这一页必须声明 residualReason，并目视确认它是以独立节点出现，不是被并进最后一根柱子'});
  return found;
}

/* 单页自查的紧凑摘要：只列可执行结论，不冒充验收状态。 */
function summarize(row) {
  const errors = [], warnings = [];
  for (const item of row.overflow || []) errors.push({code: 'OVERFLOW', ...item});
  for (const item of row.unreadableText || []) errors.push({code: 'UNREADABLE-TEXT', ...item});
  for (const chart of row.charts || []) if (!chart.rendered || chart.error) errors.push({code: 'CHART-NOT-RENDERED', ...chart});
  for (const item of row.relations?.errors || []) errors.push({code: item.code || 'GEOMETRY', ...item});
  for (const item of row.layoutCheck?.errors || []) errors.push({code: item.code || 'LAYOUT', ...item});
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
  /* 瀑布对账门：判据落在探针里，单页自查与正式审计就不可能有两套结论。
     只看"有没有对账属性"是不够的——那读到的只是渲染器写下的值，把差额塞进最后一根柱子照样"闭合"。
     真正要拦的是：图上有一笔说不清的差额，而这一页没承认它。承认与否由 pages.json 的声明决定，
     探针这里只负责把现场量出来（见 check_pages 的 verifyDeck 做两处对账），以及拦住"有两份结论"。 */
  for (const item of waterfallErrors(row)) { const {fatal, ...detail} = item; (fatal ? errors : warnings).push(detail); }
  if (row.fonts?.identity === 'FAIL') errors.push({code: 'FONT-IDENTITY', message: fontAudit.describe(row.fonts)});
  if (!row.frame?.boundary) errors.push({code: 'FRAME-BOUNDARY-MISSING', message: '未显式声明 data-frame-boundary'});
  if (row.frame?.ruleVisible && row.frame.doubleBorder.length) warnings.push({code: 'DOUBLE-BORDER', cls: row.frame.doubleBorder[0], message: '标题区隔线与正文首排顶线可能并存'});
  // 需要人工确认的路径原样带出：它们不是通过，也不该在摘要里被压成一句"已检查"。
  const manual = (row.visualPolicy?.findings || []).map(f => ({code: f.code, selector: f.selector, message: f.message}));
  return {errors, warnings, manual};
}

module.exports = {inspectDom, activate, collect, screenshotName, summarize, waterfallErrors, WF_FORMS};
