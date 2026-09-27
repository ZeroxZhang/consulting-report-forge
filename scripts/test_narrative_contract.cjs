/* 叙事主线与单页焦点合同测试：弧线、逐页新增理解、核心答案落地、焦点节点、策略身份与旧策略兼容。
   每个正例至少配一个会暴露错误的变体；期望值不由待测 helper 生成。 */
'use strict';
const assert=require('node:assert/strict');
const narrative=require('./narrative_contract.cjs');
const caps=require('./contract_capabilities.cjs');
const reviewContract=require('./review_contract.cjs');
let checks=0;
const ok=(label,cond)=>{checks++;assert.ok(cond,label);};
const throws=(label,fn,pattern)=>{checks++;assert.throws(fn,pattern,label);};

const NARRATIVE='narrative-focus-1';
function task(visual=NARRATIVE){
  return {version:3,analysisAlgorithm:'semantic-v2',workMode:'analytical',complexity:'simple',majorConclusion:false,
    mode:'reading',theme:'mckinsey',typography:'serif-report-bold',ratio:'16x9',kind:'fragment',
    policyVersions:{analysis:'semantic-v2',reading:'reading-shadow-1',visual,references:'single-page-1'},critical:[]};
}
const cover={id:'cover',sequence:1,pageRole:'cover',storyBeat:'context',title:'封面',subtitle:'',cornerLabel:'',speakerIntent:''};
function page(id,seq,pageRole,storyBeat,title,proves,adds,claimRefs){
  return {id,sequence:seq,pageRole,storyBeat,title,proves,adds,claimRefs,
    subtitle:'',cornerLabel:'',speakerIntent:'',metricRefs:[],
    visual:{layout:'custom',form:'html.text',primary:'结构化文字',readingPath:'自上而下',
      regions:[{slot:'main',role:'primary',span:1,form:'html.text'}]},
    density:{profile:'balanced',spaceIntent:'主区承担本页判断，侧栏只放口径',evidenceUnits:[{role:'primary',purpose:'本页的主要判断'},{role:'support',purpose:'支撑的口径与边界'}]}};
}
function doc(){
  return {schemaVersion:3,analysisAlgorithm:'semantic-v2',
    deck:{title:'测试报告',audience:'管理层',decision:'是否试点',arc:'problem-to-fix',mode:'reading',ratio:'16x9'},
    sources:{},claims:[],artifacts:[],
    slides:[cover,
      page('p1',2,'analysis','diagnosis','收入下滑集中在商超','收入下滑集中在商超渠道','看到下滑集中在商超而非全渠道',['a']),
      page('p2',3,'analysis','insight','成本没有同步下降','成本与收入不同步','知道成本没跟着降，所以问题在两头挤压而不是单点',['b']),
      page('p3',4,'action','action','先试点两个渠道','先在高信号渠道试点','拿到可排期的试点范围、停止条件与验证指标',['a'])],
    analysis:{brief:{purpose:'diagnosis'},issues:[],gaps:[],workItems:[],options:[],
      synthesis:{answerClaimRefs:['a','b'],basis:'直接读数',openIssueRefs:[]}}};
}
const run=(d,t=task(),stage='synthesis')=>narrative.validate(d,{task:t,stage,claims:[]});

// —— A 弧线与推进 ——
{
  ok('A01 合法蓝图通过',run(doc()).length===0);
  const missing=doc();delete missing.deck.arc;
  ok('A01 缺弧线被拒',run(missing).some(e=>e.includes('deck.arc 须声明')));
  const bad=doc();bad.deck.arc='waterfall-ish';
  ok('A01 未登记弧线被拒',run(bad).some(e=>e.includes('deck.arc 须声明')));
  const other=doc();other.deck.arc='other';
  ok('A01 other 缺理由被拒',run(other).some(e=>e.includes('自定义弧线')));
  other.deck.arcReason='本册沿"先证伪再定位"的顺序推进，四条默认弧线都不覆盖这条路径。';
  ok('A01 other 有理由即可',run(other).length===0);
  const double=doc();double.deck.arcReason='多写一段理由，弧线本身不是 other，这属于双写。';
  ok('A01 非 other 写理由被拒',run(double).some(e=>e.includes('只在 deck.arc="other" 时使用')));
  const drift=doc();drift.slides[3].storyBeat='insight';
  ok('A02 弧线没有走到收束节拍被拒',run(drift).some(e=>e.includes('要求正文至少走到')));
}

