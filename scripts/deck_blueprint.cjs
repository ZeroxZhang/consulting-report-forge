/* 统一的咨询叙事蓝图：在静态报告制作前校验“要证明什么、如何呈现、如何收束”。 */
'use strict';
const fs = require('node:fs');
const forms = require('../assets/deck-forms.js');
const density = require('./density_contract.cjs');
const layouts = require('./layout_contract.cjs');

const PAGE_ROLES = ['cover', 'section', 'analysis', 'decision', 'action', 'risk', 'appendix', 'close'];
const STORY_BEATS = ['context', 'tension', 'diagnosis', 'insight', 'choice', 'action', 'risk', 'close'];
const CONTENT_ROLES = new Set(['analysis', 'decision', 'action', 'risk', 'appendix']);
const norm = density.norm;

// 可选的逐主张记录：老蓝图仍可读；一旦登记，就不能把待核实状态静默带入生产。
function claimErrors(source, where, ready) {
  if (source?.claims === undefined) return [];
  if (!Array.isArray(source.claims) || !source.claims.length) return [where + '.claims 须为非空数组'];
  const errors = [], ids = new Set();
  source.claims.forEach((c, i) => {
    const at = where + '.claims[' + i + ']';
    if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(at + ' 须为对象'); return; }
    if (!/^[a-z][a-z0-9-]*$/.test(c.id || '') || ids.has(c.id)) errors.push(at + ' id须为不重复的小写标识');
    ids.add(c.id);
    for (const key of ['statement', 'period', 'population', 'unit', 'denominator', 'calculation', 'inference', 'limitation']) if (typeof c[key] !== 'string' || !norm(c[key])) errors.push(at + '.' + key + ' 须为非空文本，不适用须写明原因');
    if (!['fact', 'estimate', 'forecast', 'assumption', 'recommendation'].includes(c.kind)) errors.push(at + '.kind 须区分事实、估计、预测、假设或建议');
    if (!['provided', 'source_checked', 'pending', 'not_applicable'].includes(c.verification)) errors.push(at + '.verification 无效');
    if (ready && c.verification === 'pending') errors.push(at + ' 仍为pending：核实或在材料限制内改写后再进入生产');
    const factual = ['fact', 'estimate', 'forecast'].includes(c.kind);
    if (factual && source.status === 'not_applicable') errors.push(at + ' 含事实类主张，sourcePlan不能标not_applicable');
    if (factual && c.verification === 'not_applicable') errors.push(at + ' 外部事实/估计/预测不能免核对来源');
    if (!Array.isArray(c.sourceKeys) || (factual && !c.sourceKeys.length)) errors.push(at + '.sourceKeys须为数组，事实类主张须列来源');
    else for (const key of c.sourceKeys) if (typeof key !== 'string' || !Array.isArray(source.keys) || !source.keys.includes(key)) errors.push(at + ' 来源键未登记于sourcePlan.keys：' + key);
  });
  return errors;
}

