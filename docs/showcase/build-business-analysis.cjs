/* 合成业务集成样稿；只生成输入/页面，不生成任何通过审查记录。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),scripts=path.join(root,'scripts');
const content=require(path.join(scripts,'content_contract.cjs')),contract=require(path.join(scripts,'report_contract.cjs'));
const out=path.join(root,'renders/business-analysis');
const value=(id,n,unit='元')=>({id,value:n,unit,decimals:Number.isInteger(n)?0:1});
const formula=(id,op,args,unit='元')=>({id,formula:{op,args},unit,decimals:0});
const claim=(id,statement,metrics,limitation,kind='fact')=>({id,kind,statement,verification:'provided',sourceKeys:['S1'],period:'两个合成完整期间',population:'同一合成业务',unit:'元',denominator:'不适用：绝对值对比',calculation:'按全局 metrics 的显式公式复算',inference:'只说明所列关系',limitation,metrics});
function doc(name){
  const d=require('../../tests/fixtures/analysis_fixture.cjs').fixture();d.deck.title=name==='profit'?'合成经营诊断：增长与利润':'合成市场研究：规模与进入条件';d.deck.decision=d.deck.title;d.sources={S1:{label:'合成输入，仅验证工具链',locator:'input.json · 本案例全部数值'}};d.claims=[];d.analysis.issues=[{id:'main-issue',question:d.deck.title,priority:'high',disposition:'answered',workItemRefs:['main-work']}];d.analysis.workItems=[{id:'main-work',issueRefs:['main-issue'],method:name==='profit'?'profit-driver-tree':'market-boundary',rationale:'先核对算术，再区分可支持与未知',status:'complete',inputClaimRefs:['raw-input'],artifactRefs:['input-file'],outputClaimRefs:['finding'],counterEvidence:'不能把算术关系解释成已识别因果或进入建议'}];d.analysis.synthesis={answerClaimRefs:['finding'],openIssueRefs:[],basis:'合成输入能支持算术关系，不能替代真实经营或投资判断。'};d.analysis.brief={question:d.deck.title,purpose:name==='profit'?'diagnosis':'research',scope:'合成单业务',period:'合成期间',baseline:'同一口径比较',constraints:'未验证因果或进入投入',successCriteria:'给出可复算、有边界的结果'};
  const s=d.slides[1];s.id=name;s.claimRefs=['finding'];s.metricRefs=[];s.visual={form:'html.table',semanticType:'table',selection:{relationship:'exact',reason:'需要逐格核对两期数值和公式结果，表格保留精确值与统一表头。'},primary:'共同表头的数值与口径比较',layout:'custom',readingPath:'标题 → 精确对照 → 支持结论与边界',regions:[{slot:'main',role:'primary',form:'html.table',span:3},{slot:'bottom',role:'support',form:'html.text',span:1}]};s.proves='同一内容真源的计算结果及边界';s.density={profile:'balanced',evidenceUnits:[{role:'primary',purpose:'以共同表头核对同口径数值'},{role:'support',purpose:'明确结果不能推出的判断'}],spaceIntent:'表格与结论分组，来源独立'};
  return d;
}
function prepare(name){
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});const d=doc(name);let input,rows;
  if(name==='profit'){
    input={q0:100,p0:10,c0:6,f0:200,q1:120,p1:9,c1:6.5,f1:220};
    d.claims=[claim('raw-input','输入为合成销量、净价、单位成本和固定费用。',Object.entries(input).map(([id,n])=>value(id,n,id.startsWith('q')?'件':id.startsWith('f')?'元':'元/件')),'合成输入，不代表实际企业'),claim('finding','收入上升而利润下降；价格、成本与数量的净效果需要同时核对。',[formula('revenue0','multiply',['q0','p0']),formula('revenue1','multiply',['q1','p1']),formula('cost0','multiply',['q0','c0']),formula('cost1','multiply',['q1','c1']),formula('contribution0','subtract',['revenue0','cost0']),formula('contribution1','subtract',['revenue1','cost1']),formula('profit0','subtract',['contribution0','f0']),formula('profit1','subtract',['contribution1','f1']),formula('profit-change','subtract',['profit1','profit0'])],'合成算术；不能证明价格变化导致销量变化。')];
    d.slides[1].title='收入增加，利润从{{metric:profit0}}降至{{metric:profit1}}';d.slides[1].metricRefs=['revenue0','revenue1','cost0','cost1','contribution0','contribution1','profit0','profit1','profit-change'];rows=[['收入','revenue0','revenue1'],['变动成本','cost0','cost1'],['贡献','contribution0','contribution1'],['利润','profit0','profit1']];
  }else{
    input={accounts:10000,eligible:2000,spend:5000,capacity:80};
    d.claims=[claim('raw-input','输入为合成账户边界、年度支出和团队容量。',Object.entries(input).map(([id,n])=>value(id,n,id==='spend'?'元/户/年':'户')),'未给出赢单率、进入投入或获客成本。'),claim('finding','适用客户支出与团队可交付金额回答不同问题；当前证据不足以建议进入。',[formula('sam','multiply',['eligible','spend'],'元/年'),formula('ceiling','multiply',['capacity','spend'],'元/年')],'容量金额假定全部交付且全部赢单，不是销售预测或可获得份额。','estimate')];
    d.slides[1].title='市场支出空间与交付容量不能当成同一个销售预测';d.slides[1].metricRefs=['sam','ceiling'];rows=[['适用客户年度支出','sam','2,000 户 × 年支出'],['团队容量对应金额','ceiling','80 户 × 年支出；假定全赢单']];
    d.claims.forEach(c=>{c.period='合成年度';c.population='合成客户与团队容量';c.unit='元/年';});
    d.slides[1].density.profile='sparse';d.slides[1].density.sparseReason='只比较两种不同边界的金额，证据不足以增加进入建议。';
    d.analysis.gaps=[{id:'entry-cost-gap',description:'未给进入投入与赢单率，不能给进入推荐',route:'bounded',affectedRefs:[],blockingScope:'none',status:'unavailable',resolution:{basis:'本轮目标收窄为规模边界研究，未做投资推荐'}}];
  }
  fs.writeFileSync(path.join(dir,'input.json'),JSON.stringify(input,null,2)+'\n');d.artifacts=[{id:'input-file',kind:'input',path:'input.json',sha256:contract.fileHash(path.join(dir,'input.json')),dependsOn:[]}];
  fs.writeFileSync(path.join(dir,'blueprint.json'),JSON.stringify(d,null,2)+'\n');fs.writeFileSync(path.join(dir,'rows.json'),JSON.stringify(rows,null,2)+'\n');
  const task={version:2,workMode:'analytical',complexity:'simple',majorConclusion:false,mode:'reading',ratio:'16x9',kind:'fragment',theme:'mckinsey',typography:'serif-report-bold',blueprint:{record:'blueprint.json'},pages:{record:'pages.json'},critical:[]};
  fs.writeFileSync(path.join(dir,'task.json'),JSON.stringify(task,null,2)+'\n');
  return {name,dir,analysisSha256:require(path.join(scripts,'analysis_contract.cjs')).digest(d)};
}
async function render(name){
  const dir=path.join(out,name),tf=path.join(dir,'task.json'),task=JSON.parse(fs.readFileSync(tf)),rf=path.join(dir,'analysis-review.json');
  if(fs.existsSync(rf)){task.analysisReview={record:'analysis-review.json',sha256:contract.fileHash(rf)};fs.writeFileSync(tf,JSON.stringify(task,null,2)+'\n');}
  require(path.join(scripts,'compile_blueprint.cjs')).run([path.join(dir,'blueprint.json'),path.join(dir,'pages.json'),'--task',tf,...(task.analysisReview?[]:['--preview'])]);
  const p=JSON.parse(fs.readFileSync(path.join(dir,'pages.json'))).pages[0],rows=JSON.parse(fs.readFileSync(path.join(dir,'rows.json')));
  const bind=(k,tag='span',cls='')=>content.html(p,k,{tag,className:cls});
  const metricIds=new Set(p.content.metrics.map(m=>m.id)),rendered=new Set();
  const cell=v=>{if(metricIds.has(v)){rendered.add(v);return bind('metric:'+v,'td');}return '<td>'+v+'</td>';};
  const table='<table class="data-table"><thead><tr><th>指标</th><th>'+ (name==='profit'?'基期':'金额')+'</th><th>'+(name==='profit'?'本期':'口径')+'</th></tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell).join('')+'</tr>').join('')+'</tbody></table>';
  const extras=p.content.metrics.filter(m=>!rendered.has(m.id)).map(m=>'<p class="delta">利润变化：'+bind('metric:'+m.id)+'</p>').join('');
  const html=`<section class="slide reading business-sample" data-page-id="${p.id}" data-frame-boundary="line"><header class="slide__header">${bind('title','h1','slide__title')}<p class="slide__lead">合成案例 · 统一分析、计算与可见绑定验证</p></header><div class="slide__body"><div data-module="main">${table}${extras}</div><div data-module="bottom">${p.content.claims.map(c=>bind('claim:'+c.id,'p')+bind('limitation:'+c.id,'p','limits')).join('')}</div></div><footer class="source">${bind(p.content.sources.map(s=>'source:'+s.key))}</footer></section>`;
  const css='.business-sample .slide__header{flex:0 0 132px}.business-sample[data-layout="custom"] .slide__body{display:grid;flex:0 0 462px;height:462px;grid-template-rows:'+ (name==='market'?'190px 258px':'300px 148px') +';gap:14px}.business-sample .data-table{width:100%;table-layout:fixed}.business-sample th{font-size:18px}.business-sample td{font-size:20px;line-height:30px;padding:10px 18px}.business-sample th:first-child{width:30%}.business-sample p{font-size:18px;line-height:29px;margin:8px 0}.business-sample .limits{font-size:15px;line-height:24px;color:#526372}.business-sample .delta{color:#000080;font-size:22px}.business-sample .source{font-size:13px;line-height:19px}';
  fs.writeFileSync(path.join(dir,'pages.html'),html);fs.writeFileSync(path.join(dir,'page.css'),css);
  await require(path.join(scripts,'assemble_deck.cjs')).assemble({pagesFile:path.join(dir,'pages.html'),outputFile:path.join(dir,'deck.html'),cssFile:path.join(dir,'page.css'),contractFile:tf,title:p.title});
  return {name,html:path.join(dir,'deck.html')};
}
(async()=>{const mode=process.argv[2];if(!['--prepare','--render'].includes(mode))throw Error('用法：node docs/showcase/build-business-analysis.cjs --prepare|--render');for(const name of (process.argv[3]?[process.argv[3]]:['profit','market'])){if(!['profit','market'].includes(name))throw Error('未知样例');console.log(JSON.stringify(mode==='--prepare'?prepare(name):await render(name)));}})().catch(e=>{console.error(e);process.exitCode=1;});
