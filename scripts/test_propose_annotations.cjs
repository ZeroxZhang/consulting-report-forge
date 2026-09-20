/* 旁注候选的分流：瀑布不适用通用的同组排名规则。
   这个脚本过去对着一张瀑布图会提"最高 100""最低 -580"——把一笔拖累读成一次排名，
   还会让毛利（小计）与小计 -60 互比。这里锁住改后的行为，也锁住"非瀑布不受影响"。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const P = require('./propose_annotations.cjs');
const A = require('../assets/annotation-layer.js');
const W = require('../assets/waterfall-bridge.js');
const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'propose-annot-'));

let checks = 0;
const ok = (name, condition, detail) => { checks += 1; assert.ok(condition, name + (detail === undefined ? '' : '：' + JSON.stringify(detail))); };
const eq = (name, actual, expected) => { checks += 1; assert.equal(actual, expected, name + '（实际 ' + JSON.stringify(actual) + '）'); };

/* 桥接夹具：拖累 -580 是最大项，小计与起止柱都在场——正是过去被混进同一张榜的那些柱子。 */
const bridgeConfig = {mode: 'bridge', metric: '损益', metric_type: 'currency', unit: '万元', source: '测试夹具'};
const bridgeRecords = [
  {label: '营业收入', type: 'start', value: 1000}, {label: '营业成本', type: 'delta', value: -580},
  {label: '毛利', type: 'subtotal', value: 420}, {label: '研发费用', type: 'delta', value: -220},
  {label: '税前利润', type: 'end', value: 200}
];
const report = extra => W.present(W.diagnose({records: bridgeRecords.map(r => ({...r})), config: {...bridgeConfig, ...extra}}));
const spec = (renderer, rep, more) => ({renderer, type: 'waterfall', spec: {width: 900, height: 460, title: '税前利润桥', waterfall: rep, ...more}});

const candidates = input => {
  const anchors = A.collect(P.render(input));
  return P.waterfallCandidates(anchors, input.spec.waterfall);
};

/* ---------- 瀑布：不再出通用的同组排名候选 ---------- */
const LEAGUE = /最高|最低|领先|占本组|倍 MAD|第 \d+ 位/;
for (const renderer of ['kit', 'precision']) {
  const got = candidates(spec(renderer, report({})));
  eq(renderer + '：只给一条候选', got.list.length, 1);
  ok(renderer + '：不再提"最高/最低"这类排名', !got.list.some(item => LEAGUE.test(item.text)), got.list.map(item => item.text));
  eq(renderer + '：候选挂在最大变动量的柱上', got.list[0].derived.label, '营业成本');
  eq(renderer + '：派生值就是内核的 delta', got.list[0].derived.delta, -580);
  eq(renderer + '：名次固定为第一', got.list[0].derived.rank, 1);
  eq(renderer + '：说明派生自内核', got.list[0].derived.source, 'chart.details');
  ok(renderer + '：候选带引用锚点', got.list[0].evidence.length === 1, got.list[0].evidence);
}

/* 柱子的锚点 id 两个渲染器不同（kit 是 bar:<label>，precision 就是 label），候选必须落在各自真实存在的锚点上。 */
{
  const kit = candidates(spec('kit', report({})));
  const pre = candidates(spec('precision', report({})));
  eq('kit 的候选指向 bar: 前缀的锚点', kit.list[0].on, 'bar:营业成本');
  eq('precision 的候选指向裸标签锚点', pre.list[0].on, '营业成本');
  for (const [name, input, on] of [['kit', spec('kit', report({})), kit.list[0].on], ['precision', spec('precision', report({})), pre.list[0].on]]) {
    checks += 1;
    assert.ok(A.collect(P.render(input))[on], name + ' 的候选指向了图上不存在的锚点：' + on);
  }
}

