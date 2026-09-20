/* 瀑布合同的门禁测试：声明侧（pages.json）与现场侧（成稿属性）。
   与 test_waterfall_bridge.cjs 分工：那个测内核算得对不对，这个测门禁拦不拦得住。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const W = require('./waterfall_contract.cjs');
const pages = require('./check_pages.cjs');
const B = require('../assets/waterfall-bridge.js');
const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wf-contract-'));

let checks = 0;
const ok = (name, condition, detail) => { checks += 1; assert.ok(condition, name + (detail === undefined ? '' : '：' + JSON.stringify(detail))); };
const eq = (name, actual, expected) => { checks += 1; assert.equal(actual, expected, name + '（实际 ' + JSON.stringify(actual) + '）'); };
const block = page => ({page: 1, proves: 'x', form: 'kit.waterfall', layout: 'L01',
  density: {profile: 'balanced', reason: '占位理由足够长', evidenceUnits: [{role: 'primary', form: 'kit.waterfall'}]}, ...page});

/* ---------- 声明侧：结构校验 ---------- */
eq('不声明就整页不查', W.blockErrors({page: 1}, '在第1条').length, 0);
ok('声明为空对象要报错', W.blockErrors({waterfall: {}}, '在第1条')[0].includes('status'));
ok('status 取值受限', W.blockErrors({waterfall: {status: 'ok'}}, '在第1条')[0].includes('not_applicable'));

/* not_applicable：豁免必须说人话，且不能两边都写。 */
ok('not_applicable 缺 reason 被拦', W.blockErrors({waterfall: {status: 'not_applicable'}}, '在第1条')[0].includes('≥' + W.MIN_REASON));
ok('not_applicable 的 reason 太短被拦', W.blockErrors({waterfall: {status: 'not_applicable', reason: '太短了'}}, '在第1条').length, 1);
eq('not_applicable 写够字数就放行', W.blockErrors({waterfall: {status: 'not_applicable', reason: '这一页是手绘的资金流向示意，不含可加总的起点与增量'}}, '在第1条').length, 0);
ok('not_applicable 不能同时声明对账结论', W.blockErrors({waterfall: {status: 'not_applicable', reason: '这一页是手绘的资金流向示意，不含可加总的起点与增量', reconciliation: '0'}}, '在第1条')[0].includes('两个结论'));

/* verified：三个数必须是从内核抄来的，且账要平。 */
const verified = extra => ({waterfall: {status: 'verified', reconciliation: '0', tolerance: '0.000001', nodes: 8, ...extra}});
eq('对得上的声明放行', W.blockErrors(verified({}), '在第1条').length, 0);
ok('缺 reconciliation 被拦', W.blockErrors({waterfall: {status: 'verified', tolerance: '0.000001', nodes: 8}}, '在第1条')[0].includes('chart.reconciliation'));
ok('缺 tolerance 被拦', W.blockErrors({waterfall: {status: 'verified', reconciliation: '0', nodes: 8}}, '在第1条')[0].includes('容差'));
ok('缺 nodes 被拦', W.blockErrors({waterfall: {status: 'verified', reconciliation: '0', tolerance: '0.000001'}}, '在第1条')[0].includes('nodes'));
ok('reconciliation 不是数被拦', W.blockErrors(verified({reconciliation: '差不多吧'}), '在第1条')[0].includes('原样字符串'));
expectError('超容差且不承认残差被拦', verified({reconciliation: '1'}), /被门禁拦住/);
eq('超容差但承认残差 + 写清理由就放行', W.blockErrors(verified({reconciliation: '1', residual: '1', residualReason: '四舍五入到万元造成的差额，已在图上单独成柱'}), '在第1条').length, 0);
expectError('承认残差但理由太短被拦', verified({reconciliation: '1', residual: '1', residualReason: '差额'}), /residualReason/);
eq('residual 为 0 不要求理由', W.blockErrors(verified({residual: '0'}), '在第1条').length, 0);
expectError('节点超上限被拦', verified({nodes: 19}), /归并驱动项/);
eq('节点正好 18 放行', W.blockErrors(verified({nodes: 18}), '在第1条').length, 0);
expectError('residual 不是数被拦', verified({residual: '有一点'}), /原样字符串/);

function expectError(name, page, pattern) {
  const errors = W.blockErrors(page, '在第1条');
  checks += 1;
  assert.ok(errors.some(error => pattern.test(error)), name + '：' + JSON.stringify(errors));
}

