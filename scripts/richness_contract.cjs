/* 表达清单与审稿线索：统计页面各阅读区的实际形式，数量本身不证明证据充分。
   v1-v3 保留历史配额；v4 把重复、种数和同形式分面交给实际阅读判断。 */
'use strict';
const forms = require('../assets/deck-forms.js');
const layout = require('./layout_contract.cjs');

/* 降序排列，取第一个满足的档；10 页以内不设下限。
   阈值按逐格计数重算过：旧阈值（5/10）是按"每页只记主形式"定的，换成逐格计数后，
   一页排得饱满些就能顶掉大半——阈值不再挡任何东西。现在的口径是"可计入表达的约三到四成"：
   11 页档 8 种，21 页档 12 种。真正偷懒的稿子（通篇两三种图型）仍会被挡住，
   而认真选型的稿子不必为了凑数去找冷门图型。
   这里原先写死了"登记形式共 33 条、可计入 29 条"。那是个派生量，加两个形式就过期，
   而它过期时没有任何东西会报错——所以改口径，不复述条数：可计入的集合由
   NON_EXPRESSIVE_FAMILIES 现算，想知道当前几条就问 deck-forms。 */
const TIERS = [
  { minPages: 21, minTypes: 12 },
  { minPages: 11, minTypes: 8 }
];
/* 不计入丰富度的族：表格与结构化文字不是图表、信息图或图示。定义在形式登记表里，两个合同共用。 */
const EXCLUDED_FAMILIES = forms.NON_EXPRESSIVE_FAMILIES;
const MIN_REASON = 12;
const norm = value => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();

const requiredTypes = pageCount => {
  const tier = TIERS.find(item => pageCount >= item.minPages);
  return tier ? tier.minTypes : 0;
};

/* 一页上实际出现的表达清单。v3 页按格取：布局定了有几格，作者每格填了什么就是什么。
   v1/v2 页没有格，退回页级 form/visual，历史稿的计数口径不变。 */
const expressionsOf = (page, version) => {
  if (version === 4 && page && page.layout === 'custom' && Array.isArray(page.regions)) {
    return page.regions.filter(region => region && norm(region.form))
      .map(region => ({form: norm(region.form), visual: norm(region.visual)}));
  }
  const modules = layout.resolveModules(page);
  if (!modules.length) return [{ form: norm(page && page.form), visual: norm(page && page.visual) }];
  return modules.filter(m => m.form).map(m => ({ form: m.form, visual: m.visual }));
};

/* 计数键：非 custom 取 form——visual 在那些页上是可选自由文案，用它计数等于允许改文案注水；
   custom 没有可辨识的 form，只有作者声明的实际图型，所以取 visual。前缀防与真实 form 同名相撞。
   同一表达在一页上出现两次只记一次：丰富度问的是"变了没有"，不是"用了几个"。 */
const keyOf = ({ form, visual }) => form === 'svg.custom' ? 'svg.custom:' + norm(visual) : norm(form);

const countable = form => forms.expressive(form);

/* 兼容旧调用点：传页对象取该页的主形式计数键。 */
const typeKey = page => keyOf({ form: norm(page && page.form), visual: norm(page && page.visual) });

const typesOf = doc => {
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  const keys = new Set();
  pages.forEach(page => {
    if (!page) return;
    expressionsOf(page, doc.version).forEach(expression => {
      if (!countable(expression.form)) return;
      const key = keyOf(expression);
      if (key) keys.add(key);
    });
  });
  return [...keys];
};

/* 逐页表达清单：审稿时看得到"哪几页其实只有一种东西"，而不是只看整册总数。
   这里数的是"所有填了的格"，不是"可计入丰富度的格"——判的是这一页是不是只有一种东西，
   表格和文字也是东西。口径只留可计入的话，一页三格表格会被算成 0 格，正好漏掉最典型的那种
   单薄（三格同一种表）；下面报错文案里的"补一张表"也会变成空头支票，补了不计分。 */
const perPage = doc => {
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  return pages.map((page, index) => {
    const filled = expressionsOf(page, doc.version).map(keyOf).filter(Boolean);
    const distinct = [...new Set(filled)];
    return {
      index, page: page && page.page, expressions: filled.length, distinct: distinct.length, keys: distinct,
      varietyReason: norm(page && page.varietyReason)
    };
  });
};

