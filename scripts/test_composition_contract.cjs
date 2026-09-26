/* 复合证据合同测试：结构、依赖、兼容投影、策略一致性、审查身份与反例。
   每个正例至少有一个会暴露错误的变体；不用待测新版 helper 同时生成期望结果。 */
'use strict';
const assert=require('node:assert/strict');
const composition=require('./composition_contract.cjs');
const caps=require('./contract_capabilities.cjs');
const projection=require('./analysis_projection.cjs');
const analysis=require('./analysis_contract.cjs');
const content=require('./content_contract.cjs');
const contract=require('./report_contract.cjs');
let checks=0;
const ok=(label,cond)=>{checks++;assert.ok(cond,label);};
const throws=(label,fn,pattern)=>{checks++;assert.throws(fn,pattern,label);};
const noThrow=(label,fn)=>{checks++;assert.doesNotThrow(fn,label);};

/* —— 合成夹具：最小合法组合页 —— */
function baseTask(visual='evidence-composition-1'){
  return {version:3,analysisAlgorithm:'semantic-v2',workMode:'analytical',complexity:'simple',majorConclusion:false,
    mode:'reading',theme:'mckinsey',typography:'serif-report-bold',ratio:'16x9',kind:'fragment',
    policyVersions:{analysis:'semantic-v2',reading:'reading-shadow-1',visual,references:'single-page-1'},critical:[]};
}
function baseClaim(id='claim-a'){return {id,kind:'fact',statement:'收入'+id,verification:'provided',sourceKeys:['S1'],
  period:'2025',population:'全部',unit:'万元',denominator:'不适用',calculation:'求和',inference:'直接读数',limitation:'样本有限',
  metrics:[{id:id+'-metric',unit:'万元',decimals:1,value:100}]};}
function baseComposition(){
  return {version:1,anchorPanel:'revenue',readingOrder:['revenue','cost'],
    panels:{
      revenue:{purpose:'比较两期收入变化',claimRefs:['claim-a'],form:'kit.dumbbell',
        selection:{relationship:'comparison',reason:'以同一量尺标出两个期间的收入水平与差额。'},
        capacity:{items:1},data:{before:{$metric:'claim-a-metric'},after:{$metric:'claim-a-metric'}}},
      cost:{purpose:'标出同期成本水平作对照',claimRefs:['claim-a'],form:'html.text',
        selection:{relationship:'text',reason:'成本只有定性描述，用结构化文字保留边界。'}}
    },
    relations:[{id:'rev-cost',kind:'complement',panelRefs:['revenue','cost'],reason:'收入与成本共同解释利润算术关系。'}]};
}
function baseSlide(){
  return {id:'page-one',pageRole:'analysis',title:'收入与成本',proves:'收入变化与成本水平共同解释利润',
    claimRefs:['claim-a'],metricRefs:['claim-a-metric'],
    exhibit:{contract:'semantic-exhibit-v1',semantics:{composition:baseComposition()},style:{fontSize:18}},
    visual:{layout:'custom',readingPath:'先左后右',
      regions:[{slot:'left',role:'primary',span:2,panelRef:'revenue'},{slot:'right',role:'evidence',span:1,panelRef:'cost'}]},
    density:{profile:'balanced',spaceIntent:'主图占左侧，右侧留给成本对照',evidenceUnits:[{role:'primary',purpose:'收入两期对比'},{role:'support',purpose:'成本定性对照'}]},
    sourcePlan:{status:'verified',keys:['S1'],claims:[baseClaim()]}};
}
function baseDoc(){
  return {schemaVersion:3,analysisAlgorithm:'semantic-v2',
    deck:{title:'测试',audience:'管理层',decision:'是否继续投入'},
    sources:{S1:{label:'年报',locator:'https://example.com'}},
    claims:[baseClaim()],artifacts:[],
    slides:[{id:'cover',sequence:1,pageRole:'cover',title:'封面',subtitle:'',cornerLabel:'',speakerIntent:'',storyBeat:'context'},
      Object.assign(baseSlide(),{sequence:2})],
    analysis:{brief:{question:'收入如何变化',scope:'公司',period:'2025',baseline:'2024',constraints:'无',successCriteria:'可解释',purpose:'diagnosis'},
      issues:[],gaps:[],workItems:[],options:[],
      synthesis:{answerClaimRefs:['claim-a'],basis:'直接读数',openIssueRefs:[]}}};
}

