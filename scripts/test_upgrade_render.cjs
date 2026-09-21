'use strict';
/* 可重跑的真实生产链验证。产物保留供人审，不生成作者/独立审稿的通过记录。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const compiler = require('./compile_blueprint.cjs');
const content = require('./content_contract.cjs');
const verifier = require('./verify_blueprint_pages.cjs');
const {assemble} = require('./assemble_deck.cjs');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'renders/upgrade-integration');
const fixture = path.join(root, 'tests/fixtures/upgrade-blueprint.json');
const clone = value => JSON.parse(JSON.stringify(value));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

function command(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, script), ...args], {cwd: root, env: process.env});
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({code, stdout, stderr}));
  });
}

function binding(page, key, tag = 'span', className = '') {
  return content.html(page, key, {tag, className});
}
function svgText(page, key, x, y) {
  return `<g transform="translate(${x},${y})">${binding(page, key, 'text')}</g>`;
}
function source(page) {
  return `<footer class="source">${binding(page, page.content.sources.map(item => 'source:' + item.key))}</footer>`;
}
function header(page, caption) {
  return `<header class="slide__header">${binding(page, 'title', 'h1', 'slide__title')}<p class="slide__lead">${caption}</p></header>`;
}

function authorPages(pages) {
  const [comparison, scenario, conditions] = pages;
  const value = (page, id) => page.content.metrics.find(metric => metric.id === id).value;
  const comparisonSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="290" viewBox="0 0 1160 290" aria-label="合成地区规模比较">
    <line x1="100" x2="100" y1="32" y2="215" stroke="#9cabb8"/>
    <text x="10" y="87">甲区</text><text x="10" y="169">乙区</text>
    <rect x="100" y="53" width="${value(comparison, 'region-a') * 6}" height="48" fill="#000080"/>
    <rect x="100" y="135" width="${value(comparison, 'region-b') * 6}" height="48" fill="#7b90b1"/>
    ${svgText(comparison, 'metric:region-a', value(comparison, 'region-a') * 6 + 116, 86)}
    ${svgText(comparison, 'metric:region-b', value(comparison, 'region-b') * 6 + 116, 168)}
    <text x="100" y="248">零基线 · 同一期间 · 同一单位</text>
  </svg>`;
  const scenarioRows = [['low', '低情景', 75], ['base', '基准', 165], ['high', '高情景', 255]];
  const scenarioSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="370" viewBox="0 0 720 370" aria-label="合成情景同轴比较">
    ${scenarioRows.map(([id, label, y]) => `<text x="0" y="${y + 6}">${label}</text><line x1="100" x2="620" y1="${y}" y2="${y}" stroke="#cbd5df"/><circle cx="${100 + value(scenario, id) * 24}" cy="${y}" r="7" fill="#000080"/>${svgText(scenario, 'metric:' + id, 116 + value(scenario, id) * 24, y - 15)}`).join('')}
    <text x="100" y="334">各点为假设结果，不表示时间或发生概率</text>
  </svg>`;
  return `<section class="slide reading fixture comparison-page" data-page-id="comparison" data-frame-boundary="line">
    ${header(comparison, '合成同期数据；主图与差额由同一输入生成')}
    <div class="slide__body">
      <div data-module="main" class="fixture-primary">${comparisonSvg}</div>
      <div data-module="bottom" class="support-band"><div class="gap-value"><span>规模差额</span>${binding(comparison, 'metric:gap', 'strong')}</div><div>${binding(comparison, 'claim:regional-gap', 'p')}${binding(comparison, 'limitation:regional-gap', 'p', 'fixture-limit')}</div></div>
    </div>${source(comparison)}
  </section>
  <section class="slide reading fixture scenario-page" data-page-id="scenario" data-frame-boundary="line">
    ${header(scenario, '三档合成假设；不赋予概率，也不把情景画成时间趋势')}
    <div class="slide__body">
      <div data-module="left" class="fixture-primary">${scenarioSvg}</div>
      <div data-module="right" class="scenario-notes"><h2>读图边界</h2>${binding(scenario, 'claim:scenario-range', 'p')}${binding(scenario, 'limitation:scenario-range', 'p', 'fixture-limit')}</div>
    </div>${source(scenario)}
  </section>
  <section class="slide reading fixture conditions-page" data-page-id="conditions" data-frame-boundary="line">
    ${header(conditions, '共同表头对齐两类条件；保留来源与适用限制')}
    <div class="slide__body">
      <div data-module="table" class="exhibit"><table class="data-table"><thead><tr><th>条件与对应动作</th><th>适用边界</th></tr></thead><tbody>
        <tr>${binding(conditions, 'claim:proceed', 'td')}${binding(conditions, 'limitation:proceed', 'td')}</tr>
        <tr>${binding(conditions, 'claim:stop', 'td')}${binding(conditions, 'limitation:stop', 'td')}</tr>
      </tbody></table></div>
      <div data-module="panel" class="exhibit conclusion-band"><h2>使用方式</h2><p>逐项核对条件，再决定推进、补证或停止；这份合成样稿不替代真实业务判断。</p></div>
    </div>${source(conditions)}
  </section>`;
}

const css = `
.fixture .slide__lead{margin:10px 0 0}
.fixture .slide__header{flex:0 0 128px}
.fixture .source{font-size:13px;line-height:18px;margin-top:10px}
.fixture svg{display:block;flex:none;max-width:none;font-size:18px;font-weight:400;fill:#203343}
.fixture p{margin:0 0 12px;font-size:17px;line-height:26px}
.fixture h2{font-size:20px;line-height:28px;font-weight:600;margin:0 0 16px;color:#000080}
.fixture .fixture-limit{font-size:15px;line-height:24px;color:#50606e}
.fixture[data-layout="custom"] .slide__body{display:grid;flex:0 0 486px;height:486px;margin-top:0;gap:16px;grid-template-rows:1fr;grid-template-columns:1fr}
.comparison-page[data-layout="custom"] .slide__body{grid-template-rows:300px 170px;grid-template-columns:1fr}
.fixture-primary{padding:10px 20px;box-sizing:border-box;min-width:0;min-height:0}
.support-band{display:grid;grid-template-columns:220px 1fr;gap:30px;align-items:start;padding:16px 20px;box-sizing:border-box}
.gap-value{display:flex;flex-direction:column;gap:12px;font-size:17px;line-height:25px}
.gap-value strong{font-size:32px;line-height:42px;font-weight:600;color:#000080}
.scenario-page[data-layout="custom"] .slide__body{grid-template-columns:760px 424px;grid-template-rows:486px}
.scenario-notes{padding:30px 20px 10px;box-sizing:border-box}
.scenario-notes .fixture-limit{margin-top:26px}
.conditions-page .data-table{width:100%;table-layout:fixed}
.conditions-page .data-table th{font-size:17px;font-weight:600}
.conditions-page .data-table td{font-size:17px;line-height:28px;padding:20px 14px;vertical-align:top}
.conditions-page .data-table th:first-child{width:58%}
.conditions-page .conclusion-band{padding:18px 24px}
`;

async function runQA(htmlFile, name, tier, expectedPattern) {
  const destination = path.join(out, name);
  const result = await command('qa_deck.cjs', [htmlFile, destination, '--tier', tier]);
  const auditFile = path.join(destination, 'audit.json');
  assert.ok(fs.existsSync(auditFile), 'QA 未产出实际审计：' + result.stderr + result.stdout);
  const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
  if (expectedPattern) {
    assert.equal(audit.geometryStatus, 'FAIL', name + ' 应被真实成稿核对阻断');
    assert.ok(audit.errors.some(error => expectedPattern.test(error)), name + ' 未出现预期合同错误：' + JSON.stringify(audit.errors));
  } else {
    assert.equal(result.code, 0, result.stderr + result.stdout);
    assert.equal(audit.geometryStatus, 'PASS', JSON.stringify(audit.errors));
    assert.equal(audit.pagesCheck.status, 'PASS', JSON.stringify(audit.pagesCheck));
    assert.equal(audit.pdfPages, 3);
    assert.ok(audit.acceptance.complete && audit.pdfArtifact.bytes > 0);
    assert.match(audit.visualStatus, /NOT_REVIEWED/, '机器验收不能伪造目视通过');
  }
  console.log(JSON.stringify({step: name, machineStatus: audit.geometryStatus, expectedFailure: !!expectedPattern, audit: auditFile}));
  return audit;
}

async function main() {
  fs.mkdirSync(out, {recursive: true});
  const blueprintFile = path.join(out, 'blueprint.json'), pagesFile = path.join(out, 'pages.json');
  const fragmentsFile = path.join(out, 'pages.html'), cssFile = path.join(out, 'pages.css');
  const taskFile = path.join(out, 'task.json'), deckFile = path.join(out, 'deck.html');
  const blueprint = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  writeJson(blueprintFile, blueprint);
  const compiled = compiler.run([blueprintFile, pagesFile]);
  const pagesDoc = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
  assert.equal(compiled.pages, 3);
  assert.deepEqual(verifier.verify(blueprint, pagesDoc), []);
  const changed = clone(blueprint);
  changed.slides[1].sourcePlan.claims[0].metrics[0].value = 125;
  const recompiled = content.compile(changed);
  assert.notEqual(recompiled.pages[0].contentHash, pagesDoc.pages[0].contentHash);
  assert.deepEqual(recompiled.pages.slice(1).map(page => page.contentHash), pagesDoc.pages.slice(1).map(page => page.contentHash), '单页输入变化不应污染其他页的内容指纹');
  assert.ok(verifier.verify(changed, pagesDoc).some(error => /编译结果不同/.test(error)), '修改蓝图后旧 pages 必须失效');
  fs.writeFileSync(fragmentsFile, authorPages(pagesDoc.pages));
  fs.writeFileSync(cssFile, css);
  writeJson(taskFile, {version: 1, kind: 'fragment', mode: 'reading', workMode: 'editorial', complexity: 'complex', majorConclusion: false,
    theme: 'mckinsey', typography: 'serif-report-bold', ratio: '16x9', pages: {record: 'pages.json'}, blueprint: {record: 'blueprint.json'}, critical: []});
  const assemblyOptions = {pagesFile: fragmentsFile, outputFile: deckFile, cssFile, contractFile: taskFile, title: blueprint.deck.title};
  await assemble(assemblyOptions);
  console.log(JSON.stringify({step: 'assemble', pages: 3, path: deckFile}));
  const baseline = await runQA(deckFile, 'baseline', 'acceptance');
  const original = fs.readFileSync(deckFile, 'utf8');

  const metricNeedle = 'data-content-key="metric:region-a">120 万元<';
  assert.ok(original.includes(metricNeedle), '找不到真实 metric 绑定节点');
  const alteredMetric = path.join(out, 'tampered-metric.html');
  fs.writeFileSync(alteredMetric, original.replace(metricNeedle, 'data-content-key="metric:region-a">999 万元<'));
  await runQA(alteredMetric, 'tampered-metric', 'smoke', /文本偏离内容真源.*metric:region-a/);

  const title = pagesDoc.pages[0].content.title;
  const alteredTitle = path.join(out, 'tampered-title.html');
  assert.ok(original.includes('>' + title + '</h1>'));
  fs.writeFileSync(alteredTitle, original.replace('>' + title + '</h1>', '>未经蓝图授权的标题</h1>'));
  await runQA(alteredTitle, 'tampered-title', 'smoke', /标题不一致|文本偏离内容真源.*title/);

  const hiddenPrint = path.join(out, 'hidden-print-binding.html');
  fs.writeFileSync(hiddenPrint, original.replace('</head>', '<style>@media print{[data-page-id="comparison"] [data-content-key="limitation:regional-gap"]{display:none!important}}</style></head>'));
  await runQA(hiddenPrint, 'hidden-print-binding', 'smoke', /打印.*(?:内容不可见|缺少真实可见|limitation:regional-gap)/);

  for(const [name,style] of [['clipped-binding','clip-path:inset(100%)'],['transparent-binding','color:transparent;-webkit-text-fill-color:transparent']]){
    const file=path.join(out,name+'.html');
    fs.writeFileSync(file,original.replace('</head>','<style>[data-content-key="metric:gap"]{'+style+'!important}</style></head>'));
    await runQA(file,name,'smoke',/内容不可见.*metric:gap|missing.*metric:gap/);
  }

  for(const [name,selector,style] of [
    ['transparent-svg-fill','[data-content-key="metric:region-a"]','fill-opacity:0!important'],
    ['transparent-svg-inherited','g:has(>[data-content-key="metric:region-a"])','fill-opacity:0!important'],
    ['transparent-svg-stroke','[data-content-key="metric:region-a"]','fill:none!important;stroke:#203343!important;stroke-width:1px!important;stroke-opacity:0!important']
  ]){
    const file=path.join(out,name+'.html');
    fs.writeFileSync(file,original.replace('</head>','<style>'+selector+'{'+style+'}</style></head>'));
    await runQA(file,name,'smoke',/内容不可见.*metric:region-a/);
  }
  const strokedText=path.join(out,'visible-svg-stroke.html');
  fs.writeFileSync(strokedText,original.replace('</head>','<style>[data-content-key="metric:region-a"]{fill:none!important;stroke:#203343!important;stroke-width:1px!important;stroke-opacity:1!important}</style></head>'));
  await runQA(strokedText,'visible-svg-stroke','acceptance');

  // 不允许在仍绑定新蓝图时换一个 legacy pages 跳过内容验证。
  writeJson(pagesFile,{version:1,pages:pagesDoc.pages.map(p=>({page:p.page,form:p.form,visual:p.visual,proves:p.proves}))});
  try{await assert.rejects(()=>assemble({...assemblyOptions,outputFile:path.join(out,'downgraded.html')}),/必须配套|历史合同/);}
  finally{writeJson(pagesFile,pagesDoc);}

  writeJson(blueprintFile, changed);
  try {
    await assert.rejects(() => assemble({...assemblyOptions, outputFile: path.join(out, 'stale-blueprint.html')}), /编译结果不同|摘要变化|重新编译/);
  } finally { writeJson(blueprintFile, blueprint); }
  const summary = {pass: true, synthetic: true, html: deckFile, pdf: baseline.pdfArtifact.path,
    checks: ['真实三页 HTML/PDF 验收', '标题篡改拒绝', 'metric 成稿篡改拒绝', '打印隐藏关键绑定拒绝', '裁切/透明关键文字拒绝', 'SVG填充/继承/描边透明拒绝，可见描边通过', '降级历史合同拒绝', '蓝图改值未编译拒绝', '单页修改保留其他页内容指纹'],
    reviewStatus: 'NOT_REVIEWED：未写入作者或独立审稿通过记录', baselineAudit: path.join(out, 'baseline/audit.json')};
  writeJson(path.join(out, 'result.json'), summary);
  console.log(JSON.stringify(summary));
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = {authorPages, css, main};
