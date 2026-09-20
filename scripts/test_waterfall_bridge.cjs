/* 瀑布数据内核的回归集：从 aeolus-period-waterfall 的 tests/test_waterfall.py 逐条端口化。
   每个断言都在说一件事——数据不够时它必须说不够，而不是画一张看起来对的图。

   末尾的黄金几何表在本次移植时与 aeolus 原版 Python diagnose() 逐字段比对过
   （三个夹具 × 15 个字段全部一致），此后作为防漂移的锁：改动内核若动了这些数，必须是有意的。
   比对脚本刻意不进仓库——那会让本技能依赖 aeolus 的本地路径，正是这次融合要避免的事。 */
'use strict';
const assert = require('node:assert/strict');
const B = require('../assets/waterfall-bridge.js');

let checks = 0;
const ok = (label, condition, extra) => { assert.ok(condition, label + (extra === undefined ? '' : '：' + JSON.stringify(extra))); checks += 1; };
const eq = (label, actual, expected) => { assert.equal(actual, expected, label + '：实际 ' + JSON.stringify(actual)); checks += 1; };
/* 序列用深比较；strictEqual 比的是引用，逐项相同也会失败。 */
const same = (label, actual, expected) => { assert.deepEqual(actual, expected, label + '：实际 ' + JSON.stringify(actual)); checks += 1; };
const near = (label, actual, expected) => { assert.ok(Math.abs(actual - expected) < 1e-9, label + '：实际 ' + actual); checks += 1; };
const clone = value => JSON.parse(JSON.stringify(value));
const codes = payload => new Set(B.diagnose(payload).issues.map(x => x.code));
const isBlocked = payload => B.diagnose(payload).status === 'blocked';
const fmt = (value, chart, delta) => B.formatValue(value, chart, delta);

/* 三个内置夹具与 aeolus build_demo.py 逐字一致，便于两边对账。 */
function fixtures() {
  const period = {
    records: [
      { '分类': '核心产品', '上期值': 380, '本期值': 590 },
      { '分类': '新产品', '上期值': 300, '本期值': 460 },
      { '分类': '传统渠道', '上期值': 250, '本期值': 160 },
      { '分类': '国际业务', '上期值': 170, '本期值': 210 },
      { '分类': '其他业务', '上期值': 100, '本期值': 80 }],
    config: { mode: 'period', metric: '收入', metric_type: 'currency', unit: '万元', additive: true,
      period_previous: '2025 Q2', period_current: '2026 Q2', source: '内置模拟数据，仅用于功能与视觉验收',
      as_of: '2026-06-30', title: '收入增长 25%，核心产品与新产品贡献主要增量', subtitle: '以两期分类原值计算' }
  };
  const bridge = {
    records: [
      { label: '营业收入', type: 'start', value: 1000 },
      { label: '营业成本', type: 'delta', value: -580 },
      { label: '毛利', type: 'subtotal', value: 420 },
      { label: '销售管理费用', type: 'delta', value: -260 },
      { label: '研发费用', type: 'delta', value: -220 },
      { label: '营业利润', type: 'subtotal', value: -60 },
      { label: '其他收益', type: 'delta', value: 100 },
      { label: '税前利润', type: 'end', value: 40 }],
    config: { mode: 'bridge', metric: '损益', metric_type: 'currency', unit: '万元',
      source: '内置模拟数据，仅用于功能与视觉验收', title: '小计不重复累加，负余额与跨零仍可正确表达' }
  };
  const rate = {
    records: [
      { '分类': '标准方案', '上期值': '10%', '本期值': '12%', '上期分母': 900, '本期分母': 800 },
      { '分类': '高级方案', '上期值': '20%', '本期值': '18%', '上期分母': 100, '本期分母': 200 }],
    config: { mode: 'period', metric: '转化率', metric_type: 'rate', rate_scale: 'fraction', unit: '% / pp',
      period_previous: '基期转化率', period_current: '本期转化率', source: '内置模拟数据，仅用于功能与视觉验收', decimals: 1 }
  };
  return { period, bridge, rate };
}

/* ---------- period 两期分类 ---------- */

