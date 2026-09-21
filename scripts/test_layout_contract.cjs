'use strict';
/* 布局合同把"这一页长什么样"变成可核对的模块几何：目录自洽、页面↔目录对账、布局丰富度下限，
   任何一处放松都会在这里失败。目录是唯一权威，本测试不复制任何几何常量。 */
const assert = require('node:assert/strict');
const grid = require('../assets/deck-grid.js');
const forms = require('../assets/deck-forms.js');
const lc = require('./layout_contract.cjs');
const pages = require('./check_pages.cjs');

let checks = 0;
const ok = (label, condition) => { assert.ok(condition, label); checks += 1; };

/* —— 1. 目录自检：条目合法、几何合法、留白有交代 —— */
assert.deepEqual(lc.catalogErrors(), [], '目录自检必须为零错误');
checks += 1;
ok('目录条数够撑起整册', lc.list().length >= 30);
ok('每条布局都能在两种画幅下算出几何', lc.list().every(layout => ['16x9', '4x3'].every(ratio => layout.modules.every(m => {
  const box = grid.box(m, ratio);
  return box.width > 0 && box.height > 0 && Number.isInteger(box.x) && Number.isInteger(box.y);
}))));
/* 死格子：一个槽位没有任何形式能填，作者选到这条布局就只能空着。 */
const deadSlots = [];
lc.list().forEach(layout => layout.modules.forEach(module => {
  if (!lc.slotFormList(module.slot)) deadSlots.push(layout.id + ' ' + module.slot);
}));
assert.deepEqual(deadSlots, [], '每个槽位都必须至少有一种可填形式');
checks += 1;
/* 满幅布局必须真的满幅：tiled 是承诺，不是形容词。 */
lc.list().filter(layout => layout.fill === 'tiled').forEach(layout => {
  ok(layout.id + ' tiled 铺满网格', grid.coverage(layout.modules).ratio === 1);
});
lc.list().filter(layout => layout.fill === 'open').forEach(layout => {
  ok(layout.id + ' open 确有留白并写了 openWhy', grid.coverage(layout.modules).ratio < 1 && lc.norm(layout.openWhy).length >= lc.MIN_REASON);
});
/* 加宽模块必须真的更宽：目录里的 w/h 是给作者选型看的，写错了选型就是错的。 */
lc.list().forEach(layout => layout.modules.forEach(module => {
  const box = grid.box(module, '16x9');
  ok(layout.id + ' ' + module.title + ' 几何与 w/h 一致', box.width === grid.span(module.w, grid.ratioOf('16x9').columnWidth, grid.ratioOf('16x9').gutter) && box.height === grid.span(module.h, grid.ratioOf('16x9').rowHeight, grid.ratioOf('16x9').gutter));
}));

/* —— 2. 几何推导出的容量：布局必须报得出每格装得下几行 —— */
const measured = lc.measure('L01', '16x9');
ok('measure 返回每条布局的格子', measured.modules.length === lc.get('L01').modules.length);
ok('measure 的盒子与 grid.box 同源', measured.modules.every((m, i) => JSON.stringify(m.box) === JSON.stringify(grid.box(lc.get('L01').modules[i], '16x9'))));
ok('measure 给出容量', measured.modules.every(m => m.lines.body.plain >= 0 && m.lines.body.titled <= m.lines.body.plain));
/* 深模块才装得下带坐标轴的精确展品：目录里四格辅助证据必然偏小，这是选型时要看见的事实。 */
const small = lc.list().flatMap(layout => grid.sizeWarnings(layout.modules, '16x9').map(warning => layout.id + ' ' + warning));
ok('过小的精确展品格会被指出', small.length > 0);

