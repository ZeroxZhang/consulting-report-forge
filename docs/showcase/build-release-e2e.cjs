/* 发布前多页合成验收：只生成材料与页面，不生成审查通过记录。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'renders/release-e2e');
const content=require('../../scripts/content_contract.cjs');
const report=require('../../scripts/report_contract.cjs');
const bookends=require('../../scripts/bookends.cjs');
const metric=(id,value,unit='元')=>({id,value,unit,decimals:0});
const calc=(id,op,args,unit='元')=>({id,formula:{op,args},unit,decimals:0});
const claim=(id,kind,statement,limitation,metrics=[])=>({id,kind,statement,verification:'provided',sourceKeys:['S1'],period:'两个合成完整期间及下一期条件情景',population:'同一合成业务',unit:'元',denominator:'绝对额；增长率以基期收入为分母',calculation:'使用全局 metrics 中声明的公式；情景输入为显式假设',inference:'只解释给定输入与条件情景，不识别价格、销量或成本的因果关系',limitation,metrics});
const visual={form:'html.table',semanticType:'table',primary:'同口径指标与条件对照',layout:'custom',readingPath:'标题 → 精确数值 → 主张与限制',regions:[{slot:'main',role:'primary',form:'html.table',span:3},{slot:'bottom',role:'support',form:'html.text',span:1}]};
const density={profile:'balanced',evidenceUnits:[{role:'primary',purpose:'以同一单位和期间核对数值'},{role:'support',purpose:'区分算术关系与决策限制'}],spaceIntent:'保留清楚的数值表、结论与来源分区'};
const specs=[
  {id:'revenue',role:'analysis',beat:'context',title:'收入由{{metric:revenue0}}升至{{metric:revenue1}}，但盈利仍需另查',claim:'revenue-finding',metrics:['revenue0','revenue1','revenue-growth'],labels:['基期收入','本期收入','收入增幅']},
  {id:'cost',role:'analysis',beat:'diagnosis',title:'变动成本由{{metric:cost0}}升至{{metric:cost1}}',claim:'cost-finding',metrics:['cost0','cost1','contribution0','contribution1'],labels:['基期变动成本','本期变动成本','基期贡献','本期贡献']},
  {id:'profit',role:'analysis',beat:'insight',title:'贡献少{{metric:contribution-loss}}、固定费用多{{metric:fixed-rise}}，利润少{{metric:profit-loss}}',claim:'profit-finding',metrics:['contribution-loss','fixed-rise','profit0','profit1','profit-loss'],labels:['贡献减少','固定费用增加','基期利润','本期利润','利润减少']},
  {id:'scenarios',role:'risk',beat:'risk',title:'在现状持平假设下，试点利润为{{metric:weak-profit}}至{{metric:strong-profit}}',claim:'scenario-finding',metrics:['baseline-next','pilot-cost','weak-saving','strong-saving','weak-net','strong-net','weak-profit','strong-profit']},
  {id:'choice',role:'decision',beat:'choice',title:'节省额超过{{metric:pilot-cost}}，试点净效果才为正',claim:'decision-finding',metrics:['baseline-next','pilot-cost','weak-saving','strong-saving','weak-net','break-even-net','strong-net']},
  {id:'action',role:'action',beat:'action',title:'先确认风险预算与基线，再决定是否开展有限试点',claim:'action-finding',metrics:['pilot-cost'],steps:[{stage:'1 核对',owner:'业务负责人待定',condition:'确认成本口径及同期未试点基线；无法配对时不归因。'},{stage:'2 授权',owner:'预算负责人待定',condition:'先批准可承受的试点风险预算',metricRef:'pilot-cost'},{stage:'3 实施',owner:'试点负责人待定',condition:'获批后在限定范围和期间内开展试点，记录成本、节省额与质量。'},{stage:'4 复核',owner:'业务与预算负责人待定',condition:'实测节省额超过投入且质量不下降才扩大，否则停止。'}]}
];
function blueprint(input){
 const raw=claim('raw-input','fact','合成输入列示两期销量、净价、单位变动成本与固定费用。','这些数值仅用于流程验收，不对应实际企业。',Object.entries(input).filter(([id])=>['q0','p0','c0','f0','q1','p1','c1','f1'].includes(id)).map(([id,n])=>metric(id,n,id.startsWith('q')?'件':id.startsWith('p')||id.startsWith('c')?'元/件':'元')));
 const scenarioInput=claim('scenario-input','assumption','情景假设下一期无试点利润与本期持平，且试点投入和节省额为给定数值。','下一期基线、可实现节省、费用完整性及质量影响均未验证。',Object.entries(input).filter(([id])=>['baseline-next','weak-saving','strong-saving','pilot-cost','negative-pilot-cost'].includes(id)).map(([id,n])=>metric(id,n)));
 const findings=[
  claim('revenue-finding','fact','本期收入高于基期，但收入变化本身不能证明盈利改善。','售价、销量与收入的关系是算术拆解，不证明降价导致销量增长。',[calc('revenue0','multiply',['q0','p0']),calc('revenue1','multiply',['q1','p1']),calc('revenue-growth','percent_change',['revenue1','revenue0'],'%')]),
  claim('cost-finding','fact','变动成本上升，贡献从基期降至本期。','单位成本与销量的变动不能由这张表归因。',[calc('cost0','multiply',['q0','c0']),calc('cost1','multiply',['q1','c1']),calc('contribution0','subtract',['revenue0','cost0']),calc('contribution1','subtract',['revenue1','cost1'])]),
  claim('profit-finding','fact','贡献减少与固定费用增加共同对应利润下降。','这是顺序明确的会计算术桥，不识别经营因果。',[calc('contribution-loss','subtract',['contribution0','contribution1']),calc('fixed-rise','subtract',['f1','f0']),calc('profit0','subtract',['contribution0','f0']),calc('profit1','subtract',['contribution1','f1']),calc('profit-loss','subtract',['profit0','profit1'])]),
  claim('scenario-finding','assumption','假定下一期无试点利润仍为80，两组节省对应的试点利润只是条件情景。','基线持平、节省持续性、费用完整性及质量副作用均未验证，不能把区间当成预测。',[calc('weak-net','subtract',['weak-saving','pilot-cost']),calc('break-even-net','subtract',['pilot-cost','pilot-cost']),calc('strong-net','subtract',['strong-saving','pilot-cost']),calc('weak-profit','sum',['baseline-next','weak-saving','negative-pilot-cost']),calc('strong-profit','sum',['baseline-next','strong-saving','negative-pilot-cost'])]),
  claim('decision-finding','recommendation','以假定的无试点利润为基线；只有获批可承受的试点风险预算才考虑启动，实测节省额超过30且质量不下降才考虑扩大。','节省额等于30仅覆盖投入，净效果为零；尚无启动授权或价值证明，现金时点未建模。'),
  claim('action-finding','recommendation','先核对下一期基线与成本口径，申请试点风险预算；获批后才开展有限试点，再按实测节省额和质量门槛决定继续或停止。','责任人、预算和期间需真实业务方确认；未获授权时保持现状，此处只验证报告生产流程。')
 ];
 const slides=[{id:'cover',sequence:1,pageRole:'cover',storyBeat:'context',title:'合成经营决策报告',subtitle:'发布前多页流程验收',cornerLabel:'',speakerIntent:''}];
 for(const [i,s] of specs.entries()){const v=structuredClone(visual);v.selection={relationship:'exact',reason:'此页需逐格核对合成输入与条件结果，精确表格保留数值、口径和限制。'};if(s.steps)v.steps=structuredClone(s.steps);slides.push({id:s.id,sequence:i+2,pageRole:s.role,storyBeat:s.beat,title:s.title,subtitle:'合成数据 · 同一业务 · 条件情景',cornerLabel:String(i+1).padStart(2,'0'),speakerIntent:'沿数值、解释和限制逐页核对。',proves:'对照同口径数据，说明当前判断及其适用边界',visual:v,density:structuredClone(density),claimRefs:[s.claim],metricRefs:s.metrics});}
 slides.push({id:'close',sequence:slides.length+1,pageRole:'close',storyBeat:'close',title:'结论与待验证项',subtitle:'合成材料不构成实际经营建议',cornerLabel:'',speakerIntent:''});
 const issues=[{id:'economics-issue',question:'收入增长为何未带来利润改善？',priority:'high',disposition:'answered',workItemRefs:['economics-work']},{id:'pilot-issue',question:'有限试点在什么条件下可取？',priority:'high',disposition:'answered',workItemRefs:['scenario-work','choice-work']}];
 const workItems=[
  {id:'economics-work',issueRefs:['economics-issue'],method:'period-profit-bridge',rationale:'核对收入、变动成本、贡献和固定费用的闭合关系',status:'complete',inputClaimRefs:['raw-input'],artifactRefs:['input-file'],outputClaimRefs:['revenue-finding','cost-finding','profit-finding'],counterEvidence:'收入增长与利润下降并存；不能从贡献桥推出价格因果。'},
  {id:'scenario-work',issueRefs:['pilot-issue'],method:'conditional-sensitivity',rationale:'比较低高节省假设与固定投入',status:'complete',inputClaimRefs:['raw-input','scenario-input','profit-finding'],artifactRefs:['input-file'],outputClaimRefs:['scenario-finding'],counterEvidence:'低节省情景使利润低于假定的无试点基线，说明试点并非必然有利。'},
  {id:'choice-work',issueRefs:['pilot-issue'],method:'baseline-option-comparison',rationale:'现状与有限试点同时列出收益、限制和停止条件',status:'complete',inputClaimRefs:['scenario-finding'],artifactRefs:['input-file'],outputClaimRefs:['decision-finding','action-finding'],counterEvidence:'缺现金时点与可持续性，不能据此批准全量投入。'}
 ];
 const options=[{id:'baseline-option',label:'保持现状',baseline:true,claimRefs:['scenario-finding'],metricRefs:['baseline-next'],constraints:'下一期利润持平80只是待验证假设',dependencies:'需核对下一期实际无试点基线',validation:'试点期间保留同口径未试点业务同期对照；无法配对时不把差异归因于试点'},{id:'pilot-option',label:'获批后有限试点',baseline:false,claimRefs:['scenario-finding','decision-finding'],metricRefs:['weak-profit','strong-profit'],constraints:'先获批可承受的30元试点风险预算并限定范围',dependencies:'须确认责任人、费用、质量指标和现金时点',validation:'实测节省额超过30（净效果为正）且质量不下降才扩大'}];
 return {schemaVersion:3,deck:{title:'合成经营决策报告',audience:'流程验收审查者',decision:'是否在获批风险预算后进行有限试点',mode:'reading',ratio:'16x9'},sources:{S1:{label:'合成经营输入，仅供验收',locator:'input.json · 全部数值与假设'}},slides,claims:[raw,scenarioInput,...findings],artifacts:[],analysis:{brief:{question:'收入增长但利润下降时，在什么条件下开展有限降耗试点？',purpose:'decision',scope:'单一合成业务',period:'两个合成期间及下一期条件情景',baseline:'假定下一期无试点利润仍为80；必须先验证',constraints:'没有真实业务授权、现金时点和因果识别',successCriteria:'算术闭合、方案有基线、启动与扩大门槛分开、限制可见'},issues,gaps:[{id:'causal-gap',description:'真实成本原因、下一期无试点基线、试点预算与质量影响未知',route:'bounded',affectedRefs:['cost-finding','scenario-finding','decision-finding','action-finding','pilot-option'],blockingScope:'none',status:'unavailable',resolution:{basis:'合成验收只给条件方案；实际启动须先取得预算授权并核对基线'}}],workItems,options,synthesis:{answerClaimRefs:['decision-finding','action-finding'],openIssueRefs:[],optionRefs:['baseline-option','pilot-option'],basis:'利润桥闭合，但下一期基线与节省仅是假设，低节省情景不利；未获授权不得启动试点。'}}};
}
function prepare(){
 fs.mkdirSync(dir,{recursive:true});const input={q0:100,p0:10,c0:6,f0:200,q1:120,p1:9,c1:6.5,f1:220,'baseline-next':80,'weak-saving':20,'strong-saving':60,'pilot-cost':30,'negative-pilot-cost':-30};
 fs.writeFileSync(path.join(dir,'input.json'),JSON.stringify(input,null,2)+'\n');
 const d=blueprint(input);d.artifacts=[{id:'input-file',kind:'input',path:'input.json',sha256:report.fileHash(path.join(dir,'input.json')),dependsOn:[]}];
 fs.writeFileSync(path.join(dir,'blueprint.json'),JSON.stringify(d,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify({version:2,workMode:'analytical',complexity:'complex',majorConclusion:true,mode:'reading',ratio:'16x9',kind:'report',theme:'mckinsey',typography:'serif-report-bold',blueprint:{record:'blueprint.json'},pages:{record:'pages.json'},critical:[]},null,2)+'\n');
 return {dir,analysisSha256:require('../../scripts/analysis_contract.cjs').digest(d),pages:specs.length+3};
}
async function render(){
 const tf=path.join(dir,'task.json'),task=JSON.parse(fs.readFileSync(tf)),rf=path.join(dir,'analysis-review.json');
 if(fs.existsSync(rf)){task.analysisReview={record:'analysis-review.json',sha256:report.fileHash(rf)};fs.writeFileSync(tf,JSON.stringify(task,null,2)+'\n');}
 require('../../scripts/compile_blueprint.cjs').run([path.join(dir,'blueprint.json'),path.join(dir,'pages.json'),'--task',tf,...(task.analysisReview?[]:['--preview'])]);
 const pages=JSON.parse(fs.readFileSync(path.join(dir,'pages.json'))).pages;
 const sourceSlides=JSON.parse(fs.readFileSync(path.join(dir,'blueprint.json'))).slides;
 const bodies=pages.map((p,i)=>{
  const bind=(k,tag='span',cls='')=>content.html(p,k,{tag,className:cls});
  let exhibit,cls='';
  if(specs[i].id==='scenarios'){
   cls=' release-e2e--scenario';
   const line=(label,saving,net,profit)=>`<tr><th>${label}</th>${bind('metric:baseline-next','td')}${bind('metric:'+saving,'td')}${bind('metric:pilot-cost','td')}${bind('metric:'+net,'td')}${bind('metric:'+profit,'td')}</tr>`;
   exhibit='<table class="data-table"><thead><tr><th>情景</th><th>无试点基线</th><th>节省额</th><th>试点投入</th><th>相对基线净效果</th><th>试点利润</th></tr></thead><tbody>'+line('低节省','weak-saving','weak-net','weak-profit')+line('高节省','strong-saving','strong-net','strong-profit')+'</tbody></table>';
  }else if(specs[i].id==='choice'){
   cls=' release-e2e--choice';
   const line=(label,saving,net,judgment)=>`<tr><th>${label}</th>${bind('metric:'+saving,'td')}${bind('metric:pilot-cost','td')}${bind('metric:'+net,'td')}<td>${judgment}</td></tr>`;
   exhibit='<table class="data-table"><thead><tr><th>门槛情景</th><th>节省额</th><th>试点投入</th><th>相对无试点基线 '+bind('metric:baseline-next')+' 的净效果</th><th>经济判断</th></tr></thead><tbody>'+line('低于门槛','weak-saving','weak-net','净损失，停止')+line('恰好覆盖','pilot-cost','break-even-net','仅保本，不扩大')+line('高于门槛','strong-saving','strong-net','质量不降才考虑扩大')+'</tbody></table>';
  }else if(specs[i].id==='action'){
   cls=' release-e2e--action';const steps=sourceSlides.find(s=>s.id==='action').visual.steps;
   exhibit='<table class="data-table"><thead><tr><th>顺序</th><th>责任角色</th><th>进入或停止条件</th></tr></thead><tbody>'+steps.map(step=>`<tr><th>${step.stage}</th><td>${step.owner}</td><td>${step.condition}${step.metricRef?' '+bind('metric:'+step.metricRef):''}</td></tr>`).join('')+'</tbody></table>';
  }else{
   const rows=p.content.metrics.map(m=>`<tr><th>${specs[i].labels[specs[i].metrics.indexOf(m.id)]||m.id}</th>${bind('metric:'+m.id,'td')}</tr>`).join('');
   exhibit='<table class="data-table"><thead><tr><th>指标</th><th>数值</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  return `<section class="slide reading release-e2e${cls}" data-page-id="${p.id}" data-frame-boundary="line"><header class="slide__header">${bind('title','h1','slide__title')}<p class="slide__lead">合成决策材料 · 不作为真实企业建议</p></header><div class="slide__body"><div data-module="main">${exhibit}</div><div data-module="bottom">${p.content.claims.map(c=>bind('claim:'+c.id,'p','claim')+bind('limitation:'+c.id,'p','limits')).join('')}</div></div><footer class="source">${bind(p.content.sources.map(s=>'source:'+s.key))}</footer></section>`;
 });
 const meta={title:'合成经营决策报告',shortTitle:'报告验收结束',subtitle:'发布前复杂多页流程验收 · 非真实经营建议',closingText:'依据、限制和后续验证需随实际业务重新确认',date:'2026-09-23',producer:'Consulting Report Forge 流程验收',access:'合成材料',version:'1.4.0',project:'release-e2e',statement:'全部数值为合成输入；本报告只验证生产与复核流程。'};
 const refs=bookends.references({sources:[{id:'S1',author:'流程验收',title:'合成经营输入',date:'2026-09-23',version:'1.0',locator:'input.json',kind:'合成数据'}]});
 const bound=html=>html.replace('<section class="slide','<section data-frame-boundary="line" class="slide');
 const html=[bound(bookends.cover(meta)),...bodies,refs,bound(bookends.backCover(meta))].join('\n');
 const css='.release-e2e .slide__header{flex:0 0 132px}.release-e2e[data-layout="custom"] .slide__body{display:grid;flex:0 0 462px;height:462px;grid-template-rows:246px 202px;gap:14px}.release-e2e .data-table{width:100%;table-layout:fixed}.release-e2e th,.release-e2e td{font-size:18px;line-height:26px;padding:5px 16px}.release-e2e th:first-child{width:68%}.release-e2e--scenario .data-table th,.release-e2e--scenario .data-table td{font-size:15px;line-height:22px;padding:8px 8px}.release-e2e--scenario .data-table th:first-child{width:13%}.release-e2e--choice .data-table th,.release-e2e--choice .data-table td{font-size:15px;line-height:22px;padding:7px 8px}.release-e2e--choice .data-table th:first-child{width:12%}.release-e2e--choice .data-table th:nth-child(4){width:24%}.release-e2e--choice .data-table th:nth-child(5){width:23%}.release-e2e--action .data-table th,.release-e2e--action .data-table td{font-size:16px;line-height:25px;padding:8px 10px}.release-e2e--action .data-table th:first-child{width:13%}.release-e2e--action .data-table th:nth-child(2){width:20%}.release-e2e p{font-size:16px;line-height:25px;margin:5px 0}.release-e2e .limits{font-size:14px;line-height:21px;color:#526372}.release-e2e .source{font-size:13px;line-height:19px}';
 fs.writeFileSync(path.join(dir,'pages.html'),html);fs.writeFileSync(path.join(dir,'page.css'),css);
 await require('../../scripts/assemble_deck.cjs').assemble({pagesFile:path.join(dir,'pages.html'),outputFile:path.join(dir,'deck.html'),cssFile:path.join(dir,'page.css'),contractFile:tf,title:meta.title});
 return {dir,html:path.join(dir,'deck.html'),pages:bodies.length+3};
}
(async()=>{const mode=process.argv[2];if(mode==='--prepare')console.log(JSON.stringify(prepare()));else if(mode==='--render')console.log(JSON.stringify(await render()));else throw Error('用法：node docs/showcase/build-release-e2e.cjs --prepare|--render');})().catch(e=>{console.error(e);process.exitCode=1;});
