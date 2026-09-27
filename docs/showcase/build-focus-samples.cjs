/* 叙事主线与单页焦点代表页：两页推进（诊断 → 行动），每页恰有一个收束节点。
   合成输入，只验证工具链与合同，不生成任何通过审查记录。
   与 build-composition-samples.cjs 的区别：那份验的是"证据怎么组合"，这份验的是
   "整册有没有推进"与"一页有没有收束成一句"——即 narrative-focus-1 的新增能力。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),scripts=path.join(root,'scripts');
const content=require(path.join(scripts,'content_contract.cjs')),contract=require(path.join(scripts,'report_contract.cjs'));
const narrative=require(path.join(scripts,'narrative_contract.cjs'));
const out=path.join(root,'renders/focus-samples');
const POLICY=narrative.POLICY;

const value=(id,n,unit='万元',decimals=1)=>({id,value:n,unit,decimals});
const formula=(id,op,args,unit='万元')=>({id,formula:{op,args},unit,decimals:1});
const claim=(id,statement,metrics,limitation,kind='fact')=>({id,kind,statement,verification:'provided',sourceKeys:['S1'],period:'2024–2025',population:'合成业务',unit:'万元',denominator:'不适用',calculation:'按全局 metrics 公式复算',inference:'只说明所列关系',limitation,metrics});

function deckDoc(){
  const d=require('../../tests/fixtures/analysis_fixture.cjs').fixture();
  d.analysisAlgorithm='semantic-v2';
  d.deck.title='合成渠道诊断：先试点再看是否扩张';
  d.deck.decision='是否把资源转向两个高信号渠道';
  d.deck.audience='经营研究读者';
  d.deck.arc='problem-to-fix';
  d.sources={S1:{label:'合成输入，仅验证工具链',locator:'input.json · 全部数值'}};
  d.claims=[
    claim('raw-input','输入为合成分渠道两期销量与试点预算。',[
      value('super0',100),value('super1',82),value('conv0',100),value('conv1',94),
      value('online0',100),value('online1',109),value('budget',120)],'合成输入，不代表实际企业'),
    claim('finding','销量下滑集中在商超，其他渠道没有同步下滑。',[
      formula('super-change','subtract',['super0','super1']),
      formula('conv-change','subtract',['conv0','conv1']),
      formula('online-change','subtract',['online0','online1'])
    ],'合成算术；不能证明渠道迁移的原因。')
  ];
  d.analysis.issues=[{id:'main-issue',question:'下滑集中在哪些渠道',priority:'high',disposition:'answered',workItemRefs:['main-work']}];
  d.analysis.workItems=[{id:'main-work',issueRefs:['main-issue'],method:'period-comparison',rationale:'同口径比较分渠道变化',status:'complete',inputClaimRefs:['raw-input'],artifactRefs:['input-file'],outputClaimRefs:['finding'],counterEvidence:'分渠道变化不能推出因果关系。'}];
  d.analysis.synthesis={answerClaimRefs:['finding'],openIssueRefs:[],basis:'两期分渠道数据支持"下滑集中于商超"，不支持据此判断原因。'};
  d.analysis.brief={question:'销量下滑集中在哪些渠道',purpose:'decision',scope:'合成单业务',period:'2024–2025',baseline:'2024同口径销量',constraints:'无原因证据',successCriteria:'给出可试点范围与停止条件'};
  d.analysis.options=[{id:'opt-pilot',label:'先试点两个高信号渠道',baseline:false,claimRefs:['finding'],metricRefs:['super-change','online-change'],constraints:'预算与执行能力待确认',dependencies:'试点范围的业务确认',validation:'以增量测量而非平台归因判定'},
    {id:'opt-all',label:'全渠道同时调整',baseline:true,claimRefs:['finding'],metricRefs:['super-change'],constraints:'原因未证实，调整方向可能错',dependencies:'渠道迁移的原因诊断',validation:'无法与季节性区分'}];
  d.analysis.synthesis.optionRefs=['opt-pilot','opt-all'];
  return d;
}

function slides(){
  return [
    {id:'cover',sequence:1,pageRole:'cover',storyBeat:'context',title:'合成渠道诊断',subtitle:'叙事主线样稿 · 仅验证工具链',cornerLabel:'',speakerIntent:''},
    /* 第 1 页：把"下滑集中在哪里"讲完就收。副标题只写口径，不重复标题的判断。 */
    {id:'concentration',sequence:2,pageRole:'analysis',storyBeat:'diagnosis',
      title:'销量下滑集中在商超，其他渠道没有同步下滑',
      subtitle:'单位：万台｜期间：2025 全年 vs 2024 同口径',cornerLabel:'01',
      speakerIntent:'读者读完这一页要知道：问题不在全渠道，而在商超。',
      adds:'知道下滑不是全渠道现象，只有商超需要单独解释，后面的方案不必覆盖所有渠道。',
      proves:'同口径比较显示商超减量远大于其他渠道，方向差异可直接读出。',
      claimRefs:['finding'],metricRefs:['super-change','conv-change','online-change'],
      exhibit:{contract:'semantic-exhibit-v1',semantics:{composition:{version:1,anchorPanel:'channels',readingOrder:['channels','reading'],
        panels:{
          channels:{purpose:'用同一量尺比较三个渠道的两期销量变化',claimRefs:['finding'],form:'kit.dumbbell',
            selection:{relationship:'comparison',reason:'三个渠道共用一条量尺，读者能直接比出减量幅度差异。'},
            capacity:{items:1},data:{before:{$metric:'super0'},after:{$metric:'online1'}}},
          reading:{purpose:'给出三个渠道的同期读数，支持逐项核对',claimRefs:['finding'],form:'html.text',
            selection:{relationship:'text',reason:'渠道口径与分母需要保留文字说明。'}}
        },
        relations:[{id:'channels-reading',kind:'complement',panelRefs:['channels','reading'],
          reason:'图给幅度差异，文字给口径与分母；两者共同支持"集中在商超"这一判断。'}]}}},
      visual:{layout:'custom',readingPath:'左：三渠道对比图 → 右：口径与读数',
        regions:[{slot:'main',role:'primary',span:3,panelRef:'channels'},{slot:'aside',role:'evidence',span:1,panelRef:'reading'}]},
      density:{profile:'balanced',evidenceUnits:[
        {role:'primary',purpose:'三渠道同量尺的减量对比'},
        {role:'support',purpose:'口径、分母与逐项读数'}],spaceIntent:'主图占左侧三分之二，右侧留给口径，来源独立底部'}},
    /* 第 2 页：接上一页推进到行动，讲完"先做什么、什么时候停"。 */
    {id:'pilot',sequence:3,pageRole:'action',storyBeat:'action',
      title:'先在高信号渠道试点，并以增量测量决定是否扩张',
      subtitle:'合成方案｜预算上限与停止条件待与业务确认',cornerLabel:'02',
      speakerIntent:'读者读完这一页要拿到：试点范围与停止条件。',
      adds:'拿到可排期的试点范围与停止条件，知道什么结果算失败，不必等全渠道结论再决策。',
      proves:'两个候选方案在证据支持度、成本与验证方式上可比，试点方案的门槛更低且可止损。',
      claimRefs:['finding'],metricRefs:['super-change','online-change'],
      exhibit:{contract:'semantic-exhibit-v1',semantics:{composition:{version:1,anchorPanel:'options',readingOrder:['options'],
        panels:{
          options:{purpose:'并排列出两个方案的支持度、成本与停止条件',claimRefs:['finding'],form:'html.table',
            selection:{relationship:'exact',reason:'方案比较需要逐格核对条件，表格保留精确值。'}}
        },relations:[]}}},
      visual:{layout:'custom',readingPath:'整幅：方案对照表',
        regions:[{slot:'main',role:'primary',span:4,panelRef:'options'}]},
      density:{profile:'balanced',evidenceUnits:[
        {role:'primary',purpose:'两个候选方案的条件对照表'},
        {role:'support',purpose:'停止条件与验证方式'}],spaceIntent:'表格整幅展开，来源独立底部'}}
  ];
}

