/* 复合证据代表页样稿：三栏互补与总览+细节两种组织，可编译、可装配、可逐 panel 核对。
   合成输入，只验证工具链与组合结构，不生成任何通过审查记录。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),scripts=path.join(root,'scripts');
const content=require(path.join(scripts,'content_contract.cjs')),contract=require(path.join(scripts,'report_contract.cjs'));
const composition=require(path.join(scripts,'composition_contract.cjs'));
const out=path.join(root,'renders/composition-samples');

const value=(id,n,unit='万元',decimals=1)=>({id,value:n,unit,decimals});
const formula=(id,op,args,unit='万元')=>({id,formula:{op,args},unit,decimals:1});
const claim=(id,statement,metrics,limitation,kind='fact')=>({id,kind,statement,verification:'provided',sourceKeys:['S1'],period:'2024–2025',population:'合成业务',unit:'万元',denominator:'不适用',calculation:'按全局 metrics 公式复算',inference:'只说明所列关系',limitation,metrics});

function baseDoc(){
  const d=require('../../tests/fixtures/analysis_fixture.cjs').fixture();
  d.analysisAlgorithm='semantic-v2';
  d.deck.title='合成经营诊断：收入、成本与利润';
  d.deck.decision='理解利润变化的算术构成';
  d.deck.audience='经营研究读者';
  d.sources={S1:{label:'合成输入，仅验证工具链',locator:'input.json · 全部数值'}};
  d.claims=[];
  d.analysis.issues=[{id:'main-issue',question:'利润变化由哪些算术项构成',priority:'high',disposition:'answered',workItemRefs:['main-work']}];
  d.analysis.workItems=[{id:'main-work',issueRefs:['main-issue'],method:'profit-bridge',rationale:'先核对算术，再区分可支持与未知',status:'complete',inputClaimRefs:['raw-input'],artifactRefs:['input-file'],outputClaimRefs:['finding'],counterEvidence:'算术关系不能解释为已识别的经营因果'}];
  d.analysis.synthesis={answerClaimRefs:['finding'],openIssueRefs:[],basis:'合成输入能支持算术关系，不能替代真实经营判断。'};
  d.analysis.brief={question:'利润变化由哪些算术项构成',purpose:'diagnosis',scope:'合成单业务',period:'2024–2025',baseline:'2024',constraints:'未验证因果',successCriteria:'给出可复算、有边界的结果'};
  return d;
}

/* —— 样例 1：三栏互补（收入/成本/利润各承担不同证明分工） —— */
function threeColumn(){
  const d=baseDoc();
  const input={rev0:1200,rev1:1380,cost0:800,cost1:870,fixed0:200,fixed1:210};
  d.claims=[
    claim('raw-input','输入为合成收入、变动成本与固定费用的两期数值。',Object.entries(input).map(([id,n])=>value(id,n)),'合成输入，不代表实际企业'),
    claim('finding','收入上升而利润下降；成本与费用的净效果需要同时核对。',[
      formula('rev-change','subtract',['rev1','rev0']),
      formula('cost-change','subtract',['cost1','cost0']),
      formula('fixed-change','subtract',['fixed1','fixed0']),
      formula('profit0','subtract',['rev0','cost0']),
      formula('profit0f','subtract',['profit0','fixed0']),
      formula('profit1','subtract',['rev1','cost1']),
      formula('profit1f','subtract',['profit1','fixed1']),
      formula('profit-delta','subtract',['profit1f','profit0f'])
    ],'合成算术；不能证明价格变化导致销量变化。')
  ];
  d.slides=[
    {id:'cover',sequence:1,pageRole:'cover',storyBeat:'context',title:'合成经营诊断',subtitle:'复合证据样稿 · 仅验证工具链',cornerLabel:'',speakerIntent:''},
    {id:'three-column',sequence:2,pageRole:'analysis',storyBeat:'diagnosis',
      title:'收入升{{metric:rev-change}}，利润降{{metric:profit-delta}}：成本与费用同时上行',
      subtitle:'合成数据，2024–2025',cornerLabel:'01',speakerIntent:'三项互补证据共同解释利润变化的算术构成。',
      proves:'收入、成本与利润变化共同解释会计算术关系，不据此识别经营因果。',
      claimRefs:['finding'],metricRefs:['rev-change','cost-change','fixed-change','profit0f','profit1f','profit-delta'],
      exhibit:{contract:'semantic-exhibit-v1',semantics:{
        composition:{version:1,anchorPanel:'revenue',readingOrder:['revenue','cost','profit'],
          panels:{
            revenue:{purpose:'比较两期收入变化，建立利润诊断的背景',claimRefs:['finding'],form:'kit.dumbbell',
              selection:{relationship:'comparison',reason:'以同一量尺标出两个期间的收入水平与差额。'},
              capacity:{items:1},data:{before:{$metric:'rev0'},after:{$metric:'rev1'}}},
            cost:{purpose:'标出成本与费用的同期变化，解释利润压力来源',claimRefs:['finding'],form:'html.text',
              selection:{relationship:'text',reason:'成本拆解需保留口径说明，用结构化文字呈现更准确。'}},
            profit:{purpose:'给出利润终值与差额，收束本页判断',claimRefs:['finding'],form:'html.kpi',
              selection:{relationship:'kpi',reason:'利润终值和差额适合用KPI卡片直接读数。'},
              // 页面上是三张卡（期初利润、期末利润、差额）。计划写 2 会让逐 panel 容量对账把成稿判成超计划；
              // 上限要按实际证据单元数写，不能按"我以为放几张"写。
              capacity:{items:3}}
          },
          relations:[{id:'rev-cost-profit',kind:'complement',panelRefs:['revenue','cost','profit'],
            reason:'收入、成本及利润变化共同解释会计算术关系，不据此识别经营因果。'}]}
      },style:{fontSize:18}},
      visual:{layout:'custom',readingPath:'左：收入 → 中：成本 → 右：利润',
        regions:[
          {slot:'left',role:'primary',span:2,panelRef:'revenue'},
          {slot:'main',role:'evidence',span:2,panelRef:'cost'},
          {slot:'right',role:'evidence',span:1,panelRef:'profit'}
        ]},
      density:{profile:'dense',evidenceUnits:[
        {role:'primary',purpose:'收入两期同量尺对比'},
        {role:'support',purpose:'成本与费用的口径拆解'},
        {role:'implication',purpose:'利润终值与差额收束判断'}
      ],spaceIntent:'三栏各司其职，来源独立底部'},
      }
  ];
  return {doc:d,input};
}

