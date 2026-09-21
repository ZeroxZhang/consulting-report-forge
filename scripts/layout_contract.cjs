/* 布局合同：把"这一页长什么样"从散文变成可核对的模块几何。
   目录（assets/layout-atlas/catalog.json）是唯一权威：脚本不重复描述布局，只引用 layout.ref。
   页面侧的约定是——布局固定结构，作者只填每一格的形式。所以 pages.json 的 regions 按序
   对应目录里的 modules，几何、槽位、角色都来自目录，作者写不写都不改变事实，写错则报错。
   几何计算在 assets/deck-grid.js，本模块只做目录合法性与页面↔目录的对账。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const grid = require('../assets/deck-grid.js');
const forms = require('../assets/deck-forms.js');

const CATALOG_FILE = path.join(__dirname, '../assets/layout-atlas/catalog.json');
/* 模块视觉处理：只保留承担语义的几种，装饰性色条与分组框不在此列（见视觉政策）。 */
const MODULE_STYLES = ['plain', 'tinted', 'compact', 'nohead', 'finding'];
/* 角色沿用 pages.json 的既有词汇，并补上含义块——布局与页面用同一套角色，才能互相校验。 */
const MODULE_ROLES = ['primary', 'support', 'context', 'evidence', 'implication'];
const MIN_REASON = 12;
/* 布局丰富度下限：页数越多，越不该靠一两种结构撑满全篇。阈值与图表种数下限同量级，
   但更宽松——同一布局换形式就是另一种读法，所以它比图表类型更容易复用。
   数字与"同一布局第 3 次使用要写理由"对齐：不写理由时每条布局最多用两次，
   N 页的天然上限是 ceil(N/2)。11 页档取 6、21 页档取 10，正好各留一条可复用的口子，
   两条规则相互印证而不是互相打架。可选的骨架有 30 条（analysis 母版），够用。 */
const LAYOUT_TIERS = [
  { minPages: 21, minLayouts: 10 },
  { minPages: 11, minLayouts: 6 }
];