/* —— 3. 页面 ↔ 目录对账：v3 的每一格都要交代清楚 —— */
const full = (over = {}) => Object.assign({
  version: 3,
  pages: [Object.assign({
    page: 1,
    layout: 'L01',
    proves: '读者要直接看出的关系。',
    form: 'recipe.rankedBar',
    regions: [{form: 'recipe.rankedBar'}, {form: 'html.text'}],
    density: {
      profile: 'balanced',
      evidenceUnits: [{role: 'primary', purpose: '主图呈现核心比较。'}, {role: 'support', purpose: '侧栏限定解释范围。'}],
      spaceIntent: '主证据占主体阅读区，侧栏紧随其后，底部只留来源安全区。'
    }
  }, over)]
}, over.deck || {});
ok('合规的 v3 页通过', pages.check(full()).status === 'PASS', JSON.stringify(pages.check(full()).errors));

const failWith = (over, pattern) => {
  const out = pages.check(full(over));
  assert.equal(out.status, 'FAIL', JSON.stringify(over));
  assert.ok(out.errors.some(error => pattern.test(error)), JSON.stringify(out.errors));
  checks += 1;
};
failWith({layout: undefined}, /缺少 layout/);
ok('写了 layoutExemptReason 可免布局', pages.check(full({layout: undefined, layoutExemptReason: '本页为一次性手绘示意，几何与阅读顺序都在 SVG 内部决定。'})).status === 'PASS');
ok('layoutExemptReason 太短不算数', pages.check(full({layout: undefined, layoutExemptReason: '没有合适的。'})).status === 'FAIL');
failWith({layout: 'L99'}, /未知布局 L99/);
failWith({regions: [{form: 'recipe.rankedBar'}]}, /regions 有 1 项/);
failWith({regions: [{form: 'recipe.rankedBar'}, {form: 'html.text'}, {form: 'html.text'}]}, /regions 有 3 项/);
failWith({regions: undefined}, /却没有 regions/);
failWith({regions: [{form: 'recipe.rankedBar'}, {}]}, /缺少 form/);
/* 槽位是布局对内容的约束：表格式的格不能填一张图，图格也不能拿表格顶替。 */
failWith({form: 'html.matrix', regions: [{form: 'html.matrix'}, {form: 'html.text'}]}, /slot=chart 装不下 html.matrix/);
failWith({regions: [{form: 'recipe.rankedBar', c: 1, r: 1, w: 8, h: 6}, {form: 'html.text'}]}, /不要写 c\/r\/w\/h/);
failWith({form: 'kit.dumbbell', regions: [{form: 'recipe.rankedBar'}, {form: 'html.text'}]}, /主展品是第 1 格「主证据」/);
failWith({form: 'svg.custom', regions: [{form: 'svg.custom'}, {form: 'html.text'}]}, /svg.custom 必须用 visual 声明实际表达/);
failWith({form: 'svg.custom', visual: 'x', regions: [{form: 'svg.custom', visual: 'y'}, {form: 'html.text'}]}, /主展品的 visual 与 page.visual 不一致/);
failWith({regions: [{form: 'recipe.rankedBar', slot: 'table'}, {form: 'html.text'}]}, /slot 与目录不一致/);
/* 布局限定某格只能填某几种形式时，填别的要报错并带出布局自己的约束说明。 */
const limited = lc.list().find(layout => layout.modules.some(m => Array.isArray(m.accepts)));
const limitedModule = limited.modules.findIndex(m => Array.isArray(m.accepts));
const otherForm = forms.list().find(form => grid.slotAccepts(limited.modules[limitedModule].slot, form) && !lc.formInAccepts(form, limited.modules[limitedModule].accepts));
ok('目录里存在限定形式的格子', limitedModule >= 0 && !!otherForm);
if (otherForm) {
  const regions = limited.modules.map((m, i) => i === limitedModule ? {form: otherForm} : {form: forms.list().find(f => grid.slotAccepts(m.slot, f) && (!m.accepts || lc.formInAccepts(f, m.accepts)))});
  const out = lc.pageErrors({layout: limited.id, form: regions[lc.primaryIndex(limited)].form, regions}, '本页');
  ok('限定格换形式要报错', out.some(error => /本布局限定这一格填/.test(error)));
}