// —— B 逐页新增理解 ——
{
  const missing=doc();delete missing.slides[1].adds;
  ok('B01 缺 adds 被拒',run(missing).some(e=>e.includes('adds 须说明至少')));
  const short=doc();short.slides[1].adds='看到下滑';
  ok('B01 adds 过短被拒',run(short).some(e=>e.includes('adds 须说明至少')));
  const dup=doc();dup.slides[2].adds=dup.slides[1].adds;
  ok('B02 相邻页同一件新增理解被拒',run(dup).some(e=>e.includes('近似重复')));
  const exempt=doc();exempt.slides[2].adds=exempt.slides[1].adds;
  exempt.slides[2].addsOverlapReason='两页必须并排比较同一批渠道，重复说明的是对照组而非同一结论。';
  ok('B02 写明理由后豁免',run(exempt).length===0);
  /* 反例：换个标点或加一个"的"不能算改过——相似度按字符二元组，不按字符串相等。 */
  const cosmetic=doc();cosmetic.slides[2].adds=cosmetic.slides[1].adds+'。';
  ok('B02 只改标点仍算重复',run(cosmetic).some(e=>e.includes('近似重复')));
  /* 本页新增的理解正好是另一页的标题：多半是两页分工重叠，交给人判断，不阻断编译。 */
  const overlap=narrative.duplicateAdds([{adds:'收入下滑集中在商超'},{adds:'渠道结构决定了资源该投向哪里',title:'收入下滑集中在商超'}],[0,1]);
  ok('B03 与另一页标题高度重合只出诊断',overlap.errors.length===0&&overlap.warnings.some(w=>w.message.includes('标题')));
  ok('B03 诊断不带阻断项',run(doc()).length===0&&narrative.diagnostics(doc(),{task:task()}).length===0);
  /* 复述自己的标题不算问题：本页新增的理解本来就常常等于本页的判断。 */
  const selfNarrative=doc();selfNarrative.slides[2].adds=selfNarrative.slides[2].title;
  ok('B03 复述自己的标题不报',narrative.diagnostics(selfNarrative,{task:task()}).every(w=>!w.message.includes('slides[2]')));
}

// —— C 核心答案必须落地 ——
{
  const orphan=doc();orphan.analysis.synthesis.answerClaimRefs=['a','b','never-carried'];
  ok('C01 核心答案无人承担被拒',run(orphan).some(e=>e.includes('核心答案没有被任何正文页承担')));
  const single=doc();single.analysis.synthesis.answerClaimRefs=['a'];
  ok('C01 被承担即可通过',run(single).length===0);
  const none=doc();none.analysis.synthesis.answerClaimRefs=[];
  ok('C01 没有回答主张时不误报',run(none).length===0);
}

// —— D 研究阶段与策略边界 ——
{
  const empty=doc();empty.slides=[cover];empty.deck.arc='evidence-to-view';
  ok('D01 研究阶段无正文页只要求弧线',run(empty,task(),'research').length===0);
  const drafts=doc();delete drafts.slides[1].adds;
  ok('D01 研究阶段不逐个要求 adds',run(drafts,task(),'research').length===0);
  ok('D02 综合阶段起逐个要求',run(drafts,task(),'synthesis').some(e=>e.includes('adds 须说明至少')));
  const legacy=doc();
  ok('D03 旧策略带新标记被拒',run(legacy,task('structural-lines-1')).some(e=>e.includes('需要显式视觉策略 '+NARRATIVE)));
  const plain=doc();delete plain.deck.arc;plain.slides.forEach(s=>delete s.adds);
  ok('D03 旧策略读旧稿不受影响',run(plain,task('structural-lines-1')).length===0);
  ok('D04 能力表包含关系成立',caps.visualPolicy(NARRATIVE).narrative===true
    &&caps.visualPolicy(NARRATIVE).composition===true&&caps.visualPolicy(NARRATIVE).structuralLines===true
    &&caps.visualPolicy('evidence-composition-1').narrative===false);
  ok('D04 旧策略能力保持不变',caps.visualPolicy('evidence-composition-1').panelIdentity===true&&caps.visualPolicy('legacy-1').structuralLines===false);
  ok('D04 未登记策略被拒',(()=>{try{caps.visualPolicy('narrative-focus-2');return false;}catch(e){return /未知视觉策略/.test(e.message);}})());
}

