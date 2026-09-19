/* 统一的咨询叙事蓝图：在研究、Slides/PPT 与静态报告制作前校验“要证明什么、如何呈现、如何收束”。 */
'use strict';
const fs = require('node:fs');
const forms = require('../assets/deck-forms.js');
const density = require('./density_contract.cjs');

const PAGE_ROLES = ['cover', 'section', 'analysis', 'decision', 'action', 'risk', 'appendix', 'close'];
const STORY_BEATS = ['context', 'tension', 'diagnosis', 'insight', 'choice', 'action', 'risk', 'close'];
const CONTENT_ROLES = new Set(['analysis', 'decision', 'action', 'risk', 'appendix']);
const norm = density.norm;

function validate(doc, options = {}) {
  const errors = [], bad = message => errors.push(message);
  const ready = options.ready === true;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {status: 'FAIL', errors: ['blueprint 须为对象']};
  if (doc.schemaVersion !== 1) bad('blueprint.schemaVersion 只接受 1');
  const deck = doc.deck;
  if (!deck || typeof deck !== 'object') bad('blueprint 缺少 deck');
  else {
    for (const key of ['title', 'audience', 'decision', 'governingThought']) if (!norm(deck[key])) bad('deck.' + key + ' 须为非空文本');
    if (!['presentation', 'reading'].includes(deck.mode)) bad('deck.mode 须为 presentation/reading');
    if (!['slides-html', 'slides-pptx', 'static-report'].includes(deck.route)) bad('deck.route 须为 slides-html/slides-pptx/static-report');
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
        else if (slide.visual.form !== 'custom') { try { forms.get(slide.visual.form); } catch (error) { bad(where + '.visual.form ' + error.message + '；Slides独有表达可写 custom 并用 rationale 说明'); } }
        if (!norm(slide.visual.primary)) bad(where + '.visual.primary 须说明第一眼的主展品');
        if (!norm(slide.visual.layout)) bad(where + '.visual.layout 须说明版式模式');
        if (!norm(slide.visual.readingPath)) bad(where + '.visual.readingPath 须写出读者的阅读顺序');
        if (slide.visual.form === 'custom' && !norm(slide.visual.rationale)) bad(where + '.visual.form="custom" 必须写 rationale，说明为何现有形式不适用');
      }
      errors.push(...density.validate(slide.density, where + '.density'));
      const source = slide.sourcePlan;
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
  if (body.length >= 3 && ![...beats].some(beat => ['choice', 'action'].includes(beat))) bad('至少三页正文时须有 choice 或 action，把分析收束为判断、取舍或下一步');
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