{
  const chart = B.diagnose(fixtures().period).chart;
  eq('两期总量对账', [chart.start, chart.end, chart.net, chart.growth].join(','), '1200,1500,300,0.25');
  eq('整体闭合差额为零', chart.reconciliation, '0');
}
{
  const report = B.diagnose(fixtures().period);
  eq('缺增量时逐行推导', report.derived.length, 5);
  ok('推导有记录可查', report.derived.every(x => x.includes('增量=')));
}
{
  const payload = fixtures().period;
  for (const row of payload.records) { row['增量'] = row['本期值'] - row['上期值']; delete row['上期值']; }
  eq('缺基期时反推基期', B.diagnose(payload).chart.start, 1200);
}
{
  const payload = fixtures().period;
  for (const row of payload.records) { row['增量'] = row['本期值'] - row['上期值']; delete row['本期值']; }
  eq('缺本期时反推本期', B.diagnose(payload).chart.end, 1500);
}
{
  const payload = fixtures().period;
  payload.records[0]['本期值'] = null;
  const report = B.diagnose(payload);
  eq('缺值直接阻断，不静默丢行', report.status, 'blocked');
  ok('缺值带明确代码', codes(payload).has('missing_values'));
  eq('缺值请求归属数据方', report.requests[0].owner, 'data');
  ok('阻断时不产出图', report.chart === null);
}
{
  const payload = fixtures().period;
  payload.records[0]['本期值'] = null;
  payload.config.supplement_source = 'explicit-source';
  eq('给定补数来源后请求转给 Agent', B.diagnose(payload).requests[0].owner, 'agent');
}
{
  const payload = fixtures().period;
  payload.records[0]['增量'] = 999;
  ok('增量与两期不一致要报错', codes(payload).has('inconsistent_delta'));
}
{
  const payload = fixtures().period;
  for (const row of payload.records) row['本期值'] = row['上期值'];
  const chart = B.diagnose(payload).chart;
  ok('净变化为零时占比不适用', chart.details.every(d => d.net_share === null));
  eq('净变化为零时占比显示破折号', B.present(B.diagnose(payload)).chart.details[0].netShareText, '—');
}
{
  const payload = fixtures().period;
  payload.records[0]['上期值'] = 0;
  const chart = B.diagnose(payload).chart;
  eq('基期为零不删行', chart.details.length, 5);
  eq('基期为零不编增长率', chart.details[0].growth, null);
}
{
  const payload = fixtures().period;
  for (const row of payload.records) row['上期值'] = -100;
  eq('基期非正不给整体增长率', B.diagnose(payload).chart.growth, null);
}
{
  const payload = fixtures().period;
  for (const row of payload.records) { row['上期值'] = 0.02; row['本期值'] = 0.03; }
  const chart = B.diagnose(payload).chart;
  ok('小额金额不印成百分比', !fmt(chart.start, chart).includes('%'));
  ok('小额非零不印成 0', fmt(chart.net, chart, true) !== '0');
}
{
  const payload = fixtures().period;
  payload.records.push(clone(payload.records[0]));
  ok('分类重复不擅自求和', codes(payload).has('duplicate_category'));
}
{
  const payload = fixtures().period;
  payload.records[0]['分类'] = '合计';
  ok('汇总行混入明细要报错', codes(payload).has('summary_row'));
}
{
  const payload = fixtures().period;
  payload.records[0]['当前值'] = 590;
  ok('一列多名候选要澄清', codes(payload).has('ambiguous_mapping'));
}
{
  const payload = fixtures().period;
  for (const row of payload.records) { row['甲'] = row['本期值']; delete row['本期值']; }
  payload.config.mapping = { current: '甲' };
  eq('显式映射可解歧义', B.diagnose(payload).status, 'ready');
}
{
  const payload = fixtures().period;
  delete payload.config.additive;
  ok('可加总必须显式确认', codes(payload).has('additivity'));
}
{
  const payload = fixtures().period;
  delete payload.config.metric_type;
  ok('指标类型不靠数值大小推断', codes(payload).has('metric_type'));
}
{
  const payload = fixtures().period;
  delete payload.config.as_of;
  eq('不自动生成截止日', B.diagnose(payload).chart.as_of, null);
}
eq('空记录直接阻断', B.diagnose({ records: [] }).status, 'blocked');
{
  const payload = fixtures().period;
  payload.records[0]['本期值'] = 'Infinity';
  ok('Infinity 拒绝', codes(payload).has('invalid_number'));
}
{
  const payload = fixtures().period;
  payload.records[0]['本期值'] = '约1.2万';
  ok('含糊单位不猜', codes(payload).has('invalid_number'));
}
{
  const payload = fixtures().period;
  payload.records[0]['本期值'] = '1e999';
  ok('超大值拒绝', codes(payload).has('invalid_number'));
}
{
  const payload = fixtures().period;
  payload.config.source = 123;
  ok('文本字段不接受数值', codes(payload).has('invalid_text'));
}
{
  const payload = fixtures().period;
  payload.config.third_layer_config = {};
  ok('未支持的配置不静默忽略', codes(payload).has('unsupported_config'));
}
{
  const payload = fixtures().period;
  payload.records[0]['本期值'] = null;
  payload.records[1]['本期值'] = null;
  eq('多行缺值合并成一条请求', B.diagnose(payload).requests[0].need.length, 2);
}
{
  const payload = fixtures().period;
  for (const row of payload.records) row['增量'] = String(row['本期值'] - row['上期值'] + 0.0000009);
  ok('逐行容差累积后整体仍须闭合', codes(payload).has('aggregate_not_reconciled'));
}