/* —— 4. resolveModules：装配与浏览器审计共用一份几何，不能各算一遍 —— */
const resolved = lc.resolveModules(full().pages[0], '16x9');
ok('resolveModules 逐格给出几何与形式', resolved.length === 2 && resolved[0].form === 'recipe.rankedBar' && resolved[1].form === 'html.text');
ok('resolveModules 标记主展品', resolved[0].primary === true && resolved[1].primary === false);
ok('resolveModules 的盒子与目录一致', resolved.every((m, i) => JSON.stringify(m.box) === JSON.stringify(grid.box(lc.get('L01').modules[i], '16x9'))));
ok('无布局页不产出格子', lc.resolveModules({page: 1}).length === 0);

/* —— 5. 布局丰富度下限：结构与证据形式一样要有变化 —— */
/* 阈值跟着"同一布局第 3 次使用要写理由"走：上限是 ceil(N/2)，下限各留一条复用口子。
   所以 11 页档 6、21 页档 10——正好是一个"不写理由就不够用"的位置。 */
ok('页数不足不设下限', lc.requiredLayouts(10) === 0 && lc.requiredLayouts(11) === 6 && lc.requiredLayouts(21) === 10);
/* 一组互相不打架、且每格都装得下至少一种表达形式的骨架，供下限类断言造稿用。
   刻意不取 L17/L19/L25/L28：那四条通篇只有表格或文字格，一页能记到的表达形式是 0 种，
   会把"库存记录逐页表达数"这条断言和下限量本身搅在一起（是夹具问题，不是下限问题）。 */
const SIX = ['L01', 'L02', 'L03', 'L04', 'L05', 'L06'];
const TEN = [...SIX, 'L07', 'L08', 'L09', 'L10'];
const densityPlan = () => ({
  profile: 'balanced',
  evidenceUnits: [{role: 'primary', purpose: '展示主展品要表达的核心关系。'}, {role: 'support', purpose: '补充基准与分母，限定结论范围。'}],
  spaceIntent: '主证据占据主体阅读区，支持证据紧随其后，底部只保留来源安全区。'
});
/* 造一册"合规"的稿子：每格按槽位挑一个合法形式，并让相邻几格不撞，
   这样下限类断言失败时才一定是下限本身在报错，而不是被别的规则连带拖下水。
   autoLayoutReason 默认打开——同一条布局第 3 次起本来就要写理由，那是合规的一部分。 */
