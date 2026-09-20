'use strict';
const assert = require('node:assert/strict');
const pages = require('./check_pages.cjs');

const unit = (role, purpose) => ({role, purpose});
const base = (over = {}) => ({
  page: 1,
  proves: '毛利下降说明折扣策略并未形成可持续增长。',
  form: 'html.text',
  density: {
    profile: 'balanced',
    evidenceUnits: [
      unit('primary', '展示毛利、销量和价格的同口径变化。'),
      unit('support', '给出基准期与同行差异，限定结论范围。')
    ],
    spaceIntent: '主证据位于左侧主体阅读区，支持证据紧随其后，底部仅保留来源安全区。'
  },
  ...over
});

const valid = {version: 2, pages: [base()]};
assert.equal(pages.check(valid).status, 'PASS', JSON.stringify(pages.check(valid).errors));
assert.equal(pages.check({version: 1, pages: [{page: 1, proves: '历史稿仍可读取。', form: 'html.text'}]}).status, 'PASS');

/* —— 表达丰富度下限：正文 >10 页要 ≥5 种图表类型，>20 页要 ≥10 种 —— */
const richness = require('./richness_contract.cjs');
const profile = () => ({
  profile: 'balanced',
  evidenceUnits: [unit('primary', '展示主展品要表达的核心关系。'), unit('support', '补充基准与分母，限定结论范围。')],
  spaceIntent: '主证据占据主体阅读区，支持证据紧随其后，底部只保留来源安全区。'
});
/* 每页都写 repetitionReason：本组用例只测丰富度，不能让 repetitionErrors 同时报错而混淆断言。 */
const deck = (count, formsList, over = {}) => ({
  version: 2,
  ...over,
  pages: Array.from({length: count}, (_, i) => base({
    page: i + 1,
    proves: '第' + (i + 1) + '页要读者看出的关系。',
    form: formsList[i % formsList.length],
    repetitionReason: '同类形式在此处承担相同的论证角色，已在版式上分组以免误读。',
    density: profile()
  }))
});
const FIVE = ['recipe.rankedBar', 'recipe.timeSeries', 'kit.waterfall', 'recipe.scatter', 'html.kpi'];
const NINE = [...FIVE, 'recipe.sankey', 'kit.tree', 'diagram.mechanism', 'recipe.histogram'];
const EXEMPT = '本文档为单一指标的深度拆解，所有证据共用同一时间轴，换图型会破坏可比基准。';

assert.equal(richness.requiredTypes(10), 0);
assert.equal(richness.requiredTypes(11), 5);
assert.equal(richness.requiredTypes(21), 10);
assert.equal(pages.check(deck(10, ['recipe.rankedBar'])).status, 'PASS', '10 页以内不设下限');
assert.equal(pages.check(deck(11, FIVE)).status, 'PASS', JSON.stringify(pages.check(deck(11, FIVE)).errors));
assert.equal(pages.check(deck(21, [...NINE, 'kit.bullet'])).status, 'PASS', '21 页 10 种应通过');
/* 计数键：非 custom 页的 visual 是自由文案，改文案不得虚增类型数。 */
assert.equal(richness.typesOf(deck(11, ['recipe.rankedBar'])).length, 1);
assert.equal(richness.typesOf({version: 2, pages: deck(11, ['recipe.rankedBar']).pages.map(p => ({...p, visual: '文案' + p.page}))}).length, 1, '不同 visual 文案不得算作不同图型');
/* custom 页没有可辨识的 form，按作者声明的实际图型分别计数。 */
const customs = {version: 2, pages: deck(11, ['svg.custom']).pages.map(p => ({...p, visual: '自定义图型' + (p.page % 5)}))};
assert.equal(richness.typesOf(customs).length, 5);
assert.equal(pages.check(customs).status, 'PASS', '5 种自定义图型应满足下限');
/* 豁免：写了就通过，但事实必须进 inventory，供审稿人看见而不是静默放行。 */
const exempt = deck(11, ['recipe.rankedBar'], {diversityReason: EXEMPT});
assert.equal(pages.check(exempt).status, 'PASS', JSON.stringify(pages.check(exempt).errors));
assert.equal(pages.inventory(exempt).diversityExempt, true);
assert.equal(pages.inventory(deck(11, FIVE)).diversityExempt, false);
/* v1 历史稿不受新规则约束：与 densityErrors 同一先例，避免旧稿重新打包时突然失败。 */
assert.equal(pages.check({version: 1, pages: Array.from({length: 11}, (_, i) => base({page: i + 1, repetitionReason: '历史稿沿用同一形式，不做回溯改造。'}))}).status, 'PASS');

const cases = [
  [{version: 2, pages: [base({density: undefined})]}, /density 缺失/],
  [{version: 2, pages: [base({density: {...base().density, profile: 'dense'}})]}, /至少需要 3 个/],
  [{version: 2, pages: [base({density: {...base().density, profile: 'sparse'}})]}, /sparseReason/],
  [{version: 2, pages: [base({density: {...base().density, evidenceUnits: [unit('primary', '展示毛利与价格变化。'), unit('primary', '重复主角色不应通过。')]}})]}, /role 重复/],
  [deck(11, FIVE.slice(0, 4)), /正文 11 页需要至少 5 种图表类型，当前只有 4 种/],
  [deck(21, NINE), /正文 21 页需要至少 10 种图表类型，当前只有 9 种/],
  [deck(11, ['html.table', 'html.text', 'kit.comparisonTable', 'html.matrix']), /当前只有 0 种/],
  [deck(11, ['recipe.rankedBar'], {diversityReason: '材料限制'}), /至少12字/]
];
for (const [doc, pattern] of cases) {
  const out = pages.check(doc);
  assert.equal(out.status, 'FAIL', JSON.stringify(doc));
  assert.ok(out.errors.some(error => pattern.test(error)), JSON.stringify(out.errors));
}

const slides = [{page: 1, form: 'html.text', visual: '', proves: valid.pages[0].proves, densityProfile: 'balanced', role: null}];
assert.deepEqual(pages.verifyDeck(valid, slides), []);
assert.ok(pages.verifyDeck(valid, [{...slides[0], densityProfile: 'dense'}]).some(error => /data-density-profile/.test(error)));
assert.deepEqual(pages.inventory(valid).densities, {balanced: 1});
console.log(JSON.stringify({pass: true, checks: 26, densityProfiles: pages.DENSITY_PROFILES, richnessTiers: richness.TIERS}));
