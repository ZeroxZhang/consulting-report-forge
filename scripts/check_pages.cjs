/* pages.json 是 S3 的机器可读产物：逐页声明这条页面证明什么、用什么形式实现。
   form 是实现入口，visual 是实际表达。这里只做结构与一致性校验，不判定形式选得好不好——那是分析取舍与目视验收。 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const forms = require('../assets/deck-forms.js');
const layer = require('../assets/annotation-layer.js');
const densityContract = require('./density_contract.cjs');
const richness = require('./richness_contract.cjs');

const SLOTS = ['main', 'left', 'right', 'top', 'bottom', 'aside', 'full'];
const ROLES = ['primary', 'support', 'context', 'evidence'];
const BOOKEND_ROLES = ['cover', 'references', 'back-cover', 'divider'];
const DENSITY_PROFILES = densityContract.PROFILES;
const DENSITY_ROLES = densityContract.ROLES;
const fileHash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const norm = value => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();

/* v2 将“内容够不够、留白为什么存在”变成页级计划，而不以字数或组件数冒充质量。
   v1 仍可读取，避免历史报告失效；所有新报告应使用 v2。 */
function densityErrors(page, at) {
  return densityContract.validate(page && page.density, at + ' density');
}

function check(doc) {
  const errors = [];
  const bad = message => errors.push(message);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { bad('pages.json 须为对象'); return { status: 'FAIL', errors }; }
  if (![1, 2].includes(doc.version)) bad('pages.version 只接受 1（历史）或 2（含密度合同）');
  if (!Array.isArray(doc.pages) || !doc.pages.length) { bad('pages.pages 须为非空数组'); return { status: 'FAIL', errors }; }
  const seen = new Set();
  doc.pages.forEach((page, index) => {
    const at = '第 ' + (index + 1) + ' 条';
    if (!page || typeof page !== 'object') { bad(at + ' 须为对象'); return; }
    if (!Number.isInteger(page.page) || page.page < 1) bad(at + ' 缺少合法 page 序号');
    else if (seen.has(page.page)) bad('page 序号重复: ' + page.page); else seen.add(page.page);
    if (!norm(page.proves)) bad(at + '（page ' + page.page + '）缺少 proves：这页要让读者看出什么关系');
    if (doc.version === 2) errors.push(...densityErrors(page, at + '（page ' + page.page + '）'));
    if (page.form === 'svg.custom' && !norm(page.visual)) bad(at + ' svg.custom 必须用 visual 声明实际表达');
    if (page.visual !== undefined && (typeof page.visual !== 'string' || !norm(page.visual))) bad(at + ' visual 须为非空的实际表达名称');
    let entry = null;
    try { entry = forms.get(page.form); }
    catch (error) { bad(at + '（page ' + page.page + '）' + error.message); }
    if (Array.isArray(page.regions) && page.regions.length) {
      const primaries = page.regions.filter(r => r && r.role === 'primary');
      if (primaries.length !== 1) bad(at + ' regions 必须恰好有一个 role="primary"，当前 ' + primaries.length + ' 个');
      page.regions.forEach((region, r) => {
        const where = at + ' regions[' + r + ']';
        if (!region || typeof region !== 'object') { bad(where + ' 须为对象'); return; }
        if (region.form === 'svg.custom' && !norm(region.visual)) bad(where + ' svg.custom 必须用 visual 声明实际表达');
        if (region.visual !== undefined && (typeof region.visual !== 'string' || !norm(region.visual))) bad(where + ' visual 须为非空字符串');
        if (!SLOTS.includes(region.slot)) bad(where + ' slot 须为 ' + SLOTS.join('/'));
        if (!ROLES.includes(region.role)) bad(where + ' role 须为 ' + ROLES.join('/'));
        if (typeof region.span !== 'number' || !Number.isFinite(region.span) || region.span <= 0) bad(where + ' span 须为正数');
        try { forms.get(region.form); } catch (error) { bad(where + ' ' + error.message); }
      });
      if (primaries.length === 1 && primaries[0].visual !== undefined && norm(primaries[0].visual) !== norm(page.visual)) bad(at + ' 主区 visual 与 page.visual 不一致');
      if (page.form !== undefined && primaries.length === 1 && primaries[0].form !== page.form) bad(at + ' 主区形式与 page.form 不一致：' + primaries[0].form + ' ≠ ' + page.form);
    }
    if (page.annotations !== undefined) {
      if (!Array.isArray(page.annotations)) bad(at + ' annotations 须为数组');
      else if (page.annotations.length && entry && entry.annotation !== 'layer') bad(at + ' 形式 ' + page.form + ' 尚未接入通用标注层，不能声明 annotations' + (entry.annotation === 'comparisons' ? '（该形式用自己的 comparisons 入口）' : ''));
      else page.annotations.forEach((a, k) => {
        const where = at + ' annotations[' + k + ']';
        if (!a || typeof a !== 'object') { bad(where + ' 须为对象'); return; }
        if (!norm(a.on)) bad(where + ' 缺少 on（锚点 id）');
        const kind = a.kind || 'value';
        const contract = layer.kinds[kind];
        if (!contract) bad(where + ' kind 须为 ' + layer.kindList.join('/'));
        else {
          if (contract.requiresText && !norm(a.text)) bad(where + ' kind=' + kind + ' 必须给 text');
          if (contract.requiresFrom && !norm(a.from)) bad(where + ' kind=' + kind + ' 必须给 from');
        }
        if (a.of !== undefined && !norm(a.of)) bad(where + ' of 不能为空');
      });
    }
    // 已移除字段的残留必须显式报错：静默忽略会让作者以为声明仍然生效。
    if (page.planner !== undefined) bad(at + ' 已取消 planner 字段：图表选型由本技能直接完成，请删除该字段及 capability_id');
    if (page.repetitionReason !== undefined && !norm(page.repetitionReason)) bad(at + ' repetitionReason 不能为空');
    // 图型不因容量不足改表：合同里不再有降级出口，放不下时在同一表达内重排、分面或换实现。
    if (page.fallback !== undefined) bad(at + ' 已取消 fallback：容量不足时调整布局、分面、换实现或如实报未完成，不能改表');
  });
  if (doc.pages.length && !errors.some(e => /缺少合法 page 序号/.test(e))) {
    const numbers = doc.pages.map(p => p.page);
    for (let i = 1; i <= numbers.length; i++) if (!numbers.includes(i)) bad('page 序号不连续：缺少 ' + i);
  }
  errors.push(...repetitionErrors(doc));
  // 与 densityErrors 同一先例：声明质量类合同只对 v2 生效，历史 v1 稿继续可读、重新打包不会因新规则突然失败。
  if (doc.version === 2) errors.push(...richness.validate(doc));
  return { status: errors.length ? 'FAIL' : 'PASS', errors, inventory: inventory(doc) };
}