/* ---------- 声明侧：挂进 pages.json 后仍然生效 ---------- */
const wfForm = 'kit.waterfall';
{
  const doc = {version: 3, pages: [block(verified({}))]};
  const result = pages.check(doc);
  /* 布局与密度会先报它们自己的错；这里只关心 waterfall 的那一条不再出现在错误里。 */
  ok('合法声明不产生 waterfall 错误', !result.errors.some(e => /waterfall/.test(e)), result.errors);
  eq('inventory 数得出声明过的瀑布页', result.inventory.waterfallPages, 1);
  eq('inventory 分出 verified 与 not_applicable', result.inventory.waterfallVerified, 1);
  eq('inventory 统计节点总数', result.inventory.waterfallNodes, 8);
}
{
  const result = pages.check({version: 3, pages: [block(verified({reconciliation: '1', residual: '1'}))]});
  ok('残差没写理由时 pages 合同报错', result.errors.some(e => /residualReason/.test(e)), result.errors);
}
{
  const result = pages.check({version: 3, pages: [block({waterfall: {status: 'not_applicable', reason: '这一页是手绘的资金流向示意，不含可加总的起点与增量'}})]});
  eq('inventory 分出豁免页', result.inventory.waterfallNotApplicable, 1);
  eq('豁免页不算 verified', result.inventory.waterfallVerified, 0);
}
{
  const result = pages.check({version: 3, pages: [block(verified({residual: '1', residualReason: '四舍五入到万元造成的差额，已在图上单独成柱'}))]});
  ok('带残差的页被单独列出来', result.inventory.waterfallWithResidual.includes(1), result.inventory.waterfallWithResidual);
}

/* ---------- 现场侧：成稿属性与声明的两处对账 ---------- */
const dom = extra => ({page: 1, form: wfForm, waterfall: {form: wfForm, isWaterfallForm: true, axes: 1, residual: '', tolerance: '0.000001', nodes: 8, ...extra}});
const declared = extra => ({page: 1, form: wfForm, waterfall: {status: 'verified', reconciliation: '0', tolerance: '0.000001', nodes: 8, ...extra}});
eq('两处一致时无话可说', pages.waterfallMismatches(dom(), declared(), 1).length, 0);
expectMatch('没走内核的图被拦', {...dom(), waterfall: {form: wfForm, isWaterfallForm: true, axes: 0, residual: null, tolerance: null, nodes: null}}, declared(), /没走体检/);
expectMatch('声明豁免但图上有对账零轴被拦', dom(), {page: 1, form: wfForm, waterfall: {status: 'not_applicable', reason: '这一页是手绘的资金流向示意，不含可加总的起点与增量'}}, /两边只能有一个是对的/);
expectMatch('residual 两处不一致被拦', dom({residual: '1'}), declared(), /residual 与成稿不一致/);
expectMatch('tolerance 两处不一致被拦', dom({tolerance: '0.01'}), declared(), /tolerance 与成稿不一致/);
expectMatch('nodes 两处不一致被拦', dom({nodes: 7}), declared(), /nodes 与成稿不一致/);
eq('残差写成 null 与空串是同一件事', pages.waterfallMismatches(dom({residual: ''}), declared({residual: null}), 1).length, 0);
eq('没声明就整页不查', pages.waterfallMismatches(dom(), {page: 1, form: wfForm}, 1).length, 0);
eq('声明豁免且图上确实没有零轴则放行', pages.waterfallMismatches({page: 1, form: wfForm, waterfall: {form: wfForm, isWaterfallForm: true, axes: 0, residual: null, tolerance: null, nodes: null}},
  {page: 1, form: wfForm, waterfall: {status: 'not_applicable', reason: '这一页是手绘的资金流向示意，不含可加总的起点与增量'}}, 1).length, 0);

function expectMatch(name, slide, page, pattern) {
  const errors = pages.waterfallMismatches(slide, page, 1);
  checks += 1;
  assert.ok(errors.some(error => pattern.test(error)), name + '：' + JSON.stringify(errors));
}