function validate(doc, options = {}) {
  const errors = [], bad = message => errors.push(message);
  const ready = options.ready === true;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {status: 'FAIL', errors: ['blueprint 须为对象']};
  if (![1, 2].includes(doc.schemaVersion)) bad('blueprint.schemaVersion 只接受 1（历史）或 2（统一内容）');
  const deck = doc.deck;
  if (!deck || typeof deck !== 'object') bad('blueprint 缺少 deck');
  else {
    for (const key of ['title', 'audience', 'decision', 'governingThought']) if (!norm(deck[key])) bad('deck.' + key + ' 须为非空文本');
    if (!['presentation', 'reading'].includes(deck.mode)) bad('deck.mode 须为 presentation/reading');
    if (deck.ratio !== undefined && !['16x9', '4x3'].includes(deck.ratio)) bad('deck.ratio 须为16x9/4x3');
    if (deck.route !== undefined) bad('deck.route 已移除：本技能只产出静态报告，请删除该字段');
  }
  if (!Array.isArray(doc.slides) || !doc.slides.length) return {status: 'FAIL', errors: [...errors, 'blueprint.slides 须为非空数组']};
  const ids = new Set(), beats = new Set();
  doc.slides.forEach((slide, index) => {
    const where = 'slides[' + index + ']';
    if (!slide || typeof slide !== 'object') { bad(where + ' 须为对象'); return; }
    if (!/^[a-z][a-z0-9-]*$/.test(slide.id || '')) bad(where + '.id 须为小写 kebab-case');
    else if (ids.has(slide.id)) bad(where + '.id 重复：' + slide.id); else ids.add(slide.id);
    if (slide.sequence !== index + 1) bad(where + '.sequence 须等于 ' + (index + 1));
    if (!PAGE_ROLES.includes(slide.pageRole)) bad(where + '.pageRole 须为 ' + PAGE_ROLES.join('/'));
    if (!norm(slide.title)) bad(where + '.title 须为非空结论性标题或明确章节标题');
    for (const key of ['subtitle', 'cornerLabel', 'speakerIntent']) if (typeof slide[key] !== 'string') bad(where + '.' + key + ' 须显式为字符串（可为空，但不能省略）');
    if (!STORY_BEATS.includes(slide.storyBeat)) bad(where + '.storyBeat 须为 ' + STORY_BEATS.join('/'));
    else beats.add(slide.storyBeat);
    if (CONTENT_ROLES.has(slide.pageRole)) {
      if (!norm(slide.proves)) bad(where + '.proves 须说明读者要直接看出的关系');
      if (!slide.visual || typeof slide.visual !== 'object') bad(where + '.visual 缺失');
      else {
        if (!norm(slide.visual.form)) bad(where + '.visual.form 须声明表达形式');
        else if (slide.visual.form !== 'custom') { try { forms.get(slide.visual.form); } catch (error) { bad(where + '.visual.form ' + error.message + '；词汇表之外的表达可写 custom 并用 rationale 说明'); } }
        if (!norm(slide.visual.primary)) bad(where + '.visual.primary 须说明第一眼的主展品');
        // 版式不是自由文案：从布局目录里选一条，页面才有可核对的骨架，作者也才知道每格能放什么。
        // 确实没有合适布局时写 layoutExemptReason 说清楚——出口要有，但不能是静默的。
        if (!norm(slide.visual.layout)) bad(where + '.visual.layout 须填布局编号（见 assets/layout-atlas.html 或 assets/layout-atlas/catalog.json，形如 L09）');
        else if (doc.schemaVersion === 2 && slide.visual.layout === 'custom') { /* 自由区域由编译后的 v4 合同检查 */ }
        else if (!layouts.has(norm(slide.visual.layout))) {
          if (doc.schemaVersion === 1 && norm(slide.visual.layoutExemptReason).length >= layouts.MIN_REASON) { /* 历史豁免 */ }
          else bad(where + '.visual.layout="' + norm(slide.visual.layout) + '" 不是目录里的布局编号：'
            + '布局目录共 ' + layouts.list().length + ' 条（' + layouts.list().slice(0, 3).map(item => item.id).join('/') + '…）；'
            + '选一条承载得住这一页的布局，或写 visual.layoutExemptReason（≥' + layouts.MIN_REASON + '字）说明为什么目录里没有可用结构');
        }
        if (!norm(slide.visual.readingPath)) bad(where + '.visual.readingPath 须写出读者的阅读顺序');
        if (layouts.has(slide.visual.layout) && forms.list().includes(slide.visual.form) && ['16x9', '4x3'].includes(deck?.ratio || '16x9')) {
          const layout = layouts.get(slide.visual.layout), module = layout.modules[layouts.primaryIndex(layout)];
          errors.push(...layouts.sizeErrors(slide.visual.form, module, deck?.ratio || '16x9', slide.visual.sizing, where + '.visual'));
        }
        if (slide.visual.form === 'custom' && !norm(slide.visual.rationale)) bad(where + '.visual.form="custom" 必须写 rationale，说明为何现有形式不适用');
      }
      errors.push(...density.validate(slide.density, where + '.density'));
      const source = slide.sourcePlan;
      errors.push(...claimErrors(source, where + '.sourcePlan', ready));
      if (!source || typeof source !== 'object') bad(where + '.sourcePlan 缺失：须声明 verified/to_verify/not_applicable');
      else if (!['verified', 'to_verify', 'not_applicable'].includes(source.status)) bad(where + '.sourcePlan.status 须为 verified/to_verify/not_applicable');
      else if (source.status === 'verified' && (!Array.isArray(source.keys) || !source.keys.length)) bad(where + '.sourcePlan verified 须列出实际来源键或链接');
      else if (source.status === 'to_verify' && !norm(source.scope)) bad(where + '.sourcePlan to_verify 须说明待核实的数字、判断或边界');
      else if (ready && source.status === 'to_verify') bad(where + '.sourcePlan 仍为 to_verify：研究完成并进入生产/交付前，必须核实来源或改写为不含该主张的页面');
      else if (source.status === 'not_applicable' && !norm(source.reason)) bad(where + '.sourcePlan not_applicable 须说明为何页面不含外部可核查主张');
    }
  });
  const first = doc.slides[0], body = doc.slides.filter(s => CONTENT_ROLES.has(s?.pageRole));
  if (first?.pageRole !== 'cover') bad('第1页须为 cover；从读者要解决的决策问题建立叙事，而非直接堆数据');
  if (body.length >= 3 && ![...beats].some(beat => ['diagnosis', 'insight'].includes(beat))) bad('至少三页正文时须有 diagnosis 或 insight，不能只有背景与行动口号');
  if (doc.schemaVersion === 1 && body.length >= 3 && ![...beats].some(beat => ['choice', 'action'].includes(beat))) bad('至少三页正文时须有 choice 或 action，把分析收束为判断、取舍或下一步');
  if (doc.schemaVersion === 2) errors.push(...require('./content_contract.cjs').validate(doc));
  return {status: errors.length ? 'FAIL' : 'PASS', errors, inventory: inventory(doc)};
}