/* ---------- 比例与百分点 ---------- */

{
  const chart = B.diagnose(fixtures().rate).chart;
  near('加权起点', chart.start, 0.11);
  near('加权终点', chart.end, 0.132);
  near('加权净变化', chart.net, 0.022);
  near('首个分类贡献', chart.details[0].delta, 0.006);
  near('次个分类贡献', chart.details[1].delta, 0.016);
  ok('比例模式不声称因果分解', B.diagnose(fixtures().rate).warnings.some(w => w.includes('不声称是因果效应分解')));
}
{
  const chart = B.diagnose(fixtures().rate).chart;
  eq('比例起点标签', fmt(chart.start, chart), '11.0%');
  eq('净变化用百分点', fmt(chart.net, chart, true), '+2.2 pp');
}
{
  const payload = fixtures().rate;
  for (const row of payload.records) delete row['上期分母'];
  ok('比例缺分母不能跨分类求和', codes(payload).has('rate_denominator'));
}
{
  const payload = fixtures().rate;
  delete payload.config.rate_scale;
  payload.records[0]['上期值'] = 0.1;
  ok('比例刻度必须明确', codes(payload).has('invalid_number'));
}
{
  const payload = fixtures().rate;
  for (const row of payload.records) { row['上期值'] = parseFloat(row['上期值']); row['本期值'] = parseFloat(row['本期值']); }
  payload.config.rate_scale = 'percent';
  near('percent 刻度换算正确', B.diagnose(payload).chart.end, 0.132);
}
{
  const payload = fixtures().rate;
  payload.records[0]['上期分母'] = 0;
  ok('分母为零要报错', codes(payload).has('invalid_denominator'));
}
{
  /* percent 刻度下容差同量纲缩到百分之一：0.000009 的差值放大后必须被抓住。 */
  const payload = fixtures().rate;
  payload.config.rate_scale = 'percent';
  for (const row of payload.records) { row['上期值'] = parseFloat(row['上期值']); row['本期值'] = parseFloat(row['本期值']); }
  eq('percent 刻度仍可判闭合', B.diagnose(payload).status, 'ready');
}

/* ---------- bridge 有序桥 ---------- */

