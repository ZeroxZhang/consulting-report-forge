'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const contract = require('./content_contract.cjs');
const clone = value => JSON.parse(JSON.stringify(value));

/* 仅合成数据；同时供真实渲染集成使用，require 本文件不运行测试。 */
function fixture() {
  return {
    schemaVersion: 2,
    deck: {title: '合成业务收入分析', audience: '经营研究读者', decision: '理解收入变化及预测边界',
      governingThought: '合成收入增加，单凭收入变化不能判断利润。', mode: 'reading', ratio: '16x9'},
    sources: {
      S1: {label: '合成销售输入', locator: 'inputs/synthetic.csv:L2-L3'},
      S2: {label: '合成情景假设', locator: 'inputs/scenario.md:L1-L2'}
    },
    slides: [
      {id: 'cover', sequence: 1, pageRole: 'cover', storyBeat: 'context', title: '合成业务收入分析', subtitle: '仅用于工具验证', cornerLabel: '', speakerIntent: ''},
      {id: 'revenue', sequence: 2, pageRole: 'analysis', storyBeat: 'insight', title: '收入增长{{metric:growth-rate}}，利润变化仍待核对',
        subtitle: '合成数据，2024–2025年', cornerLabel: '01', speakerIntent: '区分收入变化与利润判断。',
        proves: '本期收入较基期增长{{metric:growth-rate}}，预测另列且不冒充实际。',
        visual: {form: 'kit.dumbbell', primary: '基期与本期收入的同量尺比较', layout: 'L01', readingPath: '主图 → 预测 → 口径与来源'},
        density: {profile: 'balanced', evidenceUnits: [{role: 'primary', purpose: '同量尺显示基期与本期收入变化'}, {role: 'support', purpose: '区分预测身份与利润边界'}], spaceIntent: '主图与条件分组，来源独立。'},
        sourcePlan: {status: 'verified', keys: ['S1', 'S2'], scope: '只核对合成输入和算术。', claims: [
          {id: 'revenue-change', kind: 'fact', statement: '合成收入从{{metric:base}}增至{{metric:current}}，增长{{metric:growth-rate}}。', verification: 'provided', sourceKeys: ['S1'],
            period: '2024–2025全年', population: '同一合成业务', unit: '万元', denominator: '基期收入{{metric:base}}', calculation: '本期{{metric:current}}除以基期{{metric:base}}再减一，按百分数显示。',
            inference: '收入增加{{metric:growth-rate}}，不证明利润增加。', limitation: '合成测试数据；没有成本与现金数据。',
            metrics: [{id: 'base', unit: '万元', decimals: 0, value: 100}, {id: 'current', unit: '万元', decimals: 0, value: 120},
              {id: 'growth-rate', unit: '%', decimals: 1, formula: {op: 'percent_change', args: ['current', 'base']}}]},
          {id: 'next-year', kind: 'forecast', statement: '下一期收入可能达到{{metric:forecast-revenue}}。', verification: 'provided', sourceKeys: ['S2'],
            period: '2026全年', population: '同一合成业务情景', unit: '万元', denominator: '本期收入{{metric:current}}', calculation: '本期收入{{metric:current}}乘以{{metric:factor}}。',
            inference: '条件情景，不是实际经营结果。', limitation: '合成假设，增长率尚未验证。',
            metrics: [{id: 'factor', unit: '倍', decimals: 1, value: 1.1}, {id: 'forecast-revenue', unit: '万元', decimals: 0,
              formula: {op: 'multiply', args: ['current', 'factor']}}]}
        ]}}
    ]
  };
}