/* —— 样例 2：总览+细节（主图给全局，表格给精确值） —— */
function overviewDetail(){
  const d=baseDoc();
  const input={rev0:1200,rev1:1380,cost0:800,cost1:870,fixed0:200,fixed1:210};
  d.claims=[
    claim('raw-input','输入为合成收入、变动成本与固定费用的两期数值。',Object.entries(input).map(([id,n])=>value(id,n)),'合成输入，不代表实际企业'),
    claim('finding','收入上升而利润下降；成本与费用的净效果需要同时核对。',[
      formula('rev-change','subtract',['rev1','rev0']),
      formula('cost-change','subtract',['cost1','cost0']),
      formula('fixed-change','subtract',['fixed1','fixed0']),
      formula('profit0','subtract',['rev0','cost0']),
      formula('profit0f','subtract',['profit0','fixed0']),
      formula('profit1','subtract',['rev1','cost1']),
      formula('profit1f','subtract',['profit1','fixed1']),
      formula('profit-delta','subtract',['profit1f','profit0f'])
    ],'合成算术；不能证明价格变化导致销量变化。')
  ];
  d.slides=[
    {id:'cover',sequence:1,pageRole:'cover',storyBeat:'context',title:'合成经营诊断',subtitle:'复合证据样稿 · 仅验证工具链',cornerLabel:'',speakerIntent:''},
    {id:'overview-detail',sequence:2,pageRole:'analysis',storyBeat:'insight',
      title:'利润变化{{metric:profit-delta}}的精确构成',
      subtitle:'合成数据，2024–2025',cornerLabel:'02',speakerIntent:'主图给方向，表格给精确值。',
      proves:'利润终值与逐项差额可在同一页核对，避免读者自行反算。',
      claimRefs:['finding'],metricRefs:['profit0f','profit1f','profit-delta','rev-change','cost-change','fixed-change'],
      exhibit:{contract:'semantic-exhibit-v1',semantics:{
        composition:{version:1,anchorPanel:'bridge',readingOrder:['bridge','detail'],
          panels:{
            bridge:{purpose:'用瀑布呈现利润从期初到期末的算术桥',claimRefs:['finding'],form:'kit.waterfall',
              selection:{relationship:'bridge',reason:'瀑布对账收入与成本的净效果，起点终点闭合可核。'},
              capacity:{nodes:5},
              waterfall:{input:{items:[
                {label:'2024利润',value:200,type:'start'},
                {label:'收入增加',value:180,type:'delta'},
                {label:'成本增加',value:-70,type:'delta'},
                {label:'费用增加',value:-10,type:'delta'},
                {label:'2025利润',value:300,type:'end'}
              ],config:{}}}},
            detail:{purpose:'给出逐项精确值，支持读者核对数字',claimRefs:['finding'],form:'html.table',
              selection:{relationship:'exact',reason:'需要逐格核对两期数值和差额，表格保留精确值。'}}
          },
          relations:[{id:'bridge-detail',kind:'overview-detail',panelRefs:['bridge','detail'],
            reason:'瀑布给出变化方向，表格给出精确值；读者不需要自行反算差额。'}]}
      },style:{fontSize:18}},
      visual:{layout:'custom',readingPath:'上：利润桥 → 下：精确对照表',
        regions:[
          {slot:'main',role:'primary',span:3,panelRef:'bridge'},
          {slot:'bottom',role:'evidence',span:1,panelRef:'detail'}
        ]},
      density:{profile:'balanced',evidenceUnits:[
        {role:'primary',purpose:'利润桥呈现逐项净效果'},
        {role:'support',purpose:'精确表逐格核对数值'}
      ],spaceIntent:'主图与表格分组，来源独立'},
      }
  ];
  return {doc:d,input};
}