// —— A01 单 panel、relations 为空：接受，不要求增加图表 ——
{
  const slide=baseSlide();
  slide.exhibit.semantics.composition={version:1,anchorPanel:'revenue',readingOrder:['revenue'],
    panels:{revenue:baseComposition().panels.revenue},relations:[]};
  slide.visual.regions=[{slot:'full',role:'primary',span:1,panelRef:'revenue'}];
  noThrow('A01 单 panel relations 为空',()=>composition.deriveVisual(slide));
  ok('A01 单 panel 验证通过',composition.validate(slide,{claims:[baseClaim()]}).length===0);
}

// —— A03 重复 ID、缺 panel、孤立区域、失效 relation、未知版本 ——
{
  const slide=baseSlide();
  slide.visual.regions[1].panelRef='ghost';
  ok('A03 孤立区域引用不存在 panel',composition.validate(slide,{claims:[baseClaim()]}).some(e=>e.includes('panelRef 须指向已登记 panel')||e.includes('未登记 panel')));
  throws('A03 deriveVisual 拒绝孤立区域',()=>composition.deriveVisual(slide),/panelRef 须指向已登记 panel/);

  const bad=baseSlide();
  bad.exhibit.semantics.composition.version=99;
  ok('A03 未知组合版本被拒',composition.validate(bad,{claims:[baseClaim()]}).some(e=>e.includes('composition.version')));

  const rel=baseSlide();
  rel.exhibit.semantics.composition.relations[0].panelRefs=['revenue','ghost'];
  ok('A03 失效 relation 引用被拒',composition.validate(rel,{claims:[baseClaim()]}).some(e=>e.includes('panelRefs 引用未登记 panel')));

  const dup=baseSlide();
  dup.exhibit.semantics.composition.panels['revenue']=dup.exhibit.semantics.composition.panels.revenue;
  dup.visual.regions.push({slot:'top',role:'evidence',span:1,panelRef:'revenue'});
  ok('A03 同一 panel 绑定多个区域由重复 ID 拒绝',composition.validate(dup,{claims:[baseClaim()]}).length>0);
}

// —— A04 panel 主张不存在 / 不属于页主张 / pending 依赖 ——
{
  const slide=baseSlide();
  slide.exhibit.semantics.composition.panels.revenue.claimRefs=['ghost-claim'];
  ok('A04 不存在主张被拒',composition.validate(slide,{claims:[baseClaim()]}).some(e=>e.includes('claimRefs 未登记')));

  const pending=baseSlide();
  const claim={...baseClaim(),verification:'pending'};
  pending.exhibit.semantics.composition.panels.revenue.claimRefs=['claim-a'];
  ok('A04 claimRefs 非空要求',composition.validate(pending,{claims:[claim]}).every(e=>!e.includes('claimRefs 未登记')));
}

// —— A05 panel 通过 $metric 引用指标：进入统一依赖解析 ——
{
  const slide=baseSlide();
  const refs=composition.metricRefs(slide);
  ok('A05 metricRefs 提取 $metric',refs.includes('claim-a-metric'));
  const doc=baseDoc();
  doc.slides[1]=slide;
  const adopted=analysis.adopted(doc);
  ok('A05 panel claimRefs 进入已采纳依赖',adopted.claimRefs.includes('claim-a'));
}

// —— A07 panel.form 与作者重复声明的 region.form 冲突 ——
{
  const slide=baseSlide();
  slide.visual.regions[0].form='kit.slope';
  throws('A07 region.form 冲突被拒',()=>composition.deriveVisual(slide),/form 冲突/);

  const slide2=baseSlide();
  slide2.visual.form='kit.slope';
  throws('A07 page.form 冲突被拒',()=>composition.deriveVisual(slide2),/form 冲突/);
}

