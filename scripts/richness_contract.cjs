/* 共享的表达丰富度合同：正文页数决定图表类型种数的下限，避免阈值在门禁与文档间漂移。
   与 repetitionErrors 的分工：那边管"重复要解释"（不设下限），这边管"丰富度要有下限"。 */
'use strict';
const forms = require('../assets/deck-forms.js');

/* 降序排列，取第一个满足的档；10 页以内不设下限。 */
const TIERS = [
  { minPages: 21, minTypes: 10 },
  { minPages: 11, minTypes: 5 }
];
/* 不计入丰富度的族：表格与结构化文字不是图表、信息图或图示。 */
const EXCLUDED_FAMILIES = ['table', 'text'];
const MIN_REASON = 12;
const norm = value => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();

const requiredTypes = pageCount => {
  const tier = TIERS.find(item => pageCount >= item.minPages);
  return tier ? tier.minTypes : 0;
};

/* 计数键：非 custom 页取 form——visual 在那些页上是可选自由文案，用它计数等于允许改文案注水；
   custom 页没有可辨识的 form，只有作者声明的实际图型，所以取 visual。前缀防与真实 form 同名相撞。 */
const typeKey = page => page.form === 'svg.custom' ? 'svg.custom:' + norm(page.visual) : page.form;

/* 可计入的形式：族不在排除表内。未知 form 由 check_pages 另行报错，这里静默跳过。 */
const countable = form => {
  try { return !EXCLUDED_FAMILIES.includes(forms.familyOf(form)); }
  catch (error) { return false; }
};

const typesOf = doc => {
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  const keys = new Set();
  pages.forEach(page => {
    if (!page || !page.form || !countable(page.form)) return;
    const key = typeKey(page);
    if (key) keys.add(key);
  });
  return [...keys];
};

const display = key => key.replace(/^svg\.custom:/, 'custom/');

function validate(doc) {
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  const required = requiredTypes(pages.length);
  // 未触发下限时 diversityReason 是无关字段，不做要求——与 sparseReason 只在 profile="sparse" 时校验同理。
  if (!required) return [];
  const types = typesOf(doc);
  if (types.length >= required) return [];
  const errors = [];
  const reason = norm(doc && doc.diversityReason);
  // 与 sparseReason 同一约定：写了就必须说清楚为什么，不能只写“材料限制”。
  if (doc && doc.diversityReason !== undefined && reason.length < MIN_REASON) {
    errors.push('pages.diversityReason 须说明至少' + MIN_REASON + '字：为什么本稿用不了更多形式（当前 '
      + types.length + ' 种，下限 ' + required + ' 种）');
    return errors;
  }
  if (reason.length >= MIN_REASON) return errors; // 已用豁免；豁免事实由 inventory 暴露，供审计留痕
  errors.push('正文 ' + pages.length + ' 页需要至少 ' + required + ' 种图表类型，当前只有 ' + types.length + ' 种：'
    + (types.length ? types.map(display).join('、') : '（无）')
    + '。请补充真实证据以引入新的表达形式，不要为凑数改用不合适的图型；若本主题确实无法使用更多形式，'
    + '写 pages.diversityReason 说明原因。表格与结构化文字不计入图表类型。');
  return errors;
}

module.exports = { TIERS, EXCLUDED_FAMILIES, MIN_REASON, requiredTypes, typeKey, countable, typesOf, validate };