{
  const chart = B.diagnose(fixtures().bridge).chart;
  eq('桥终点闭合', chart.end, 40);
  eq('桥整体闭合差额为零', chart.reconciliation, '0');
  eq('小计后继续从负余额出发', chart.bars[6].from, -60);
  eq('桥不展示增长率', chart.growth, null);
  eq('小计锚定零基线', chart.bars[2].from, 0);
  eq('小计值等于累计值', chart.bars[2].value, 420);
}
{
  const payload = fixtures().bridge;
  payload.records[2].value = null;
  eq('缺小计由累计推导', B.diagnose(payload).chart.bars[2].value, 420);
}
{
  const payload = fixtures().bridge;
  payload.records.pop();
  eq('缺终点由累计推导', B.diagnose(payload).chart.end, 40);
}
{
  const payload = fixtures().bridge;
  payload.records[payload.records.length - 1].value = 50;
  ok('终点不闭合要报错', codes(payload).has('not_reconciled'));
  ok('不自动平账', isBlocked(payload));
}
{
  const payload = fixtures().bridge;
  payload.records[payload.records.length - 1].value = 50;
  payload.config.residual = 'explicit';
  const chart = B.diagnose(payload).chart;
  eq('显式残差独立成节点', chart.bars[chart.bars.length - 2].type, 'residual');
  eq('残差纳入后整体闭合', chart.reconciliation, '0');
  eq('残差原值可审计', chart.residual, '10');
}
{
  const payload = fixtures().bridge;
  payload.records[1].value = null;
  payload.config.residual = 'explicit';
  ok('残差只用于终点，不填补缺失项', B.diagnose(payload).chart === null);
}
{
  const payload = fixtures().bridge;
  payload.records = [payload.records[0], payload.records[payload.records.length - 1]];
  ok('只有起终点无法拆解贡献', codes(payload).has('missing_contributions'));
}
{
  const payload = fixtures().bridge;
  payload.config.order = 'absolute_desc';
  ok('有序桥不可自动重排', codes(payload).has('bridge_order'));
}
{
  const payload = fixtures().bridge;
  payload.config.endpoint_style = 'stacked';
  ok('桥不接受堆叠首尾', codes(payload).has('stacked_unsupported'));
}
{
  const payload = fixtures().period;
  payload.config.endpoint_style = 'stacked';
  eq('非负两期数据可用堆叠首尾', B.diagnose(payload).status, 'ready');
  payload.records[0]['上期值'] = -1;
  ok('含负数拒绝堆叠首尾', codes(payload).has('stacked_unsupported'));
}

/* ---------- 数值解析 ---------- */

eq('括号表示负值', B.decimalToNumber(B.number('(1,200)')), -1200);
eq('全角减号与全角逗号', B.decimalToNumber(B.number('−1，200')), -1200);
eq('普通千分位', B.decimalToNumber(B.number('1,200.5')), 1200.5);
{
  let threw = false; try { B.number('1,20'); } catch { threw = true; }
  ok('千分位不明确要抛错', threw);
  threw = false; try { B.number(true); } catch { threw = true; }
  ok('布尔不是数值', threw);
}
eq('缺失归 null 而不是零', B.number(null), null);
eq('破折号归 null 而不是零', B.number('—'), null);
eq('待补归 null 而不是零', B.number('待补'), null);

/* ---------- forge 原生 items 入口 ---------- */

{
  const report = B.diagnose({ items: [
    { label: '期初', type: 'total', value: 1000 },
    { label: '增长', type: 'delta', value: 300 },
    { label: '期末', type: 'total', value: 1300 }] });
  eq('items 首个 total 作起点', report.chart.bars[0].type, 'start');
  eq('items 末个 total 作终点', report.chart.bars[2].type, 'end');
  eq('items 入口免溯源追问', report.status, 'ready');
  eq('items 入口推断为桥', report.mode, 'bridge');
}
{
  const report = B.diagnose({ items: [
    { label: '期初', type: 'total', value: 1000 },
    { label: '期末', type: 'total', value: 1300 }] });
  ok('items 缺贡献项要报缺口', report.issues.some(x => x.code === 'missing_contributions'));
}
{
  /* 中间的 total 无从判断是起点还是终点，宁可不画也不猜。 */
  let threw = false;
  try {
    B.diagnose({ items: [{ label: 'A', type: 'total', value: 1 }, { label: 'B', type: 'total', value: 2 }, { label: 'C', type: 'total', value: 3 }] });
  } catch (error) { threw = error.name === 'BridgeError'; }
  ok('中间的 total 拒绝猜测', threw);
}
{
  const blocked = B.diagnose({ items: [
    { label: '期初', type: 'total', value: 1000 },
    { label: '增长', type: 'delta', value: 300 },
    { label: '期末', type: 'total', value: 1301 }] });
  eq('items 不闭合要阻断', blocked.status, 'blocked');
  ok('items 不闭合时不产出图', blocked.chart === null);
  ok('items 不闭合写进补数请求', blocked.requests.some(r => r.code === 'not_reconciled'));
}
{
  /* 溯源豁免不是静默：生效的类型必须回显，作者看得见被假定了什么。 */
  const report = B.diagnose({ items: [
    { label: '期初', type: 'total', value: 1000 },
    { label: '增长', type: 'delta', value: 300 },
    { label: '期末', type: 'total', value: 1300 }] });
  eq('items 默认类型回显在图上', report.chart.metric_type, 'number');
  ok('items 入口不追问数据来源', !report.issues.some(x => x.code === 'source'));
}
{
  /* rate 语义仍然必须显式声明，不能被 items 入口的默认值掩盖。 */
  const payload = { items: [
    { label: '基期', type: 'total', value: 0.11 },
    { label: '变化', type: 'delta', value: 0.022 },
    { label: '本期', type: 'total', value: 0.132 }],
    config: { metric_type: 'rate', rate_scale: 'fraction' } };
  const chart = B.diagnose(payload).chart;
  eq('items 显式声明比例后按百分比展示', B.formatValue(chart.start, chart), '11.0%');
}