function build(){
  const d=deckDoc();d.slides=slides();
  const input={super0:100,super1:82,conv0:100,conv1:94,online0:100,online1:109,budget:120};
  return {doc:d,input};
}

function prepare(name){
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  const {doc:d,input}=build();
  fs.writeFileSync(path.join(dir,'input.json'),JSON.stringify(input,null,2)+'\n');
  // 合成输入只校验引用的原料读数存在；派生值由 formulas 表达，不落成第二份真源。
  for(const c of d.claims)for(const m of c.metrics){
    if(m.formula){
      for(const ref of m.formula.args){
        const known=input[ref]!==undefined||d.claims.some(x=>x.metrics.some(y=>y.id===ref));
        if(!known)throw Error('缺少输入：'+c.id+' '+m.id+' 依赖 '+m.formula.args.join('/'));
      }
    }else if(input[m.id]===undefined&&m.value===undefined)throw Error('缺少输入：'+c.id+' '+m.id);
  }
  d.artifacts=[{id:'input-file',kind:'input',path:'input.json',sha256:contract.fileHash(path.join(dir,'input.json')),dependsOn:[]}];
  fs.writeFileSync(path.join(dir,'blueprint.json'),JSON.stringify(d,null,2)+'\n');
  const task={version:3,analysisAlgorithm:'semantic-v2',workMode:'analytical',complexity:'simple',majorConclusion:false,
    mode:'reading',ratio:'16x9',kind:'fragment',theme:'mckinsey',typography:'serif-report-bold',
    policyVersions:{analysis:'semantic-v2',reading:'reading-shadow-1',visual:POLICY,references:'single-page-1'},
    blueprint:{record:'blueprint.json'},pages:{record:'pages.json'},critical:[]};
  fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify(task,null,2)+'\n');
  // 生成阶段先跑一遍叙事合同，把错误暴露在这里而不是等到成稿之后
  const errors=narrative.validate(d,{task,stage:'synthesis'});
  if(errors.length)throw Error(name+' 叙事校验失败：'+errors.join('；'));
  return {name,dir,arc:d.deck.arc,adds:d.slides.filter(s=>s.adds).map(s=>({slide:s.id,adds:s.adds}))};
}

