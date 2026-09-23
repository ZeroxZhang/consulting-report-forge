/* 形式容量的唯一数字真源。hard 是组件可接收的数据上限；soft 只提示审稿，不截断数据。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FormCapacity = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const RULES = {
    'kit.waterfall': {nodes:{label:'起点、贡献项与终点合计节点',hardMax:18}},
    'precision.waterfall': {nodes:{label:'起点、贡献项与终点合计节点',hardMax:18},width:{label:'画布宽度(px)',hardMin:400},height:{label:'画布高度(px)',hardMin:260},categoryLines:{label:'类别标签行数',hardMax:4}},
    'kit.dumbbell': {items:{label:'对照行',hardMax:14}},
    'kit.slope': {items:{label:'对照行',hardMax:10}},
    'kit.bullet': {items:{label:'指标',hardMax:6}},
    'kit.heatmap': {cells:{label:'矩阵格',hardMax:160}},
    'kit.mekko': {items:{label:'列',hardMax:6}},
    'kit.stacked': {items:{label:'列',hardMax:12},series:{label:'系列',hardMax:6}},
    'kit.shareBar': {items:{label:'构成条',hardMax:2},series:{label:'系列',hardMax:6}},
    'kit.tree': {nodes:{label:'树节点',hardMax:48}},
    'kit.swimlane': {nodesPerCell:{label:'同一主体与阶段单元格节点',hardMax:1}},
    'kit.processFlow': {stages:{label:'阶段',hardMin:2,softMin:3,softMax:6}},
    'recipe.rankedBar': {items:{label:'排序项',hardMax:24,softMax:12}},
    'recipe.groupedBar': {categories:{label:'类别',hardMax:12},series:{label:'系列',hardMax:4}},
    'recipe.timeSeries': {periods:{label:'期间',hardMax:36},series:{label:'系列',hardMax:5}},
    'recipe.composition': {items:{label:'类别',hardMax:12},series:{label:'系列',hardMax:6}},
    'recipe.histogram': {bins:{label:'分箱',hardMax:24}},
    'recipe.scatter': {items:{label:'散点',hardMax:200},labeledPoints:{label:'直接标签',softMax:15}},
    'recipe.heatmap': {cells:{label:'矩阵格',hardMax:160}},
    'recipe.sankey': {nodes:{label:'节点',hardMax:30},links:{label:'连线',hardMax:60}},
    'recipe.tree': {nodes:{label:'树节点',hardMax:48}},
    'html.kpi': {items:{label:'卡片',softMax:5}},
    'html.finding': {items:{label:'依据',hardMin:3,softMax:5}},
    'precision.columns': {width:{label:'画布宽度(px)',hardMin:400},height:{label:'画布高度(px)',hardMin:260},categoryLines:{label:'类别标签行数',hardMax:4}},
    'precision.stacked': {width:{label:'画布宽度(px)',hardMin:400},height:{label:'画布高度(px)',hardMin:260},categoryLines:{label:'类别标签行数',hardMax:4}}
  };
  const rules = form => RULES[form] || {};
  function countTree(root) {
    const seen = new Set();
    function visit(node) {
      if (!node || typeof node !== 'object' || seen.has(node)) return undefined;
      seen.add(node);
      let total = 1;
      for (const child of node.children || []) { const n = visit(child); if (n === undefined) return undefined; total += n; }
      return total;
    }
    return root ? visit(root) : undefined;
  }
  function dimensions(form, spec = {}) {
    const length = value => Array.isArray(value) ? value.length : undefined;
    const values = {
      items:length(spec.items), nodes:length(spec.nodes), links:length(spec.links),
      categories:length(spec.categories), periods:length(spec.periods), bins:length(spec.bins),
      stages:length(spec.stages), width:spec.width, height:spec.height,
      categoryLines:spec.categoryLines,
      labeledPoints:Array.isArray(spec.items)?spec.items.filter(item=>spec.items.length<=limit('recipe.scatter','labeledPoints','softMax')||item.selected).length:undefined
    };
    if(form==='kit.swimlane'&&Array.isArray(spec.items)){
      const occupied=new Map();for(const item of spec.items){const cell=String(item.lane)+':'+String(item.stage);occupied.set(cell,(occupied.get(cell)||0)+1);}values.nodesPerCell=Math.max(0,...occupied.values());
    }
    if (form === 'recipe.sankey') values.nodes = length(spec.nodes);
    if (['kit.tree','recipe.tree'].includes(form)) values.nodes = countTree(spec.root);
    if (form === 'kit.waterfall') values.nodes = length(spec.waterfall?.chart?.bars || spec.bars || spec.items);
    if (form === 'precision.waterfall') values.nodes = length(spec.waterfall?.chart?.bars || spec.items);
    if (['kit.heatmap','recipe.heatmap'].includes(form)) values.cells = length(spec.rows) !== undefined && length(spec.columns) !== undefined ? spec.rows.length * spec.columns.length : undefined;
    if (['kit.stacked','kit.shareBar','kit.mekko','recipe.composition'].includes(form)) values.series = length(spec.items?.[0]?.segments);
    if (form === 'kit.stacked') values.series = length(spec.items?.[0]?.segments);
    if (form === 'recipe.groupedBar' || form === 'recipe.timeSeries') values.series = length(spec.series);
    return values;
  }
  function inspect(form, values, {requireAll = false} = {}) {
    const errors = [], warnings = [];
    for (const [key, rule] of Object.entries(rules(form))) {
      const n = values?.[key];
      if (n === undefined || n === null) { if (requireAll) errors.push(form + ' 缺少容量计数 ' + key); continue; }
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || (key !== 'width' && key !== 'height' && !Number.isInteger(n))) { errors.push(form + ' 的 ' + key + ' 须为非负有限计数'); continue; }
      if (rule.hardMax !== undefined && n > rule.hardMax) errors.push(form + ' ' + rule.label + ' ' + n + ' 超过硬上限 ' + rule.hardMax);
      if (rule.hardMin !== undefined && n < rule.hardMin) errors.push(form + ' ' + rule.label + ' ' + n + ' 低于硬下限 ' + rule.hardMin);
      if (rule.softMax !== undefined && n > rule.softMax) warnings.push(form + ' ' + rule.label + ' ' + n + ' 超过建议阅读量 ' + rule.softMax + '，须看图确认');
      if (rule.softMin !== undefined && n < rule.softMin) warnings.push(form + ' ' + rule.label + ' ' + n + ' 低于建议阅读量 ' + rule.softMin + '，须看图确认');
    }
    return {errors, warnings};
  }
  const check = (form, spec) => inspect(form, dimensions(form, spec));
  const limit = (form, key, bound = 'hardMax') => rules(form)[key]?.[bound];
  const encoded = (form, spec) => encodeURIComponent(JSON.stringify(Object.fromEntries(Object.keys(rules(form)).map(key=>[key,dimensions(form,spec)[key]]).filter(([,value])=>value!==undefined))));
  return {version:'1.0.0', RULES, rules, dimensions, inspect, check, limit, encoded};
});
