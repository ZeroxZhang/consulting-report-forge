/* 瀑布图数据内核：体检 → 推导 → 闭合校验 → 预格式化文本。
   三条不可协商的纪律：缺失不等于零；不自动平账；不把对不上的差额藏进取整里。
   加、减与闭合判定走精确十进制（BigInt 有效数字 + 指数，无固定缩放，故大数不溢出）；
   只有展示性的除法（占比、增长率、加权费率）取浮点——那里的精度由除法本身决定，不是这里省掉的。
   对外输出一律数值或字符串，绝不外泄 BigInt：内核结果会被 JSON.stringify 进 spec 与 audit。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WaterfallBridge = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* ---------- 精确十进制 ---------- */

  function BridgeError(message) { const error = new Error(message); error.name = 'BridgeError'; return error; }
  const ZERO = Object.freeze({ s: 0, d: 0n, e: 0 });
  const pow10 = n => 10n ** BigInt(n);
  const isDec = v => !!v && typeof v === 'object' && typeof v.d === 'bigint';

  /* {s:-1|0|1, d:BigInt>=0, e:整数} 表示 s × d × 10^e；d 无末尾零，d=0 时整个为零。 */
  function normalize(sign, digits, exp) {
    if (digits === 0n) return ZERO;
    /* 异号相减且被减数更小时，digits 会是负的。符号必须由 digits 自己决定并把它取回正数：
       否则 d 带着负号进入表示，decimalToText 把 String(-2n) 当正数拼，产出 '--2'、'-0.00000-2'
       这种既不可读也不可解析的文本——而 residual / reconciliation 的文本正是下游逐字比对的对象，
       畸形值会让声明门禁无论怎么写都对不上，把这一页锁死。 */
    const negative = digits < 0n;
    let d = negative ? -digits : digits, e = exp;
    while (d % 10n === 0n) { d /= 10n; e += 1; }
    return { s: (negative ? -sign : sign) < 0 ? -1 : 1, d, e };
  }
  const scaleBy = (x, places) => normalize(x.s, x.d, x.e + places);

  const DECIMAL_TEXT = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;
  /* 只接受明确写出的十进制文本；不猜单位、不估算，因此“约 1.2 万”会被拒绝。 */
  function decimalFromText(text) {
    const match = DECIMAL_TEXT.exec(text);
    if (!match || (!match[2] && !match[3])) throw BridgeError('不是明确数值，不自动猜测单位或估算值');
    const frac = match[3] || '';
    const digits = BigInt((match[2] || '') + frac || '0');
    const out = normalize(match[1] === '-' ? -1 : 1, digits, (match[4] ? parseInt(match[4], 10) : 0) - frac.length);
    if (out.s !== 0) {
      const magnitude = out.e + String(out.d).length - 1;
      if (magnitude > 24 || magnitude < -20) throw BridgeError('数值超出稳定展示范围，请先明确单位缩放');
    }
    return out;
  }
  function decimalToText(x) {
    if (x.s === 0) return '0';
    const digits = String(x.d), sign = x.s < 0 ? '-' : '';
    if (x.e >= 0) return sign + digits + '0'.repeat(x.e);
    const point = digits.length + x.e;
    if (point > 0) return sign + digits.slice(0, point) + '.' + digits.slice(point);
    return sign + '0.' + '0'.repeat(-point) + digits;
  }
  /* 只给展示性除法与几何用；闭合判定绝不经过它。 */
  const decimalToNumber = x => (isDec(x) ? (x.s === 0 ? 0 : x.s * Number(String(x.d) + 'e' + x.e)) : x);

  function align(a, b) {
    if (a.s === 0 || b.s === 0 || a.e === b.e) return [a, b];
    if (a.e > b.e) return [{ s: a.s, d: a.d * pow10(a.e - b.e), e: b.e }, b];
    return [a, { s: b.s, d: b.d * pow10(b.e - a.e), e: a.e }];
  }
  function add(a, b) {
    if (a.s === 0) return b;
    if (b.s === 0) return a;
    const [x, y] = align(a, b);
    return normalize(x.s, x.s === y.s ? x.d + y.d : x.d - y.d, x.e);
  }
  const neg = a => (a.s === 0 ? a : { s: -a.s, d: a.d, e: a.e });
  const sub = (a, b) => add(a, neg(b));
  const abs = a => (a.s < 0 ? neg(a) : a);
  const isZero = a => a.s === 0;
  const mul = (a, b) => (a.s === 0 || b.s === 0 ? ZERO : normalize(a.s * b.s, a.d * b.d, a.e + b.e));
  const sumOf = list => list.reduce((acc, x) => add(acc, x), ZERO);

  /* 非 rate 模式全程走十进制；rate 模式的加权量本就是除法结果，用数值即可。 */
  const vAdd = (a, b) => (isDec(a) && isDec(b) ? add(a, b) : decimalToNumber(a) + decimalToNumber(b));
  const vSub = (a, b) => (isDec(a) && isDec(b) ? sub(a, b) : decimalToNumber(a) - decimalToNumber(b));
  const vText = v => (isDec(v) ? decimalToText(v) : String(v));
  /* |a−b| > tolerance */
  const beyond = (a, b, tolerance) => Math.abs(decimalToNumber(vSub(a, b))) > decimalToNumber(tolerance);

  /* ---------- 数值解析 ---------- */

  const NULLS = new Set(['', '--', '—', 'null', 'none', 'nan', 'n/a', '待补', '未知']);
  const THOUSANDS = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;

  /* 缺失一律返回 null——它不等于零，也不等于可以跳过。 */
  function number(value, metricType, scale) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') throw BridgeError('布尔值不是指标数值');
    if (typeof value === 'number' && !Number.isFinite(value)) throw BridgeError('不允许 Infinity/NaN');
    if (typeof value !== 'number' && NULLS.has(String(value).trim().toLowerCase())) return null;
    let text = String(value).trim().replace(/−/g, '-').replace(/，/g, ',');
    if (text.startsWith('(') && text.endsWith(')')) text = '-' + text.slice(1, -1);
    const percent = text.endsWith('%') || text.endsWith('％');
    if (percent) {
      if (metricType !== 'rate') throw BridgeError('百分比文本需要 metric_type=rate；不能当作金额');
      text = text.slice(0, -1);
    }
    if (text.includes(',')) {
      if (!THOUSANDS.test(text)) throw BridgeError('千分位格式不明确');
      text = text.replace(/,/g, '');
    }
    const out = decimalFromText(text);
    if (metricType === 'rate') {
      if (percent || scale === 'percent') return scaleBy(out, -2);
      if (scale !== 'fraction') throw BridgeError('比例数值必须明确 rate_scale=fraction 或 percent');
    }
    return out;
  }

  /* ---------- 展示格式化 ---------- */

  /* 选定的精度下也绝不把一个非零值印成 0——那等于替读者做了减法。 */
  function decimalsFor(chart) {
    const config = chart.config || {};
    if (config.decimals !== undefined) return config.decimals;
    if (chart.metric_type === 'rate') return 1;
    const divisor = chart.display_divisor || 1;
    const values = (chart.bars || []).filter(b => b.value !== null && decimalToNumber(b.value) !== 0)
      .map(b => Math.abs(decimalToNumber(b.value) / divisor));
    if (!values.length || values.every(v => Math.abs(v - Math.round(v)) < 1e-9)) return 0;
    return Math.min(4, Math.max(1, 1 - Math.floor(Math.log10(Math.min(...values)))));
  }

  function groupFixed(v, decimals, signed) {
    const fixed = Math.abs(v).toFixed(decimals), dot = fixed.indexOf('.');
    const int = dot < 0 ? fixed : fixed.slice(0, dot), frac = dot < 0 ? '' : fixed.slice(dot);
    /* 零没有方向：给 0 印 + 号等于把"没有变化"说成一个方向。 */
    const sign = v < 0 || Object.is(v, -0) ? '-' : (signed && v > 0 ? '+' : '');
    return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + frac;
  }

  function formatValue(value, chart, delta) {
    if (value === null || value === undefined) return '—';
    const decimals = decimalsFor(chart), divisor = chart.display_divisor || 1;
    const v = chart.metric_type === 'rate' ? decimalToNumber(value) * 100 : decimalToNumber(value) / divisor;
    const threshold = 0.5 * 10 ** -decimals;
    let text;
    if (v !== 0 && Math.abs(v) < threshold) {
      text = (v < 0 ? '−' : delta ? '+' : '') + '<' + threshold.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
    } else text = groupFixed(v, decimals, !!delta);
    if (chart.metric_type === 'rate') text += delta ? ' pp' : '%';
    return text.replace(/-/g, '−');
  }

  const percentText = value => (value === null || value === undefined ? '—' : groupFixed(value * 100, 1, true) + '%');
  const growthText = value => (value === null || value === undefined ? '—' : groupFixed(value * 100, 1, true) + '%');

  /* CJK 约 1em、拉丁约 0.55em；按此折算而非按字符数，中文标签才不会被截。 */
  function labelLines(text, limit) {
    const out = [];
    for (const word of String(text).split('\n')) {
      let part = '', size = 0;
      for (const ch of word) {
        const cost = ch.codePointAt(0) > 255 ? 1 : 0.55;
        if (size + cost > limit) { out.push(part); part = ''; size = 0; }
        part += ch; size += cost;
      }
      out.push(part);
    }
    return out;
  }

  /* ---------- 诊断 ---------- */

  const ALIASES = {
    label: ['label', 'category', 'dimension', 'name', '维度名称', '维度', '分类', '项目', '产品', '区域', '名称'],
    previous: ['previous', 'prev', 'baseline', '去年同期值', '上期值', '前期值', '基期值', '预算值'],
    current: ['current', 'curr', 'actual', '当前值', '本期值', '实际值'],
    delta: ['delta', 'change', 'impact', '差异值', '变化值', '同比差值', '环比差值', '增量', '贡献值'],
    type: ['type', 'kind', '类型', '节点类型'],
    value: ['value', '数值', '值'],
    previous_denominator: ['previous_denominator', '上期分母', '基期分母'],
    current_denominator: ['current_denominator', '本期分母']
  };
  const TYPES = {
    start: 'start', '起点': 'start', delta: 'delta', '增量': 'delta', '变化': 'delta',
    subtotal: 'subtotal', '小计': 'subtotal', end: 'end', '终点': 'end'
  };
  const SUMMARY_LABELS = new Set(['总计', '合计', '小计', 'total', 'subtotal']);
  const ALLOWED_CONFIG = new Set(['mode', 'mapping', 'metric', 'metric_type', 'unit', 'rate_scale', 'additive',
    'source', 'period_previous', 'period_current', 'as_of', 'title', 'subtitle', 'order', 'residual', 'tolerance',
    'end_label', 'supplement_source', 'endpoint_style', 'decimals', 'display_divisor', 'filters']);
  const OPTIONS = { order: ['input', 'absolute_desc'], residual: ['block', 'explicit'], endpoint_style: ['solid', 'stacked'] };
  const TEXT_KEYS = ['metric', 'unit', 'source', 'period_previous', 'period_current', 'as_of', 'title', 'subtitle', 'supplement_source', 'end_label', 'filters'];
  /* 这些一旦成立，后面的取数已经没有意义，直接返回，不产生噪声。 */
  const FATAL = new Set(['invalid_text', 'unsupported_mode', 'invalid_mapping', 'mapping_not_found', 'unknown_mapping',
    'ambiguous_mapping', 'duplicate_mapping', 'missing_label', 'metric_type', 'rate_scale', 'tolerance', 'decimals', 'display_divisor']);

  /* forge 原生 items 的节点类型翻译：首个 total 是起点，末个 total 是终点，中间无从判断故拒绝。 */
  function itemsToRecords(items) {
    return items.map((item, index) => {
      const type = item.type === 'total'
        ? (index === 0 ? 'start' : index === items.length - 1 ? 'end' : '')
        : item.type;
      if (!type) {
        if (item.type === 'total') throw BridgeError('第 ' + (index + 1) + ' 个节点是中间的 total：无法判断它是起点还是终点，请改用 start/end 或 subtotal');
        throw BridgeError('第 ' + (index + 1) + ' 个节点没有 type：每个节点都要写明 start/delta/subtotal/end，不猜也不默认');
      }
      return { label: item.label, type, value: item.value };
    });
  }

  function diagnose(payload, options) {
    const opts = options || {};
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw BridgeError('顶层必须是包含 records 与 config 的对象');
    const native = Array.isArray(payload.items) && !Array.isArray(payload.records);
    if (native) {
      if (!payload.items.length) throw BridgeError('items 不可为空');
      const config = Object.assign({}, payload.config);
      /* items 是“作者已经算好、只求体检与格式”的入口，默认 number（金额与数量同一种格式，
         差别只在语义标注）。这不是从数值大小推断类型——比例语义仍必须显式声明 rate + rate_scale。
         内核会把生效值回显在 chart.metric_type 上，作者看得见被假定了什么。 */
      if (config.metric_type === undefined) config.metric_type = 'number';
      payload = { records: itemsToRecords(payload.items), config };
    }
    /* 溯源字段（来源、单位、期间、可加总）是“从原始记录分析”时的阻断项；
       对已有 items 的体检，出处由报告正文与 pages.json 承担，此处不再重复追问。 */
    const provenance = opts.provenance === undefined ? !native : !!opts.provenance;

    const records = payload.records, cfg = payload.config || {};
    if (typeof cfg !== 'object' || Array.isArray(cfg)) throw BridgeError('config 必须是对象');
    const report = { status: 'blocked', mode: null, metric_type: null, mapping: {}, issues: [], derived: [], warnings: [], requests: [], chart: null };
    const issue = (code, message, fields, owner) => report.issues.push({ code, message, fields: fields || [], owner: owner || 'user' });

    /* 只汇总出可执行的补数请求，不为每个空格子单独发问。 */
    const finish = () => {
      const grouped = new Map();
      for (const item of report.issues) {
        let owner = item.owner;
        if (owner === 'data' && cfg.supplement_source) owner = 'agent';
        const key = item.code + '|' + owner;
        if (!grouped.has(key)) grouped.set(key, {
          owner, code: item.code, need: [], source: owner === 'agent' ? cfg.supplement_source : null,
          constraints: '同指标、同单位、同粒度、同期间、同筛选；保留出处，返回后重新校验'
        });
        grouped.get(key).need.push(item.message);
      }
      report.requests = [...grouped.values()];
      report.status = report.issues.length ? 'blocked' : 'ready';
      return report;
    };

    if (!Array.isArray(records) || !records.length || !records.every(r => r && typeof r === 'object' && !Array.isArray(r))) {
      issue('missing_records', '缺少可读取的明细，请提供文件、链接或粘贴数据。', [], 'data');
      return finish();
    }
    if (records.length > 10000) { issue('too_many_rows', '原始记录超过 10000 行，先明确聚合粒度并汇总，不逐行绘图。'); return finish(); }
    const cols = [...new Set(records.flatMap(row => Object.keys(row)))];
    if (!cols.every(c => typeof c === 'string')) { issue('invalid_columns', '字段名称必须为字符串。'); return finish(); }

    const given = cfg.mapping || {};
    if (typeof given !== 'object' || Array.isArray(given)) { issue('invalid_mapping', 'mapping 必须是角色到列名的对象。'); return finish(); }
    const unknownRoles = Object.keys(given).filter(k => !ALIASES[k]);
    if (unknownRoles.length) issue('unknown_mapping', '不支持的字段角色：' + unknownRoles.sort().join(', '));
    for (const [role, aliases] of Object.entries(ALIASES)) {
      if (role in given) {
        if (!cols.includes(given[role])) issue('mapping_not_found', role + ' 指向的列不存在：' + given[role]);
        else report.mapping[role] = given[role];
        continue;
      }
      const matches = cols.filter(c => aliases.includes(c.trim().toLowerCase()));
      if (matches.length === 1) report.mapping[role] = matches[0];
      else if (matches.length > 1) issue('ambiguous_mapping', role + ' 有多个候选列：' + matches.join('、') + '；请明确映射。');
    }
    const mapping = report.mapping;
    if (new Set(Object.values(mapping)).size !== Object.keys(mapping).length) issue('duplicate_mapping', '同一列不能承担多个字段角色。');

    let mode = cfg.mode || 'auto';
    if (mode === 'auto') mode = 'type' in mapping && 'value' in mapping ? 'bridge' : 'period';
    if (!['period', 'bridge'].includes(mode)) issue('unsupported_mode', '仅支持 period（两期分类对比）或 bridge（起点与有序增减）。');
    const metricType = cfg.metric_type;
    if (!['number', 'currency', 'rate'].includes(metricType)) issue('metric_type', '请确认指标类型：number、currency 或 rate；不根据数值大小推断。');
    if (provenance && (!cfg.metric || !cfg.unit)) issue('metric_unit', '请明确指标名称与统一单位（如收入、万元）。');
    if (provenance && !cfg.source) issue('source', '请注明数据来源；模拟数据也必须明确标注。');
    if (mode === 'period') {
      if (provenance && (!cfg.period_previous || !cfg.period_current)) issue('period', '请明确基期和本期名称/范围；不默认同比或截止昨天。');
      if (provenance && cfg.additive !== true && metricType !== 'rate') issue('additivity', '请确认分类互斥、范围完整且指标可以加总（additive=true）；平均值/去重人数不可直接相加。');
    }
    if (cfg.rate_scale !== undefined && cfg.rate_scale !== null && !['fraction', 'percent'].includes(cfg.rate_scale)) issue('rate_scale', 'rate_scale 仅接受 fraction 或 percent。');
    if (metricType !== 'rate' && cfg.rate_scale !== undefined && cfg.rate_scale !== null) issue('rate_scale', '非比例指标不接受 rate_scale，不能接收后忽略。');
    for (const key of TEXT_KEYS) if (cfg[key] !== undefined && cfg[key] !== null && typeof cfg[key] !== 'string') issue('invalid_text', key + ' 必须是文本。');
    const unsupported = Object.keys(cfg).filter(k => !ALLOWED_CONFIG.has(k));
    if (unsupported.length) issue('unsupported_config', '未支持的配置不能静默忽略：' + unsupported.sort().join(', '));
    for (const [key, values] of Object.entries(OPTIONS)) if (cfg[key] !== undefined && !values.includes(cfg[key])) issue('invalid_option', key + ' 仅支持 ' + values.join('/'));

    let tolerance = decimalFromText('0.000001');
    try {
      const parsed = cfg.tolerance === undefined ? decimalFromText('0.000001') : number(cfg.tolerance);
      if (parsed === null || parsed.s <= 0 || decimalToNumber(parsed) > 0.01) throw BridgeError('tolerance 需大于 0 且不超过 0.01，并使用原始输入量纲；容差为 0 等于要求位精确，近零净变化会把占比算成天文数字');
      tolerance = parsed;
    } catch (error) { issue('tolerance', error.message); }
    /* 比例以 percent 表述时，容差与数值同量纲地缩到百分之一。 */
    if (metricType === 'rate' && cfg.rate_scale === 'percent') tolerance = scaleBy(tolerance, -2);
    if (cfg.decimals !== undefined && (!Number.isInteger(cfg.decimals) || cfg.decimals < 0 || cfg.decimals > 4)) issue('decimals', 'decimals 需为 0–4 的整数。');
    let divisor = 1;
    try {
      const parsed = cfg.display_divisor === undefined ? 1 : decimalToNumber(number(cfg.display_divisor));
      if (!(parsed > 0) || (metricType === 'rate' && parsed !== 1)) throw BridgeError('display_divisor 必须为正数；比例指标仅支持 1');
      divisor = parsed;
    } catch (error) { issue('display_divisor', error.message); }
    if (!('label' in mapping)) issue('missing_label', '无法识别分类/节点名称，请确认 label 映射。');
    if (mode === 'period' && cfg.residual !== undefined && cfg.residual !== 'block') issue('invalid_option', 'period 不接受 residual=explicit；分类差值不一致必须澄清。');
    if (report.issues.some(it => FATAL.has(it.code))) return finish();

    const get = (row, role, index) => {
      if (!(role in mapping)) return null;
      try {
        /* 分母是计数而不是百分比，因此不按 metric_type 解析。 */
        return number(row[mapping[role]], role.includes('denominator') ? 'number' : metricType, cfg.rate_scale);
      } catch (error) {
        issue('invalid_number', '第 ' + (index + 1) + ' 行 ' + mapping[role] + '：' + error.message, [mapping[role]]);
        return null;
      }
    };

    const rows = [], seen = new Set();
    records.forEach((row, index) => {
      const cell = row[mapping.label];
      const label = String(cell === undefined || cell === null ? '' : cell).trim();
      if (!label) issue('empty_label', '第 ' + (index + 1) + ' 行分类/节点名称为空。');
      if (mode === 'period' && seen.has(label)) issue('duplicate_category', '分类 ' + label + ' 重复；需确认聚合粒度，不能擅自求和。');
      if (mode === 'period' && SUMMARY_LABELS.has(label.toLowerCase())) issue('summary_row', '检测到汇总行 ' + label + '；请明确明细范围，避免重复计算。');
      seen.add(label);
      rows.push({ index, row, label });
    });

    const bars = [], detail = [];
    let start, end;

    if (mode === 'period') {
      if (metricType === 'rate' && !['previous_denominator', 'current_denominator'].every(x => x in mapping)) {
        issue('rate_denominator', '比例指标不能跨分类求和。请补充两期各分类分母/权重，或提供经确认的整体起点、终点和 pp 贡献桥。', [], 'data');
        return finish();
      }
      for (const { index, row, label } of rows) {
        let [prev, curr, delta] = ['previous', 'current', 'delta'].map(role => get(row, role, index));
        if ([prev, curr, delta].filter(v => v !== null).length < 2) {
          issue('missing_values', '分类 ' + label + ' 的基期、本期、增量至少需要两项；缺失不按零计算。', [], 'data');
          continue;
        }
        if (prev === null) { prev = sub(curr, delta); report.derived.push(label + ' 基期=本期−增量'); }
        if (curr === null) { curr = add(prev, delta); report.derived.push(label + ' 本期=基期+增量'); }
        if (delta === null) { delta = sub(curr, prev); report.derived.push(label + ' 增量=本期−基期'); }
        if (beyond(curr, add(prev, delta), tolerance)) issue('inconsistent_delta', '分类 ' + label + ' 的增量与本期−基期不一致。');
        const item = { label, previous: prev, current: curr, delta, growth: null, row: index + 1 };
        if (metricType === 'rate') {
          const pden = get(row, 'previous_denominator', index), cden = get(row, 'current_denominator', index);
          if (pden === null || cden === null || pden.s <= 0 || cden.s <= 0) issue('invalid_denominator', '分类 ' + label + ' 两期分母必须为正数；不能补零。', [], 'data');
          item.previous_denominator = pden; item.current_denominator = cden;
        } else if (prev.s > 0) item.growth = decimalToNumber(delta) / decimalToNumber(prev);
        else report.warnings.push(label + ' 基期非正，不计算通常意义增长率。');
        detail.push(item);
      }
      if (report.issues.length) return finish();
      if (metricType === 'rate') {
        const ps = decimalToNumber(sumOf(detail.map(x => x.previous_denominator)));
        const cs = decimalToNumber(sumOf(detail.map(x => x.current_denominator)));
        start = detail.reduce((acc, x) => acc + decimalToNumber(x.previous) * decimalToNumber(x.previous_denominator), 0) / ps;
        end = detail.reduce((acc, x) => acc + decimalToNumber(x.current) * decimalToNumber(x.current_denominator), 0) / cs;
        /* 加权贡献之差：组内率与结构权重变化都在里面，但不能说成因果分解。 */
        for (const x of detail) {
          x.delta = decimalToNumber(x.current) * decimalToNumber(x.current_denominator) / cs
            - decimalToNumber(x.previous) * decimalToNumber(x.previous_denominator) / ps;
        }
        report.warnings.push('采用各分类加权贡献之差，包含组内率与权重变化，不声称是因果效应分解。');
      } else {
        start = sumOf(detail.map(x => x.previous));
        end = sumOf(detail.map(x => x.current));
      }
      if (cfg.order === 'absolute_desc') detail.sort((a, b) => Math.abs(decimalToNumber(b.delta)) - Math.abs(decimalToNumber(a.delta)));
      bars.push({ label: cfg.period_previous, type: 'start', value: start, from: ZERO, to: start });
      let running = start;
      for (const x of detail) {
        const next = vAdd(running, x.delta);
        bars.push({ label: x.label, type: 'delta', value: x.delta, from: running, to: next });
        running = next;
      }
      bars.push({ label: cfg.period_current, type: 'end', value: end, from: ZERO, to: end });
    } else {
      /* bridge：有序节点，小计锚定零基线且不重复累计，负余额与跨零都要正确。 */
      if (!['type', 'value'].every(x => x in mapping)) {
        issue('bridge_fields', 'bridge 需要节点 label、type、value；有起止总量而没有贡献项，不能推断原因。', [], 'data');
        return finish();
      }
      if (cfg.order !== undefined && cfg.order !== 'input') issue('bridge_order', '有序桥/小计不可自动重排，请保留 input 顺序。');
      let running = null, deltaCount = 0, endSeen = null;
      rows.forEach(({ index, row, label }, position) => {
        const cell = row[mapping.type];
        const kind = TYPES[String(cell === undefined || cell === null ? '' : cell).trim().toLowerCase()];
        let value = get(row, 'value', index);
        if (kind === undefined) { issue('unknown_type', '第 ' + (index + 1) + ' 行节点类型不支持。'); return; }
        if ((position === 0 && kind !== 'start') || (position > 0 && kind === 'start')) { issue('start_order', '桥必须且只能以一个 start 开始。'); return; }
        if (kind === 'end' && position !== rows.length - 1) { issue('end_order', 'end 必须是最后一个节点。'); return; }
        if (kind === 'start') {
          if (value === null) { issue('missing_start', '缺少起点数值。', [], 'data'); return; }
          running = value;
          bars.push({ label, type: kind, value, from: ZERO, to: value });
          return;
        }
        if (running === null) return;
        if (kind === 'delta') {
          deltaCount += 1;
          /* 多个未知项之间无法互相反推，因此缺一个就报一个。 */
          if (value === null) { issue('missing_delta', '缺少 ' + label + ' 的增减金额；多个未知项不可从余额反推。', [], 'data'); return; }
          const next = add(running, value);
          bars.push({ label, type: kind, value, from: running, to: next });
          detail.push({ label, delta: value, row: index + 1, previous: null, current: null, growth: null });
          running = next;
          return;
        }
        if (value === null) { value = running; report.derived.push(label + '=起点+此前全部增减（不重复累计小计）'); }
        if (beyond(value, running, tolerance)) {
          if (kind === 'end' && cfg.residual === 'explicit' && !report.issues.length) {
            const residual = sub(value, running);
            bars.push({ label: '未解释差额', type: 'residual', value: residual, from: running, to: value });
            detail.push({ label: '未解释差额', delta: residual, row: null, previous: null, current: null, growth: null });
            report.warnings.push('存在显式未解释差额，不是已验证的业务原因。');
            running = value;
          } else {
            issue('not_reconciled', label + ' 与累计值不闭合，差额 ' + vText(sub(value, running)) + '；不自动平账。');
          }
        }
        bars.push({ label, type: kind, value, from: ZERO, to: value });
        if (kind === 'end') endSeen = value;
      });
      if (!deltaCount) { issue('missing_contributions', '只有起点和终点无法做贡献拆解，请补充可加总的驱动项。', [], 'data'); return finish(); }
      start = bars.find(b => b.type === 'start').value;
      if (endSeen === null && running !== null) {
        endSeen = running;
        bars.push({ label: cfg.end_label || '期末（计算值）', type: 'end', value: endSeen, from: ZERO, to: endSeen });
        report.derived.push('终点=起点+全部增减');
      }
      end = endSeen;
    }

    if (report.issues.length) return finish();

    /* 逐行容差允许单项小偏差，但整体必须仍然闭合；不拿容差当平账工具。 */
    const net = vSub(end, start);
    const reconciliation = vSub(net, detail.reduce((acc, x) => vAdd(acc, x.delta), isDec(net) ? ZERO : 0));
    if (Math.abs(decimalToNumber(reconciliation)) > decimalToNumber(tolerance)) {
      issue('aggregate_not_reconciled', '逐行容差累积后超过整体容差，整体仍不闭合；请核对输入精度。');
      return finish();
    }
    if (cfg.endpoint_style === 'stacked'
      && (mode !== 'period' || metricType === 'rate'
        || detail.some(x => decimalToNumber(x.previous) < 0 || decimalToNumber(x.current) < 0))) {
      issue('stacked_unsupported', '堆叠首尾仅适用于非负、可加总的两期分类数据；请使用 solid。');
      return finish();
    }

    const netNumber = decimalToNumber(net);
    const absSum = detail.reduce((acc, x) => acc + Math.abs(decimalToNumber(x.delta)), 0);
    if (Math.abs(netNumber) <= decimalToNumber(tolerance)) report.warnings.push('净变化为零或近零，净增量贡献占比不适用，显示 —。');
    if (decimalToNumber(start) <= 0) report.warnings.push('整体基期非正，增长率不适用；保留绝对变化。');
    for (const x of detail) {
      const delta = decimalToNumber(x.delta);
      x.net_share = Math.abs(netNumber) > decimalToNumber(tolerance) ? delta / netNumber : null;
      x.absolute_share = absSum ? Math.abs(delta) / absSum : null;
    }
    if (!cfg.as_of) report.warnings.push('未提供数据截止日，不自动生成截止日期。');
    const residualBar = bars.find(b => b.type === 'residual');

    report.mode = mode;
    report.metric_type = metricType;
    report.chart = {
      mode, metric_type: metricType, metric: cfg.metric, unit: cfg.unit, source: cfg.source, as_of: cfg.as_of || null,
      title: cfg.title || ((cfg.metric || '指标') + '变化拆解'), subtitle: cfg.subtitle || '',
      start: decimalToNumber(start), end: decimalToNumber(end), net: netNumber,
      growth: mode === 'period' && metricType !== 'rate' && decimalToNumber(start) > 0 ? netNumber / decimalToNumber(start) : null,
      reconciliation: vText(reconciliation),
      residual: residualBar ? vText(residualBar.value) : null,
      /* 生效容差回显：门禁要用内核真正用过的那一个（含 rate+percent 的百分之一缩量），
         不能自己再猜一个。 */
      tolerance: vText(tolerance),
      bars, details: detail, config: cfg, display_divisor: divisor
    };
    /* 输出契约：几何量一律数值，审计量（闭合差额、残差）一律精确字符串。
       十进制对象到此为止——它内部的 BigInt 一旦被 JSON.stringify 到就是 TypeError，
       而报错点会远离瀑布图本身。 */
    for (const bar of bars) { bar.value = decimalToNumber(bar.value); bar.from = decimalToNumber(bar.from); bar.to = decimalToNumber(bar.to); }
    for (const item of detail) {
      for (const key of ['previous', 'current', 'delta', 'previous_denominator', 'current_denominator']) {
        if (item[key] !== undefined) item[key] = decimalToNumber(item[key]);
      }
    }
    return finish();
  }

  /* 预格式化文本在这里一次算好，渲染器只负责画；两处各算一遍必然漂移。 */
  function present(report) {
    if (!report || !report.chart) return report;
    const chart = report.chart;
    chart.startText = formatValue(chart.start, chart);
    chart.endText = formatValue(chart.end, chart);
    chart.netText = formatValue(chart.net, chart, true);
    chart.growthText = growthText(chart.growth);
    /* 增量与残差柱带方向符号：瀑布的方向不能只由颜色承担，标签必须自己也说得清。 */
    for (const bar of chart.bars) bar.valueText = formatValue(bar.value, chart, bar.type === 'delta' || bar.type === 'residual');
    for (const item of chart.details) {
      item.netShareText = percentText(item.net_share === null ? null : item.net_share);
      item.absoluteShareText = percentText(item.absolute_share === null ? null : item.absolute_share);
      item.growthText = growthText(item.growth);
    }
    return report;
  }

  return {
    diagnose, present, number, formatValue, percentText, growthText, labelLines, decimalsFor,
    decimalFromText, decimalToText, decimalToNumber, add, sub, mul, abs, neg, isZero, sumOf, ZERO, BridgeError
  };
});
