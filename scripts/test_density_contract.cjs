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

/* —— 表达丰富度下限：正文 >10 页要 ≥8 种表达，>20 页要 ≥12 种 —— */
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
const EIGHT = [...FIVE, 'recipe.sankey', 'kit.tree', 'diagram.mechanism'];
const TWELVE = [...EIGHT, 'recipe.histogram', 'kit.dumbbell', 'recipe.groupedBar', 'diagram.process'];
const EXEMPT = '本文档为单一指标的深度拆解，所有证据共用同一时间轴，换图型会破坏可比基准。';

assert.equal(richness.requiredTypes(10), 0);
assert.equal(richness.requiredTypes(11), 8);
assert.equal(richness.requiredTypes(21), 12);
assert.equal(pages.check(deck(10, ['recipe.rankedBar'])).status, 'PASS', '10 页以内不设下限');
assert.equal(pages.check(deck(11, EIGHT)).status, 'PASS', JSON.stringify(pages.check(deck(11, EIGHT)).errors));
assert.equal(pages.check(deck(21, TWELVE)).status, 'PASS', '21 页 12 种应通过（刚好达标）');
const fiveOnly = pages.check(deck(11, FIVE));
assert.equal(fiveOnly.status, 'FAIL', '11 页只有 5 种应被逐格计数后的新阈值挡住');
assert.ok(fiveOnly.errors.some(error => /需要至少 8 种表达/.test(error)), JSON.stringify(fiveOnly.errors));
/* 计数键：非 custom 页的 visual 是自由文案，改文案不得虚增类型数。 */
assert.equal(richness.typesOf(deck(11, ['recipe.rankedBar'])).length, 1, 'v1/v2 页没有格，按页主形式计数');
assert.equal(richness.typesOf({version: 2, pages: deck(11, ['recipe.rankedBar']).pages.map(p => ({...p, visual: '文案' + p.page}))}).length, 1, '不同 visual 文案不得算作不同图型');
/* custom 页没有可辨识的 form，按作者声明的实际图型分别计数。 */
const customs = {version: 2, pages: deck(11, ['svg.custom']).pages.map(p => ({...p, visual: '自定义图型' + (p.page % 8)}))};
assert.equal(richness.typesOf(customs).length, 8);
assert.equal(pages.check(customs).status, 'PASS', '8 种自定义图型应满足下限');
/* —— 计数口径：数的是"页面上实际出现的表达"，不是"每页的主形式" ——
   这一条直接对着"单页只塞一种图表、版面单薄"：一页三格填三种图就该记成三种，
   否则把表格与卡片补进其余格子得不到任何记分，填空没有回报，页面只会越做越薄。 */
const layoutContract = require('./layout_contract.cjs');
const multi = (formsList, over = {}) => ({
  version: 3,
  pages: [base({
    page: 1,
    layout: 'L05',
    dense: undefined,
    form: formsList[0],
    regions: formsList.map(form => ({form})),
    density: profile(),
    ...over
  })]
});
assert.equal(layoutContract.get('L05').modules.length, 3, '本组用例假定 L05 是三格布局');
assert.equal(richness.typesOf(multi(['recipe.rankedBar', 'recipe.timeSeries', 'kit.waterfall'])).length, 3, '一页三格三种表达记三种');
assert.equal(richness.typesOf(multi(['recipe.rankedBar', 'recipe.rankedBar', 'recipe.rankedBar'])).length, 1, '同一表达在一页出现三次仍只记一种');
const thin = pages.check(multi(['recipe.rankedBar', 'recipe.rankedBar', 'recipe.rankedBar']));
assert.equal(thin.status, 'FAIL', '三格同一种表达即单薄');
assert.ok(thin.errors.some(error => /只填出一种表达/.test(error)), JSON.stringify(thin.errors));
assert.equal(pages.check(multi(['recipe.rankedBar', 'recipe.rankedBar', 'recipe.rankedBar'], {varietyReason: '同一指标按三个区域分面，尺度与图型必须一致才可比。'})).status, 'PASS', '分面写清维度即可通过');
assert.equal(pages.check(multi(['recipe.rankedBar', 'recipe.rankedBar', 'recipe.rankedBar'], {varietyReason: '材料限制'})).status, 'FAIL', 'varietyReason 写了就必须说清楚');
/* "一种东西"按种类判，不按它可不可计入丰富度判：三格同一种表格、三格同一段文字同样单薄。
   口径若只留可计入的表达，这两种最典型的单薄会被算成 0 格直接漏掉，而报错文案里的
   "补一张表"也成了空头支票——补了不计分。 */