function panelHtml(p,region,bind){
  const panel=p.composition.panels[region.panelRef];
  if(region.form==='kit.dumbbell'){
    /* 手绘 SVG 按内在尺寸出图：viewBox 与版位同比例，缩放比才能落在 1 附近。
       被 CSS 放大的手绘图会连带放大内部字号，读者第一眼就可能落到图里而不是标题上。 */
    const rows=[{label:'商超',a:100,b:82},{label:'便利店',a:100,b:94},{label:'线上',a:100,b:109}];
    const x=v=>150+((v-70)/45)*520;
    const bars=rows.map((r,i)=>{const y=76+i*46;
      return `<text x="20" y="${y+5}" font-size="15" fill="#20303f">${r.label}</text>`
        +`<line x1="${x(r.a)}" y1="${y}" x2="${x(r.b)}" y2="${y}" stroke="#c9d2da" stroke-width="4"/>`
        +`<circle cx="${x(r.a)}" cy="${y}" r="6" fill="#FFFFFF" stroke="#5b7a9d" stroke-width="2"/>`
        +`<circle cx="${x(r.b)}" cy="${y}" r="7" fill="#c0504d"/>`
        +`<text x="${x(r.a)}" y="${y-13}" font-size="14" fill="#5b7a9d" text-anchor="middle">100</text>`
        +`<text x="${x(r.b)}" y="${y+25}" font-size="14" fill="#c0504d" text-anchor="middle">${r.b}</text>`;}).join('');
    return `<div class="panel-chart"><svg data-form="kit.dumbbell" data-capacity="${encodeURIComponent(JSON.stringify({items:1}))}" viewBox="0 0 815 245" width="100%" height="100%">
      <text x="20" y="30" font-size="15" fill="#526372">分渠道销量（万台）｜圆点 2024，实点 2025</text>
      <line x1="150" y1="220" x2="670" y2="220" stroke="#e3e8ee" stroke-width="1"/>
      ${bars}</svg></div>`;
  }
  if(region.form==='html.table'){
    return `<div class="panel-table"><table class="data-table"><thead><tr><th>方案</th><th>证据支持</th><th>成本</th><th>停止条件</th></tr></thead><tbody>
      <tr><td>先试点两个高信号渠道</td><td>与本页判断一致</td><td>预算待确认</td><td>增量测量未达标即停</td></tr>
      <tr><td>全渠道同时调整</td><td>原因尚未证实</td><td>高</td><td>无法与季节性区分</td></tr></tbody></table></div>`;
  }
  return `<div class="panel-text">${p.content.claims.map(c=>bind('claim:'+c.id,'p')+bind('limitation:'+c.id,'p','limits')).join('')}</div>`;
}

const TITLES={concentration:'销量下滑集中在商超，其他渠道没有同步下滑',pilot:'先在高信号渠道试点，并以增量测量决定是否扩张'};
const LEADS={concentration:'单位：万台｜期间：2025 全年 vs 2024 同口径',pilot:'合成方案｜预算上限与停止条件待与业务确认'};
/* 收束句是本页作者写的那一句"读者离开时要记住什么"，不是把主张或标题再绑一次。
   标题、副标题、收束句三处复述同一句时，页面看上去写了三遍，读者只拿到一个信息。 */
const TAKEAWAYS={
  concentration:'下滑不是全渠道现象：只有商超需要单独解释，后面的方案不必覆盖所有渠道',
  pilot:'试点先行、增量定去留：测量不达标即停，不必等全渠道结论'
};