/* ---------- 现场侧：探针自己的判据 ----------
   这一支过去只在浏览器里被跑到，测试链完全没覆盖：把 kit.waterfall 从白名单里删掉，
   整个 npm test 照样全绿。判据函数是纯函数，直接喂合成行就能锁住。 */
{
  const probe = require('./page_probe.cjs');
  /* 瀑布形式清单只有一份权威：形式目录的 limits.reconciles。这里把期望值钉死，
     目录里少标一个、或探针改成别的派生方式，都会红——不然这个常量没人看得见。 */
  /* 排过序再比：清单的顺序由目录的书写顺序决定，那不该是这条断言要管的事。 */
  eq('探针的瀑布形式清单就是这两个', probe.WF_FORMS.slice().sort().join(','), 'kit.waterfall,precision.waterfall');
  const facts = extra => ({page: 2, waterfall: {form: 'kit.waterfall', isWaterfallForm: true, axes: 1, residual: '', tolerance: '0.000001', nodes: 8, ...extra}});
  const codes = row => probe.waterfallErrors(row).map(x => x.code);

  eq('两个瀑布形式都在白名单里，走内核的一页无话可说', probe.waterfallErrors(facts()).length, 0);
  for (const form of ['kit.waterfall', 'precision.waterfall']) {
    const found = probe.waterfallErrors({page: 2, waterfall: {form, isWaterfallForm: true, axes: 0, residual: null, tolerance: null, nodes: null}});
    checks += 1;
    assert.ok(found.some(x => x.code === 'WF-NOT-RECONCILED'), form + ' 声明了却没有对账零轴，应当被拦：' + JSON.stringify(found));
  }
  ok('一页两条对账零轴被拦', codes(facts({axes: 2}))[0] === 'WF-MULTIPLE-AUDIT', codes(facts({axes: 2})));
  ok('不是瀑布形式又没有零轴，整页不判', codes({page: 9, waterfall: {form: 'precision.columns', isWaterfallForm: false, axes: 0, residual: null, tolerance: null, nodes: null}}).length === 0);
  /* 声明不是瀑布、图上却有对账零轴：仍然按瀑布判。
     这是有意的——data-form 是装配器照着 pages.json 写的，不是独立证据，所以"声明柱图、实际画了瀑布"
     这种情况别处发现不了，这条差额提醒是唯一的信号。少判一页等于放走一页没人核对过的账。 */
  ok('声明不是瀑布但图上有对账零轴，照样把差额报出来', codes({page: 9, waterfall: {form: 'precision.columns', isWaterfallForm: false, axes: 1, residual: '3', tolerance: '0.000001', nodes: 3}}).join() === 'WF-RESIDUAL');
  ok('但它不会被误报成"没走体检"', !codes({page: 9, waterfall: {form: 'precision.columns', isWaterfallForm: false, axes: 1, residual: '', tolerance: '0.000001', nodes: 3}}).includes('WF-NOT-RECONCILED'));
  /* 有差额不是错，藏着不说才是错：这条只能进提醒，绝不能阻塞。 */
  const residual = probe.waterfallErrors(facts({residual: '1'}));
  eq('有差额只给一条', residual.length, 1);
  eq('给的是提醒不是阻塞', residual[0].fatal, false);
  eq('代码是 WF-RESIDUAL', residual[0].code, 'WF-RESIDUAL');
  ok('提醒里说清楚了差额与容差', /1/.test(residual[0].message) && /0\.000001/.test(residual[0].message), residual[0].message);
  /* 阻塞与提醒必须真的分流到 summarize 的两个队列里，否则 fatal 只是个没人读的字段。 */
  const summary = probe.summarize({page: 2, waterfall: {form: 'kit.waterfall', isWaterfallForm: true, axes: 0, residual: null, tolerance: null, nodes: null}});
  /* "声明为瀑布形式、图上却没有零轴"是提醒不是阻塞：这一页可能走的是老 items 路径，本来就没有内核报告，
     作者没做错什么。真正该拦的那条是"pages.json 声明 verified、成稿却没有零轴"，由 verifyDeck 判——
     那里看得见声明。探针负责把现场量出来，不替声明做决定，否则历史稿会因为一条它们无法满足的规则集体失败。 */
  ok('老路径的瀑布只进提醒，不阻塞', summary.warnings.some(x => x.code === 'WF-NOT-RECONCILED') && !summary.errors.some(x => x.code === 'WF-NOT-RECONCILED'), summary.warnings.map(x => x.code));
  eq('并且它自己就标着 fatal:false', probe.waterfallErrors({page: 2, waterfall: {form: 'kit.waterfall', isWaterfallForm: true, axes: 0, residual: null, tolerance: null, nodes: null}})[0].fatal, false);
  const relaxed = probe.summarize(facts({residual: '1'}));
  ok('差额提醒进 warnings 而不是 errors', relaxed.warnings.some(x => x.code === 'WF-RESIDUAL') && !relaxed.errors.some(x => x.code === 'WF-RESIDUAL'), relaxed.warnings.map(x => x.code));
}