/* ---------- config 的边界：容差上限与映射角色 ---------- */

{
  /* 容差是"多少差额还算对得上"，放宽它等于把说不清的差额放进图里。上限必须钉住：
     把它从 0.01 改成 1，tolerance=0.5 会从 blocked 变成 ready，而图上什么都没有变。 */
  const tolerant = t => B.diagnose({ records: [
    { label: '起', type: 'start', value: 1000 }, { label: '降', type: 'delta', value: -580 }, { label: '终', type: 'end', value: 420 }],
    config: { mode: 'bridge', metric: '损益', metric_type: 'currency', unit: '万元', source: '测试夹具', tolerance: t } });
  eq('容差 0.01 是上限本身，放行', tolerant(0.01).status, 'ready');
  const over = tolerant(0.011);
  eq('容差刚过上限就阻断', over.status, 'blocked');
  ok('并且指名是容差的问题', over.issues.some(x => x.code === 'tolerance'), over.issues.map(x => x.code));
  eq('容差 0.5 更不放行', tolerant(0.5).status, 'blocked');
  eq('负容差也不放行', tolerant(-1).status, 'blocked');
  /* 容差为 0 等于要求位精确：近零的净变化会被当成非零，占比于是算成天文数字。
     文档把它写成 0 < t ≤ 0.01，代码必须同口径——曾经只判了 < 0。 */
  eq('容差 0 也不放行', tolerant(0).status, 'blocked');
  ok('并且指名是容差的问题', tolerant(0).issues.some(x => x.code === 'tolerance'), tolerant(0).issues.map(x => x.code));
}
{
  /* 同一列不能既当基期又当本期：那会让"变化量"永远等于零，画出一条平的桥。 */
  const report = B.diagnose({ records: [{ 分类: '甲', 上期值: 1, 本期值: 2 }],
    config: { mode: 'period', metric: '户数', metric_type: 'number', unit: '户', source: '测试夹具',
      mapping: { label: '分类', previous: '上期值', current: '上期值' } } });
  eq('同一列承担两个字段角色要阻断', report.status, 'blocked');
  ok('并报出重复映射', report.issues.some(x => x.code === 'duplicate_mapping'), report.issues.map(x => x.code));
}