function runTests() {
  let checks = 0;
  const test = (name, fn) => { fn(); checks++; };
  const doc = fixture(), before = JSON.stringify(doc), compiled = contract.compile(doc), page = compiled.pages[0];
  const facts = p => Object.entries(contract.bindings(p)).map(([key, text]) => ({key, text, visible: true}));
  const rejects = (mutate, pattern) => {
    const changed = fixture(); mutate(changed);
    const errors = contract.validate(changed);
    assert.ok(errors.some(error => pattern.test(error)), JSON.stringify(errors));
    assert.throws(() => contract.compile(changed), pattern);
  };
  test('schema 1 不受扩展验证影响', () => assert.deepEqual(contract.validate({schemaVersion: 1}), []));
  test('派生内容不改输入', () => { assert.equal(JSON.stringify(doc), before); assert.equal(compiled.version, 4); assert.equal(page.id, 'revenue'); });
  test('真实增长率与跨主张公式计算', () => {
    const metrics = new Map(page.content.metrics.map(m => [m.id, m]));
    assert.ok(Math.abs(metrics.get('growth-rate').value - 20) < 1e-12);
    assert.equal(metrics.get('growth-rate').text, '20.0%');
    assert.equal(metrics.get('forecast-revenue').value, 132);
    assert.equal(metrics.get('forecast-revenue').text, '132 万元（预测）');
  });
  test('指标插值联动标题、主张、口径和论点，未知token拒绝', () => {
    const changed = fixture(); changed.slides[1].sourcePlan.claims[0].metrics[0].value = 80;
    changed.slides[1].sourcePlan.claims[0].limitation += '本页基数为{{metric:base}}。';
    const output = contract.compile(changed).pages[0], map = contract.bindings(output);
    assert.equal(map['metric:growth-rate'], '50.0%');
    assert.equal(output.title, output.content.title); assert.match(output.title, /增长50\.0%/);
    assert.match(output.proves, /增长50\.0%/); assert.match(map['claim:revenue-change'], /80 万元.*120 万元.*50\.0%/);
    assert.match(map['limitation:revenue-change'], /分母：基期收入80 万元.*基数为80 万元/);
    assert.equal(contract.resolveText(changed.slides[1], '{{metric:current}}'), '120 万元');
    rejects(d => { d.slides[1].title = '{{metric:missing}}'; }, /未知内容 token/);
    rejects(d => { d.slides[1].sourcePlan.claims[0].calculation = '{{script:evil}}'; }, /未知内容 token/);
    rejects(d => { d.slides[1].proves = '{{metric:base'; }, /token 不完整/);
  });
  test('跨主张非事实输入不能洗成fact，含传递依赖', () => {
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics.push({id: 'laundered', unit: '万元', decimals: 0, formula: {op: 'sum', args: ['forecast-revenue']}}); }, /身份冲突.*fact/);
    const changed = fixture(), claims = changed.slides[1].sourcePlan.claims;
    claims.push({...clone(claims[0]), id: 'decision', kind: 'recommendation', metrics: [{id: 'target', unit: '万元', decimals: 0, formula: {op: 'sum', args: ['forecast-revenue']}}]});
    const output = contract.compile(changed).pages[0].content.metrics.find(m => m.id === 'target');
    assert.equal(output.kind, 'recommendation'); assert.equal(output.text, '132 万元（建议；含预测输入）');
    claims[0].metrics.push({id: 'laundered', unit: '万元', decimals: 0, formula: {op: 'sum', args: ['target']}});
    assert.ok(contract.validate(changed).some(e => /身份冲突.*fact/.test(e)));
  });
  test('跨主张预测或假设不能洗成estimate，并保留上游身份', () => {
    for (const kind of ['forecast', 'assumption']) {
      rejects(d => {
        const claims = d.slides[1].sourcePlan.claims; claims[1].kind = kind;
        claims.push({...clone(claims[0]), id: 'estimate-copy', kind: 'estimate', metrics: [{id: 'copy', unit: '万元', decimals: 0, formula: {op: 'sum', args: ['forecast-revenue']}}]});
      }, /身份冲突.*estimate/);
    }
    const changed = fixture(), claims = changed.slides[1].sourcePlan.claims;
    const factor = claims[1].metrics.shift();
    claims.push({...clone(claims[1]), id: 'factor-assumption', kind: 'assumption', statement: '倍数为{{metric:factor}}。', metrics: [factor]});
    assert.equal(contract.compile(changed).pages[0].content.metrics.find(m => m.id === 'forecast-revenue').text, '132 万元（预测；含假设输入）');
  });
  test('十进制中点显示按半入舍入，保留未舍入计算值并消除负零', () => {
    const doc = fixture(), cases = [[0.725,'0.73'],[2.175,'2.18'],[1.005,'1.01'],[-1.005,'-1.01'],[-0.0001,'0.00']];
    doc.slides[1].sourcePlan.claims[0].metrics.push(...cases.map(([value],i)=>({id:'round-'+i,value,unit:'周',decimals:2})));
    const metrics = contract.compile(doc).pages[0].content.metrics;
    cases.forEach(([value,text],i)=>{const actual=metrics.find(m=>m.id==='round-'+i);assert.equal(actual.text,text+' 周');assert.equal(actual.value,value);});
  });
  test('sum/subtract/divide/share 运算', () => {
    const modified = fixture();
    for (const op of ['sum', 'subtract', 'divide', 'share']) modified.slides[1].sourcePlan.claims[0].metrics.push({id: op, unit: op === 'share' ? '%' : '万元', decimals: 2, formula: {op, args: ['current', 'base']}});
    const values = Object.fromEntries(contract.compile(modified).pages[0].content.metrics.map(m => [m.id, m.value]));
    assert.deepEqual([values.sum, values.subtract, values.divide, values.share], [220, 20, 1.2, 120]);
  });
  test('目录派生槽位角色，不能猜测支持图', () => {
    assert.deepEqual(page.regions.map(r => [r.slot, r.role, r.form]), [['chart', 'primary', 'kit.dumbbell'], ['annotation', 'implication', 'html.text']]);
    const changed = fixture(); changed.slides[1].visual.layout = 'L04';
    assert.throws(() => contract.compile(changed), /明确形式|主区|派生布局/);
  });
  test('来源解析及身份文本', () => {
    const map = contract.bindings(page);
    assert.equal(map['source:S1'], '合成销售输入 · inputs/synthetic.csv:L2-L3');
    assert.match(map['claim:next-year'], /^预测：/);
    assert.match(map['limitation:next-year'], /2026全年.*分母：本期收入120 万元.*合成假设/);
    assert.deepEqual(contract.verify({title: page.title, bindings: facts(page)}, page), []);
  });
  test('所有非事实身份均可见', () => {
    for (const [kind, label] of [['estimate', '估计'], ['assumption', '假设'], ['recommendation', '建议']]) {
      const changed = fixture(); changed.slides[1].sourcePlan.claims[1].kind = kind;
      const result = contract.bindings(contract.compile(changed).pages[0]);
      assert.ok(result['claim:next-year'].startsWith(label + '：'));
      assert.ok(result['metric:forecast-revenue'].endsWith('（' + label + '）'));
    }
  });
  test('篡改、删除、隐藏和未知绑定被拒绝', () => {
    for (const mutate of [items => { items[0].text = '另一标题'; }, items => items.pop(), items => { items[0].visible = false; }, items => items.push({key: 'metric:forged', text: '1', visible: true})]) {
      const got = facts(page); mutate(got); assert.ok(contract.verifyBindings(page, got).length);
    }
    const lostIdentity = facts(page); lostIdentity.find(f => f.key === 'claim:next-year').text = page.content.claims[1].statement;
    assert.ok(contract.verifyBindings(page, lostIdentity).some(e => /文本偏离/.test(e)));
    const metricIdentity = facts(page); metricIdentity.find(f => f.key === 'metric:forecast-revenue').text = '132 万元';
    assert.ok(contract.verifyBindings(page, metricIdentity).some(e => /文本偏离.*metric:forecast-revenue/.test(e)));
  });
  test('同键重复合法，但隐藏的第二副本仍拒绝', () => {
    const got = facts(page); got.push({...got[0]}); assert.deepEqual(contract.verifyBindings(page, got), []);
    got[got.length - 1].visible = false; assert.ok(contract.verifyBindings(page, got).some(e => /不可见/.test(e)));
  });
  test('来源可在同一叶节点合并', () => {
    const got = facts(page).filter(f => !f.key.startsWith('source:'));
    got.push({key: JSON.stringify(['source:S1', 'source:S2']), text: contract.bindingText(page, ['source:S1', 'source:S2']), visible: true});
    assert.deepEqual(contract.verifyBindings(page, got), []);
    assert.match(contract.html(page, ['source:S1', 'source:S2']), /&quot;source:S1&quot;/);
  });
  test('来源缺失与重复显式失败', () => {
    rejects(d => { delete d.sources.S1; }, /来源键未登记/);
    rejects(d => { d.sources.S1.locator = ''; }, /locator/);
    rejects(d => { d.slides[1].sourcePlan.keys.push('S1'); }, /来源键重复/);
    rejects(d => { delete d.slides[1].sourcePlan.claims; }, /须有非空/);
  });
  test('计算循环、缺参、零除和负增长基数拒绝', () => {
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics[0] = {id: 'base', unit: '万元', decimals: 0, formula: {op: 'sum', args: ['growth-rate']}}; }, /计算循环/);
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics[2].formula.args[0] = 'missing'; }, /引用缺失/);
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics[0].value = 0; }, /零除/);
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics[0].value = -100; }, /基数须为正/);
  });
  test('重复 metric、非有限值、非法精度、双输入和任意代码拒绝', () => {
    rejects(d => { d.slides[1].sourcePlan.claims[1].metrics[0].id = 'base'; }, /同页唯一/);
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics[0].value = Infinity; }, /有限数字/);
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics[0].decimals = 7; }, /0–6/);
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics[0].formula = {op: 'sum', args: ['current']}; }, /二选一/);
    rejects(d => { d.slides[1].sourcePlan.claims[0].metrics[2].formula.op = 'process.exit()'; }, /formula.op/);
  });
  test('内容或来源改变使内容摘要失效，对象键顺序不影响摘要', () => {
    for (const mutate of [d => { d.slides[1].title += '（更新）'; }, d => { d.sources.S1.locator = 'inputs/synthetic.csv:L3-L4'; }, d => { d.slides[1].sourcePlan.claims[0].metrics[1].value = 125; }]) {
      const changed = fixture(); mutate(changed); const other = contract.compile(changed);
      assert.notEqual(other.pages[0].contentHash, page.contentHash); assert.notEqual(other.blueprintSha256, compiled.blueprintSha256);
    }
    assert.equal(contract.hash({b: 2, a: 1}), contract.hash({a: 1, b: 2}));
    const forged = clone(page); forged.content.claims[0].statement += '篡改';
    assert.ok(contract.verifyBindings(forged, facts(forged)).some(e => /contentHash/.test(e)));
  });
  test('HTML helper 只生成转义后的叶内容', () => {
    const changed = fixture(); changed.slides[1].title = '<script>alert("x")</script>';
    const output = contract.html(contract.compile(changed).pages[0], 'title', {tag: 'h1', className: 'slide__title'});
    assert.ok(output.includes('&lt;script&gt;')); assert.ok(!output.includes('<script>'));
    assert.throws(() => contract.html(page, 'title', {tag: 'script'}), /不支持/);
  });
  test('自定义图有语义身份与实际阅读区', () => {
    const changed = fixture(), v = changed.slides[1].visual;
    Object.assign(v, {form: 'custom', semanticType: 'comparison', rationale: '合成检验自定义比较图的合同', layout: 'custom',
      regions: [{slot: 'main', span: 8, role: 'primary', form: 'svg.custom', visual: v.primary}, {slot: 'aside', span: 4, role: 'support', form: 'html.text'}]});
    const custom = contract.compile(changed).pages[0]; assert.equal(custom.semanticType, 'comparison'); assert.equal(custom.form, 'svg.custom');
    delete v.semanticType; assert.ok(contract.validate(changed).some(e => /semanticType/));
  });
  test('未封装图型可声明真实语义，未知语义及伪瀑布仍被拒绝', () => {
    for (const semanticType of ['distribution', 'correlation', 'hierarchy', 'geographic', 'network']) {
      const changed = fixture(), v = changed.slides[1].visual;
      Object.assign(v, {form: 'svg.custom', semanticType, layout: 'custom',
        regions: [{slot: 'main', span: 1, role: 'primary', form: 'svg.custom', visual: '合成数据的自定义关系展示'}]});
      assert.equal(require('./deck_blueprint.cjs').validate(changed, {ready: true}).status, 'PASS');
      const output = contract.compile(changed);
      assert.equal(output.pages[0].semanticType, semanticType);
      assert.equal(require('./check_pages.cjs').check(output).status, 'PASS');
      v.semanticType = 'invented'; assert.ok(contract.validate(changed).some(e => /semanticType/.test(e)));
      v.semanticType = 'waterfall'; assert.ok(contract.validate(changed).some(e => /waterfall.input/.test(e)));
    }
  });
  test('新版编辑任务不按页数强造洞察，布局错误给出可执行的新版路径', () => {
    const changed = fixture();
    changed.slides[1].storyBeat = 'context';
    for (let i=2;i<=3;i++) changed.slides.push({...clone(changed.slides[1]), id: 'context-'+i, sequence: i+1});
    const blueprint = require('./deck_blueprint.cjs');
    assert.equal(blueprint.validate(changed, {ready: true}).status, 'PASS');
    assert.equal(contract.compile(changed).pages.length, 3);
    const legacy = clone(changed); legacy.schemaVersion=1;
    assert.ok(blueprint.validate(legacy).errors.some(e => /diagnosis.*insight/.test(e)));
    changed.slides[1].visual.layout='not-a-layout';
    const errors=blueprint.validate(changed).errors;
    assert.ok(errors.some(e => /visual.layout=.*custom.*visual.regions/.test(e)), JSON.stringify(errors));
    changed.slides[1].visual.layout='custom';
    assert.ok(contract.validate(changed).length || (()=>{try {contract.compile(changed);return false;}catch {return true;}})(), '没有区域的custom不能蒙混通过');
  });
  test('瀑布只从内核输入派生且输入纳入内容摘要', () => {
    const changed = fixture(); changed.slides[1].visual.form = 'kit.waterfall';
    assert.ok(contract.validate(changed).some(e => /waterfall.input/));
    changed.slides[1].waterfall = {input: {items: [{label: '基期', type: 'start', value: 100}, {label: '增量', type: 'delta', value: 20}, {label: '本期', type: 'end', value: 120}],
      config: {mode: 'bridge', metric: '收入', metric_type: 'currency', unit: '万元', source: '合成输入'}}};
    const first = contract.compile(changed).pages[0]; assert.equal(first.waterfall.status, 'verified'); assert.equal(first.waterfall.reconciliation, '0'); assert.equal(first.waterfall.nodes, 3);
    changed.slides[1].waterfall.input.items[0].value = 105; changed.slides[1].waterfall.input.items[1].value = 15;
    assert.notEqual(contract.compile(changed).pages[0].contentHash, first.contentHash);
    changed.slides[1].waterfall.residual = '0'; assert.ok(contract.validate(changed).some(e => /不能手填/));
    delete changed.slides[1].waterfall.residual; changed.slides[1].waterfall.input.items[1].value = 100;
    assert.ok(contract.validate(changed).some(e => /未通过体检/));
  });
  test('编译CLI同文件/软链输入保护', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'content-contract-'));
    try {
      const file = path.join(tmp, 'input.json'), link = path.join(tmp, 'alias.json');
      fs.writeFileSync(file, JSON.stringify(fixture())); fs.symlinkSync(file, link);
      const cli = require('./compile_blueprint.cjs');
      assert.throws(() => cli.run([file, file]), /拒绝覆盖输入/);
      assert.throws(() => cli.run([file, link]), /拒绝覆盖输入/);
      assert.equal(JSON.parse(fs.readFileSync(file)).schemaVersion, 2);
    } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
  });
  test('真实CLI ready编译、重复编译及作者文件保护', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'content-cli-'));
    try {
      const {spawnSync} = require('node:child_process');
      const input = path.join(tmp, 'blueprint.json'), output = path.join(tmp, 'pages.json'), snippets = path.join(tmp, 'snippets.html');
      fs.writeFileSync(input, JSON.stringify(fixture()));
      const call = (...args) => spawnSync(process.execPath, [path.join(__dirname, 'compile_blueprint.cjs'), ...args], {encoding: 'utf8'});
      const first = call(input, output, '--snippets', snippets);
      assert.equal(first.status, 0, first.stderr);
      assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), compiled);
      assert.ok(fs.readFileSync(snippets, 'utf8').startsWith(require('./compile_blueprint.cjs').SNIPPET_MARKER));
      assert.equal(call(input, output, '--snippets', snippets).status, 0);
      fs.writeFileSync(snippets, '<section>作者原稿</section>');
      const protectedSnippet = call(input, output, '--snippets', snippets);
      assert.notEqual(protectedSnippet.status, 0); assert.match(protectedSnippet.stderr, /拒绝覆盖作者片段/);
      assert.equal(fs.readFileSync(snippets, 'utf8'), '<section>作者原稿</section>');
      fs.writeFileSync(output, '{"version":3,"pages":[]}');
      const protectedPages = call(input, output);
      assert.notEqual(protectedPages.status, 0); assert.match(protectedPages.stderr, /拒绝覆盖非生成/);
      const pending = fixture(); pending.slides[1].sourcePlan.claims[0].verification = 'pending'; fs.writeFileSync(input, JSON.stringify(pending));
      const notReady = call(input, path.join(tmp, 'pending-pages.json'));
      assert.notEqual(notReady.status, 0); assert.match(notReady.stderr, /未准备好/);
      assert.ok(!fs.existsSync(path.join(tmp, 'pending-pages.json')));
    } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
  });
  console.log(JSON.stringify({pass: true, checks, metrics: page.content.metrics.length, bindingKeys: Object.keys(contract.bindings(page)).length}));
  return checks;
}

if (require.main === module) runTests();
module.exports = {fixture, runTests};