/* ---------- 渲染器确实把现场写下来了 ---------- */
{
  const record = (records, config) => B.present(B.diagnose({records, config}));
  const config = {mode: 'bridge', metric: '损益', metric_type: 'currency', unit: '万元', source: '测试夹具'};
  const ready = record([{label: '起', type: 'start', value: 1000}, {label: '降', type: 'delta', value: -580}, {label: '终', type: 'end', value: 420}], config);
  const kit = require('../assets/exhibit-kit.js').waterfall({palette: require('../assets/deck-themes.js').palette('mckinsey'), typography_id: 'serif-report-bold', width: 900, height: 460, title: 't', waterfall: ready});
  const pre = require('./render_precision_exhibit.cjs').render({type: 'waterfall', theme: 'mckinsey', typography_id: 'serif-report-bold', width: 900, height: 460, title: 't', waterfall: ready});
  for (const [name, svg] of [['kit', kit], ['precision', pre]]) {
    const axis = /data-role="reconciliation"[^>]*/.exec(svg)[0];
    checks += 2;
    assert.ok(/data-tolerance="0\.000001"/.test(axis), name + ' 零轴缺 tolerance：' + axis);
    assert.ok(/data-nodes="3"/.test(axis), name + ' 零轴缺 nodes：' + axis);
  }
  const withResidual = record([{label: '起', type: 'start', value: 1000}, {label: '降', type: 'delta', value: -580}, {label: '终', type: 'end', value: 421}], {...config, residual: 'explicit'});
  const svg = require('../assets/exhibit-kit.js').waterfall({palette: require('../assets/deck-themes.js').palette('mckinsey'), typography_id: 'serif-report-bold', width: 900, height: 460, title: 't', waterfall: withResidual});
  checks += 1;
  assert.ok(/data-residual="1"/.test(svg), '残差没有写到零轴上');

  /* 残差柱的颜色是这条能力的可见结论：它必须用主题的 residual 令牌。
     用 caution/warn 会让"说不清的差额"和"下降"长成同一个颜色——这正是当初选 risk 的理由。
     这里盯住颜色本身，否则以后有人"顺手简化"成 delta 的配色，注释与文档就一起变成空话。 */
  const residualLabel = withResidual.chart.bars.find(b => b.type === 'residual').label;
  const fillOf = (markup, id) => {
    const tag = new RegExp('<(?:rect|path)\\b[^>]*data-anchor-id="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>').exec(markup);
    return tag ? (/fill="([^"]+)"/.exec(tag[0]) || [])[1] : null;
  };
  const themes = require('../assets/deck-themes.js');
  for (const id of ['mckinsey', 'bcg', 'accenture']) {
    const p = themes.palette(id);
    checks += 2;
    assert.notEqual(p.residual, p.negative, id + ' 的残差色与"下降"色相同，读者分不出差额与负增量');
    assert.notEqual(p.residual, p.accent, id + ' 的残差色与强调色相同，残差柱会被误读成主数据');
  }
  const pink = themes.palette('mckinsey');
  const barFill = fillOf(svg, 'bar:' + residualLabel);
  checks += 2;
  assert.ok(barFill, '找不到残差柱的锚点：bar:' + residualLabel);
  assert.equal(barFill, pink.residual, '残差柱没用主题的 residual 色（实际 ' + barFill + '，应为 ' + pink.residual + '）');
  /* 同一张图上"降"是负增量柱：它的颜色必须还是 delta-negative。
     没有这一条，上面那句"残差柱是 residual 色"可能只是因为整张图都用同一个颜色才碰巧命中。 */
  checks += 1;
  assert.equal(fillOf(svg, 'bar:降'), pink.negative, '负增量的颜色不该被残差改动波及');
}