let cache = null;
const norm = value => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
const catalog = () => cache || (cache = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')));
const reset = () => { cache = null; };
const list = () => catalog().layouts;
const masters = () => catalog().masters;
const get = ref => {
  const layout = list().find(item => item.id === ref);
  if (!layout) {
    throw new Error('未知布局 ' + ref + '（目录共 ' + list().length + ' 条，如 ' + list().slice(0, 4).map(i => i.id).join('/') + '…；'
      + '选布局见 references/consulting-page-system.md，或打开 assets/layout-atlas.html）');
  }
  return layout;
};
const has = ref => list().some(item => item.id === ref);
const masterOf = ref => get(ref).master;
const memberLayouts = masterId => list().filter(layout => layout.master === masterId).map(layout => layout.id);
const master = id => {
  const found = masters().find(item => item.id === id);
  if (!found) throw new Error('未知母版 ' + id + '（可用 ' + masters().map(m => m.id).join('/') + '）');
  return found;
};

/* 一个布局里"主展品"的位置：每页恰好一个，它决定这一页的 form 与标题指向。 */
const primaryIndex = layout => layout.modules.findIndex(m => m.role === 'primary');
const moduleLabels = layout => layout.modules.map((m, i) => '第 ' + (i + 1) + ' 格「' + m.title + '」（' + m.slot + '/' + m.role + '）');

/* 每条布局的完整尺寸与容量：选型时用它判断"这个格装不装得下我要放的东西"。 */
const measure = (ref, ratio = grid.DEFAULT_RATIO) => {
  const layout = get(ref);
  return {
    id: layout.id, name: layout.name, family: layout.family, master: layout.master,
    fill: layout.fill, fillRatio: grid.coverage(layout.modules).ratio,
    modules: layout.modules.map((m, i) => {
      const box = grid.box(m, ratio);
      return {
        index: i, title: m.title, slot: m.slot, role: m.role, style: m.style || 'plain',
        c: m.c, r: m.r, w: m.w, h: m.h, box,
        lines: grid.capacity(m.h, ratio),
        accepts: m.accepts || null,
        formFits: forms.list().filter(f => grid.slotAccepts(m.slot, f) && (!m.accepts || formInAccepts(f, m.accepts))).map(f => ({form:f, ...formFit(f, m, ratio)}))
      };
    })
  };
};

/* —— 目录自检：布局目录自身的合法性与完备性，构造期与测试期都跑 —— */
function catalogErrors(doc = catalog()) {
  const errors = [];
  const bad = message => errors.push(message);
  if (doc.schema !== 1) bad('catalog.schema 只接受 1');
  if (!Array.isArray(doc.layouts) || !doc.layouts.length) { bad('catalog.layouts 须为非空数组'); return errors; }
  if (!Array.isArray(doc.masters) || !doc.masters.length) bad('catalog.masters 须为非空数组');
  const masterIds = new Set((doc.masters || []).map(m => m.id));
  const seen = new Set();
  doc.layouts.forEach(layout => {
    const at = (layout && layout.id) || '（无 id）';
    if (!layout || typeof layout !== 'object') { bad('布局条目须为对象'); return; }
    if (!/^L\d{2}$/.test(layout.id || '')) bad(at + ' id 须形如 L01');
    if (seen.has(layout.id)) bad(at + ' id 重复'); else seen.add(layout.id);
    if (!masterIds.has(layout.master)) bad(at + ' master 不在母版表内：' + layout.master);
    ['family', 'familyName', 'name', 'use', 'path', 'trade', 'avoid'].forEach(key => {
      if (!norm(layout[key])) bad(at + ' 缺少 ' + key);
    });
    if (!Array.isArray(layout.modules) || !layout.modules.length) { bad(at + ' modules 须为非空数组'); return; }
    errors.push(...grid.boundsErrors(layout.modules).map(e => at + ' ' + e));
    errors.push(...grid.overlapErrors(layout.modules).map(e => at + ' ' + e));
    errors.push(...grid.fillErrors(layout, at));
    const primaries = layout.modules.filter(m => m && m.role === 'primary');
    if (primaries.length !== 1) bad(at + ' 必须恰好有一个 role="primary" 的主展品，当前 ' + primaries.length + ' 个');
    layout.modules.forEach((m, i) => {
      const where = at + ' modules[' + i + ']';
      if (!grid.SLOTS.includes(m.slot)) bad(where + ' slot 须为 ' + grid.SLOTS.join('/'));
      if (!MODULE_ROLES.includes(m.role)) bad(where + ' role 须为 ' + MODULE_ROLES.join('/'));
      if (!norm(m.title)) bad(where + ' 缺少 title：模块标题是线框图与生成骨架的标签');
      else if (norm(m.title).length > 12) bad(where + ' title 超过 12 字，线框里放不下');
      if (m.style !== undefined && !MODULE_STYLES.includes(m.style)) bad(where + ' style 须为 ' + MODULE_STYLES.join('/'));
      if (m.slot === 'head' || m.slot === 'source') bad(where + ' head/source 由版心固定占用，不能作为内容模块');
      if (m.accepts !== undefined) {
        if (!Array.isArray(m.accepts) || !m.accepts.length) bad(where + ' accepts 须为非空数组或省略');
        else m.accepts.forEach(token => {
          // 只有"这一格的论证依赖某种形式"时才写 accepts；写了就必须是可以真正填进去的形式。
          if (!validToken(token)) bad(where + ' accepts 含未知形式或族：' + token);
          else if (!acceptsToken(m.slot, token)) bad(where + ' slot=' + m.slot + ' 装不下 ' + token + '：槽位与形式不相容');
        });
      }
    });
    if (layout.constraint !== undefined && norm(layout.constraint).length < 8) bad(at + ' constraint 写了就要说清楚（≥8字）');
    if (layout.openWhy !== undefined && norm(layout.openWhy).length < MIN_REASON) bad(at + ' openWhy 少于 ' + MIN_REASON + ' 字');
  });
  return errors;
}

/* accepts 允许写形式 id，也允许写 family:<族>——族是"这一类都行"，形式是"必须就是它"。 */
const validToken = token => {
  const text = norm(token);
  if (text.startsWith('family:')) return Object.prototype.hasOwnProperty.call(forms.familyLabels, text.slice(7));
  return forms.list().includes(text);
};

const acceptsToken = (slot, token) => {
  const text = norm(token);
  if (text.startsWith('family:')) {
    const family = text.slice(7);
    return forms.list().some(form => forms.familyOf(form) === family && grid.slotAccepts(slot, form));
  }
  return grid.slotAccepts(slot, text);
};

const formInAccepts = (form, accepts) => (accepts || []).some(token => {
  const text = norm(token);
  if (text.startsWith('family:')) return forms.familyOf(form) === text.slice(7);
  return text === form;
});

/* —— 页面 ↔ 目录对账：v3 的核心校验 ——
   regions 按序对应 modules，作者只填 form/visual。几何、槽位、角色、容量都来自目录，
   所以"这页长什么样"在写内容之前就已经定死，作者的自由落在每一格放什么。 */
function formFit(form, module, ratio = grid.DEFAULT_RATIO, sizing = {}) {
  if (!sizing || typeof sizing !== 'object' || Array.isArray(sizing)) throw Error('sizing 须为对象');
  for (const k of Object.keys(sizing)) if (!['titled', 'unit', 'stages'].includes(k)) throw Error('未知 sizing 字段：' + k);
  for (const k of ['titled', 'unit']) if (sizing[k] !== undefined && typeof sizing[k] !== 'boolean') throw Error('sizing.' + k + ' 须为布尔值');
  if (sizing.stages !== undefined && form !== 'kit.processFlow') throw Error('sizing.stages 当前只适用于 kit.processFlow');
  const box = grid.box(module, ratio), required = forms.minimumSize(form, sizing);
  const available = {width:box.width - 2 * grid.MODULE.pad, height:box.height - 2 * grid.MODULE.pad - (sizing.titled ? grid.MODULE.titleBand : 0) - (sizing.unit ? grid.MODULE.unitBand : 0)};
  return {available, required, fits:required ? available.width >= required.width && available.height >= required.height : null};
}

function sizeErrors(form, module, ratio, sizing, at) {
  try {
    const fit = formFit(form, module, ratio, sizing);
    return fit.fits === false ? [at + ' ' + form + ' 最小画布 ' + fit.required.width + '×' + fit.required.height + 'px，槽位可用 ' + fit.available.width + '×' + fit.available.height + 'px（' + ratio + '）；请换更大布局或改用适合该槽位的表达，不能缩放组件绕过'] : [];
  } catch (error) { return [at + ' ' + error.message]; }
}

function pageErrors(page, at = '本页', ratio = grid.DEFAULT_RATIO) {
  const errors = [];
  const bad = message => errors.push(message);
  const ref = norm(page && page.layout);
  if (!ref) {
    if (norm(page && page.layoutExemptReason).length >= MIN_REASON) return errors;
    bad(at + ' 缺少 layout：v3 每页都要声明用哪条布局（见 assets/layout-atlas.html 选型）；'
      + '确实没有合适布局时写 layoutExemptReason（≥' + MIN_REASON + ' 字）说明为什么这一页不套布局');
    return errors;
  }
  let layout;
  try { layout = get(ref); } catch (error) { bad(at + ' ' + error.message); return errors; }
  const regions = Array.isArray(page.regions) ? page.regions : [];
  if (!regions.length) {
    bad(at + ' 声明了 layout=' + ref + '（' + layout.name + '）却没有 regions：'
      + '按序给每一格写形式，本布局共 ' + layout.modules.length + ' 格——' + moduleLabels(layout).join('、'));
    return errors;
  }
  if (regions.length !== layout.modules.length) {
    bad(at + ' regions 有 ' + regions.length + ' 项，layout=' + ref + ' 有 ' + layout.modules.length + ' 格：'
      + moduleLabels(layout).join('、') + '。逐格对应，不能多也不能少');
    return errors;
  }
  regions.forEach((region, index) => {
    const module = layout.modules[index], where = at + ' regions[' + index + ']（第 ' + (index + 1) + ' 格「' + module.title + '」）';
    if (!region || typeof region !== 'object') { bad(where + ' 须为对象'); return; }
    if (region.c !== undefined || region.r !== undefined || region.w !== undefined || region.h !== undefined) {
      bad(where + ' 不要写 c/r/w/h：几何由 layout=' + ref + ' 决定，写了会与目录漂移');
    }
    if (region.slot !== undefined && region.slot !== module.slot) bad(where + ' slot 与目录不一致：目录是 ' + module.slot);
    if (region.role !== undefined && region.role !== module.role) bad(where + ' role 与目录不一致：目录是 ' + module.role);
    if (!norm(region.form)) { bad(where + ' 缺少 form：这一格用什么表达'); return; }
    let entry = null;
    try { entry = forms.get(region.form); } catch (error) { bad(where + ' ' + error.message); return; }
    errors.push(...sizeErrors(region.form, module, ratio, region.sizing, where));
    // 槽位是布局对内容的约束：表格式的格不能填一张图，图表格也不能拿表格顶替。
    if (!grid.slotAccepts(module.slot, region.form)) {
      bad(where + ' slot=' + module.slot + ' 装不下 ' + region.form + '（' + entry.label + '）：'
        + '这一格的可填形式是 ' + slotFormList(module.slot) + '；换形式或换布局');
    }
    if (Array.isArray(module.accepts) && module.accepts.length && !formInAccepts(region.form, module.accepts)) {
      bad(where + ' 本布局限定这一格填 ' + module.accepts.join('/') + '，给了 ' + region.form
        + (layout.constraint ? '（布局约束：' + layout.constraint + '）' : ''));
    }
    if (region.form === 'svg.custom' && !norm(region.visual)) bad(where + ' svg.custom 必须用 visual 声明实际表达');
    if (region.visual !== undefined && (typeof region.visual !== 'string' || !norm(region.visual))) bad(where + ' visual 须为非空字符串');
  });
  const primary = primaryIndex(layout);
  if (primary >= 0 && regions[primary] && norm(regions[primary].form) && norm(page.form) !== norm(regions[primary].form)) {
    bad(at + ' 主展品是第 ' + (primary + 1) + ' 格「' + layout.modules[primary].title + '」，'
      + 'page.form 必须是 ' + regions[primary].form + '，当前是 ' + (norm(page.form) || '（空）'));
  }
  if (primary >= 0 && regions[primary] && regions[primary].visual !== undefined
      && norm(regions[primary].visual) !== norm(page.visual)) {
    bad(at + ' 主展品的 visual 与 page.visual 不一致：主展品写「' + norm(regions[primary].visual) + '」，page 写「' + norm(page.visual) + '」');
  }
  return errors;
}

const slotFormList = slot => forms.list().filter(form => grid.slotAccepts(slot, form)).join('/');

/* 逐格展开：几何 + 该格实际填的形式。装配与浏览器审计都用它，避免两边各算一遍。 */
const resolveModules = (page, ratio = grid.DEFAULT_RATIO) => {
  const ref = norm(page && page.layout);
  if (!ref || !has(ref)) return [];
  const layout = get(ref), regions = Array.isArray(page.regions) ? page.regions : [];
  return layout.modules.map((module, index) => {
    const region = regions[index] || {};
    const box = grid.box(module, ratio);
    return {
      index, ref, title: module.title, slot: module.slot, role: module.role, style: module.style || 'plain',
      c: module.c, r: module.r, w: module.w, h: module.h, box,
      form: norm(region.form), visual: norm(region.visual), primary: module.role === 'primary',
      lines: grid.capacity(module.h, ratio)
    };
  });
};

const requiredLayouts = pageCount => {
  const tier = LAYOUT_TIERS.find(item => pageCount >= item.minPages);
  return tier ? tier.minLayouts : 0;
};

const layoutsOf = doc => {
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  const counts = new Map();
  pages.forEach(page => {
    const ref = norm(page && page.layout);
    if (ref) counts.set(ref, (counts.get(ref) || 0) + 1);
  });
  return counts;
};

/* 整册的布局下限 + 单条布局的复用理由。与图表丰富度是两条独立的下限：
   图表管"表达方式有没有变"，布局管"页面结构有没有变"——三页同一种图不同，三页同一种结构也不同。 */
function validate(doc) {
  const errors = [];
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  const counts = layoutsOf(doc);
  counts.forEach((count, ref) => {
    if (count < 3) return;
    const pagesUsing = pages.filter(page => norm(page.layout) === ref);
    const from = pagesUsing[2];
    if (!norm(from.layoutReason)) {
      errors.push('page ' + from.page + '：布局 ' + ref + ' 已是本稿第 3 次使用，必须写 layoutReason 说明为什么这里还是它'
        + '（同一布局换形式是另一种读法，但要说得出来）');
    }
  });
  const required = requiredLayouts(pages.length);
  if (!required) return errors;
  const used = counts.size;
  if (used >= required) return errors;
  const reason = norm(doc && doc.layoutDiversityReason);
  if (doc && doc.layoutDiversityReason !== undefined && reason.length < MIN_REASON) {
    errors.push('pages.layoutDiversityReason 须说明至少' + MIN_REASON + '字：为什么本稿用不了更多布局（当前 '
      + used + ' 种，下限 ' + required + ' 种）');
    return errors;
  }
  if (reason.length >= MIN_REASON) return errors;
  errors.push('正文 ' + pages.length + ' 页需要至少 ' + required + ' 种布局，当前只有 ' + used + ' 种：'
    + ([...counts.keys()].join('、') || '（无）')
    + '。布局决定页面结构，结构与证据形式一样要有变化；确实只能用少数结构时写 pages.layoutDiversityReason 说明原因。');
  return errors;
}

function inventory(doc) {
  const counts = layoutsOf(doc);
  const used = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const pages = (doc && Array.isArray(doc.pages)) ? doc.pages : [];
  const required = requiredLayouts(pages.length);
  const reason = norm(doc && doc.layoutDiversityReason);
  return {
    layouts: Object.fromEntries(used),
    distinctLayouts: counts.size,
    layoutRequired: required,
    layoutExempt: required > 0 && counts.size < required && reason.length >= MIN_REASON,
    layoutDiversityReason: reason,
    families: [...new Set(used.map(([ref]) => has(ref) ? get(ref).familyName : '未知'))],
    masters: [...new Set(used.map(([ref]) => has(ref) ? get(ref).master : '未知'))]
  };
}

module.exports = {
  CATALOG_FILE, MODULE_STYLES, norm, MODULE_ROLES, MIN_REASON, LAYOUT_TIERS,
  catalog, reset, list, masters, get, has, master, masterOf, memberLayouts,
  primaryIndex, moduleLabels, measure, catalogErrors, formFit, sizeErrors,
  validToken, acceptsToken, formInAccepts, slotFormList,
  pageErrors, resolveModules, requiredLayouts, layoutsOf, validate, inventory
};