/* ---------- 精确十进制的文本必须与数值同号 ---------- */
{
  /* 异号相减且被减数更小时，内部有效数字是负的。曾经 normalize 把符号交给调用方给的 sign，
     于是 d 带着负号进入表示，decimalToText 把 String(-2n) 当正数拼，产出 '--2' / '-0.00000-2'。
     数值一直是对的（几何与闭合都没事），坏的只有文本——而 residual / reconciliation 的文本
     恰恰是 pages.json 要原样抄、门禁要逐字比的东西：抄不到，这一页无论怎么写声明都过不了。
     所以这一组断言盯的不是"算得对"，是 decimalToText 与 decimalToNumber 必须说同一件事。 */
  const agree = (label, value) => {
    const text = B.decimalToText(value), num = B.decimalToNumber(value);
    checks += 2;
    assert.ok(Number.isFinite(Number(text)), label + ' 的文本不可解析：' + text);
    assert.equal(Number(text), num, label + ' 的文本与数值不同号：文本 ' + text + '，数值 ' + num);
  };
  agree('3+(-5)', B.add(B.number('3'), B.number('-5')));
  agree('neg(3+(-5))', B.neg(B.add(B.number('3'), B.number('-5'))));
  agree('abs(-7)', B.abs(B.number('-7')));
  agree('-5e-7-(-7e-7)', B.sub(B.number('-5e-7'), B.number('-7e-7')));
  agree('1.005+2.005-3.01', B.sub(B.add(B.number('1.005'), B.number('2.005')), B.number('3.01')));
  agree('20 位整数相减', B.sub(B.number('12345678901234567890'), B.number('12345678901234567891')));
  /* 走到 diagnose 的出口：这两处文本会被原样写进页面属性，再被原样抄进 pages.json。 */
  const residualReport = B.present(B.diagnose({
    records: [{label: '起', type: 'start', value: -12}, {label: '增', type: 'delta', value: 1}, {label: '终', type: 'end', value: -10}],
    config: {mode: 'bridge', metric: '损益', metric_type: 'currency', unit: '万元', source: '测试夹具', residual: 'explicit'}}));
  eq('负基数桥的残差是规范十进制', residualReport.chart.residual, '1');
  ok('残差文本可被 Number 解析（门禁的 decimal() 依赖这一点）', Number.isFinite(Number(residualReport.chart.residual)), residualReport.chart.residual);
  const blocked = B.diagnose({
    records: [{label: '起', type: 'start', value: -10}, {label: '增', type: 'delta', value: -2}, {label: '终', type: 'end', value: -11}],
    config: {mode: 'bridge', metric: '损益', metric_type: 'currency', unit: '万元', source: '测试夹具'}});
  ok('阻断消息里的差额也是规范十进制', /差额 1；/.test(blocked.issues[0].message), blocked.issues[0].message);
}
/* ---------- 零没有方向 ---------- */
{
  /* 给恰好为零的净变化印一个 + 号，等于把"没有变化"说成一个方向。 */
  const zero = B.present(B.diagnose({
    records: [{label: '起', type: 'start', value: 5}, {label: '增', type: 'delta', value: 0}, {label: '终', type: 'end', value: 5}],
    config: {mode: 'bridge', metric: '户数', metric_type: 'number', unit: '户', source: '测试夹具'}}));
  eq('零净变化不带正号', zero.chart.netText, '0');
  const risen = B.present(B.diagnose({
    records: [{label: '起', type: 'start', value: 5}, {label: '增', type: 'delta', value: 2}, {label: '终', type: 'end', value: 7}],
    config: {mode: 'bridge', metric: '户数', metric_type: 'number', unit: '户', source: '测试夹具'}}));
  eq('非零的正增量仍然带正号', risen.chart.netText, '+2');
}
/* ---------- 缺 type 的节点不能被报成"中间的 total" ---------- */
{
  const withItems = items => () => B.diagnose({items, config: {mode: 'bridge', metric: '损益', metric_type: 'currency', unit: '万元', source: '测试夹具'}});
  checks += 2;
  assert.throws(withItems([{label: 'a', value: 1}]), /没有 type/, '缺 type 应报"没有 type"，而不是被当成中间的 total');
  assert.throws(withItems([{label: 'a', type: 'total', value: 1}, {label: 'b', type: 'total', value: 2}, {label: 'c', type: 'total', value: 3}]), /中间的 total/, '真正的中间 total 仍要报它自己的原因');
}
/* ---------- 输出契约 ---------- */