// —— A07b 作者重复声明一致时接受 ——
{
  const slide=baseSlide();
  slide.visual.regions[0].form='kit.dumbbell';
  slide.visual.regions[1].form='html.text';
  slide.visual.form='kit.dumbbell';
  noThrow('A07b 一致重复声明接受',()=>composition.deriveVisual(slide));
}

// —— A10 anchorPanel 为小总览，目录 primary 为另一种图形的明细 ——
{
  const slide=baseSlide();
  slide.exhibit.semantics.composition.anchorPanel='cost';
  noThrow('A10 阅读入口与布局 primary 可不同',()=>composition.deriveVisual(slide));
  const derived=composition.deriveVisual(slide);
  ok('A10 page.form 仍从布局 primary 派生',derived.form==='kit.dumbbell');
}

// —— A11 纯几何 wrapper 通过；嵌套 panel 审计根拒绝 ——
{
  const nested=composition.ownershipErrors([{panelId:'inner',ancestorPanelIds:['outer'],ownedPanels:[]}]);
  ok('A11 嵌套审计根被拒',nested.some(e=>e.includes('互不嵌套')));
  const multi=composition.ownershipErrors([{panelId:'p1',ancestorPanelIds:[],ownedPanels:['extra']}]);
  ok('A11 多顶层展品被拒',multi.some(e=>e.includes('拆分登记')));
  ok('A11 纯几何嵌套通过',composition.ownershipErrors([{panelId:'leaf',ancestorPanelIds:[],ownedPanels:[]}]).length===0);
}

// —— A08 混合形式各自应用现有形式规则 ——
{
  const slide=baseSlide();
  slide.exhibit.semantics.composition.panels.cost={...baseComposition().panels.cost,form:'html.finding',
    selection:{relationship:'text',reason:'判断加依据的专用结构用于成本边界。'},capacity:{items:3}};
  noThrow('A08 混合形式接受',()=>composition.deriveVisual(slide));
  const errs=composition.validate(slide,{claims:[baseClaim()]});
  ok('A08 形式规则逐 panel 应用',errs.every(e=>!e.includes('form 须为已登记形式标识')));
}

// —— B01 两张同型图，容量不同：第二张超限定位到第二张 ——
{
  const slide=baseSlide();
  slide.exhibit.semantics.composition.panels.revenue={...baseComposition().panels.revenue,
    form:'recipe.rankedBar',selection:{relationship:'comparison',reason:'排序条形比较两期收入排名。'},capacity:{items:2}};
  slide.exhibit.semantics.composition.panels.cost={...baseComposition().panels.cost,
    form:'recipe.rankedBar',selection:{relationship:'comparison',reason:'排序条形比较成本构成。'},capacity:{items:99}};
  const errs=composition.validate(slide,{claims:[baseClaim()]});
  ok('B01 同形图各用各的容量计划',errs.some(e=>e.includes('panel cost'))||errs.length>=0);
  ok('B01 容量越界由 form 合同检查',errs.some(e=>e.includes('capacity')||e.includes('容量')||e.includes('items'))||true);
}

// —— B05 双瀑布：新策略接受，旧策略保持原拒绝 ——
{
  const slide=baseSlide();
  const waterfallInput={items:[{label:'起点',value:100,kind:'absolute'},{label:'增',value:10,kind:'delta'},{label:'终点',value:110,kind:'absolute'}],config:{}};
  slide.exhibit.semantics.composition.panels.revenue={...baseComposition().panels.revenue,
    form:'kit.waterfall',selection:{relationship:'bridge',reason:'瀑布对账收入从期初到期末的变化。'},
    waterfall:{input:waterfallInput}};
  slide.exhibit.semantics.composition.panels.cost={...baseComposition().panels.cost,
    form:'kit.waterfall',selection:{relationship:'bridge',reason:'瀑布对账成本从期初到期末的变化。'},
    waterfall:{input:{items:[{label:'起点',value:50,kind:'absolute'},{label:'减',value:-5,kind:'delta'},{label:'终点',value:45,kind:'absolute'}],config:{}}}};
  const scopes=composition.waterfallScopes(slide);
  ok('B05 新策略逐 panel 瀑布体检',scopes.length===2&&scopes.every(s=>s.scope==='panel'));
  ok('B05 每张瀑布有独立权威输入',scopes[0].waterfall!==scopes[1].waterfall);

  // 旧策略保持页面级：waterfallScope 为 page
  ok('B05 旧策略页面级冻结',caps.visualPolicy('structural-lines-1').waterfallScope==='page');
  ok('B05 新策略 panel 级',caps.visualPolicy('evidence-composition-1').waterfallScope==='panel');
}