function render(name){
  const dir=path.join(out,name),tf=path.join(dir,'task.json');
  require(path.join(scripts,'compile_blueprint.cjs')).run([path.join(dir,'blueprint.json'),path.join(dir,'pages.json'),'--task',tf,'--preview']);
  const pagesDoc=JSON.parse(fs.readFileSync(path.join(dir,'pages.json')));
  const slideHtml=[];
  for(const p of pagesDoc.pages){
    const bind=(k,tag='span',cls='')=>content.html(p,k,{tag,className:cls});
    const regions=p.regions.map(r=>`<div data-module="${r.slot}" data-panel-id="${r.panelRef}" class="focus-region focus-region--${r.slot}">${panelHtml(p,r,bind)}</div>`).join('');
    const strip=Object.keys(content.bindings(p)).filter(k=>k!=='title').map(k=>bind(k,'span','binding-item')).join('');
    // 收束节点：每页恰有一个 data-reading-role="takeaway"，它是这一页唯一被声明为"要记住什么"的地方。
    slideHtml.push(`<section class="slide reading focus-sample" data-page-id="${p.id}" data-frame-boundary="line">
<header class="slide__header">${bind('title','h1','slide__title')}<p class="slide__lead">${LEADS[p.id]||''}</p></header>
<div class="slide__body focus-body">${regions}</div>
<div class="takeaway" data-reading-role="takeaway">${TAKEAWAYS[p.id]||''}</div>
<div class="binding-strip">${strip}</div>
<footer class="source">${bind(p.content.sources.map(s=>'source:'+s.key))}</footer></section>`);
  }
  slideHtml.unshift(`<section class="slide cover" data-page-id="cover" data-page-role="cover" data-frame="off" data-frame-boundary="space"><div class="slide__frame" aria-hidden="true"></div><header class="bookend-top"></header><div class="bookend-main"><h1 class="cover-title">合成渠道诊断</h1><p class="bookend-subtitle">叙事主线样稿 · 仅验证工具链</p></div><footer class="bookend-footer"><div class="bookend-meta"><span data-report-field="date">2026-09-26</span></div></footer></section>`);
  fs.writeFileSync(path.join(dir,'pages.html'),slideHtml.join('\n')+'\n');
  fs.writeFileSync(path.join(dir,'page.css'),buildCSS());
  return require(path.join(scripts,'assemble_deck.cjs')).assemble({pagesFile:path.join(dir,'pages.html'),outputFile:path.join(dir,'deck.html'),cssFile:path.join(dir,'page.css'),contractFile:tf,title:'合成渠道诊断'})
    .then(result=>({name,html:path.join(dir,'deck.html'),pages:result.pages||'?'}));
}

function buildCSS(){
  return `.focus-sample .slide__header{flex:0 0 128px}
.focus-sample .slide__body.focus-body{flex:1;display:grid;gap:12px;padding:0 40px}
.focus-sample[data-page-id="concentration"] .focus-body{grid-template-columns:3fr 1fr;grid-template-rows:1fr}
.focus-sample[data-page-id="pilot"] .focus-body{grid-template-columns:1fr;grid-template-rows:1fr}
.focus-region{overflow:hidden;padding:8px;background:#f7f8fa;border-radius:4px}
.panel-chart svg{width:100%;height:100%}
.panel-text p{font-size:16px;line-height:26px;margin:6px 0}
.panel-text .limits{font-size:13px;line-height:20px;color:#526372}
.data-table{width:100%;border-collapse:collapse}
.data-table th{font-size:14px;padding:6px 10px;text-align:left;border-bottom:2px solid #ccc}
.data-table td{font-size:15px;padding:6px 10px;border-bottom:1px solid #eee}
.focus-sample .takeaway{font-size:17px;line-height:26px;padding:8px 40px;color:#111}
.focus-sample .source{font-size:12px;line-height:18px;padding:4px 40px;color:#526372}
.binding-strip{display:flex;flex-wrap:wrap;gap:4px 12px;padding:4px 40px;font-size:13px;line-height:20px;color:#526372}
.binding-item{white-space:nowrap}`;
}

(async()=>{
  const mode=process.argv[2];
  if(!['--prepare','--render'].includes(mode))throw Error('用法：node docs/showcase/build-focus-samples.cjs --prepare|--render [name]');
  const name=process.argv[3]||'narrative-focus';
  const prepared=prepare(name);
  if(mode==='--prepare')console.log(JSON.stringify({...prepared,directory:undefined}));
  else console.log(JSON.stringify(await render(name)));
})().catch(e=>{console.error(e.message||e);process.exitCode=1;});