const expression = page => norm(page.visual) || page.form;

/* 重复必须是被解释的决定，不能是默认：同一形式第 3 次起、或连续 3 页同形式，都要写理由。
   本函数只要求"你注意到了并说得出为什么"，不设数量下限；整册的类型种数下限由
   richness_contract 单独承担（见下方 check 里对 richness.validate 的调用）。 */
function repetitionErrors(doc) {
  const errors = [], pages = Array.isArray(doc && doc.pages) ? doc.pages : [];
  const counts = {};
  pages.forEach(page => { if (page && page.form) (counts[expression(page)] = counts[expression(page)] || []).push(page); });
  Object.entries(counts).forEach(([form, list]) => {
    list.forEach((page, index) => {
      if (index >= 2 && !norm(page.repetitionReason)) errors.push('page ' + page.page + '：' + form + ' 已是本稿第 ' + (index + 1) + ' 次出现，必须写 repetitionReason 说明为什么这里还是它');
    });
  });
  let run = 1;
  for (let i = 1; i < pages.length; i++) {
    if (pages[i] && pages[i - 1] && pages[i].form && expression(pages[i]) === expression(pages[i - 1])) {
      run += 1;
      if (run >= 3 && !norm(pages[i].repetitionReason)) errors.push('page ' + pages[i].page + '：与前两页同为 ' + expression(pages[i]) + '，连续三页同形式必须写 repetitionReason');
    } else run = 1;
  }
  return [...new Set(errors)];
}