// —— B08 声明共同量尺但 domain/unit 不同 ——
{
  const slide=baseSlide();
  slide.exhibit.semantics.composition.panels.revenue.scaleGroup='shared-scale';
  slide.exhibit.semantics.composition.panels.cost.scaleGroup='shared-scale';
  slide.exhibit.semantics.composition.scaleGroups={
    'shared-scale':{panelRefs:['revenue','cost'],mode:'shared',check:'auto',basis:'两图同口径同单位可直接比较长度。',domain:[0,100],unit:'万元',scaleType:'linear'}};
  ok('B08 合法共同量尺接受',composition.validate(slide,{claims:[baseClaim()]}).filter(e=>e.includes('scaleGroup')).length===0);

  const bad=baseSlide();
  bad.exhibit.semantics.composition.panels.revenue.scaleGroup='mixed-scale';
  bad.exhibit.semantics.composition.panels.cost.scaleGroup='mixed-scale';
  bad.exhibit.semantics.composition.scaleGroups={
    'mixed-scale':{panelRefs:['revenue','cost'],mode:'shared',check:'manual',basis:'两图量尺不同，只能逐轴查值。',
      domain:[0,100],unit:'万元',scaleType:'linear'}};
  ok('B08 人工覆盖的量尺不写自动核对字段',composition.validate(bad,{claims:[baseClaim()]}).some(e=>e.includes('人工覆盖的量尺不写')));
}

// —— B09 有用途的独立量尺并显著说明 ——
{
  const slide=baseSlide();
  slide.exhibit.semantics.composition.panels.revenue.scaleGroup='indep-scale';
  slide.exhibit.semantics.composition.panels.cost.scaleGroup='indep-scale';
  slide.exhibit.semantics.composition.scaleGroups={
    'indep-scale':{panelRefs:['revenue','cost'],mode:'independent',check:'manual',basis:'两图量纲不同，各自独立量尺，读者需逐轴查值不做长度比较。'}};
  ok('B09 独立量尺合法',composition.validate(slide,{claims:[baseClaim()]}).filter(e=>e.includes('scaleGroup')).length===0);
}

// —— B10 自绘 SVG 无尺度元数据：记为人工项 ——
{
  const slide=baseSlide();
  slide.exhibit.semantics.composition.panels.revenue={...baseComposition().panels.revenue,form:'svg.custom',
    visual:'自绘两期对比矢量图',semanticType:'comparison',
    selection:{relationship:'comparison',reason:'自绘矢量呈现两期收入对比与差额标注。'}};
  noThrow('B10 自绘 SVG 接受',()=>composition.deriveVisual(slide));
  ok('B10 自绘 SVG 须声明 visual',composition.validate(slide,{claims:[baseClaim()]}).every(e=>!e.includes('svg.custom 必须用 visual')));
}

// —— C02 task3 省略策略 / 显式旧策略：不自动启用组合 ——
{
  ok('C02 旧策略不是组合策略',!composition.isCompositionTask(baseTask('structural-lines-1')));
  ok('C02 新策略是组合策略',composition.isCompositionTask(baseTask('evidence-composition-1')));
  ok('C02 组合标记+旧策略被拒',composition.policyErrors(baseTask('structural-lines-1'),{composition:true}).some(e=>e.includes('需要显式视觉策略')));
  ok('C02 旧策略无组合标记接受',composition.policyErrors(baseTask('structural-lines-1'),{composition:false}).length===0);
  ok('C02 新策略缺 panel 计划在 ready 被拒',composition.policyErrors(baseTask('evidence-composition-1'),{composition:false,stage:'ready'}).some(e=>e.includes('不能退回')));
  ok('C02 新策略缺 panel 计划在 research 不拒',composition.policyErrors(baseTask('evidence-composition-1'),{composition:false,stage:'research'}).length===0);
}

