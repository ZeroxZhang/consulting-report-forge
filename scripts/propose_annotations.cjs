#!/usr/bin/env node
/* 从一个展品规格直接给出旁解读候选：作者采纳哪些由 pages.json 决定，这里只提候选与依据。
   瀑布不适用通用的"同组排名"规则，单独走 waterfallCandidates，理由见那个函数。 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const A = require('../assets/annotation-layer.js');
const kit = require('../assets/exhibit-kit.js');
const palette = require('../assets/deck-themes.js').palette('mckinsey');

function render(spec) {
  const { renderer, type, spec: inner, typography_id = 'serif-report-bold', theme = 'mckinsey' } = spec;
  const merged = Object.assign({ palette, typography_id, width: 900, height: 420 }, inner);
  if (renderer === 'kit') return kit[type](merged);
  if (renderer === 'precision') return require('./render_precision_exhibit.cjs').render(Object.assign({ type, theme, typography_id }, inner));
  // 配方同样带锚点，候选该照提；这里的 type 是配方名（rankedBar 等），inner 是配方 spec。
  if (renderer === 'recipe') return require('./render_echarts_svg.cjs').render({ recipe: type, spec: inner, width: 900, height: 420, theme_id: theme, typography_id }).pages[0].svg;
  throw new Error('renderer 须为 kit、precision 或 recipe');
}

/* 瀑布的柱子是"贡献项"，不是同类可比对象。
   把 -580 和 +100 放进同一张榜排"最高/最低"，会让读者把「一笔拖累」读成「一次排名」——
   同一页里毛利 420 与小计 -60 还会被当成同类互比，而那两根柱根本不在同一段账上。
   所以瀑布这一支不跑通用规则，改从内核的体检结论里取驱动项。名次由本脚本按 |delta| 排——
   内核的 details 是输入顺序（period 默认 order:'input'，bridge 直接拒绝重排），它不给排名；
   占比用内核算好的 absolute_share，那一步才是内核的结论。缺内核报告的瀑布（老 items 路径）一条都不提。 */
function waterfallCandidates(anchors, report) {
  const details = report && report.chart && Array.isArray(report.chart.details) ? report.chart.details : null;
  if (!details || !details.length) return {list: [], note: '这一页是瀑布形式，但没有内核体检报告：柱子是贡献项，按大小排"最高/最低"会把一笔拖累读成一次排名。改用内核出图（spec 里带 waterfall）后，这里会给出驱动项候选。'};
  // details 只含贡献项（起点／小计／终点不在其中）。按 |delta| 取第一大项：名次是本脚本排的，不是内核给的。
  const rank = details.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = rank[0];
  const anchor = Object.values(anchors).find(a => a.label === top.label || a.id === 'bar:' + top.label || a.id === top.label);
  if (!anchor) return {list: [], note: '这一页是瀑布形式，但内核报告里的驱动项 "' + top.label + '" 在图上找不到对应锚点，无法给出候选。'};
  const drag = top.delta < 0;
  return {list: [{
    id: 'p-driver-' + anchor.id, kind: 'value', on: anchor.id,
    text: drag ? '最大拖累 {value}' : '最大拉动 {value}',
    reason: '瀑布的柱子是贡献项：按绝对变动量取第一大项，比"哪个数最高"更接近这一页真正要说的事',
    derived: {source: 'chart.details', rank: 1, label: top.label, delta: top.delta,
      absolute_share: top.absolute_share === undefined ? null : top.absolute_share},
    evidence: [anchor.id]
  }]};
}

function main(argv) {
  const file = argv.find(v => !v.startsWith('--'));
  if (!file) { console.log('用法: node scripts/propose_annotations.cjs <spec.json> [--json]\n' +
    'spec.json: {"renderer":"kit|precision|recipe","type":"dumbbell","spec":{...}}（spec 里不要写 annotations；recipe 的 type 写配方名）'); process.exitCode = 1; return; }
  const input = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const svg = render(input);
  const anchors = A.collect(svg);
  if (Object.keys(anchors).length < 2) { console.log('该展品没有声明锚点或锚点少于两个，无法给出候选。'); return; }
  const scene = A.createScene({ width: Number(svg.match(/data-actual-size="\d+×(\d+)"/)?.[1] || 420), height: 420, fontSize: 14, measure: A.estimateMeasure, anchors });
  scene.anchors = anchors;
  /* 分派依据是调用方声明的展品类型，不是从 DOM 属性猜。recipe 的 type 是配方名，不参与这一支。 */
  const isWaterfall = input.renderer !== 'recipe' && input.type === 'waterfall';
  const waterfall = isWaterfall ? waterfallCandidates(anchors, input.spec && input.spec.waterfall) : null;
  if (waterfall && !waterfall.list.length) {
    if (argv.includes('--json')) { console.log(JSON.stringify({anchors: Object.keys(anchors).length, proposals: [], note: waterfall.note}, null, 2)); return; }
    console.log(waterfall.note);
    return;
  }
  const list = waterfall ? waterfall.list.slice(0, input.max === undefined ? 6 : input.max)
    : A.propose(scene, { max: input.max === undefined ? 6 : input.max });
  if (argv.includes('--json')) { console.log(JSON.stringify({ anchors: Object.keys(anchors).length, proposals: list }, null, 2)); return; }
  console.log('锚点 ' + Object.keys(anchors).length + ' 个，给出 ' + list.length + ' 条候选（采纳哪些写进 pages.json 的 annotations）：\n');
  list.forEach(item => {
    console.log('- ' + item.id + '  ' + item.kind + '  on=' + item.on + (item.from ? ' from=' + item.from : ''));
    console.log('  文本: ' + item.text);
    console.log('  依据: ' + item.reason);
    console.log('  派生: ' + JSON.stringify(item.derived));
    console.log('  引用: ' + item.evidence.join('、'));
  });
  console.log('\n候选只是建议：采纳前核对口径与可比性，采纳后由标注层负责放置与避让。');
}

if (require.main === module) { try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { render, main, waterfallCandidates };
