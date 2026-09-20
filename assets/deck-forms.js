/* 实现入口登记：组件不是图型全集。其他原生、组合与手写 SVG 走 svg.custom，
   pages.visual 记录实际表达；入口一致性由 test_blueprint_pages.cjs 验证。 */
'use strict';

const FORMS = {
  // —— 构建期静态咨询展品（assets/exhibit-kit.js）——
  'kit.waterfall': { family: 'comparison', label: '瀑布图', kind: 'svg', module: 'exhibit-kit', export: 'waterfall', annotation: 'layer', capacity: '贡献项 ≤ 8；不闭合不做' },
  'kit.dumbbell': { family: 'comparison', label: '哑铃图', kind: 'svg', module: 'exhibit-kit', export: 'dumbbell', annotation: 'layer', capacity: '行 ≤ 14；两期同口径同量尺' },
  'kit.slope': { family: 'comparison', label: '坡度图', kind: 'svg', module: 'exhibit-kit', export: 'slope', annotation: 'layer', capacity: '行 ≤ 10；只比较排序迁移，不比横距' },
  'kit.bullet': { family: 'kpi', label: '子弹图', kind: 'svg', module: 'exhibit-kit', export: 'bullet', annotation: 'layer', capacity: '指标 ≤ 6；分档须另有业务定义' },
  'kit.heatmap': { family: 'correlation', label: '矩阵热力图', kind: 'svg', module: 'exhibit-kit', export: 'heatmap', annotation: 'layer', capacity: '≤ 160 格；固定 domain；只接受有限数值，未观察／缺失用自定义 SVG 或 HTML 单独编码' },
  'kit.mekko': { family: 'composition', label: '百分轴 Mekko', kind: 'svg', module: 'exhibit-kit', export: 'mekko', annotation: 'layer', capacity: '列 ≤ 6；窄列与小片自动改走同侧引线通道，通道放不下时报错' },
  'kit.stacked': { family: 'composition', label: '堆积构成', kind: 'svg', module: 'exhibit-kit', export: 'stacked', annotation: 'layer', capacity: '列 ≤ 12 × 系列 ≤ 6；仅非负组成；小片与零值走引线通道' },
  'kit.tree': { family: 'hierarchy', label: '层级树', kind: 'svg', module: 'exhibit-kit', export: 'tree', annotation: null, capacity: '≤ 48 节点；每层同一拆分逻辑' },
  'kit.swimlane': { family: 'diagram', label: '泳道图', kind: 'svg', module: 'exhibit-kit', export: 'swimlane', annotation: null, capacity: '单元格仅 1 节点；复杂分支换专门路径' },
  'kit.processFlow': { family: 'diagram', label: '阶段流程', kind: 'svg', module: 'exhibit-kit', export: 'processFlow', annotation: null, capacity: '3–6 段线性；等宽不表示等时长' },
  'kit.comparisonTable': { family: 'table', label: '比较表（HTML）', kind: 'html', module: 'exhibit-kit', export: 'comparisonTable', annotation: null, capacity: '高度由内容决定，须自行分页' },

  // —— ECharts 配方（assets/echarts-recipes.js，构建期 SSR 成内联 SVG）——
  'recipe.rankedBar': { family: 'comparison', label: '排序条形', kind: 'svg', module: 'echarts-recipes', export: 'rankedBar', annotation: 'layer', capacity: '≤ 24 项，正文宜更少' },
  'recipe.groupedBar': { family: 'comparison', label: '分组柱状', kind: 'svg', module: 'echarts-recipes', export: 'groupedBar', annotation: 'layer', capacity: '≤ 12 类 × 4 系列' },
  'recipe.timeSeries': { family: 'trend', label: '时间序列折线', kind: 'svg', module: 'echarts-recipes', export: 'timeSeries', annotation: 'layer', capacity: '≤ 36 期 × 5 系列，更多分面' },
  'recipe.composition': { family: 'composition', label: '堆积／100% 堆积', kind: 'svg', module: 'echarts-recipes', export: 'composition', annotation: 'layer', capacity: '≤ 12 类 × 6 系列' },
  'recipe.histogram': { family: 'distribution', label: '直方图', kind: 'svg', module: 'echarts-recipes', export: 'histogram', annotation: 'layer', capacity: '须已正确分箱，不从均值伪造' },
  'recipe.scatter': { family: 'correlation', label: '散点／气泡', kind: 'svg', module: 'echarts-recipes', export: 'scatter', annotation: 'layer', capacity: '> 15 点只标关键点' },
  'recipe.heatmap': { family: 'correlation', label: '连续矩阵热力', kind: 'svg', module: 'echarts-recipes', export: 'heatmap', annotation: 'layer', capacity: '≤ 160 格；只接受有限数值，未观察／缺失用自定义 SVG 或 HTML 单独编码' },
  'recipe.sankey': { family: 'flow', label: '桑基图', kind: 'svg', module: 'echarts-recipes', export: 'sankey', annotation: 'layer', capacity: '≤ 30 节点 / 60 边；须守恒无环' },
  'recipe.tree': { family: 'hierarchy', label: '层级树（ECharts）', kind: 'svg', module: 'echarts-recipes', export: 'tree', annotation: 'layer', capacity: '≤ 48 节点' },

  // —— 专业标注入口（scripts/render_precision_exhibit.cjs）——
  'precision.columns': { family: 'comparison', label: '数值柱（含小计／断轴／Δ）', kind: 'svg', module: 'precision', type: 'columns', annotation: 'layer', capacity: '≥ 400×260；类别 ≤ 4 行' },
  'precision.stacked': { family: 'composition', label: '数值堆积（含层比较）', kind: 'svg', module: 'precision', type: 'stacked', annotation: 'layer', capacity: '仅非负组成；列内须列全系列' },
  'precision.waterfall': { family: 'comparison', label: '数值瀑布（含累计连接）', kind: 'svg', module: 'precision', type: 'waterfall', annotation: 'layer', capacity: '须闭合；累计连接只用于瀑布' },

  // —— 语义图示（scripts/render_diagram.cjs）——
  'diagram.mechanism': { family: 'diagram', label: '机制／反馈图', kind: 'svg', module: 'diagram', annotation: null, capacity: '边须写含义与证据状态；循环标反馈' },
  'diagram.process': { family: 'flow', label: '流程与资金转移', kind: 'svg', module: 'diagram', annotation: null, capacity: '无量化就不给连线加宽度' },
  'diagram.swimlane': { family: 'diagram', label: '多主体泳道', kind: 'svg', module: 'diagram', annotation: null, capacity: 'lane 编码主体、stage 编码阶段' },
  'diagram.hierarchy': { family: 'hierarchy', label: '能力／层级地图', kind: 'svg', module: 'diagram', annotation: null, capacity: '区分包含、依赖、必要条件' },
  'diagram.condition': { family: 'diagram', label: '条件与决策树', kind: 'svg', module: 'diagram', annotation: null, capacity: '决策节点与结果分开；概率缺依据就保留分支' },

  // —— 作者手写结构 ——
  'html.table': { family: 'table', label: '精确数据表', kind: 'html', annotation: null, capacity: '一列一种单位；总计由作者提供' },
  'html.matrix': { family: 'table', label: '评估矩阵／RACI', kind: 'html', annotation: null, capacity: '权重与评分锚点须透明' },
  'html.kpi': { family: 'kpi', label: 'KPI 卡组', kind: 'html', annotation: null, capacity: '≤ 5 张卡；每张须有目标线' },
  'html.text': { family: 'text', label: '结构化文字／证据组', kind: 'html', annotation: null, capacity: '无共同维度时保留结构化文字' },
  'svg.custom': { family: 'custom', label: '自定义矢量构图', kind: 'svg', annotation: null, capacity: '几何与语义由作者负责，须实际看图' },
};