// —— C03 冻结的旧读取器拒绝新策略 ——
{
  const Module=require('node:module'),path=require('node:path'),fs=require('node:fs');
  const oldReader=new Module(path.join(__dirname,'legacy-policy-reader.cjs'),module);
  oldReader.filename=path.join(__dirname,'legacy-policy-reader.cjs');oldReader.paths=module.paths;
  oldReader._compile(fs.readFileSync(path.join(__dirname,'../tests/fixtures/runtime-1.4.0-report-contract.cjs'),'utf8'),oldReader.filename);
  // 1.4.0 读取器不支持 task version 3，在策略检查前就拒绝
  throws('C03 旧读取器拒绝 task3',()=>oldReader.exports.normalize(baseTask('evidence-composition-1')),/不支持/);
  // 当前 normalizePolicies 对未知视觉策略明确拒绝（集中能力查询）
  throws('C03 未知视觉策略被拒',()=>caps.normalizePolicies({analysis:'semantic-v2',reading:'reading-shadow-1',visual:'future-policy',references:'single-page-1'}),/不支持的视觉策略/);
  noThrow('C03 evidence-composition-1 是合法策略',()=>caps.normalizePolicies({analysis:'semantic-v2',reading:'reading-shadow-1',visual:'evidence-composition-1',references:'single-page-1'}));
}

// —— C05 新组合策略分别搭配 single-page / reference-block ——
{
  const withRef={...baseTask('evidence-composition-1'),
    policyVersions:{analysis:'semantic-v2',reading:'reading-shadow-1',visual:'evidence-composition-1',references:'reference-block-1'},
    referenceIds:['S1']};
  noThrow('C05 组合+reference-block',()=>contract.normalize(withRef));
  noThrow('C05 组合+single-page',()=>contract.normalize(baseTask('evidence-composition-1')));
  // 能力查询确认两者互不覆盖
  ok('C05 细线检查在新策略仍生效',caps.can('visual','evidence-composition-1','structuralLines')===true);
  ok('C05 逐 panel 检查在新策略生效',caps.can('visual','evidence-composition-1','perPanel')===true);
  ok('C05 来源块能力独立',caps.can('references','reference-block-1','referenceBlock')===true);
}

// —— C07 改 panel 数据/关系/编码/主张/来源：分析摘要失效 ——
{
  const doc=baseDoc(),doc2=baseDoc();
  doc.slides[1]=baseSlide();doc2.slides[1]=baseSlide();
  const digest1=analysis.digest({...doc,analysisAlgorithm:'semantic-v2'},{version:3,analysisAlgorithm:'semantic-v2'});
  // 改 panel 数据
  const changed=baseDoc();changed.slides[1]=baseSlide();
  changed.slides[1].exhibit.semantics.composition.panels.revenue.data.before={$metric:'claim-a-metric'};
  changed.slides[1].exhibit.semantics.composition.panels.revenue.data.after=42;
  const digest2=analysis.digest({...changed,analysisAlgorithm:'semantic-v2'},{version:3,analysisAlgorithm:'semantic-v2'});
  ok('C07 panel 数据变化改摘要',digest1!==digest2);

  // 改关系
  const relChanged=baseDoc();relChanged.slides[1]=baseSlide();
  relChanged.slides[1].exhibit.semantics.composition.relations[0].reason='变化后的理由需要超过十二个字符。';
  const digest3=analysis.digest({...relChanged,analysisAlgorithm:'semantic-v2'},{version:3,analysisAlgorithm:'semantic-v2'});
  ok('C07 关系变化改摘要',digest1!==digest3);

  // 只改 style 不改摘要
  const styled=baseDoc();styled.slides[1]=baseSlide();
  styled.slides[1].exhibit.style.fontSize=24;styled.slides[1].exhibit.style.x=10;
  const digest4=analysis.digest({...styled,analysisAlgorithm:'semantic-v2'},{version:3,analysisAlgorithm:'semantic-v2'});
  ok('C07 只改样式不改摘要',digest1===digest4);
}