const deckOf = (count, refs, over = {}) => {
  const {autoLayoutReason = true, ...rest} = over;
  const uses = new Map();
  const pages = Array.from({length: count}, (_, i) => {
    const ref = refs[i % refs.length], layout = lc.get(ref);
    const nth = (uses.get(ref) || 0) + 1; uses.set(ref, nth);
    let cursor = i * 7;
    const regions = layout.modules.map(module => {
      // 排除 svg.custom：它必须由作者声明 visual，测试夹具不该替作者编一个图型名。
      const legal = forms.list().filter(form => form !== 'svg.custom' && grid.slotAccepts(module.slot, form) && (!module.accepts || lc.formInAccepts(form, module.accepts)) && lc.formFit(form, module).fits !== false);
      return {form: legal[cursor++ % legal.length]};
    });
    const primary = lc.primaryIndex(layout);
    return Object.assign({
      page: i + 1, layout: ref, proves: '第' + (i + 1) + '页要读者看出的关系。',
      form: regions[primary].form, regions,
      repetitionReason: '同类形式在此处承担相同的论证角色，已在版式上分组以免误读。',
      density: densityPlan()
    }, autoLayoutReason && nth >= 3 ? {layoutReason: '本页是同一论证链的续页，保持同一骨架读者才能沿同一条路径读完。'} : {});
  });
  return Object.assign({version: 3}, rest, {pages});
};
ok('11 页 6 种布局刚好达标', pages.check(deckOf(11, SIX)).status === 'PASS', JSON.stringify(pages.check(deckOf(11, SIX)).errors.slice(0, 3)));
const insufficient = pages.check(deckOf(11, SIX.slice(0, 5)));
ok('11 页 5 种布局被拦下', insufficient.status === 'FAIL' && insufficient.errors.some(error => /需要至少 6 种布局/.test(error)));
const shortage = '本稿的全部证据都是同一口径的同期对照，换结构会破坏读者建立的比较基准。';
ok('写了 layoutDiversityReason 可免', pages.check(deckOf(11, SIX.slice(0, 5), {layoutDiversityReason: shortage})).status === 'PASS', JSON.stringify(pages.check(deckOf(11, SIX.slice(0, 5), {layoutDiversityReason: shortage})).errors.slice(0, 2)));
ok('layoutDiversityReason 太短不算数', pages.check(deckOf(11, SIX.slice(0, 5), {layoutDiversityReason: '材料限制'})).status === 'FAIL');
ok('21 页 9 种布局不足', pages.check(deckOf(21, TEN.slice(0, 9))).status === 'FAIL');
ok('21 页 10 种布局刚好达标', pages.check(deckOf(21, TEN)).status === 'PASS', JSON.stringify(pages.check(deckOf(21, TEN)).errors.slice(0, 3)));
/* 下限不是靠"多用几条布局"就能绕开的：页数涨、下限不涨时，复用压力由第 3 次使用规则接管。 */
ok('20 页与 21 页分属两档', lc.requiredLayouts(20) === 6 && lc.requiredLayouts(21) === 10);
/* 同一条布局第 3 次使用起要说得出为什么：换形式是另一种读法，但不能是默认动作。 */
const repeated = deckOf(6, ['L01'], {autoLayoutReason: false});
ok('第三次复用同一布局要写理由', pages.check(repeated).errors.some(error => /第 3 次使用/.test(error)));
repeated.pages.slice(2).forEach(page => { page.layoutReason = '本页是同一论证链的续页，保持同一骨架读者才能沿同一条路径读完。'; });
ok('写了 layoutReason 就放行', pages.check(repeated).status === 'PASS', JSON.stringify(pages.check(repeated).errors.slice(0, 2)));

/* —— 6. 库存：下限与豁免的事实必须能被审稿看见 —— */
const stock = pages.inventory(deckOf(11, SIX));
ok('库存记录布局分布', stock.distinctLayouts === 6 && stock.layoutRequired === 6 && stock.layoutExempt === false);
ok('库存记录逐页表达数', stock.expressions.length === 11 && stock.expressions.every(item => item.expressions >= 1));
ok('库存记录模块总数', stock.modules === deckOf(11, SIX).pages.reduce((sum, page) => sum + page.regions.length, 0));
ok('库存暴露布局豁免', pages.inventory(deckOf(11, SIX.slice(0, 4), {layoutDiversityReason: shortage})).layoutExempt === true);

/* —— 7. 母版与族：条目要能按母版与族检索，选型才有路径 —— */
ok('每个母版都有成员布局', lc.masters().every(master => lc.memberLayouts(master.id).length > 0));
ok('布局都有母版归属', lc.list().every(layout => lc.masters().some(master => master.id === layout.master)));
ok('族标与族名一致', lc.list().every(layout => lc.norm(layout.familyName).length > 0));
ok('未知母版报错', (() => { try { lc.master('nope'); return false; } catch (error) { return /未知母版/.test(error.message); } })());
ok('目录覆盖全部十二个槽位之外的内容形式', forms.list().every(form => grid.SLOTS.some(slot => grid.slotAccepts(slot, form))));
const families = [...new Set(lc.list().map(layout => layout.family))];
ok('布局族数足够支撑选型', families.length >= 6);

console.log(JSON.stringify({
  pass: true, checks, layouts: lc.list().length, masters: lc.masters().map(master => master.id),
  families, tiled: lc.list().filter(layout => layout.fill === 'tiled').length,
  open: lc.list().filter(layout => layout.fill === 'open').length,
  layoutTiers: lc.LAYOUT_TIERS, sizeWarnings: small.length
}));