/* ---------- 声明侧：写一个假的 0 不能买通门禁 ---------- */
{
  /* 这里曾经是个 if/else if：只要声明里出现了 residual 键（哪怕写成 "0"），
     下面那条"|对账量| > 容差"的比较就整个跳过。于是一笔 999 的缺口配一句 residual:"0" 静默过关——
     门禁被作者自填的一个数字买通，而这正是它存在的理由。 */
  const gap = block({waterfall: {status: 'verified', reconciliation: '999', tolerance: '0.000001', nodes: 3, residual: '0'}});
  const found = W.blockErrors(gap, '第 1 条');
  checks += 1;
  assert.ok(found.some(x => /容差/.test(x)), '声明 residual:"0" 不能豁免对账量级检查，实际：' + JSON.stringify(found));
  eq('承认了差额并写了理由才放行',
    W.blockErrors(block({waterfall: {status: 'verified', reconciliation: '999', tolerance: '0.000001', nodes: 4, residual: '999', residualReason: '四舍五入到万元后留下的尾差，已单独成柱'}}), '第 1 条').length, 0);
  checks += 1;
  assert.ok(W.blockErrors(block({waterfall: {status: 'verified', reconciliation: '999', tolerance: '0.000001', nodes: 4, residual: '999'}}), '第 1 条').some(x => /residualReason/.test(x)), '承认了差额却没写理由，必须拦');
}

/* ---------- 老路径的输出不能因为新开关而改变 ---------- */
{
  /* opt-in 的全部承诺都压在"没声明 waterfall 的 spec 输出逐字节不变"上。
     下面两条是这个承诺目前唯一的护栏：它们盯的都是"新逻辑漏进老路径"这一类错误。 */
  const kit = require('../assets/exhibit-kit.js');
  const palette = require('../assets/deck-themes.js').palette('mckinsey');
  const items = [{label: '起', type: 'total', value: 300}, {label: 'A\nB', type: 'delta', value: -120}, {label: '终', type: 'total', value: 180}];
  const legacy = kit.waterfall({palette, typography_id: 'serif-report-bold', width: 900, height: 460, items});
  const labels = [...legacy.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  checks += 2;
  assert.ok(labels.includes('A\nB'), '老 items 路径的标签必须原样交出：换行曾经被内核折行逻辑切成了两个 text 节点，而那条路根本没有内核报告');
  assert.ok(!/^\s*A\s*$/.test(labels.join('|')) || labels.filter(t => t.trim() === 'A' || t.trim() === 'B').length === 0, '老路径不该出现被折开的两行标签');
  /* 破轴是瀑布唯一一处有意的行为变更：破轴之后"起点+增量=终点"肉眼无法核对。
     它不是零回归破口，是因为它被写进了文档；这条断言把这个"有意"钉住，免得以后被当成 bug 改回去。 */
  checks += 2;
  assert.throws(() => require('./render_precision_exhibit.cjs').render({type: 'waterfall', theme: 'mckinsey', width: 900, height: 460,
    axisBreaks: [{from: 400, to: 600}], items: [{id: 'a', label: '起', type: 'total', value: 1000}, {id: 'b', label: '终', type: 'total', value: 600}]}), /axisBreaks/, '瀑布不接受破轴');
  assert.throws(() => require('./render_precision_exhibit.cjs').render({type: 'columns', theme: 'mckinsey', width: 900, height: 460,
    waterfall: {status: 'ready', chart: {}}, items: [{id: 'a', label: '甲', value: 1}]}), /只有 waterfall 接受/, '非瀑布带一份瀑布报告会让零轴被标成对账结论');
}

/* ---------- CLI：阻断不产出、不覆盖 ---------- */
/* 成功路径的 stderr 也要拿到：给作者的提醒正是写在那里的，只判退出码会漏掉。 */
const cli = (...args) => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'waterfall_contract.cjs'), ...args], {encoding: 'utf8'});
  return {code: run.status, stdout: run.stdout || '', stderr: run.stderr || ''};
};
const specFile = (name, spec) => { const file = path.join(TMP, name); fs.writeFileSync(file, JSON.stringify(spec)); return file; };
const baseConfig = {mode: 'bridge', metric: '损益', metric_type: 'currency', unit: '万元', source: '测试夹具'};
const okSpec = specFile('ok.json', {renderer: 'kit', width: 900, height: 460, title: '桥',
  records: [{label: '起', type: 'start', value: 1000}, {label: '降', type: 'delta', value: -580}, {label: '终', type: 'end', value: 420}], config: baseConfig});
const badSpec = specFile('bad.json', {renderer: 'kit',
  records: [{label: '起', type: 'start', value: 1000}, {label: '降', type: 'delta', value: -580}, {label: '终', type: 'end', value: 999}], config: baseConfig});

const badOut = path.join(TMP, 'bad.svg');
let run = cli('render', badSpec, badOut);
eq('阻断时退出码为 2', run.code, 2);
ok('阻断时不产出文件', !fs.existsSync(badOut));
ok('阻断时说清楚缺什么', /不闭合/.test(run.stderr), run.stderr);
eq('diagnose 阻断也是 2', cli('diagnose', badSpec).code, 2);
eq('diagnose 通过是 0', cli('diagnose', okSpec).code, 0);