const FAMILY_LABELS = {
  comparison: '比较与排名', trend: '趋势', composition: '构成', distribution: '分布',
  correlation: '相关与矩阵', flow: '流向', hierarchy: '层级', kpi: '达成度',
  diagram: '机制与流程', table: '精确查数', text: '结构化文字', custom: '作者实现（实际图型见 visual）'
};

/* 不计入表达丰富度的族：表格与结构化文字是查数与陈述，不是把数据变成图形。
   放在形式登记表里，是因为它与具体形式绑定；丰富度合同与布局合同都用这一个定义。 */
const NON_EXPRESSIVE_FAMILIES = ['table', 'text'];

const list = () => Object.keys(FORMS);
const get = form => {
  const entry = FORMS[form];
  if (!entry) throw new Error('未知图示形式: ' + form + '（可用：' + list().join('、') + '）');
  return Object.assign({ form }, entry);
};
const familyOf = form => get(form).family;
/* 该形式是否把数据变成图形：false 表示它只承载查数或陈述，凑数时不算一种表达。 */
const expressive = form => { try { return !NON_EXPRESSIVE_FAMILIES.includes(familyOf(form)); } catch (error) { return false; } };
/* 旁解读入口：'layer' 走通用标注层（annotations），'comparisons' 用该形式自带的 Δ 入口，null 表示尚未接入。 */
const annotationEntry = form => get(form).annotation || null;
const byFamily = () => list().reduce((groups, form) => {
  const family = FORMS[form].family;
  (groups[family] = groups[family] || []).push(form);
  return groups;
}, {});

module.exports = { version: '1.1.0', forms: FORMS, familyLabels: FAMILY_LABELS, NON_EXPRESSIVE_FAMILIES, list, get, familyOf, expressive, annotationEntry, byFamily };