/* L05 的三格是 chart 槽，填不下表格与文字；改用 L06（四栏通用格）来验这条口径。 */
const cellsOf = (layoutId, formsList, over = {}) => ({
  version: 3,
  pages: [base({page: 1, layout: layoutId, dense: undefined, form: formsList[0], regions: formsList.map(form => ({form})), density: profile(), ...over})]
});
assert.equal(layoutContract.get('L06').modules.every(m => m.slot === 'panel'), true, '本组用例假定 L06 是四格通用格布局');
const thinTable = pages.check(cellsOf('L06', ['html.table', 'html.table', 'html.table', 'html.table']));
assert.equal(thinTable.status, 'FAIL', '四格同一种表格即单薄');
assert.ok(thinTable.errors.some(error => /4 格同一种 html\.table/.test(error)), JSON.stringify(thinTable.errors));
assert.equal(pages.check(cellsOf('L06', ['html.text', 'html.text', 'html.text', 'html.text'])).status, 'FAIL', '四格同一段文字即单薄');
/* 反过来：几种不同的东西，哪怕只有一种可计入丰富度，也不该被判单薄。 */
assert.equal(pages.check(cellsOf('L06', ['html.table', 'html.text', 'recipe.rankedBar', 'html.kpi'])).status, 'PASS', '表+文+图+指标四种东西不判单薄');
/* 两格同一种表达不触发：分格少时重复是版式选择，不是内容单薄。 */
assert.equal(pages.check({version: 3, pages: [base({page: 1, layout: 'L04', form: 'recipe.rankedBar', regions: [{form: 'recipe.rankedBar'}, {form: 'recipe.rankedBar'}], density: profile()})]}).status, 'PASS', JSON.stringify(pages.check({version: 3, pages: [base({page: 1, layout: 'L04', form: 'recipe.rankedBar', regions: [{form: 'recipe.rankedBar'}, {form: 'recipe.rankedBar'}], density: profile()})]}).errors));
/* 两格页（L17/L19/L25 加通用格后都是两格）不适用本条：分格少时这一页本来就不该被要求分面。 */
assert.equal(pages.check({version: 3, pages: [base({page: 1, layout: 'L19', form: 'html.table', regions: [{form: 'html.table'}, {form: 'html.text'}], density: profile()})]}).status, 'PASS', JSON.stringify(pages.check({version: 3, pages: [base({page: 1, layout: 'L19', form: 'html.table', regions: [{form: 'html.table'}, {form: 'html.text'}], density: profile()})]}).errors));
/* 豁免：写了就通过，但事实必须进 inventory，供审稿人看见而不是静默放行。 */
const exempt = deck(11, ['recipe.rankedBar'], {diversityReason: EXEMPT});
assert.equal(pages.check(exempt).status, 'PASS', JSON.stringify(pages.check(exempt).errors));
assert.equal(pages.inventory(exempt).diversityExempt, true);
assert.equal(pages.inventory(deck(11, EIGHT)).diversityExempt, false);
/* v1 历史稿不受新规则约束：与 densityErrors 同一先例，避免旧稿重新打包时突然失败。 */
assert.equal(pages.check({version: 1, pages: Array.from({length: 11}, (_, i) => base({page: i + 1, repetitionReason: '历史稿沿用同一形式，不做回溯改造。'}))}).status, 'PASS');

const cases = [
  [{version: 2, pages: [base({density: undefined})]}, /density 缺失/],
  [{version: 2, pages: [base({density: {...base().density, profile: 'dense'}})]}, /至少需要 3 个/],
  [{version: 2, pages: [base({density: {...base().density, profile: 'sparse'}})]}, /sparseReason/],
  [{version: 2, pages: [base({density: {...base().density, evidenceUnits: [unit('primary', '展示毛利与价格变化。'), unit('primary', '重复主角色不应通过。')]}})]}, /role 重复/],
  [deck(11, FIVE.slice(0, 4)), /正文 11 页需要至少 8 种表达，当前只有 4 种/],
  [deck(21, EIGHT), /正文 21 页需要至少 12 种表达，当前只有 8 种/],
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