// —— E 单页焦点（成稿侧）——
{
  ok('E01 恰好一个收束节点通过',narrative.pageFocusErrors({takeaways:1},{page:3}).length===0);
  ok('E02 没有收束节点被拒',narrative.pageFocusErrors({takeaways:0},{page:3}).some(e=>e.includes('没有标记为 takeaway')));
  ok('E03 多个收束节点被拒',narrative.pageFocusErrors({takeaways:3},{page:3}).some(e=>e.includes('有 3 个')));
  ok('E04 未采集到事实时不误报',narrative.pageFocusErrors({takeaways:null},{page:3}).length===0);
  ok('E04 事实缺失也不崩',narrative.pageFocusErrors(undefined,{page:3}).length===0);
  const T='收入下滑集中在商超渠道，其他渠道没有同步下滑';
  const rep=fields=>narrative.samePageRepetition(fields,{page:2});
  ok('E05 副标题复述标题出诊断',rep({title:{font:32,text:T},lead:T}).some(w=>w.code==='N-SAME-PAGE-REPEAT'&&w.fields.join()==='title,lead'));
  ok('E05 收束句复述标题出诊断',rep({title:{font:32,text:T},lead:'单位：亿元｜期间：2025 全年',takeawayText:T}).some(w=>w.fields.join()==='title,takeawayText'));
  ok('E05 副标题写口径不误报',rep({title:{font:32,text:T},lead:'单位：亿元｜期间：2025 全年'}).length===0);
  /* 收束句合理地包含标题的判断，只是后面接了行动——这不是复述，不能误报。 */
  ok('E05 收束句在标题之上加行动不误报',
    rep({title:{text:'收入下滑集中在商超渠道'},lead:'单位：亿元',takeawayText:'收入下滑集中在商超渠道，因此先在高信号渠道试点，以增量测量决定扩张'}).length===0);
  /* 探针的 title 是对象、蓝图的可能是字符串；两种形状都必须读得出文字，否则这条检查会静默失效。 */
  ok('E05 纯字符串标题同样可读',rep({title:T,lead:T}).length===1);
  ok('E05 标题过短不比较',rep({title:{text:'收入'},lead:'收入'}).length===0);
  ok('E05 缺收束句文字时不崩',rep({title:{text:T},takeawayText:''}).length===0);
  ok('E06 重合率对"长句只是重说短句"敏感',
    narrative.overlapRatio('收入下滑集中在商超渠道','收入下滑集中在商超渠道')===1
    &&narrative.overlapRatio('收入下滑集中在商超渠道','收入下滑集中在商超渠道，因此先在高信号渠道试点并设停止条件')<0.85);
}