function inventory(doc) {
  const slides = Array.isArray(doc?.slides) ? doc.slides : [];
  const byRole = {}, byBeat = {}, byDensity = {}, byForm = {};
  slides.forEach(slide => {
    if (!slide) return;
    if (slide.pageRole) byRole[slide.pageRole] = (byRole[slide.pageRole] || 0) + 1;
    if (slide.storyBeat) byBeat[slide.storyBeat] = (byBeat[slide.storyBeat] || 0) + 1;
    if (slide.density?.profile) byDensity[slide.density.profile] = (byDensity[slide.density.profile] || 0) + 1;
    if (slide.visual?.form) byForm[slide.visual.form] = (byForm[slide.visual.form] || 0) + 1;
  });
  return {slides: slides.length, pageRoles: byRole, storyBeats: byBeat, densities: byDensity, forms: byForm};
}

function load(file, options = {}) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = validate(doc, options);
  if (result.status !== 'PASS') throw Error('blueprint 无效：' + result.errors.join('；'));
  return {doc, inventory: result.inventory};
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2), ready = args.includes('--ready'), files = args.filter(arg => arg !== '--ready');
    if (files.length !== 1) throw Error('用法: node scripts/deck_blueprint.cjs blueprint.json [--ready]；--ready 会拒绝仍待核实的来源计划');
    const result = validate(JSON.parse(fs.readFileSync(files[0], 'utf8')), {ready});
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'PASS') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = {PAGE_ROLES, STORY_BEATS, CONTENT_ROLES, validate, inventory, load};