/* ---------- 方向由符号决定，不靠词面猜 ---------- */
{
  const drag = candidates(spec('kit', report({}))).list[0];
  ok('向下的最大项说"拖累"', /最大拖累/.test(drag.text), drag.text);
  /* 方向看的是那一根柱子自己的符号，不是整座桥的净变化：下面这座桥净变动为正，最大项也是正的。 */
  const rising = W.present(W.diagnose({records: [
    {label: '上年', type: 'start', value: 1000}, {label: '新客', type: 'delta', value: 400},
    {label: '流失', type: 'delta', value: -120}, {label: '本年', type: 'end', value: 1280}
  ], config: bridgeConfig}));
  const up = candidates(spec('kit', rising)).list[0];
  ok('向上的最大项说"拉动"', /最大拉动/.test(up.text), up.text);
  eq('向上时也取绝对值最大项', up.derived.label, '新客');
  eq('两条措辞确实不同', up.text === drag.text, false);
}

/* ---------- 缺内核报告的瀑布：不提候选，并说清为什么 ---------- */
{
  const legacy = {renderer: 'kit', type: 'waterfall', spec: {width: 900, height: 460, title: '桥',
    items: [{label: '期初', type: 'total', value: 1000}, {label: '流失', type: 'delta', value: -580}, {label: '期末', type: 'total', value: 420}]}};
  const got = candidates(legacy);
  eq('没有内核报告就不提候选', got.list.length, 0);
  ok('并且说明理由', /内核/.test(got.note) && /排名/.test(got.note), got.note);
}

/* ---------- 非瀑布分支不受影响 ---------- */
{
  const dumbbell = {renderer: 'kit', type: 'dumbbell', spec: {width: 900, height: 460, title: '哑铃',
    items: [{label: '甲', start: 10, end: 40}, {label: '乙', start: 30, end: 33}, {label: '丙', start: 5, end: 20}, {label: '丁', start: 22, end: 24}]}};
  const svg = P.render(dumbbell), anchors = A.collect(svg);
  const scene = A.createScene({width: 420, height: 420, fontSize: 14, measure: A.estimateMeasure, anchors});
  scene.anchors = anchors;
  const list = A.propose(scene, {max: 6});
  ok('哑铃仍然走通用规则', list.some(item => item.from && item.kind === 'delta'), list.map(item => item.kind));
  eq('哑铃的候选数不受瀑布分流影响', list.length, 6);
}

/* ---------- CLI：两条出口都说得清 ---------- */
const cli = (...args) => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'propose_annotations.cjs'), ...args], {encoding: 'utf8'});
  return {code: run.status, stdout: run.stdout || '', stderr: run.stderr || ''};
};
const specFile = (name, value) => { const file = path.join(TMP, name); fs.writeFileSync(file, JSON.stringify(value)); return file; };
const withKernel = specFile('with.json', spec('kit', report({})));
const withoutKernel = specFile('without.json', {renderer: 'kit', type: 'waterfall', spec: {width: 900, height: 460, title: '桥',
  items: [{label: '期初', type: 'total', value: 1000}, {label: '流失', type: 'delta', value: -580}, {label: '期末', type: 'total', value: 420}]}});

/* 只取"文本:"那一行来断言：依据里本来就会提到"最高"这个词（用来说明为什么不该这么排），
   拿整段 stdout 去匹配等于在测文案，改一个字就红。 */
const textsIn = stdout => stdout.split('\n').filter(line => line.startsWith('  文本: ')).map(line => line.slice(6));

let run = cli(withKernel);
eq('带内核的瀑布退出码为 0', run.code, 0);
ok('带内核的瀑布打印出候选', /最大拖累/.test(run.stdout), run.stdout);
ok('带内核的瀑布给出的文本里没有"最高/最低"', !textsIn(run.stdout).some(text => LEAGUE.test(text)), textsIn(run.stdout));

run = cli(withoutKernel);
eq('缺内核的瀑布仍然退出 0（不是错误，是无话可说）', run.code, 0);
ok('缺内核时打印的是理由而不是候选行', /没有内核体检报告/.test(run.stdout) && !/文本:/.test(run.stdout), run.stdout);

run = cli(withoutKernel, '--json');
eq('缺内核时 --json 也能解析', JSON.parse(run.stdout).proposals.length, 0);
ok('--json 里带同一条理由', /内核/.test(JSON.parse(run.stdout).note), run.stdout);

run = cli(path.join(TMP, '不存在.json'));
eq('文件不存在时退出码为 1', run.code, 1);

fs.rmSync(TMP, {recursive: true, force: true});
console.log(JSON.stringify({pass: true, checks, renderers: ['kit', 'precision']}));