function prepare(name,build){
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  const {doc:d,input}=build();
  fs.writeFileSync(path.join(dir,'input.json'),JSON.stringify(input,null,2)+'\n');
  d.artifacts=[{id:'input-file',kind:'input',path:'input.json',sha256:contract.fileHash(path.join(dir,'input.json')),dependsOn:[]}];
  fs.writeFileSync(path.join(dir,'blueprint.json'),JSON.stringify(d,null,2)+'\n');
  // 编译前先跑组合结构校验，把错误暴露在生成阶段
  for(const s of d.slides){
    if(!composition.hasComposition(s))continue;
    const errs=composition.validate(s,{claims:d.claims,sourceKeys:Object.keys(d.sources),task:{version:3,policyVersions:{visual:composition.POLICY}}});
    if(errs.length)throw Error(name+' 组合校验失败：'+errs.join('；'));
    composition.deriveVisual(s,'16x9');
  }
  const task={version:3,analysisAlgorithm:'semantic-v2',
    workMode:'analytical',complexity:'simple',majorConclusion:false,
    mode:'reading',ratio:'16x9',kind:'fragment',theme:'mckinsey',typography:'serif-report-bold',
    policyVersions:{analysis:'semantic-v2',reading:'reading-shadow-1',visual:'evidence-composition-1',references:'single-page-1'},
    blueprint:{record:'blueprint.json'},pages:{record:'pages.json'},critical:[]};
  fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify(task,null,2)+'\n');
  console.log(JSON.stringify({name,prepared:true,panels:d.slides.filter(s=>composition.hasComposition(s)).map(s=>({slide:s.id,panels:composition.panelIds(s)}))}));
  return {name,dir};
}

