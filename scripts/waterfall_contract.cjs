/* 瀑布的第三种入口：命令行。
   kit.* 的 11 个形式此前没有任何 CLI，瀑布作为最需要"先体检后渲染"的形式受损最大——
   作者只能自己把账算平再交给渲染器，算没算平无人核对。这里把内核的体检与渲染接成一条命令，
   阻断时退出码 2，且**绝不写出半成品**：读不到一张能对账的图，就不产生一个文件。

   同时承担 pages.json 的逐页 waterfall 声明校验：声明了就必须自洽。
   与 density/richness/layout 三个合同同一先例——只查声明过的东西，历史稿不会因它突然失败。 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const B = require('../assets/waterfall-bridge.js');
const themes = require('../assets/deck-themes.js');

/* 与 layout_contract 的 MIN_REASON 同值同义：豁免与残差都要说人话，且短到一句话就挡回去。 */
const MIN_REASON = 12;
const STATUSES = ['verified', 'not_applicable'];
/* 与两种渲染器共用同一容量数字。 */
const MAX_NODES = require('../assets/form-capacity.js').limit('kit.waterfall','nodes');
const norm = value => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();

/* 精确到字符串的数值判读：内核把 reconciliation/tolerance/residual 都以未取整字符串给出，
   声明里也照抄字符串，中间不过一次有损的浮点中转。 */
function decimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !norm(value)) return null;
  const parsed = Number(norm(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/* 逐页 waterfall 声明的结构校验。返回 Array<string>，与 density_contract.validate 同一约定。 */
function blockErrors(page, at) {
  const errors = [], block = page && page.waterfall;
  if (block === undefined) return errors;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return [at + ' waterfall 须为对象'];
  if (!STATUSES.includes(block.status)) return [at + ' waterfall.status 须为 ' + STATUSES.join('/') + '；不声明这一块就整页不查，声明了就得说得清'];
  if (block.status === 'not_applicable') {
    if (norm(block.reason).length < MIN_REASON) errors.push(at + ' waterfall.status="not_applicable" 必须写 reason（≥' + MIN_REASON + '字）说明这一页为什么没有可对账的桥：豁免不是静默放行，审稿要在 audit 里看得见');
    for (const key of ['reconciliation', 'tolerance', 'nodes', 'residual', 'residualReason']) {
      if (block[key] !== undefined) errors.push(at + ' waterfall not_applicable 时不能声明 ' + key + '：两边都写等于两个结论，先决定这页到底有没有桥');
    }
    return errors;
  }
  const reconciliation = decimal(block.reconciliation), tolerance = decimal(block.tolerance);
  if (reconciliation === null) errors.push(at + ' waterfall.reconciliation 须为内核 chart.reconciliation 的原样字符串（未取整残差），不能自填一个更好看的数');
  if (tolerance === null || tolerance < 0) errors.push(at + ' waterfall.tolerance 须为内核实际生效的容差字符串（含 rate+percent 的百分之一缩量），不能自己再猜一个');
  if (!Number.isInteger(block.nodes) || block.nodes < 1) errors.push(at + ' waterfall.nodes 须为节点数（正整数）');
  else if (block.nodes > MAX_NODES) errors.push(at + ' waterfall.nodes=' + block.nodes + ' 超过上限 ' + MAX_NODES + '：请归并驱动项，不静默截断');
  const declaredResidual = block.residual === undefined || block.residual === null ? null : decimal(block.residual);
  if (block.residual !== undefined && block.residual !== null && declaredResidual === null) errors.push(at + ' waterfall.residual 须为内核 chart.residual 的原样字符串，或写 null 表示无残差');
  /* 只有真的承认了一笔非零差额，才算"这一页说清楚了"。
     曾经这里是个 if/else if：只要写了 residual 键（哪怕写 "0"），下面那条量级比较就整个跳过，
     于是"声明 residual:0 + 对账缺口 999"能静默过关——一个自填的假 0 就买通了整道门。 */
  const admits = declaredResidual !== null && declaredResidual !== 0;
  if (admits && norm(block.residualReason).length < MIN_REASON) errors.push(at + ' waterfall.residual=' + norm(block.residual) + ' 是一笔说不清的差额，必须写 residualReason（≥' + MIN_REASON + '字）说明它是什么、为什么保留：图上画出来了，声明里也要说得清');
  if (!admits && reconciliation !== null && tolerance !== null && Math.abs(reconciliation) > tolerance) {
    errors.push(at + ' waterfall 声明为已对账，但 |' + norm(block.reconciliation) + '| > 容差 ' + norm(block.tolerance) + '：这就是被门禁拦住的那类图——要么回内核重算，要么承认残差并写 residualReason');
  }
  return errors;
}

/* 供 audit 用的逐页事实：豁免与残差都不是静默放行，要能被审稿人一眼看到。 */
function inventory(doc) {
  const pages = Array.isArray(doc && doc.pages) ? doc.pages : [];
  const declared = pages.filter(page => page && page.waterfall);
  const verified = declared.filter(page => page.waterfall.status === 'verified');
  const residual = verified.filter(page => page.waterfall.residual !== undefined && page.waterfall.residual !== null && decimal(page.waterfall.residual) !== 0);
  return {
    waterfallPages: declared.length,
    waterfallVerified: verified.length,
    waterfallNotApplicable: declared.filter(page => page.waterfall.status === 'not_applicable').length,
    /* 带残差的页要单独列出来：这些页图上有差额，是审稿人必须亲眼看的那几页。 */
    waterfallWithResidual: residual.map(page => page.page),
    waterfallNodes: verified.reduce((sum, page) => sum + (Number(page.waterfall.nodes) || 0), 0)
  };
}

/* ---------- CLI：体检与渲染 ---------- */

function loadInput(file) {
  const spec = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw Error('输入须为对象');
  return spec;
}

/* 从输入取出内核报告的输入部分。作者写 records+config（从原始记录推导），
   或写 items+config（已算好，只求体检与格式化）；两者都由内核裁决，这里不代劳。 */
function kernelPayload(spec) {
  const payload = {};
  if (Array.isArray(spec.records)) payload.records = spec.records;
  else if (Array.isArray(spec.items)) payload.items = spec.items;
  else throw Error('输入须含 records（原始记录）或 items（已算好的节点）之一');
  payload.config = Object.assign({}, spec.config);
  return payload;
}

function diagnoseSpec(spec) {
  return B.present(B.diagnose(kernelPayload(spec), spec.options));
}

/* 渲染。renderer 缺省 kit；两者都只接受内核报告，不接受作者自算的 items。 */
function renderSpec(spec, report) {
  const renderer = spec.renderer === undefined ? 'kit' : spec.renderer;
  const theme = spec.theme || 'mckinsey';
  const base = {width: Number(spec.width) || 940, height: Number(spec.height) || 460, waterfall: report};
  if (spec.title !== undefined) base.title = spec.title;
  if (spec.typography_id !== undefined) base.typography_id = spec.typography_id;
  if (renderer === 'kit') return require('../assets/exhibit-kit.js').waterfall(Object.assign({palette: themes.palette(theme), typography_id: 'serif-report-bold'}, base));
  if (renderer === 'precision') return require('./render_precision_exhibit.cjs').render(Object.assign({type: 'waterfall', theme}, base));
  throw Error('renderer 须为 kit 或 precision');
}

function describeBlocked(report) {
  const lines = ['瀑布数据未通过体检，不出图（status=' + report.status + '）。'];
  for (const issue of report.issues) lines.push('  [' + issue.code + '] ' + issue.message);
  for (const request of report.requests) lines.push('  需要补齐（' + request.owner + '）：' + request.need.join('；'));
  return lines.join('\n');
}

function main(argv) {
  const [command, input, output] = argv.slice(2);
  /* argv 是 [node, 脚本, 子命令, 输入, 可能的输出]：参数多一个少一个都直接说用法，不猜。 */
  const expected = command === 'render' ? 5 : 4;
  if (!['diagnose', 'render'].includes(command) || !input || (command === 'render' && !output) || argv.length !== expected) {
    console.error('用法: node scripts/waterfall_contract.cjs diagnose input.json\n' +
      '      node scripts/waterfall_contract.cjs render input.json output.svg\n' +
      '输入: {"renderer":"kit|precision","records"|"items":…,"config":{…},"title":…,"theme":…}');
    process.exitCode = 1; return;
  }
  try {
    const spec = loadInput(input);
    const report = diagnoseSpec(spec);
    if (command === 'diagnose') {
      console.log(JSON.stringify(report, null, 2));
      if (report.status !== 'ready') process.exitCode = 2;
      return;
    }
    /* 阻断就先说清楚缺什么，再退 2；此时输出路径一个字节都不写。 */
    if (report.status !== 'ready') { console.error(describeBlocked(report)); process.exitCode = 2; return; }
    if (fs.existsSync(output)) throw Error('输出已存在，请使用新路径：' + output);
    /* 渲染器拒绝（节点超限、破轴、未知类型）与体检不通过是同一件事的两面：图没出来，一个字节都不写。
       两者都退 2；退 1 只留给"用法写错了"，否则作者会去翻自己的参数，而问题其实在数据。 */
    let svg;
    try { svg = renderSpec(spec, report); }
    catch (error) { console.error(error.message); process.exitCode = 2; return; }
    fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
    fs.writeFileSync(output, svg);
    /* 对账结论跟着文件一起回话：作者不必再去内核报告里翻。 */
    console.log(JSON.stringify({written: output, mode: report.chart.mode, nodes: report.chart.bars.length,
      reconciliation: report.chart.reconciliation, residual: report.chart.residual, tolerance: report.chart.tolerance}, null, 2));
    if (report.chart.residual !== null && report.chart.residual !== undefined && decimal(report.chart.residual) !== 0) {
      console.error('注意：图上带一笔未解释差额 ' + report.chart.residual + '（已单独成柱）。pages.json 声明这一页时必须写 residualReason。');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv);

module.exports = {MIN_REASON, MAX_NODES, STATUSES, blockErrors, inventory, diagnoseSpec, renderSpec, describeBlocked, decimal};
