#!/usr/bin/env node
/* 从一个展品规格直接给出旁解读候选：作者采纳哪些由 pages.json 决定，这里只提候选与依据。 */
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
  const list = A.propose(scene, { max: input.max === undefined ? 6 : input.max });
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
module.exports = { render, main };