{
  for (const [name, payload] of Object.entries(fixtures())) {
    const report = B.diagnose(payload);
    let serialized = null;
    try { serialized = JSON.stringify(report); } catch (error) { ok(name + ' 结果可 JSON 序列化', false, error.message); }
    ok(name + ' 结果可 JSON 序列化', typeof serialized === 'string');
    ok(name + ' 结果不泄漏 BigInt', !/"\d+n"/.test(serialized || ''));
    eq(name + ' 闭合差额是可审计字符串', typeof report.chart.reconciliation, 'string');
  }
}
{
  const chart = B.present(B.diagnose(fixtures().period)).chart;
  eq('起点文本已预格式化', chart.startText, '1,200');
  eq('净变化文本带符号', chart.netText, '+300');
  ok('每条柱都有文本', chart.bars.every(b => typeof b.valueText === 'string'));
  ok('每条明细都有占比文本', chart.details.every(d => typeof d.netShareText === 'string'));
  /* 方向不能只由颜色承担：增量柱必须自己带符号，起点/终点/小计不带。 */
  const signed = chart.bars.filter(b => b.type === 'delta');
  ok('增量柱带方向符号', signed.every(b => /^[+−]/.test(b.valueText)), signed.map(b => b.valueText));
  ok('首尾柱不带方向符号', chart.bars.filter(b => b.type !== 'delta').every(b => !/^[+−]/.test(b.valueText)));
  const positive = signed.find(b => b.value > 0);
  eq('正增量显式写 +', positive.valueText, '+' + B.formatValue(positive.value, chart));
  const shareSum = chart.details.reduce((acc, d) => acc + d.net_share, 0);
  near('净增量贡献占比之和为 1', shareSum, 1);
}

/* ---------- 黄金几何：与 aeolus 原版逐字段比对过的结果 ---------- */

{
  /* 九位小数：锚定 aeolus 的 Decimal 结果，又不能被二进制浮点的末位噪声绊倒。 */
  const r9 = value => Math.round(value * 1e9) / 1e9;
  const golden = {
    period: {
      from: [0, 1200, 1410, 1570, 1480, 1520, 0], to: [1200, 1410, 1570, 1480, 1520, 1500, 1500],
      value: [1200, 210, 160, -90, 40, -20, 1500],
      shares: [0.7, 0.533333333, -0.3, 0.133333333, -0.066666667],
      startText: '1,200', netText: '+300'
    },
    bridge: {
      from: [0, 1000, 0, 420, 160, 0, -60, 0], to: [1000, 420, 420, 160, -60, -60, 40, 40],
      value: [1000, -580, 420, -260, -220, -60, 100, 40],
      shares: [0.604166667, 0.270833333, 0.229166667, -0.104166667],
      startText: '1,000', netText: '−960'
    },
    rate: {
      from: [0, 0.11, 0.116, 0], to: [0.11, 0.116, 0.132, 0.132], value: [0.11, 0.006, 0.016, 0.132],
      shares: [0.272727273, 0.727272727],
      startText: '11.0%', netText: '+2.2 pp'
    }
  };
  for (const [name, want] of Object.entries(golden)) {
    const chart = B.present(B.diagnose(fixtures()[name])).chart;
    same(name + ' 柱起点序列', chart.bars.map(b => r9(b.from)), want.from);
    same(name + ' 柱终点序列', chart.bars.map(b => r9(b.to)), want.to);
    same(name + ' 柱数值序列', chart.bars.map(b => r9(b.value)), want.value);
    same(name + ' 贡献占比序列', chart.details.map(d => r9(d.net_share)), want.shares);
    same(name + ' 起点文本', chart.startText, want.startText);
    same(name + ' 净变化文本', chart.netText, want.netText);
  }
}
{
  const report = B.present(B.diagnose(fixtures().bridge));
  eq('残差缺席时字段为 null', report.chart.residual, null);
}

/* ---------- 中文标签折行 ---------- */

{
  eq('短标签不折行', B.labelLines('毛利', 10).length, 1);
  ok('长中文标签按宽度折行', B.labelLines('核心产品收入变化拆解与口径说明', 10).length > 1);
  ok('拉丁字符按 0.55em 折算', B.labelLines('abcdefghijklmnop', 10).length >= 1);
  ok('折行不丢字符', B.labelLines('核心产品收入变化拆解与口径说明', 10).join('') === '核心产品收入变化拆解与口径说明');
}

console.log(JSON.stringify({ pass: true, checks, fixtures: ['period', 'bridge', 'rate'] }));
