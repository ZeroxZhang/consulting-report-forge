'use strict';
const assert = require('node:assert/strict');
const {inspectSlide} = require('./browser_module_fill.cjs');
async function main() {
  const browser = await require('playwright').chromium.launch({channel: process.env.CHROME_CHANNEL || 'chrome', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    const render = async (html, css = '') => {
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}.slide{width:1280px;height:720px;font:20px/28px Arial}.slide__body{position:relative;width:1200px;height:600px}p{margin:0}.layout-paired{display:grid;grid-template-columns:1fr 1fr;gap:24px;height:100%}.module{position:relative;height:100%;padding:12px} ${css}</style><section class="slide" data-page-role="analysis"><main class="slide__body">${html}</main></section>`);
      await page.evaluate(() => document.fonts.ready);
    };
    const inspect = () => page.locator('.slide').evaluate(inspectSlide);
    const findRegion = (result, text) => result.regions.find(r => r.selector === text);
    const selectorOf = selector => page.locator(selector).evaluate(el => { const slide = el.closest('.slide'), parts = []; for (let n = el; n !== slide; n = n.parentElement) parts.unshift(n.localName + ':nth-child(' + ([...n.parentElement.children].indexOf(n) + 1) + ')'); return ':scope > ' + parts.join(' > '); });

    // 透明满高 p、底部脚注和相邻满栏不能掩盖文字栏的中部空洞。
    await render(`<div class="layout-paired"><div class="module" data-module="same"><svg width="100%" height="100%"><rect width="100%" height="100%" fill="lightgray"/></svg></div><div class="module" data-module="same" data-fill-column><p style="height:100%">顶部两行信息<br>文字仍只在上方</p><small style="position:absolute;bottom:12px;left:12px">来源脚注</small></div></div>`);
    const first = await inspect(), rightId = await selectorOf('[data-fill-column]'), right = findRegion(first, rightId);
    assert.ok(right.findings.some(f => f.ruleId === 'D1' && f.axis === 'y' && f.position === 'middle'), '脚注不得掩盖中部空白');
    assert.ok(right.findings.some(f => f.ruleId === 'D2' && f.axis === 'y' && f.position === 'middle'), '满高文字父框不得冒充内容');
    assert.ok(right.measurements.measuredVerticalCoverage < .25);
    assert.equal(right.measurements.baselineFillRatio, null, '实测占用率不能冒充默认排版填充率');
    assert.equal(new Set(first.regions.map(r => r.id)).size, first.regions.length, '同名 data-module 必须有独立稳定 ID，同元素不能重复');
    assert.equal(right.kind, 'column');
    assert.ok(first.regions.some(r => r.kind === 'body'));
    assert.deepEqual((await inspect()).regions.map(r => r.id), first.regions.map(r => r.id), '重复读取 ID 稳定');

    // 可见性以文字实际排版为准：contents 父框没有矩形，透明滤镜却有矩形。
    await render('<div class="module"><span style="display:contents">真实可见的直接文字</span></div>');
    const contents = (await inspect()).regions.find(r => r.kind === 'module');
    assert.equal(contents.measurements.textFragments, 1, 'display:contents 中的直接文字不能漏测');
    assert.ok(contents.measurements.measuredVerticalCoverage > 0);
    for (const css of ['filter:opacity(0)', 'opacity:0', 'overflow:hidden']) {
      await render('<div class="module"><span style="display:contents;' + css + '"><span>无盒祖先中的可见正文</span></span></div>');
      const unboxed = (await inspect()).regions.find(r => r.kind === 'module');
      assert.equal(unboxed.measurements.textFragments, 1, 'display:contents 的盒级样式不应隐藏实际文字：' + css);
      assert.ok(!unboxed.findings.some(f => f.ruleId === 'D3'), '无盒祖先不能提供虚假的零尺寸裁切边界');
    }

    await render('<div class="module"><p style="filter:opacity(0);height:500px">不可见文字<br>不可见第二行</p></div>');
    const transparent = (await inspect()).regions.find(r => r.kind === 'module');
    assert.equal(transparent.measurements.textFragments, 0, '透明滤镜不可冒充内容占用');
    assert.equal(transparent.measurements.measuredVerticalCoverage, 0);
    await render('<div class="module" style="visibility:hidden"><p style="visibility:visible">显式恢复可见的正文</p></div>');
    assert.equal((await inspect()).regions.find(r => r.kind === 'body').measurements.textFragments, 1, 'visibility 可由子元素显式恢复，不能只看祖先');

    // 每栏单独测横向空洞；预留声明不消除候选。
    await render(`<div class="module card" data-fill-region><p style="width:160px">只有左侧文字</p><div data-fill-reserve="突出单一判断的阅读停顿" style="position:absolute;top:80px;left:200px;width:600px;height:300px"></div></div>`);
    const horizontal = await inspect(), module = horizontal.regions.find(r => r.kind === 'module');
    assert.ok(module.findings.some(f => f.ruleId === 'D1' && f.axis === 'x' && f.position === 'right'));
    assert.ok(module.findings.some(f => f.ruleId === 'D2' && f.axis === 'x' && f.position === 'right'));
    assert.equal(module.reserved[0].reason, '突出单一判断的阅读停顿');
    assert.ok(module.findings.every(f => f.requiresReview === true));

    // 图表内部的稀疏区由实际图表审查；模块测量使用媒体整体矩形。
    await render(`<div class="module"><svg style="display:block;width:100%;height:100%" viewBox="0 0 1176 576"><circle cx="30" cy="30" r="4"/><text x="50" y="40">稀疏散点</text></svg></div>`);
    const svgResult = await inspect(), chart = svgResult.regions.find(r => r.kind === 'module');
    assert.equal(chart.measurements.mediaObjects, 1);
    assert.equal(chart.measurements.textFragments, 0);
    assert.equal(chart.measurements.measuredVerticalCoverage, 1);
    assert.ok(!chart.findings.some(f => ['D1', 'D2'].includes(f.ruleId)), '不能把图表内部绘图区当文字空洞');

    // 打印字体改变后实际文字被裁切，预留空白不能豁免 D3。
    await render(`<div class="module" data-fill-reserve="标题下方单一判断居中"><div class="clip"><p>第一行信息<br>第二行信息<br>第三行信息</p></div></div>`, '.clip{height:100px;overflow:hidden}@media print{.clip{font-size:34px;line-height:44px}}');
    await page.emulateMedia({media: 'screen'});
    const screen = await inspect();
    assert.ok(!screen.regions.some(r => r.findings.some(f => f.ruleId === 'D3')), '屏幕三行应完整可见');
    await page.emulateMedia({media: 'print'});
    const printed = await inspect();
    assert.ok(printed.regions.some(r => r.findings.some(f => f.ruleId === 'D3' && f.axis === 'y' && f.position === 'bottom' && f.boundary === 'overflow')), '打印模式必须发现实际行框被裁切');
    assert.ok(printed.regions.find(r => r.kind === 'module').reserved.length);
    assert.deepEqual(printed.regions.map(r => r.id), screen.regions.map(r => r.id), '跨媒介区域身份可对账');

    await page.emulateMedia({media: 'screen'});
    await render('<div class="layout-paired"><div></div><div></div></div>');
    const empty = await inspect();
    assert.equal(empty.regions.filter(r => r.kind === 'column').length, 2);
    assert.ok(empty.regions.filter(r => r.kind === 'column').every(r => r.findings.some(f => f.ruleId === 'D2')), '空栏本身必须被枚举和检查');
    for (const role of ['cover', 'references', 'back-cover', 'divider']) {
      await page.locator('.slide').evaluate((el, value) => el.dataset.pageRole = value, role);
      assert.deepEqual((await inspect()).regions, [], role + ' 不适用正文模块扫描');
    }
    console.log(JSON.stringify({pass: true,scope: '真实 Chromium：透明满高文字、独立栏、脚注中空、横向留白、声明预留、稀疏 SVG、屏幕/打印裁切与稳定 ID', limitation: '合成浏览器夹具；不代表真实报告视觉通过'}));
  } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {main};