const goodOut = path.join(TMP, 'ok.svg');
run = cli('render', okSpec, goodOut);
eq('通过时退出码为 0', run.code, 0);
ok('通过时写出 SVG', fs.existsSync(goodOut) && fs.readFileSync(goodOut, 'utf8').startsWith('<svg'));
ok('回话里带对账结论', JSON.parse(run.stdout).reconciliation === '0', run.stdout);
eq('拒绝覆盖已有输出', cli('render', okSpec, goodOut).code, 1);
/* 渲染器拒绝（节点超限）与体检不通过是同一件事的两面：图没出来，一个字节都不写。
   这里曾经退 1，与"参数写错了"混在一起，作者会去翻自己的命令行，而问题其实在数据。 */
const manyRecords = [{label: '起', type: 'start', value: 1000}];
for (let i = 0; i < 22; i++) manyRecords.push({label: '项' + i, type: 'delta', value: -1});
manyRecords.push({label: '终', type: 'end', value: 978});
const manySpec = specFile('many.json', {renderer: 'kit', width: 1600, height: 460, records: manyRecords, config: baseConfig});
const manyOut = path.join(TMP, 'many.svg');
run = cli('render', manySpec, manyOut);
eq('节点超限时退出码为 2（图没出来，不是参数写错）', run.code, 2);
ok('节点超限时不产出文件', !fs.existsSync(manyOut));
ok('并说清楚是节点太多', /节点/.test(run.stderr), run.stderr);
eq('用法错误退出码为 1', cli('diagnose').code, 1);
eq('未知子命令退出码为 1', cli('graph', okSpec).code, 1);

/* 带残差时要在 stderr 提醒声明里得写理由，否则作者到 pages.json 校验那一步才发现。 */
const residualSpec = specFile('residual.json', {renderer: 'kit', width: 900, height: 460, title: '桥',
  records: [{label: '起', type: 'start', value: 1000}, {label: '降', type: 'delta', value: -580}, {label: '终', type: 'end', value: 421}], config: {...baseConfig, residual: 'explicit'}});
run = cli('render', residualSpec, path.join(TMP, 'residual.svg'));
eq('带残差仍然出图', run.code, 0);
ok('带残差时提醒写 residualReason', /residualReason/.test(run.stderr), run.stderr);

/* 残差柱的颜色令牌：kit 会拦，precision 也得拦。
   只拦一边等于"换个渲染器就能画出一根没有填充的柱子"，读者会把说不清的差额读成柱子没画出来。
   这条路走不经过 CLI（waterfall_contract 不透传 palette），所以直接对渲染器下判据。 */
const precision = require('./render_precision_exhibit.cjs');
const residualReport = B.present(B.diagnose({records: [{label: '起', type: 'start', value: 1000}, {label: '降', type: 'delta', value: -580}, {label: '终', type: 'end', value: 421}], config: {...baseConfig, residual: 'explicit'}}));
const precisionSpec = extra => ({type: 'waterfall', theme: 'mckinsey', typography_id: 'serif-report-bold', width: 900, height: 460, waterfall: residualReport, ...extra});
ok('残差进了内核报告的 bars', residualReport.chart.bars.some(v => v.type === 'residual'), residualReport.chart.bars.map(v => v.type));
const throwsWith = (name, fn, pattern) => {
  checks += 1;
  assert.throws(fn, pattern, name);
};
throwsWith('precision 的残差柱缺色时抛错', () => precision.render(precisionSpec({palette: {residual: null}})), /残差/);
ok('令牌齐备时 precision 照常出图', /^<svg/.test(precision.render(precisionSpec({}))));
/* 老 items 路径从不产出 residual，判据不能顺手把它也变成抛错路径。 */
ok('老 items 路径不受这条判据影响', /^<svg/.test(precision.render({type: 'waterfall', theme: 'mckinsey', typography_id: 'serif-report-bold', width: 900, height: 460,
  items: [{id: 'a', label: '起', type: 'total', value: 300}, {id: 'b', label: '降', type: 'delta', value: -120}, {id: 'c', label: '终', type: 'total', value: 180}]})));

fs.rmSync(TMP, {recursive: true, force: true});
console.log(JSON.stringify({pass: true, checks, cli: ['diagnose', 'render']}));