function inventory(doc) {
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  const byForm = {}, byFamily = {}, byVisual = {}, byDensity = {};
  let annotated = 0, regions = 0;
  const runs = [];
  pages.forEach(page => {
    if (!page || !page.form) return;
    byForm[page.form] = (byForm[page.form] || 0) + 1;
    byVisual[expression(page)] = (byVisual[expression(page)] || 0) + 1;
    if (page.density?.profile) byDensity[page.density.profile] = (byDensity[page.density.profile] || 0) + 1;
    let family = 'unknown';
    try { family = forms.familyOf(page.form); } catch (error) { /* 未知形式已在 check 里报错 */ }
    byFamily[family] = (byFamily[family] || 0) + 1;
    if (Array.isArray(page.annotations) && page.annotations.length) annotated += page.annotations.length;
    if (Array.isArray(page.regions)) regions += page.regions.length;
    const last = runs[runs.length - 1];
    if (last && last.form === expression(page)) { last.pages.push(page.page); last.length = last.pages.length; }
    else runs.push({ form: expression(page), pages: [page.page], length: 1 });
  });
  const entries = Object.entries(byForm).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  /* 丰富度的事实与豁免：豁免不是静默放行，要能被审稿人在 audit 里看见。 */
  const chartTypes = richness.typesOf(doc), diversityRequired = richness.requiredTypes(pages.length);
  const diversityNote = norm(doc && doc.diversityReason);
  return {
    pages: pages.length,
    forms: Object.fromEntries(entries),
    families: Object.fromEntries(Object.entries(byFamily).sort((a, b) => b[1] - a[1])),
    densities: Object.fromEntries(Object.entries(byDensity).sort((a, b) => b[0].localeCompare(a[0]))),
    distinctForms: entries.length,
    visuals: byVisual,
    distinctVisuals: Object.keys(byVisual).length,
    chartTypes,
    distinctChartTypes: chartTypes.length,
    diversityRequired,
    diversityExempt: diversityRequired > 0 && chartTypes.length < diversityRequired && diversityNote.length >= richness.MIN_REASON,
    diversityNote,
    annotations: annotated,
    regions,
    longestRun: runs.reduce((max, run) => Math.max(max, run.length), 0),
    runs: runs.filter(run => run.length > 1)
  };
}

function load(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = check(doc);
  if (result.status !== 'PASS') throw new Error('pages 合同无效：' + result.errors.join('；'));
  return { doc, record: path.resolve(file), sha256: fileHash(file), inventory: result.inventory };
}

/* 与成稿对账：页数、顺序与每页声明的 form 必须一一对应；v2 同时把密度意图绑定到实际页面。 */
function verifyDeck(doc, slides) {
  const errors = [];
  const content = slides.filter(slide => !BOOKEND_ROLES.includes(slide.role));
  const pages = (doc && doc.pages) || [];
  if (content.length !== pages.length) errors.push('pages.json 声明 ' + pages.length + ' 页正文，成稿有 ' + content.length + ' 页正文');
  content.forEach((slide, index) => {
    const declared = pages[index];
    if (!declared) { errors.push('第 ' + slide.page + ' 页在 pages.json 中没有对应条目'); return; }
    if (!slide.form) { errors.push('第 ' + slide.page + ' 页缺少 data-form；逐页显式声明，没有静默默认值'); return; }
    try { forms.get(slide.form); } catch (error) { errors.push('第 ' + slide.page + ' 页 ' + error.message); return; }
    if (slide.form !== declared.form) errors.push('第 ' + slide.page + ' 页 data-form="' + slide.form + '" 与 pages.json 的 ' + declared.form + ' 不一致');
    if (declared.visual !== undefined && norm(slide.visual) !== norm(declared.visual)) errors.push('第 ' + slide.page + ' 页 data-visual 缺失或与 pages.json 不一致');
    // 同一句话存在成稿与 pages.json 两处，逐字相同才认。报错要把两句都摊开——
    // 只说"不一致"等于让作者回去逐字比对，页数一多就是纯耗时。
    if (norm(slide.proves) && norm(slide.proves) !== norm(declared.proves)) errors.push('第 ' + slide.page + ' 页 data-proves 与 pages.json 的 proves 不一致：成稿写「' + norm(slide.proves) + '」，pages.json 写「' + norm(declared.proves) + '」；两处必须逐字相同，改完一处要同步另一处');
    if (doc.version === 2 && norm(slide.densityProfile) !== norm(declared.density?.profile)) errors.push('第 ' + slide.page + ' 页 data-density-profile 与 pages.json 不一致：成稿写「' + norm(slide.densityProfile) + '」，pages.json 写「' + norm(declared.density?.profile) + '」；v2 页面必须把 dense/balanced/sparse 显式写到 section 上');
  });
  return errors;
}

module.exports = {SLOTS, ROLES, BOOKEND_ROLES, DENSITY_PROFILES, DENSITY_ROLES, densityErrors, check, repetitionErrors, inventory, load, verifyDeck, fileHash, norm};