// —— F 审查身份与覆盖 ——
{
  const bodyRows=reviewContract.bodyRowsOf({rows:[
    {page:1,pageId:'cover',bookends:{role:'cover'}},
    {page:2,pageId:'p1',bookends:{role:'analysis'},focus:{takeawayText:'先在高信号渠道试点，以增量测量决定扩张'}},
    {page:3,pageId:'p2',bookends:{role:'analysis'},focus:{takeawayText:'成本没有同步下降'}},
    {page:4,pageId:'refs',bookends:{role:'references'}}]});
  ok('F00 正文页只取非书端',bodyRows.length===2&&bodyRows[0].pageId==='p1');
  const entry=readings=>({reviewer:'r1',independence:'author',narrativeReadings:readings});
  const good=entry([{slideId:'p1',observedTakeaway:'先在高信号渠道试点，以增量测量决定扩张'},
    {slideId:'p2',observedTakeaway:'成本没有同步下降'}]);
  ok('F01 逐页覆盖且与页面文字一致时通过',reviewContract.narrativeCoverageErrors(good,bodyRows).length===0);
  const missing=entry([{slideId:'p1',observedTakeaway:'先在高信号渠道试点，以增量测量决定扩张'}]);
  ok('F02 少一页即缺覆盖',reviewContract.narrativeCoverageErrors(missing,bodyRows).some(e=>e.includes('缺少叙事覆盖 p2')));
  const blank=entry([{slideId:'p1',observedTakeaway:''},{slideId:'p2',observedTakeaway:'成本没有同步下降'}]);
  ok('F02 留空被拒',reviewContract.narrativeCoverageErrors(blank,bodyRows).some(e=>e.includes('不能留空')));
  const short=entry([{slideId:'p1',observedTakeaway:'很好'},{slideId:'p2',observedTakeaway:'成本没有同步下降'}]);
  ok('F02 过短被拒',reviewContract.narrativeCoverageErrors(short,bodyRows).some(e=>e.includes('至少6字')));
  /* 抄蓝图声明而不是页面上的句子：这正是"填了但没看"最典型的形态。 */
  const fabricated=entry([{slideId:'p1',observedTakeaway:'本页新增的理解是读者知道该先试点哪些渠道'},{slideId:'p2',observedTakeaway:'成本没有同步下降'}]);
  ok('F03 抄声明而非页面文字被拒',reviewContract.narrativeCoverageErrors(fabricated,bodyRows).some(e=>e.includes('对不上')));
  const dup=entry([{slideId:'p1',observedTakeaway:'先在高信号渠道试点，以增量测量决定扩张'},{slideId:'p1',observedTakeaway:'先在高信号渠道试点，以增量测量决定扩张'}]);
  ok('F03 重复 slideId 被拒',reviewContract.narrativeCoverageErrors(dup,bodyRows).some(e=>e.includes('重复')));
  /* 审查者自己把两页写成同一句：读者从这两页拿到的就是同一件事。 */
  const same=entry([{slideId:'p1',observedTakeaway:'用三个可观察条件判断情景分岔'},{slideId:'p2',observedTakeaway:'用三个可观察条件判断情景分岔'}]);
  ok('F03 审查记录里两页收束句逐字相同被拒',reviewContract.narrativeCoverageErrors(same,bodyRows).some(e=>e.includes('几乎相同')));
  const explained=entry([{slideId:'p1',observedTakeaway:'用三个可观察条件判断情景分岔'},{slideId:'p2',observedTakeaway:'用三个可观察条件判断情景分岔'}]);
  explained.repetitionBasis=[['p1','p2','本章节回顾页有意复述判断，读者需要连续看到同一结论']];
  ok('F03 写明并排强调的理由后豁免',!reviewContract.narrativeCoverageErrors(explained,bodyRows).some(e=>e.includes('几乎相同')));
  /* 边界：字面测度抓不到同义改写。这条断言固定的是"已知不覆盖"，不是"已覆盖"。 */
  ok('F03 同义改写不在字面测度覆盖内',
    narrative.overlapRatio('知道名义总额不是现金，首付只占很小一部分','明白名义金额并不等于现金流入，预付款在其中占比很低')<0.2);
  const stray=entry([{slideId:'p1',observedTakeaway:'先在高信号渠道试点，以增量测量决定扩张'},{slideId:'p2',observedTakeaway:'成本没有同步下降'},{slideId:'ghost',observedTakeaway:'不存在的页'}]);
  ok('F03 引用非正文页被拒',reviewContract.narrativeCoverageErrors(stray,bodyRows).some(e=>e.includes('非正文页')));
  const noFocus=reviewContract.narrativeCoverageErrors(entry([{slideId:'p1',observedTakeaway:'第一页实际读到的收束判断'},{slideId:'p2',observedTakeaway:'第二页读到的另一条判断'}]),
    [{page:2,pageId:'p1'},{page:3,pageId:'p2'}]);
  ok('F03 未采集到页面文字时不误判内容',noFocus.length===0);

  // F04 审查层集合随策略扩展，且旧策略的层集合不变——历史稿不因新层被追溯作废。
  const threeLayers=['page','exhibit','annotation','typography'];
  ok('F04 旧策略四层',reviewContract.requiredLayers({policyVersions:{visual:'structural-lines-1'}}).length===4
    &&reviewContract.requiredLayers({policyVersions:{visual:'evidence-composition-1'}}).length===4);
  ok('F04 新策略五层含 narrative',
    reviewContract.requiredLayers({policyVersions:{visual:NARRATIVE}}).join('/')==='page/exhibit/annotation/typography/narrative');
  ok('F04 无策略按四层',reviewContract.requiredLayers({}).length===4&&reviewContract.requiredLayers(undefined).length===4);
  ok('F04 未知策略不冒充新层',reviewContract.requiredLayers({policyVersions:{visual:'nope-1'}}).length===4);
  ok('F04 layers 常量未被改写',threeLayers.every(l=>reviewContract.layers.includes(l))&&!reviewContract.layers.includes('narrative'));
}

// —— G 相似度本身的边界 ——
{
  ok('G01 完全相同为 1',narrative.similarity('成本没有同步下降','成本没有同步下降')===1);
  ok('G02 完全不同为 0',narrative.similarity('收入下滑集中在商超','先试点两个渠道')===0);
  ok('G03 空文本为 0',narrative.similarity('','收入下滑')===0&&narrative.similarity('收入下滑',undefined)===0);
  const partial=narrative.similarity('收入下滑集中在商超渠道','收入下滑集中在商超');
  ok('G03 包含关系判为高相似',partial>0.9);
  ok('G04 阈值关系正确',narrative.DUPLICATE_ADD<narrative.DUPLICATE_OTHER);
}

console.log('PASS narrative contract: '+checks+' assertions — arc, per-page advance, answer coverage, focus node, review identity, legacy compatibility');
