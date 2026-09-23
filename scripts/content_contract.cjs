/* schema 2 的内容真源：只计算声明过的公式，按同一文本生成与核对可见绑定。
   不认证来源真实性或推理质量；这些仍需实际研究和独立审查。 */
'use strict';
const crypto = require('node:crypto');
const layouts = require('./layout_contract.cjs');
const forms = require('../assets/deck-forms.js');
const waterfall = require('./waterfall_contract.cjs');

const CONTENT_ROLES = new Set(['analysis', 'decision', 'action', 'risk', 'appendix']);
const SEMANTIC_TYPES = ['comparison', 'trend', 'composition', 'flow', 'waterfall', 'scenario', 'table', 'qualitative', 'distribution', 'correlation', 'hierarchy', 'geographic', 'network'];
const CLAIM_LABELS = {fact: '', estimate: '估计', forecast: '预测', assumption: '假设', recommendation: '建议'};
const CLAIM_TEXT_FIELDS = ['statement', 'verification', 'period', 'population', 'unit', 'denominator', 'calculation', 'inference', 'limitation'];
const OPS = ['sum', 'subtract', 'multiply', 'divide', 'percent_change', 'share'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const norm = value => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
const stable = value => JSON.stringify(value, (_, item) => isObject(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
const contentHash = content => hash(content);
const copy = value => JSON.parse(JSON.stringify(value));
const bodySlides = doc => (Array.isArray(doc?.slides) ? doc.slides : []).filter(slide => CONTENT_ROLES.has(slide?.pageRole));
const metricId = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);

function metricEntries(slide) {
  const claims = Array.isArray(slide?.sourcePlan?.claims) ? slide.sourcePlan.claims : [];
  return claims.flatMap(claim => Array.isArray(claim?.metrics)
    ? claim.metrics.map(metric => ({metric, claimId: claim.id, claimKind: claim.kind})) : []);
}

function evaluateMetrics(slide) {
  const entries = metricEntries(slide), records = new Map(entries.map(entry => [entry.metric.id, entry]));
  const result = new Map(), identities = new Map(), visiting = new Set();
  function evaluate(id) {
    if (result.has(id)) return result.get(id);
    if (!records.has(id)) throw Error('metric 引用缺失：' + id);
    if (visiting.has(id)) throw Error('metric 计算循环：' + [...visiting, id].join(' → '));
    visiting.add(id);
    const {metric, claimKind} = records.get(id);
    const inputKinds = new Set();
    let value = metric.value;
    if (metric.formula) {
      const {op, args} = metric.formula, values = args.map(evaluate);
      args.forEach(arg => {
        const dependency = records.get(arg);
        if (dependency.claimKind !== 'fact') inputKinds.add(dependency.claimKind);
        identities.get(arg).forEach(kind => inputKinds.add(kind));
      });
      if (claimKind === 'fact' && inputKinds.size) throw Error('metric ' + id + ' 身份冲突：fact 不能由非事实指标推导');
      if (claimKind === 'estimate' && [...inputKinds].some(kind => kind !== 'estimate')) throw Error('metric ' + id + ' 身份冲突：estimate 不能由预测、假设或建议指标推导');
      if (['divide', 'share', 'percent_change'].includes(op) && values[1] === 0) throw Error('metric ' + id + ' 零除：分母为 0');
      if (op === 'percent_change' && values[1] < 0) throw Error('metric ' + id + ' percent_change 基数须为正数；负基数不能解释为常规增长率');
      if (op === 'sum') value = values.reduce((sum, item) => sum + item, 0);
      else if (op === 'subtract') value = values[0] - values[1];
      else if (op === 'multiply') value = values.reduce((product, item) => product * item, 1);
      else if (op === 'divide') value = values[0] / values[1];
      else if (op === 'percent_change') value = (values[0] / values[1] - 1) * 100;
      else if (op === 'share') value = values[0] / values[1] * 100;
      else throw Error('未知 metric 运算：' + op);
    }
    if (!Number.isFinite(value)) throw Error('metric ' + id + ' 结果不是有限数字');
    visiting.delete(id); result.set(id, value); identities.set(id, [...inputKinds].sort());
    return value;
  }
  entries.forEach(entry => evaluate(entry.metric.id));
  return entries.map(({metric, claimId, claimKind}) => {
    const value = result.get(metric.id);
    // 十进制显示采用半入舍入，避免 toFixed 把 0.725、2.175 显示为 0.72、2.17。
    // 只格式化显示；未舍入数值继续参与后续计算。
    let display = new Intl.NumberFormat('en-US', {useGrouping: false,
      minimumFractionDigits: metric.decimals, maximumFractionDigits: metric.decimals,
      roundingMode: 'halfExpand'}).format(value);
    if (Number(display) === 0) display = (0).toFixed(metric.decimals);
    const unit = norm(metric.unit), identity = CLAIM_LABELS[claimKind], inputKinds = identities.get(metric.id);
    const labels = [identity, ...inputKinds.filter(kind => kind !== claimKind).map(kind => '含' + CLAIM_LABELS[kind] + '输入')].filter(Boolean);
    const text = display + (['%', '％'].includes(unit) ? '' : ' ') + unit + (labels.length ? '（' + labels.join('；') + '）' : '');
    return {id: metric.id, claimId, kind: claimKind, unit, decimals: metric.decimals, value, text,
      ...(inputKinds.length ? {inputKinds} : {}),
      ...(metric.formula ? {formula: copy(metric.formula)} : {})};
  });
}

/* 只替换显式指标 token，不猜测自然语言里的数字。 */
function interpolateText(text, metrics) {
  const byId = new Map(metrics.map(metric => [metric.id, metric.text]));
  const resolved = norm(text).replace(/\{\{([\s\S]*?)\}\}/g, (_, token) => {
    const match = /^metric:([a-z][a-z0-9-]*)$/.exec(token);
    if (!match || !byId.has(match[1])) throw Error('未知内容 token：{{' + token + '}}；仅支持同页 {{metric:id}}');
    return byId.get(match[1]);
  });
  if (resolved.includes('{{') || resolved.includes('}}')) throw Error('内容 token 不完整：' + norm(text));
  return resolved;
}

function resolveText(slide, text) { return interpolateText(text, evaluateMetrics(slide)); }

/* 只验证 schema 2 的扩展；原有字段、ready 状态和页面语义由 deck_blueprint 校验。 */
function validate(doc) {
  if (doc?.schemaVersion !== 2) return [];
  const errors = [], sources = doc.sources;
  if (!isObject(sources)) errors.push('blueprint.sources 须为对象，来源键映射到 {label, locator}');
  else Object.entries(sources).forEach(([key, source]) => {
    if (!key.trim() || key !== key.trim()) errors.push('sources 的键须为非空、无首尾空白的标识');
    if (!isObject(source)) { errors.push('sources[' + key + '] 须为对象'); return; }
    for (const field of ['label', 'locator']) if (typeof source[field] !== 'string' || !norm(source[field])) errors.push('sources[' + key + '].' + field + ' 须为非空文本');
  });
  bodySlides(doc).forEach((slide, index) => {
    const at = '正文第 ' + (index + 1) + ' 页', plan = slide.sourcePlan;
    try {
      let required = slide.visual?.semanticType === 'waterfall';
      try { required ||= !!forms.get(formName(slide.visual?.form)).limits?.reconciles; } catch (_) { /* 原有形式校验负责 */ }
      if (required && slide.waterfall === undefined) errors.push(at + ' 瀑布表达须声明 slide.waterfall.input，由内核派生对账结果');
      if (slide.waterfall !== undefined) derivedWaterfall(slide);
    } catch (error) { errors.push(at + ' ' + error.message); }
    if (!isObject(plan)) { errors.push(at + ' 缺少 sourcePlan'); return; }
    const keys = plan.keys;
    if (!Array.isArray(keys)) errors.push(at + ' sourcePlan.keys 须为数组');
    else {
      if (new Set(keys).size !== keys.length) errors.push(at + ' sourcePlan.keys 来源键重复');
      keys.forEach(key => { if (typeof key !== 'string' || !isObject(sources) || !own(sources, key)) errors.push(at + ' 来源键未登记于 blueprint.sources：' + key); });
    }
    if (!Array.isArray(plan.claims) || !plan.claims.length) { errors.push(at + ' schema 2 正文须有非空 sourcePlan.claims'); return; }
    const ids = new Set(); let metricsValid = true;
    plan.claims.forEach((claim, ci) => {
      const where = at + ' claims[' + ci + ']';
      if (!isObject(claim)) { errors.push(where + ' 须为对象'); return; }
      if (!Array.isArray(claim.sourceKeys)) errors.push(where + '.sourceKeys 须为数组');
      else {
        if (new Set(claim.sourceKeys).size !== claim.sourceKeys.length) errors.push(where + '.sourceKeys 来源键重复');
        claim.sourceKeys.forEach(key => {
          if (typeof key !== 'string' || !isObject(sources) || !own(sources, key)) errors.push(where + ' 来源键未登记于 blueprint.sources：' + key);
          if (!Array.isArray(keys) || !keys.includes(key)) errors.push(where + ' 来源键未登记于 sourcePlan.keys：' + key);
        });
      }
      if (claim.metrics === undefined) return;
      if (!Array.isArray(claim.metrics)) { errors.push(where + '.metrics 须为数组'); metricsValid = false; return; }
      claim.metrics.forEach((metric, mi) => {
        const loc = where + '.metrics[' + mi + ']';
        const bad = message => { errors.push(loc + ' ' + message); metricsValid = false; };
        if (!isObject(metric)) { bad('须为对象'); return; }
        if (!metricId(metric.id) || ids.has(metric.id)) bad('id 须为同页唯一的小写 kebab-case');
        ids.add(metric.id);
        if (typeof metric.unit !== 'string' || !norm(metric.unit)) bad('unit 须为非空文本');
        if (!Number.isInteger(metric.decimals) || metric.decimals < 0 || metric.decimals > 6) bad('decimals 须为 0–6 的整数');
        if (own(metric, 'value') === own(metric, 'formula')) bad('value 与 formula 必须二选一');
        if (own(metric, 'value') && (typeof metric.value !== 'number' || !Number.isFinite(metric.value))) bad('value 须为有限数字');
        if (own(metric, 'formula')) {
          const formula = metric.formula;
          if (!isObject(formula)) { bad('formula 须为 {op, args} 对象'); return; }
          if (!OPS.includes(formula.op)) bad('formula.op 须为 ' + OPS.join('/'));
          if (!Array.isArray(formula.args) || !formula.args.length || formula.args.some(id => !metricId(id))) bad('formula.args 须为非空的同页 metric id 数组');
          else if (!['sum', 'multiply'].includes(formula.op) && formula.args.length !== 2) bad('formula.' + formula.op + ' 需要两个参数');
        }
      });
    });
    if (metricsValid) {
      try {
        const metrics = evaluateMetrics(slide);
        [slide.title, slide.proves, ...plan.claims.flatMap(claim => CLAIM_TEXT_FIELDS.map(key => claim?.[key]))]
          .forEach(text => interpolateText(text, metrics));
      } catch (error) { errors.push(at + ' ' + error.message); }
    }
    const form = slide.visual?.form;
    if (['custom', 'svg.custom'].includes(form) && !SEMANTIC_TYPES.includes(slide.visual?.semanticType)) errors.push(at + ' svg.custom 须声明 visual.semanticType：' + SEMANTIC_TYPES.join('/'));
    if (slide.visual?.semanticType !== undefined && !SEMANTIC_TYPES.includes(slide.visual.semanticType)) errors.push(at + ' visual.semanticType 无效');
  });
  return [...new Set(errors)];
}

function limitationText(claim) {
  const labels = {period: '期间', population: '范围', unit: '单位', denominator: '分母'};
  const parts = Object.entries(labels).filter(([key]) => norm(claim[key]) && !/^不适用(?:[：:，,。；;\s]|$)/.test(norm(claim[key])))
    .map(([key, label]) => label + '：' + norm(claim[key]));
  parts.push('限制：' + norm(claim.limitation));
  return parts.join('；');
}

function buildContent(slide, sources) {
  const metrics = evaluateMetrics(slide);
  const claims = slide.sourcePlan.claims.map(claim => {
    const normalized = {id: claim.id, kind: claim.kind, sourceKeys: [...claim.sourceKeys]};
    CLAIM_TEXT_FIELDS.forEach(key => { normalized[key] = interpolateText(claim[key], metrics); });
    normalized.limitationText = limitationText(normalized);
    return normalized;
  });
  return {title: interpolateText(slide.title, metrics), claims, metrics,
    ...(slide.waterfall ? {waterfallInput: copy(slide.waterfall.input)} : {}),
    sources: slide.sourcePlan.keys.map(key => {
      const source = sources[key], label = norm(source.label), locator = norm(source.locator);
      return {key, label, locator, text: label + ' · ' + locator};
    })};
}

function derivedWaterfall(slide) {
  const declared = slide.waterfall;
  if (!isObject(declared) || !isObject(declared.input)) throw Error('waterfall 须有 input:{items或records,config,options?}');
  for (const key of Object.keys(declared)) if (!['input', 'residualReason'].includes(key)) throw Error('waterfall.' + key + ' 由内核派生，不能手填');
  const input = declared.input;
  if (Array.isArray(input.items) === Array.isArray(input.records)) throw Error('waterfall.input 的 items 与 records 必须二选一');
  if (!isObject(input.config)) throw Error('waterfall.input.config 须为对象');
  const report = waterfall.diagnoseSpec(input);
  if (report.status !== 'ready') throw Error('waterfall.input 未通过体检：' + waterfall.describeBlocked(report));
  const chart = report.chart;
  const block = {status: 'verified', reconciliation: chart.reconciliation, tolerance: chart.tolerance,
    nodes: chart.bars.length, residual: chart.residual, input: copy(input),
    ...(declared.residualReason !== undefined ? {residualReason: norm(declared.residualReason)} : {})};
  const errors = waterfall.blockErrors({waterfall: block}, slide.id || '本页');
  if (errors.length) throw Error(errors.join('；'));
  return block;
}

const formName = value => value === 'custom' ? 'svg.custom' : value;
function compileRegions(slide, ratio) {
  const visual = slide.visual, ref = visual.layout, primaryForm = formName(visual.form);
  if (ref === 'custom') {
    if (!Array.isArray(visual.regions)) throw Error(slide.id + ' custom 布局须声明 visual.regions');
    return visual.regions.map(region => {
      const result = {...copy(region), form: formName(region.form)};
      if (result.role === 'primary') {
        if (result.form !== primaryForm) throw Error(slide.id + ' 主区 form 与 visual.form 不一致');
        result.visual = norm(visual.primary);
        if (visual.sizing !== undefined) result.sizing = copy(visual.sizing);
      }
      return result;
    });
  }
  const layout = layouts.get(ref), authored = visual.regions;
  if (authored !== undefined && (!Array.isArray(authored) || authored.length !== layout.modules.length)) throw Error(slide.id + ' visual.regions 须逐项对应布局 ' + ref + ' 的 ' + layout.modules.length + ' 个模块');
  const resolved = layouts.resolveModules({layout: ref, regions: authored || []}, ratio);
  return resolved.map((module, index) => {
    const input = authored?.[index] || {}, catalogModule = layout.modules[index];
    if (!isObject(input)) throw Error(slide.id + ' visual.regions[' + index + '] 须为对象');
    if (['c', 'r', 'w', 'h'].some(key => input[key] !== undefined)) throw Error(slide.id + ' 目录 regions 不手写 c/r/w/h');
    if (input.slot !== undefined && input.slot !== module.slot) throw Error(slide.id + ' region.slot 与目录不一致');
    if (input.role !== undefined && input.role !== module.role) throw Error(slide.id + ' region.role 与目录不一致');
    let form = formName(input.form);
    if (module.primary) {
      if (form && form !== primaryForm) throw Error(slide.id + ' 主区 form 与 visual.form 不一致');
      form = primaryForm;
    } else if (!form) {
      const permitsText = layouts.acceptsToken(module.slot, 'html.text')
        && (!catalogModule.accepts?.length || layouts.formInAccepts('html.text', catalogModule.accepts));
      if (!permitsText) throw Error(slide.id + ' 第 ' + (index + 1) + ' 个模块需要明确形式，请声明 visual.regions；不能猜测图表');
      form = 'html.text';
    }
    const region = {...copy(input), slot: module.slot, role: module.role, form};
    if (module.primary) {
      region.visual = norm(visual.primary);
      if (visual.sizing !== undefined) region.sizing = copy(visual.sizing);
    }
    return region;
  });
}

function compile(doc, options = {}) {
  if (doc?.schemaVersion === 3) return require('./analysis_contract.cjs').compile(doc, options);
  if (doc?.schemaVersion !== 2) throw Error('内容编译只接受 blueprint.schemaVersion 2；历史蓝图使用原流程');
  const errors = validate(doc);
  if (errors.length) throw Error('内容合同无效：' + errors.join('；'));
  const ratio = doc.deck?.ratio || '16x9';
  const pages = bodySlides(doc).map((slide, index) => {
    if (!isObject(slide.visual)) throw Error(slide.id + ' 缺少 visual');
    const content = buildContent(slide, doc.sources), visual = slide.visual;
    const page = {page: index + 1, id: slide.id, title: content.title, proves: interpolateText(slide.proves, content.metrics),
      form: formName(visual.form), visual: norm(visual.primary), layout: visual.layout,
      regions: compileRegions(slide, ratio), density: copy(slide.density), content, contentHash: contentHash(content)};
    if (visual.semanticType !== undefined) page.semanticType = visual.semanticType;
    if (visual.selection !== undefined) page.selection = copy(visual.selection);
    if (visual.capacity !== undefined) page.capacity = copy(visual.capacity);
    if (visual.sizing !== undefined) page.sizing = copy(visual.sizing);
    if (slide.waterfall !== undefined) page.waterfall = derivedWaterfall(slide);
    for (const key of ['annotations', 'repetitionReason', 'layoutReason']) if (visual[key] !== undefined) page[key] = copy(visual[key]);
    const layoutErrors = page.layout === 'custom' ? layouts.customPageErrors(page, slide.id, ratio) : layouts.pageErrors(page, slide.id, ratio);
    if (layoutErrors.length) throw Error('派生布局无效：' + layoutErrors.join('；'));
    forms.get(page.form);
    return page;
  });
  if (!pages.length) throw Error('内容编译至少需要一页正文');
  return {version: 4, ratio, blueprintSha256: hash(doc), pages};
}

function bindings(page) {
  const content = page?.content;
  if (!isObject(content)) throw Error('页面缺少编译后的 content');
  const result = {title: content.title};
  for (const claim of content.claims || []) {
    if (!own(CLAIM_LABELS, claim.kind)) throw Error('未知 claim.kind：' + claim.kind);
    const label = CLAIM_LABELS[claim.kind];
    result['claim:' + claim.id] = (label ? label + '：' : '') + claim.statement;
    result['limitation:' + claim.id] = claim.limitationText;
  }
  for (const metric of content.metrics || []) result['metric:' + metric.id] = metric.text;
  for (const source of content.sources || []) result['source:' + source.key] = source.text;
  return result;
}

function bindingKeys(value) {
  const raw = isObject(value) ? (value.keys === undefined ? value.key : value.keys) : value;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    const keys = JSON.parse(raw);
    if (!Array.isArray(keys)) throw Error('分组绑定须为键数组');
    return keys;
  }
  return [raw];
}

function bindingText(page, keyOrKeys) {
  const map = bindings(page), keys = bindingKeys(keyOrKeys);
  if (!keys.length || keys.some(key => typeof key !== 'string' || !own(map, key))) throw Error('未知内容绑定：' + stable(keys));
  if (new Set(keys).size !== keys.length) throw Error('分组绑定键重复');
  if (keys.length > 1 && keys.some(key => !key.startsWith('source:'))) throw Error('只有 source 绑定可合并到同一节点');
  return keys.map(key => map[key]).join('；');
}

function verifyBindings(page, facts) {
  const errors = [], seen = new Set();
  let map;
  try {
    map = bindings(page);
    if (page.contentHash !== contentHash(page.content)) errors.push('contentHash 与实际 content 不一致');
    if (norm(page.title) !== norm(page.content.title)) errors.push('page.title 与 content.title 不一致');
  } catch (error) { return [error.message]; }
  if (!Array.isArray(facts)) return [...errors, '缺少浏览器可见绑定数组'];
  facts.forEach((fact, index) => {
    const at = '绑定[' + index + ']';
    if (!isObject(fact)) { errors.push(at + ' 须为对象'); return; }
    try {
      const keys = bindingKeys(fact), expected = bindingText(page, keys);
      if (fact.visible !== true) errors.push(at + ' 内容不可见：' + keys.join('/'));
      if (typeof fact.text !== 'string' || norm(fact.text) !== norm(expected)) errors.push(at + ' 文本偏离内容真源：' + keys.join('/') + '；应为「' + expected + '」');
      if (fact.visible === true && typeof fact.text === 'string' && norm(fact.text) === norm(expected)) keys.forEach(key => seen.add(key));
    } catch (error) { errors.push(at + ' ' + error.message); }
  });
  for (const key of Object.keys(map)) if (!seen.has(key)) errors.push('missing：缺少真实可见且一致的内容绑定 ' + key);
  return errors;
}

function verify(slideFacts, page) {
  const errors = verifyBindings(page, slideFacts?.bindings);
  if (norm(slideFacts?.title) !== norm(page?.content?.title)) errors.push('实际 .slide__title 与内容标题不一致');
  return errors;
}

const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function html(page, keyOrKeys, options = {}) {
  const tag = options.tag || 'span';
  if (!['span', 'p', 'div', 'strong', 'em', 'small', 'h1', 'h2', 'h3', 'li', 'td', 'th', 'text', 'tspan'].includes(tag)) throw Error('不支持的绑定标签：' + tag);
  const keys = bindingKeys(keyOrKeys), text = bindingText(page, keys);
  const key = keys.length === 1 ? keys[0] : JSON.stringify(keys);
  return '<' + tag + ' data-content-key="' + escapeHtml(key) + '"'
    + (options.className ? ' class="' + escapeHtml(options.className) + '"' : '')
    + '>' + escapeHtml(text) + '</' + tag + '>';
}

function snippets(page) {
  return '<!-- 正文 ' + page.page + '：示例绑定，不是完整页面；按阅读路径放入实际模块。 -->\n'
    + Object.keys(bindings(page)).map(key => html(page, key, key === 'title' ? {tag: 'h1', className: 'slide__title'} : {})).join('\n');
}

module.exports = {CONTENT_ROLES, SEMANTIC_TYPES, CLAIM_LABELS, OPS, norm, stable, hash, contentHash,
  validate, compile, evaluateMetrics, interpolateText, resolveText, bindings, bindingKeys, bindingText, verifyBindings, verify, html, snippets};