/* 一页分了三格以上却只有一种表达：网格已经把它切开了，读者读到的还是同一件东西。
   三格同一种表格、三格同一段文字都算——"一种东西"按种类判，不按它可不可计入丰富度判。
   分面（同一证据按维度拆开）是正当例外，但要说得出是哪种维度，所以留 varietyReason 出口。 */
const thinPages = doc => perPage(doc).filter(item => item.expressions >= 3 && item.distinct < 2 && item.varietyReason.length < MIN_REASON);

const display = key => key.replace(/^svg\.custom:/, 'custom/');

function validate(doc) {
  if (doc && doc.version === 4) return [];
  const errors = [];
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  const required = requiredTypes(pages.length);
  // 单页单薄与整册反反复复是两件事：前者逐页看，后者看总数。逐页的那条任何时候都要报。
  const thin = thinPages(doc);
  if (thin.length) {
    errors.push('以下页面网格已分格却只填出一种表达，版面因此单薄：'
      + thin.map(item => 'page ' + item.page + '（' + item.expressions + ' 格同一种 ' + item.keys.map(display).join('/') + '）').join('、')
      + '。布局给出的空间该被不同证据填满——补一张表、一组卡或一个小图，或换一条分格更少的布局；'
      + '确实是同一证据的分面时，在对应页写 varietyReason（≥' + MIN_REASON + '字）说明是哪个维度在分面。');
  }
  // 未触发下限时 diversityReason 是无关字段，不做要求——与 sparseReason 只在 profile="sparse" 时校验同理。
  if (!required) return errors;
  const types = typesOf(doc);
  if (types.length >= required) return errors;
  const reason = norm(doc && doc.diversityReason);
  // 与 sparseReason 同一约定：写了就必须说清楚为什么，不能只写“材料限制”。
  if (doc && doc.diversityReason !== undefined && reason.length < MIN_REASON) {
    errors.push('pages.diversityReason 须说明至少' + MIN_REASON + '字：为什么本稿用不了更多形式（当前 '
      + types.length + ' 种，下限 ' + required + ' 种）');
    return errors;
  }
  if (reason.length >= MIN_REASON) return errors; // 已用豁免；豁免事实由 inventory 暴露，供审计留痕
  errors.push('正文 ' + pages.length + ' 页需要至少 ' + required + ' 种表达，当前只有 ' + types.length + ' 种：'
    + (types.length ? types.map(display).join('、') : '（无）')
    + '。请补充真实证据以引入新的表达形式，不要为凑数改用不合适的图型；若本主题确实无法使用更多形式，'
    + '写 pages.diversityReason 说明原因。表格与结构化文字不计入表达种数。');
  return errors;
}

function diagnostics(doc) {
  const pages = doc && Array.isArray(doc.pages) ? doc.pages.filter(Boolean) : [];
  if (!pages.length) return [];
  const types = typesOf(doc), use = new Map();
  pages.forEach(page => {
    const keys = new Set(expressionsOf(page, doc.version).filter(expression => countable(expression.form)).map(keyOf));
    keys.forEach(key => {
      if (!use.has(key)) use.set(key, []);
      use.get(key).push(page.page);
    });
  });
  const result = [{code: 'R-EXPRESSION-INVENTORY', pages: pages.map(page => page.page), chartTypes: types,
    distinctChartTypes: types.length, message: '本稿包含 ' + types.length + ' 种图表或图示表达；按读者需要选择，无最低种数要求。'}];
  use.forEach((pageNumbers, form) => {
    if (pageNumbers.length >= 3) result.push({code: 'R-REPEATED-EXPRESSION', pages: pageNumbers, form,
      message: display(form) + ' 在这些页面重复；请核对共同口径与比较任务，合理重复可直接保留，不为凑种数换图。'});
  });
  perPage(doc).filter(item => item.expressions >= 3 && item.distinct === 1).forEach(item =>
    result.push({code: 'R-SAME-EXPRESSION-PANELS', pages: [item.page], expressions: item.expressions,
      message: '本页多个阅读区使用同一表达，可能是合理小多图或逐项对照；请检查是否共用必要尺度、减少重复说明，而非凭形式数量判为单薄。'}));
  return result;
}

module.exports = { TIERS, EXCLUDED_FAMILIES, MIN_REASON, requiredTypes, typeKey, countable, expressionsOf, keyOf, typesOf, perPage, thinPages, validate, diagnostics };
