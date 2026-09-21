'use strict';
/* 同口径系列报告、小多图与内容自定阅读区：新策略允许合理重复，历史合同仍按原门槛检查。 */
const assert = require('node:assert/strict');
const layouts = require('./layout_contract.cjs');
const richness = require('./richness_contract.cjs');
const clone = value => JSON.parse(JSON.stringify(value));

const comparison = {
  page: 1, layout: 'custom', form: 'recipe.rankedBar', proves: '同口径比较各地区的收入规模。',
  regions: [
    {slot: 'main', role: 'primary', form: 'recipe.rankedBar', span: 7.5},
    {slot: 'bottom', role: 'support', form: 'html.table', span: 2.5}
  ]
};
for (const ratio of ['16x9', '4x3']) assert.deepEqual(layouts.customPageErrors(comparison, '主图加支持带', ratio), []);
assert.deepEqual(layouts.resolveModules(comparison), [], '不能给自定义阅读区编造目录坐标');
assert.ok(layouts.pageErrors(comparison).some(error => /未知布局/.test(error)), '旧目录入口不能默默接受 custom');
assert.ok(layouts.customPageErrors(comparison, '本页', 'unknown').some(error => /未知画幅/.test(error)));

const invalid = mutate => { const page = clone(comparison); mutate(page); return layouts.customPageErrors(page); };
assert.ok(invalid(page => { page.regions = []; }).some(error => /非空 regions/.test(error)));
assert.ok(invalid(page => { page.regions[1].role = 'primary'; }).some(error => /恰好有一个/.test(error)));
assert.ok(invalid(page => { page.regions[0].slot = 'outside'; }).some(error => /slot/.test(error)));
assert.ok(invalid(page => { page.regions[0].span = Infinity; }).some(error => /正有限数/.test(error)));
assert.ok(invalid(page => { page.regions[0].form = 'unregistered'; }).some(error => /形式/.test(error)));
assert.ok(invalid(page => { page.form = 'html.table'; }).some(error => /主区形式/.test(error)));
const selfDrawn = {...clone(comparison), form: 'svg.custom', visual: '带置信区间的地区收入点图'};
selfDrawn.regions[0] = {...selfDrawn.regions[0], form: 'svg.custom', visual: selfDrawn.visual};
assert.deepEqual(layouts.customPageErrors(selfDrawn), [], '自绘表达属于正式路径，仍须声明实际图型');
delete selfDrawn.regions[0].visual;
assert.ok(layouts.customPageErrors(selfDrawn).some(error => /必须用 visual/.test(error)));

// 多期同口径比较需要稳定阅读结构，不能为了满足种数要求改用不适合的图。
const series = {version: 4, pages: Array.from({length: 21}, (_, index) => ({
  ...clone(comparison), page: index + 1, layout: 'L01',
  regions: [{form: 'recipe.rankedBar'}, {form: 'html.text'}]
}))};
assert.deepEqual(layouts.validate(series), []);
assert.deepEqual(richness.validate(series), []);
assert.ok(layouts.validate({...series, version: 3}).some(error => /需要至少/.test(error)), '历史布局配额保留');
assert.ok(richness.validate({...series, version: 3}).some(error => /需要至少/.test(error)), '历史图型配额保留');
assert.equal(layouts.inventory(series).layoutRequired, 0);
assert.equal(layouts.inventory({...series, version: 3}).layoutRequired, 10);
assert.ok(layouts.diagnostics(series).some(item => item.code === 'L-CONSECUTIVE-LAYOUT' && item.pages.length === 21));
assert.ok(richness.diagnostics(series).some(item => item.code === 'R-REPEATED-EXPRESSION' && item.pages.length === 21));

// 同尺度分面可在一页使用同形式；换成三个无关图型并不天然更好。
const facets = {version: 4, pages: [{...clone(comparison), regions: [
  {slot: 'left', role: 'primary', form: 'recipe.rankedBar', span: 1},
  {slot: 'main', role: 'evidence', form: 'recipe.rankedBar', span: 1},
  {slot: 'right', role: 'evidence', form: 'recipe.rankedBar', span: 1}
]}]};
assert.deepEqual(layouts.customPageErrors(facets.pages[0]), []);
assert.deepEqual(richness.validate(facets), []);
assert.equal(richness.perPage(facets)[0].expressions, 3);
assert.equal(richness.perPage({...facets, version: 2})[0].expressions, 1, '旧版任意 layout 字段不改变既有按页计数口径');
assert.equal(richness.typesOf(facets).length, 1);
assert.ok(richness.diagnostics(facets).some(item => item.code === 'R-SAME-EXPRESSION-PANELS'));
const mixed = {version: 4, pages: [clone(comparison), {...clone(comparison), page: 2}]};
mixed.pages[1].regions = facets.pages[0].regions;
assert.equal(layouts.diagnostics(mixed)[0].distinctStructures, 2, 'custom 标签相同不意味着阅读结构相同');
assert.equal(richness.typesOf({version: 4, pages: [comparison]}).length, 1, '支持表计入阅读区但不假装是第二种图型');
console.log(JSON.stringify({pass: true, scope: 'custom reading regions, catalog compatibility, legitimate repetition and diagnostic inventory'}));

async function browserRegression() {
  const {chromium} = require('playwright'), policy = require('./browser_visual_policy.cjs');
  const browser = await chromium.launch({channel: process.env.CHROME_CHANNEL || 'chrome', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    const html = `<html><head><style>
      body{margin:0}.slide{position:relative;width:1280px;height:720px;color:#111;background:#fff}
      .slide__body{position:absolute;left:40px;top:160px;width:1200px;height:486px}
      p{position:absolute;left:0;top:0;width:1100px;height:40px;margin:0;font:18px/24px sans-serif}
      .support{top:350px}.decorated{border-left:4px solid #000080;padding-left:12px}
    </style></head><body><section class="slide" data-density-profile="balanced">
      <div class="slide__body"><p>规模比较使用一致口径，留白是否服务阅读须实际判断。</p><p class="support">支持证据与主证据保持明确关系。</p></div>
    </section></body></html>`;
    await page.setContent(html);
    const inspect = () => page.locator('.slide').evaluate(policy.inspectSlide);
    for (const version of ['', '1', '2', '3', '04']) {
      await page.evaluate(value => { document.documentElement.dataset.pageContractVersion = value; }, version);
      assert.ok((await inspect()).errors.some(item => item.code === 'V-UNDERFILLED-PAGE'), '旧版或未声明版本保留空档错误：' + version);
    }
    await page.evaluate(() => { document.documentElement.dataset.pageContractVersion = '4'; });
    const modern = await inspect();
    assert.ok(!modern.errors.some(item => item.code === 'V-UNDERFILLED-PAGE'));
    assert.ok(modern.warnings.some(item => item.code === 'V-INTERNAL-VOID' && item.requiresReview === true));
    await page.locator('.support').evaluate(element => element.remove());
    assert.ok((await inspect()).warnings.some(item => item.code === 'V-BODY-REMAINDER' && item.requiresReview === true));
    await page.locator('p').evaluate(element => element.classList.add('decorated'));
    assert.ok((await inspect()).errors.some(item => item.code === 'V-DECORATIVE-EDGE'), 'v4 不放宽非空白缺陷');
    console.log(JSON.stringify({pass: true, scope: 'real Chrome whitespace severity by page contract version; unrelated visual errors unchanged'}));
  } finally { await browser.close(); }
}
if (process.argv.includes('--browser')) browserRegression().catch(error => { console.error(error); process.exitCode = 1; });