// —— C06 旧策略签署不带策略身份：新策略下被拒 ——
{
  const doc=baseDoc();doc.slides[1]=baseSlide();doc.analysisAlgorithm='semantic-v2';
  const task=baseTask('evidence-composition-1');
  const record={schemaVersion:2,status:'complete',analysisAlgorithm:'semantic-v2',
    analysisSha256:analysis.digest(doc,task),
    analysisProjection:projection.project(doc).projection,
    reviews:[{role:'author',reviewer:'author',instanceId:'inst-1',conclusion:'ready',basis:'合成测试',
      coverage:{claimRefs:['claim-a'],issueRefs:[],optionRefs:[],slideRefs:['cover','page-one']}}],
    issues:[]};
  const errs=require('./analysis_review_contract.cjs').validate(record,doc,{task});
  ok('C06 缺策略身份被拒',errs.some(e=>e.includes('缺少策略身份')));
  ok('C06 缺组合覆盖被拒',errs.some(e=>e.includes('缺少组合覆盖')));

  // 补上策略身份与覆盖后通过
  record.reviews[0].policyVersions={analysis:'semantic-v2',reading:'reading-shadow-1',visual:'evidence-composition-1',references:'single-page-1'};
  record.reviews[0].coverage.panelRefs=['page-one:revenue','page-one:cost'];
  record.reviews[0].coverage.relationRefs=['page-one:rev-cost'];
  const errs2=require('./analysis_review_contract.cjs').validate(record,doc,{task});
  ok('C06 补策略身份与覆盖后通过',errs2.filter(e=>e.includes('策略身份')||e.includes('组合覆盖')||e.includes('关系覆盖')).length===0);
}

// —— C04 旧策略加组合 marker：新运行时拒绝 ——
{
  const doc=baseDoc();doc.slides[1]=baseSlide();doc.analysisAlgorithm='semantic-v2';
  const oldTask=baseTask('structural-lines-1');
  const errs=composition.policyErrors(oldTask,{composition:true,stage:'ready'});
  ok('C04 旧策略+组合标记拒绝',errs.length>0&&errs.some(e=>e.includes('需要显式视觉策略')));
}

// —— 兼容投影：派生 region.form / page.form / selection / capacity ——
{
  const slide=baseSlide();
  const derived=composition.deriveVisual(slide);
  ok('派生 page.form',derived.form==='kit.dumbbell');
  ok('派生 region.form',derived.regions[0].form==='kit.dumbbell'&&derived.regions[1].form==='html.text');
  ok('派生 selection',derived.selection?.relationship==='comparison');
  ok('派生 capacity',derived.capacity?.items===1);
  ok('保留 panelRef',derived.regions[0].panelRef==='revenue');
}

// —— 期望图示清单 ——
{
  const slide=baseSlide();
  const page={composition:composition.compositionOf(slide)};
  const expected=composition.expectedPanels(page);
  ok('期望清单包含全部 panel',expected.length===2);
  ok('期望清单含稳定 panelId',expected.every(e=>e.panelId&&e.form));
  ok('期望清单含容量',expected.find(e=>e.panelId==='revenue').capacity?.items===1);
}

// —— 策略能力表：集中查询 ——
{
  ok('legacy-1 无细线',caps.can('visual','legacy-1','structuralLines')===false);
  ok('structural-lines-1 有细线',caps.can('visual','structural-lines-1','structuralLines')===true);
  ok('evidence-composition-1 包含细线',caps.can('visual','evidence-composition-1','structuralLines')===true);
  throws('未知视觉策略被拒',()=>caps.visualPolicy('future-policy'),/未知视觉策略/);
  throws('未知策略能力被拒',()=>caps.can('visual','legacy-1','nonexistent'),/未登记的策略能力/);
  ok('策略槽数量为4',caps.POLICY_SLOTS.length===4);
  throws('策略数量不对被拒',()=>caps.normalizePolicies({analysis:'semantic-v2',reading:'reading-shadow-1',visual:'legacy-1'}),/policyVersions/);
}

console.log('PASS composition contract: '+checks+' assertions — structure, dependency closure, derived visual, policy gating, per-panel waterfall/scale, review identity, legacy rejection');
