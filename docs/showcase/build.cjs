/* README 图表演示：使用本项目实际渲染器，所有业务数据均为虚构。
 * 从仓库根目录运行 node docs/showcase/build.cjs；需要 npm ci 与本地 Chrome。
 * PNG 保存在本目录；中间 HTML 保存在被忽略的 renders/readme/。
 */
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const kit = require('../../assets/exhibit-kit.js');
const bridge = require('../../assets/waterfall-bridge.js');
const {render} = require('../../scripts/render_echarts_svg.cjs');
const root = path.resolve(__dirname, '../..');
const work = path.join(root, 'renders/readme');
fs.mkdirSync(work, {recursive: true});
const size = {width: 1152, height: 380, fontSize: 18};
const waterfall = bridge.diagnose({items: [
  {label: '上期利润', type: 'total', value: 120},
  {label: '销量增长', type: 'delta', value: 48},
  {label: '价格提升', type: 'delta', value: 22},
  {label: '产品结构', type: 'delta', value: 15},
  {label: '履约成本', type: 'delta', value: -28},
  {label: '营销投入', type: 'delta', value: -17},
  {label: '本期利润', type: 'total', value: 160}
], config: {mode: 'bridge', metric_type: 'currency', metric: '经营利润', unit: '万元', source: '虚构演示数据', decimals: 0}});
if (waterfall.status !== 'ready') throw Error(JSON.stringify(waterfall.issues));
bridge.present(waterfall);
const demos = [
  {id: 'sankey', form: 'recipe.sankey', name: '桑基图 · 流向与去向',
    title: '销售额集中在线上，收入去向仍需拆开看',
    unit: '虚构渠道收入流向｜单位：万元；各中间节点流入 = 流出',
    svg: render({...size, fontSize: 14, recipe: 'sankey', spec: {
      nodes: [{name:'总销售额',colorIndex:0},{name:'线上渠道',colorIndex:0},{name:'线下渠道',colorIndex:1},{name:'产品成本',colorIndex:4},{name:'渠道费用',colorIndex:3},{name:'贡献利润',colorIndex:1}],
      links: [{source:'总销售额',target:'线上渠道',value:600},{source:'总销售额',target:'线下渠道',value:400},{source:'线上渠道',target:'产品成本',value:300},{source:'线上渠道',target:'渠道费用',value:180},{source:'线上渠道',target:'贡献利润',value:120},{source:'线下渠道',target:'产品成本',value:200},{source:'线下渠道',target:'渠道费用',value:80},{source:'线下渠道',target:'贡献利润',value:120}],nodeWidth:18,nodeGap:35
    }}).pages[0].svg,
    notes: ['线上占销售额 60%，贡献利润为 120 万元，与线下相同。', '带宽编码金额；这份去向拆解不等于对渠道效果的因果判断。']},
  {id: 'waterfall', form: 'kit.waterfall', name: '瀑布图 · 增减贡献',
    title: '利润净增 40 万元，成本与投入抵消部分增长',
    unit: '虚构两期经营利润桥接｜单位：万元；120 + 48 + 22 + 15 − 28 − 17 = 160',
    svg: kit.waterfall({...size, waterfall}),
    notes: ['正向贡献共 85 万元，履约成本与营销投入合计减少 45 万元。', '起点、增量、终点经过内核对账；描述性分解不证明因果。']},
  {id: 'mekko', form: 'kit.mekko', name: 'Mekko 图 · 规模 × 构成',
    title: '大市场不一定更偏线上，规模与结构要一起看',
    unit: '虚构市场销售额｜列宽 = 市场规模；列内高度 = 渠道份额；面积 = 销售额',
    svg: kit.mekko({...size, labelContent: 'share', items: [
      {label:'市场 A',segments:[{label:'线上',value:300},{label:'线下',value:200}]},
      {label:'市场 B',segments:[{label:'线上',value:120},{label:'线下',value:180}]},
      {label:'市场 C',segments:[{label:'线上',value:160},{label:'线下',value:40}]}
    ]}),
    notes: ['市场 A 占总规模 50%；市场 C 的线上份额最高，为 80%。', '份额高与规模大是两个问题，不能只凭渠道渗透率分配预算。']},
  {id: 'heatmap', form: 'kit.heatmap', name: '矩阵热力图 · 条件与敏感性',
    title: '毛利率为 35% 时，获客成本 35 元是单笔贡献零点',
    unit: '虚构订单模型｜单笔贡献（元）= 100 × 毛利率 − 获客成本；不含固定费用',
    svg: kit.heatmap({...size, rows:['毛利率 25%','毛利率 35%','毛利率 45%','毛利率 55%'], columns:['CAC 15 元','CAC 25 元','CAC 35 元','CAC 45 元','CAC 55 元'], values:[[10,0,-10,-20,-30],[20,10,0,-10,-20],[30,20,10,0,-10],[40,30,20,10,0]],domain:[-30,40]}),
    notes: ['毛利率 35%、获客成本 35 元时，单笔贡献为 0。', '色阶从浅到深对应 −30 至 40 元；这是敏感性演示，不是盈利预测。']},
  {id: 'dumbbell', form: 'kit.dumbbell', name: '哑铃图 · 前后差距',
    title: '东区与西区改善幅度相同，期末水平仍有差距',
    unit: '虚构客户续费率｜单位：%；相同客户定义与统计窗口，比较同口径两期',
    svg: kit.dumbbell({...size,startLabel:'上期',endLabel:'本期',domain:[40,100],items:[{label:'东区',start:62,end:84},{label:'南区',start:72,end:80},{label:'西区',start:48,end:70},{label:'北区',start:78,end:82}]}),
    notes: ['东区与西区都提高 22 个百分点，本期续费率相差 14 个百分点。', '圆点位置编码续费率；增长幅度与当前水平应分别判断。']},
  {id: 'bullet', form: 'kit.bullet', name: '子弹图 · 实际与目标',
    title: '三项指标中仅续费率达标，履约仍有 9 点缺口',
    unit: '虚构运营指标｜单位：%；实心条 = 实际值，竖线 = 目标值；共同量尺 0–100',
    svg: kit.bullet({...size,items:[{label:'准时交付率',value:86,target:95,max:100},{label:'工单解决率',value:78,target:90,max:100},{label:'客户续费率',value:88,target:85,max:100}]}),
    notes: ['准时交付率距离目标 9 个百分点，工单解决率距离目标 12 个百分点。', '背景只表示共同的 0–100% 量尺；未设定好、中、差等主观分档。']}
];
const fontCss = pathToFileURL(path.join(root,'assets/fonts/deck-fonts.css')).href;
function shell(content, extra = '') {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="${fontCss}"><style>
  *{box-sizing:border-box}body{margin:0;background:#edf1f4;color:#172c3b;font-family:'Deck Inter','Deck Noto Sans SC',sans-serif;font-synthesis:none}
  .sample{width:1280px;height:720px;background:white;padding:34px 64px 30px;margin:0 0 20px;position:relative}
  .eyebrow{display:flex;justify-content:space-between;font-size:13px;letter-spacing:1px;color:#50606e}
  h1{font-family:'Deck Noto Serif SC',serif;font-size:32px;font-weight:700;line-height:1.4;margin:20px 0 16px;color:#000080}
  .unit{font-size:15px;border-top:1px solid #bfcbd2;padding-top:16px;margin-bottom:12px;color:#50606e}
  .chart{height:380px}.chart svg{display:block}.notes{display:grid;grid-template-columns:1fr 1fr;gap:36px;border-top:1px solid #bfcbd2;margin-top:10px;padding-top:14px;font-size:17px;line-height:1.55}
  footer{position:absolute;bottom:24px;font-size:12px;color:#50606e;width:1152px;display:flex;justify-content:space-between}
  ${extra}</style>${content}</html>`;
}
async function main(){
  const html = shell(demos.map((d,i)=>`<section class="sample" id="${d.id}"><div class="eyebrow"><span>CONSULTING REPORT FORGE / ${d.name}</span><span>虚构数据 · 能力演示</span></div><h1>${d.title}</h1><div class="unit">${d.unit}</div><div class="chart">${d.svg}</div><div class="notes">${d.notes.map(n=>`<div>${n}</div>`).join('')}</div><footer><span>来源：项目自建演示数据；仅展示图表表达，不构成商业建议。</span><span>${String(i+1).padStart(2,'0')} / 06</span></footer></section>`).join(''));
  fs.writeFileSync(path.join(work,'charts.html'),html);
  const browser = await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:740},deviceScaleFactor:1});
    await page.goto(pathToFileURL(path.join(work,'charts.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    for(const d of demos) await page.locator('#'+d.id).screenshot({path:path.join(__dirname,'chart-'+d.id+'.png')});
    const images=['report-priority','report-ranges','report-sensitivity','report-action'];
    const labels=['01 / 判断与证据','02 / 区间与口径','03 / 模型与敏感性','04 / 行动与门槛'];
    const hero=shell(`<div class="hero"><div class="hero-head"><span>从研究材料，到有依据的决策</span><small>真实报告选页 · TikTok 全球商业化</small></div><div class="grid">${images.map((n,i)=>`<div><img src="${pathToFileURL(path.join(__dirname,n+'.png')).href}"><p>${labels[i]}</p></div>`).join('')}</div></div>`,`.hero{width:1600px;padding:40px;background:#edf1f4}.hero-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:28px}.hero-head>span{font:700 30px 'Deck Noto Serif SC';color:#000080}.hero-head small{font-size:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px 24px}.grid img{display:block;width:100%;border:1px solid #d5dee4}.grid p{font-size:16px;margin:10px 0 0}`);
    fs.writeFileSync(path.join(work,'hero.html'),hero);
    await page.setViewportSize({width:1600,height:1100});
    await page.goto(pathToFileURL(path.join(work,'hero.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.hero').screenshot({path:path.join(__dirname,'report-overview.png')});
    console.log(JSON.stringify({samples:demos.map(d=>({file:'chart-'+d.id+'.png',form:d.form})),waterfallReconciliation:waterfall.chart.reconciliation}));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