function render(name){
  const dir=path.join(out,name),tf=path.join(dir,'task.json');
  require(path.join(scripts,'compile_blueprint.cjs')).run([path.join(dir,'blueprint.json'),path.join(dir,'pages.json'),'--task',tf,'--preview']);
  const pagesDoc=JSON.parse(fs.readFileSync(path.join(dir,'pages.json')));
  const slideHtml=[];
  for(const p of pagesDoc.pages){
    const bind=(k,tag='span',cls='')=>content.html(p,k,{tag,className:cls});
    const panels=composition.expectedPanels(p);
    // 逐 panel 生成带 data-panel-id 审计根的模块
    const regions=p.regions.map((r,i)=>{
      const panelId=r.panelRef;
      const body=renderPanel(p,r,panelId,bind);
      return `<div data-module="${r.slot}" data-panel-id="${panelId}" class="comp-region comp-region--${r.slot}">${body}</div>`;
    }).join('');
    const bindingStrip=Object.keys(content.bindings(p)).filter(k=>k!=='title').map(k=>bind(k,'span','binding-item')).join('');
    const html=`<section class="slide reading comp-sample" data-page-id="${p.id}" data-frame-boundary="line"><header class="slide__header">${bind('title','h1','slide__title')}<p class="slide__lead">复合证据样稿 · ${p.composition.relations.map(r=>r.kind).join('/')}</p></header><div class="slide__body comp-body">${regions}</div><div class="binding-strip">${bindingStrip}</div><footer class="source">${bind(p.content.sources.map(s=>'source:'+s.key))}</footer></section>`;
    slideHtml.push(html);
  }
  // 封面
  slideHtml.unshift(`<section class="slide cover" data-page-id="cover" data-page-role="cover" data-frame="off" data-frame-boundary="space"><div class="slide__frame" aria-hidden="true"></div><header class="bookend-top"></header><div class="bookend-main"><h1 class="cover-title">合成经营诊断</h1><p class="bookend-subtitle">复合证据样稿 · 仅验证工具链</p></div><footer class="bookend-footer"><div class="bookend-meta"><span data-report-field="date">2026-09-26</span></div></footer></section>`);
  const css=buildCSS(pagesDoc);
  fs.writeFileSync(path.join(dir,'pages.html'),slideHtml.join('\n')+'\n');
  fs.writeFileSync(path.join(dir,'page.css'),css);
  require(path.join(scripts,'assemble_deck.cjs')).assemble({pagesFile:path.join(dir,'pages.html'),outputFile:path.join(dir,'deck.html'),cssFile:path.join(dir,'page.css'),contractFile:tf,title:'合成经营诊断'}).then(result=>{
    console.log(JSON.stringify({name,html:path.join(dir,'deck.html'),pages:result.pages||'?',slideForms:(result.slideForms||[]).map(f=>({page:f.page,form:f.form}))}));
  });
}

function renderPanel(p,region,panelId,bind){
  const panel=p.composition.panels[panelId];
  const form=region.form;
  if(form==='kit.dumbbell'){
    const before=panel.data?.before,after=panel.data?.after;
    return `<div class="panel-dumbbell"><svg data-form="kit.dumbbell" data-capacity="${encodeURIComponent(JSON.stringify({items:1}))}" viewBox="0 0 400 120" width="100%" height="100%" data-actual-size="400,120"><text x="10" y="20" font-size="14" fill="#526372">收入（万元）</text><line x1="60" y1="60" x2="340" y2="60" stroke="#ccc" stroke-width="2"/><circle cx="${60+(before/2000)*280}" cy="60" r="10" fill="#5b7a9d"/><circle cx="${60+(after/2000)*280}" cy="60" r="10" fill="#c0504d"/><text x="${60+(before/2000)*280}" y="90" font-size="13" text-anchor="middle">${before}</text><text x="${60+(after/2000)*280}" y="90" font-size="13" text-anchor="middle">${after}</text></svg></div>`;
  }
  if(form==='html.kpi'){
    return `<div class="panel-kpi" data-form="html.kpi">${p.content.metrics.filter(m=>['profit0f','profit1f','profit-delta'].includes(m.id)).map(m=>`<div class="kpi-card"><span class="kpi-label">${m.id}</span>${bind('metric:'+m.id,'span','kpi-value')}</div>`).join('')}</div>`;
  }
  if(form==='html.table'){
    return `<div class="panel-table" data-form="html.table"><table class="data-table"><thead><tr><th>项目</th><th>2024</th><th>2025</th><th>差额</th></tr></thead><tbody>
      <tr><td>收入</td><td>${p.content.metrics.find(m=>m.id==='rev0')?.text||'—'}</td><td>${p.content.metrics.find(m=>m.id==='rev1')?.text||'—'}</td>${bind('metric:rev-change','td')}</tr>
      <tr><td>变动成本</td><td>${p.content.metrics.find(m=>m.id==='cost0')?.text||'—'}</td><td>${p.content.metrics.find(m=>m.id==='cost1')?.text||'—'}</td>${bind('metric:cost-change','td')}</tr>
      <tr><td>固定费用</td><td>${p.content.metrics.find(m=>m.id==='fixed0')?.text||'—'}</td><td>${p.content.metrics.find(m=>m.id==='fixed1')?.text||'—'}</td>${bind('metric:fixed-change','td')}</tr>
      <tr><td>利润</td>${bind('metric:profit0f','td')}${bind('metric:profit1f','td')}${bind('metric:profit-delta','td')}</tr>
    </tbody></table></div>`;
  }
  if(form==='kit.waterfall'){
    return `<div class="panel-waterfall"><svg data-form="kit.waterfall" data-capacity="${encodeURIComponent(JSON.stringify({nodes:5}))}" viewBox="0 0 500 200" width="100%" height="100%" data-actual-size="500,200">
      <text x="10" y="20" font-size="14" fill="#526372">利润桥（万元）</text>
      <line x1="30" y1="160" x2="470" y2="160" stroke="#ccc" stroke-width="1" data-role="reconciliation" data-residual="" data-tolerance="0.01" data-nodes="5" data-waterfall-model="items"/>
      <rect x="50" y="80" width="60" height="80" fill="#5b7a9d" data-from="0" data-to="200" data-role="bar" data-anchor-id="bar:start" data-anchor-label="2024利润" data-value="200"/>
      <rect x="130" y="40" width="60" height="40" fill="#4a7c59" data-from="200" data-to="380" data-role="bar" data-anchor-id="bar:rev" data-anchor-label="收入增加" data-value="180"/>
      <rect x="210" y="40" width="60" height="35" fill="#c0504d" data-from="380" data-to="310" data-role="bar" data-anchor-id="bar:cost" data-anchor-label="成本增加" data-value="-70"/>
      <rect x="290" y="40" width="60" height="10" fill="#c0504d" data-from="310" data-to="300" data-role="bar" data-anchor-id="bar:fixed" data-anchor-label="费用增加" data-value="-10"/>
      <rect x="370" y="60" width="60" height="100" fill="#5b7a9d" data-from="0" data-to="300" data-role="bar" data-anchor-id="bar:end" data-anchor-label="2025利润" data-value="300"/>
    </svg></div>`;
  }
  if(form==='html.text'){
    return `<div class="panel-text" data-form="html.text">${p.content.claims.map(c=>bind('claim:'+c.id,'p')+bind('limitation:'+c.id,'p','limits')).join('')}</div>`;
  }
  return `<div class="panel-unknown" data-form="${form}"><p>${panel.purpose}</p></div>`;
}

function buildCSS(pagesDoc){
  const n=pagesDoc.pages.length;
  return `.comp-sample .slide__header{flex:0 0 128px}
.comp-sample .slide__body.comp-body{flex:1;display:grid;gap:12px;padding:0 40px}
.comp-sample[data-page-id="three-column"] .comp-body{grid-template-columns:2fr 2fr 1fr;grid-template-rows:1fr}
.comp-sample[data-page-id="overview-detail"] .comp-body{grid-template-columns:1fr;grid-template-rows:2fr 1fr}
.comp-region{overflow:hidden;padding:8px}
.comp-region--left,.comp-region--main{background:#f7f8fa;border-radius:4px}
.comp-region--right,.comp-region--bottom{background:#fafbfc;border-radius:4px}
.panel-dumbbell svg,.panel-waterfall svg{width:100%;height:100%}
.panel-kpi{display:flex;gap:12px;flex-wrap:wrap}
.kpi-card{flex:1;min-width:100px;text-align:center;padding:12px 8px;background:#fff;border:1px solid #dde;border-radius:4px}
.kpi-label{display:block;font-size:12px;color:#526372;margin-bottom:4px}
.kpi-value{font-size:22px;font-weight:700;color:#000080}
.panel-text p{font-size:16px;line-height:26px;margin:6px 0}
.panel-text .limits{font-size:13px;line-height:20px;color:#526372}
.data-table{width:100%;border-collapse:collapse}
.data-table th{font-size:14px;padding:6px 10px;text-align:left;border-bottom:2px solid #ccc}
.data-table td{font-size:15px;padding:6px 10px;border-bottom:1px solid #eee}
.comp-sample .source{font-size:12px;line-height:18px;padding:4px 40px;color:#526372}
.binding-strip{display:flex;flex-wrap:wrap;gap:4px 12px;padding:4px 40px;font-size:13px;line-height:20px;color:#526372}
.binding-item{white-space:nowrap}`;
}

(async()=>{
  const mode=process.argv[2];
  if(!['--prepare','--render'].includes(mode))throw Error('用法：node docs/showcase/build-composition-samples.cjs --prepare|--render [name]');
  const builders={threeColumn,overviewDetail};
  for(const name of (process.argv[3]?[process.argv[3]]:Object.keys(builders))){
    if(!builders[name])throw Error('未知样例：'+name);
    if(mode==='--prepare')prepare(name,builders[name]);
    else await render(name);
  }
})().catch(e=>{console.error(e.message||e);process.exitCode=1;});
