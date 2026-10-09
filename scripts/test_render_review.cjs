/* 真实 DOM 几何与文件级审查反例；审查记录均为合成数据，不代表人工验收。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const contract=require('./report_contract.cjs'),reviews=require('./review_contract.cjs'),geometry=require('./browser_geometry_audit.cjs'),probe=require('./page_probe.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
function compositionReview(root){
 const write=(name,value)=>fs.writeFileSync(path.join(root,name),typeof value==='string'?value:JSON.stringify(value));
 const doc=require('../tests/fixtures/analysis_fixture.cjs').fixture();doc.analysisAlgorithm='semantic-v2';
 const slide=doc.slides[1];
 slide.visual={layout:'custom',readingPath:'收入变化 → 预测边界',regions:[{slot:'main',role:'primary',span:2,panelRef:'main'},{slot:'aside',role:'evidence',span:1,panelRef:'support'}]};
 slide.exhibit={contract:'semantic-exhibit-v1',semantics:{composition:{version:1,anchorPanel:'main',readingOrder:['main','support'],panels:{
  main:{purpose:'比较两期同口径收入变化',claimRefs:['revenue-change'],form:'kit.dumbbell',selection:{relationship:'comparison',reason:'同一量尺显示两期收入端点，便于直接比较真实收入变化。'},capacity:{items:1},data:{before:{$metric:'base'},after:{$metric:'current'}}},
  support:{purpose:'说明预测的条件和解释边界',claimRefs:['next-year'],form:'html.text',selection:{relationship:'text',reason:'以文字保留预测的条件与限制，不将预测混入实际收入。'}}
 },relations:[{id:'actual-forecast',kind:'complement',panelRefs:['main','support'],reason:'实际变化与预测条件共同限定本页结论的适用范围。'}]}}};
 const task=contract.normalize({version:3,analysisAlgorithm:'semantic-v2',workMode:'analytical',complexity:'simple',majorConclusion:false,kind:'fragment',policyVersions:{...require('./contract_capabilities.cjs').DEFAULT_POLICIES,visual:'evidence-composition-1'}});
 const panelRefs=['revenue:main','revenue:support'],relationRefs=['revenue:actual-forecast'];
 const analysis=require('./analysis_contract.cjs'),analysisSha256=analysis.digest(doc,task);
 const record={schemaVersion:2,status:'complete',analysisAlgorithm:'semantic-v2',analysisSha256,analysisProjection:require('./analysis_projection.cjs').project(doc).projection,reviews:[{role:'author',reviewer:'synthetic',instanceId:'synthetic',conclusion:'ready',basis:'合成合同测试',policyVersions:task.policyVersions,coverage:{claimRefs:doc.claims.map(c=>c.id),issueRefs:['revenue-issue'],optionRefs:[],slideRefs:doc.slides.map(s=>s.id),panelRefs,relationRefs}}],issues:[]};
 write('analysis-review.json',record);write('blueprint.json',doc);
 const t={...task,analysisReview:{record:'analysis-review.json',sha256:contract.fileHash(path.join(root,'analysis-review.json'))}};
 write('pages.json',require('./content_contract.cjs').compile(doc,{task:t,baseDir:root}));
 write('task.json',{...t,blueprint:{record:'blueprint.json'},pages:{record:'pages.json'}});
 const bound=contract.load(path.join(root,'task.json'),path.join(root,'deck.html'));
 const section='<section class="slide" data-page-id="revenue">合成文件级审查夹具</section>';
 write('deck.html',contract.install('<html><head></head><body>'+section+'</body></html>',bound));write('deck.pdf','%PDF-1.4 synthetic file fixture');write('html.png','synthetic image');write('pdf.png','synthetic image');
 const htmlArtifact={path:path.join(root,'deck.html'),sha256:contract.fileHash(path.join(root,'deck.html'))},pdfArtifact={path:path.join(root,'deck.pdf'),sha256:contract.fileHash(path.join(root,'deck.pdf'))};
 const manifest=require('./audit_evidence.cjs').manifest({pages:[{page:1,pageId:'revenue',content:section,styles:[]}],dependencies:{}},[{page:1,screenshot:'html.png'}],[{page:1,path:path.join(root,'pdf.png')}],{html:htmlArtifact,pdf:pdfArtifact},bound,root,{renderer:'synthetic-file-fixture'});
 // 与生产 audit 相同：只有 pagesCheck 状态；没有虚构的 pagesCheck.pages 或 rows[].composition。
 const audit={tier:'acceptance',acceptance:{complete:true},geometryStatus:'PASS',errors:[],warnings:[],pages:1,htmlArtifact,pdfArtifact,documentContract:{reliability:'2'},taskContract:bound,evidenceManifest:manifest,pagesCheck:{status:'PASS'},rows:[{page:1,pageId:'revenue',bookends:{role:'analysis'}}]};
 const review={schemaVersion:5,analysisAlgorithm:'semantic-v2',analysisSha256,status:'complete',reviewer:'synthetic',independence:'author',htmlSha256:htmlArtifact.sha256,pdfSha256:pdfArtifact.sha256,auditSha256:contract.hash(contract.stable(audit)),coverage:[{reviewer:'synthetic',independence:'author',layers:reviews.layers,htmlPages:[1],pdfPages:[1],evidence:manifest.entries.map(e=>({id:e.id})),panelRefs,relationRefs}],checks:Object.fromEntries(['analysis','evidence','visual'].map(k=>[k,{status:'pass',basis:'合成合同测试，不是真实审查'}])),issues:[],warningReview:[]};
 assert.deepEqual(reviews.validate(review,audit,{baseDir:root}),[]);
 for(const [key,pattern] of [['panelRefs',/缺少组合覆盖 revenue:main/],['relationRefs',/缺少关系覆盖 revenue:actual-forecast/]]){
  const missing=clone(review);delete missing.coverage[0][key];
  assert.ok(reviews.validate(missing,audit,{baseDir:root}).some(e=>pattern.test(e)),key+' 不得因 audit 无冗余计划字段而失效');
  assert.ok(reviews.validate(missing,audit,{baseDir:root,partial:true}).some(e=>pattern.test(e)),key+' 原始部分审查也须覆盖本人声明看过的页');
 }
 const checklist=reviews.compositionChecklist(audit,{auditDir:root});
 assert.deepEqual(checklist.map(i=>i.panelRef||i.relationRef),[...panelRefs,...relationRefs]);
 assert.deepEqual(reviews.compositionCoverageErrors(review.coverage[0],[...checklist,{slideId:'other',panelRef:'other:main'}],manifest.entries),[],'分工审查只负责本人证据对应的页');
 write('audit.json',audit);const pack=path.join(root,'pack');fs.mkdirSync(pack);
 require('./review_pack.cjs').prepare({auditFile:path.join(root,'audit.json'),outputDir:pack});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pack,'review-pack.json'))).compositionChecklist,checklist);
 const fenced=require('./aggregate_reviews.cjs').aggregate(audit,['```json\n'+JSON.stringify(review)+'\n```'],{baseDir:root});assert.equal(fenced.status,'complete',JSON.stringify(fenced.aggregationErrors));
 write('review.json',review);const snapshotDir=path.join(root,'snapshot');
 require('./snapshot_review.cjs').snapshotReview({auditFile:path.join(root,'audit.json'),reviewFile:path.join(root,'review.json'),outputDir:snapshotDir});
 const reuse=require('./prepare_review_reuse.cjs').prepareReuse({auditFile:path.join(root,'audit.json'),snapshotDir,outputDir:path.join(root,'reuse')});
 const inherited=JSON.parse(fs.readFileSync(path.join(reuse.directory,reuse.drafts[0])));
 assert.deepEqual(inherited.coverage[0].panelRefs,panelRefs);assert.deepEqual(inherited.coverage[0].relationRefs,relationRefs);
 assert.deepEqual(inherited.pendingPages,[]);inherited.status='complete';inherited.analysisSha256=analysisSha256;inherited.checks=clone(review.checks);
 assert.deepEqual(reviews.validate(inherited,audit,{baseDir:reuse.directory,auditDir:root}),[],'组合覆盖经快照与复用后仍完整可核对');
 const changed=JSON.parse(fs.readFileSync(path.join(root,'pages.json')));changed.pages[0].composition.panels={};write('pages.json',changed);
 assert.throws(()=>reviews.compositionChecklist(audit,{auditDir:root}),/当前 pages/,'陈旧或修改过的计划不得变成空清单');
 return {doc,task};
}
function narrativeReuse(root,base){
 fs.mkdirSync(root);const write=(name,value)=>fs.writeFileSync(path.join(root,name),typeof value==='string'?value:JSON.stringify(value));
 const doc=clone(base.doc),task={...base.task,policyVersions:{...base.task.policyVersions,visual:'narrative-focus-1'}};
 doc.deck.arc='evidence-to-view';doc.slides[1].adds='先区分本期已发生的收入变化与尚未证实的利润判断。';
 const second=clone(doc.slides[1]);second.id='forecast';second.sequence=3;second.title='预测区间须与实际经营结果分别解释';second.adds='再把未来情景的条件假设逐条展开，明确推断的适用边界。';doc.slides.push(second);
 const ids=['revenue','forecast'],panelRefs=ids.flatMap(id=>[id+':main',id+':support']),relationRefs=ids.map(id=>id+':actual-forecast');
 const analysisSha256=require('./analysis_contract.cjs').digest(doc,task);
 const ar={schemaVersion:2,status:'complete',analysisAlgorithm:'semantic-v2',analysisSha256,analysisProjection:require('./analysis_projection.cjs').project(doc).projection,reviews:[{role:'author',reviewer:'synthetic',instanceId:'synthetic',conclusion:'ready',basis:'合成叙事复用夹具',policyVersions:task.policyVersions,coverage:{claimRefs:doc.claims.map(c=>c.id),issueRefs:['revenue-issue'],optionRefs:[],slideRefs:doc.slides.map(s=>s.id),panelRefs,relationRefs,narrativeRefs:ids,arcBasis:'先看已经发生的变化，再解释未来假设与适用范围，形成从证据到判断的推进。'}}],issues:[]};
 write('analysis-review.json',ar);write('blueprint.json',doc);
 const t={...task,analysisReview:{record:'analysis-review.json',sha256:contract.fileHash(path.join(root,'analysis-review.json'))}};
 write('pages.json',require('./content_contract.cjs').compile(doc,{task:t,baseDir:root}));write('task.json',{...t,blueprint:{record:'blueprint.json'},pages:{record:'pages.json'}});
 const bound=contract.load(path.join(root,'task.json'),path.join(root,'deck.html'));
 const sections=ids.map(id=>'<section class="slide" data-page-id="'+id+'">合成叙事片段 '+id+'</section>');
 write('deck.html',contract.install('<html><head></head><body>'+sections.join('')+'</body></html>',bound));write('deck.pdf','%PDF-1.4 synthetic narrative fixture');
 const htmlArtifact={path:path.join(root,'deck.html'),sha256:contract.fileHash(path.join(root,'deck.html'))},pdfArtifact={path:path.join(root,'deck.pdf'),sha256:contract.fileHash(path.join(root,'deck.pdf'))};
 for(const id of ids)for(const medium of ['html','pdf'])write(medium+'-'+id+'.png','synthetic narrative image '+id);
 const manifest=require('./audit_evidence.cjs').manifest({pages:ids.map((id,i)=>({page:i+1,pageId:id,content:sections[i],styles:[]})),dependencies:{}},ids.map((id,i)=>({page:i+1,screenshot:'html-'+id+'.png'})),ids.map((id,i)=>({page:i+1,path:path.join(root,'pdf-'+id+'.png')})),{html:htmlArtifact,pdf:pdfArtifact},bound,root,{renderer:'synthetic-file-fixture'});
 const takeaway='收入增加不能证明利润同步改善';
 const audit={tier:'acceptance',acceptance:{complete:true},geometryStatus:'PASS',errors:[],warnings:[],pages:2,htmlArtifact,pdfArtifact,documentContract:{reliability:'2'},taskContract:bound,evidenceManifest:manifest,pagesCheck:{status:'PASS'},rows:ids.map((id,i)=>({page:i+1,pageId:id,bookends:{role:'analysis'},focus:{takeawayText:takeaway}}))};
 const coverage=ids.map((id,i)=>({reviewer:'synthetic',independence:'author',layers:reviews.requiredLayers(bound),htmlPages:[i+1],pdfPages:[i+1],evidence:manifest.entries.filter(e=>e.pageId===id).map(e=>({id:e.id})),panelRefs:panelRefs.filter(ref=>ref.startsWith(id+':')),relationRefs:relationRefs.filter(ref=>ref.startsWith(id+':')),narrativeReadings:[{slideId:id,observedTakeaway:takeaway}]}));
 coverage[0].repetitionBasis=[['revenue','forecast','合成夹具：两页并排对照实际与假设，特意重复同一解释边界。']];
 const review={schemaVersion:5,analysisAlgorithm:'semantic-v2',analysisSha256,status:'complete',reviewer:'synthetic',independence:'author',htmlSha256:htmlArtifact.sha256,pdfSha256:pdfArtifact.sha256,auditSha256:contract.hash(contract.stable(audit)),coverage,checks:Object.fromEntries(['analysis','evidence','visual'].map(k=>[k,{status:'pass',basis:'合成合同测试，不是真实审查'}])),issues:[],warningReview:[]};
 assert.deepEqual(reviews.validate(review,audit,{baseDir:root}),[],'真实叙事合同允许同一审查者按片段覆盖并提供跨片段重复理由');
 write('audit.json',audit);write('review.json',review);
 const snapshotDir=path.join(root,'snapshot');require('./snapshot_review.cjs').snapshotReview({auditFile:path.join(root,'audit.json'),reviewFile:path.join(root,'review.json'),outputDir:snapshotDir});
 const reuse=require('./prepare_review_reuse.cjs').prepareReuse({auditFile:path.join(root,'audit.json'),snapshotDir,outputDir:path.join(root,'reuse')});
 const inherited=JSON.parse(fs.readFileSync(path.join(reuse.directory,reuse.drafts[0])));
 assert.deepEqual(inherited.coverage[0].repetitionBasis,coverage[0].repetitionBasis,'理由可跨同一审查者的两个继承片段，不能逐片段误删');
 inherited.status='complete';inherited.analysisSha256=analysisSha256;inherited.checks=clone(review.checks);
 assert.deepEqual(reviews.validate(inherited,audit,{baseDir:reuse.directory,auditDir:root}),[],'叙事快照复用仍能完整验证');
 // 任一页图像改变，该页的旧观察与跨页理由都不得被带入当前继承片段。
 write('html-forecast.png','changed synthetic image');const changed=clone(audit);changed.evidenceManifest.entries.find(e=>e.id==='html:forecast').sha256=contract.fileHash(path.join(root,'html-forecast.png'));write('changed-audit.json',changed);
 const partial=require('./prepare_review_reuse.cjs').prepareReuse({auditFile:path.join(root,'changed-audit.json'),snapshotDir,outputDir:path.join(root,'partial-reuse')});
 const partialDraft=JSON.parse(fs.readFileSync(path.join(partial.directory,partial.drafts[0])));
 assert.deepEqual(partialDraft.pendingPages,[2]);assert.ok(partialDraft.coverage.every(c=>!c.repetitionBasis?.length),'单边变化后跨页理由必须重审');
}
function narrativePartitions(){
 const textA='销量下降集中在商超渠道',textB='现金周期拉长限制备货投入';
 const rows=[{page:1,pageId:'p1',focus:{takeawayText:textA}},{page:2,pageId:'p2',focus:{takeawayText:textB}}];
 const manifest=['html','pdf'].flatMap(medium=>rows.map(row=>({id:medium+':'+row.pageId,pageId:row.pageId,page:row.page,medium})));
 const coverage=(id,text)=>({reviewer:'synthetic',independence:'author',evidence:manifest.filter(e=>e.pageId===id).map(e=>({id:e.id})),narrativeReadings:[{slideId:id,observedTakeaway:text}]});
 const parts=[coverage('p1',textA),coverage('p2',textB)];
 assert.deepEqual(reviews.narrativeReviewErrors(parts,rows,manifest),[],'合法分段覆盖不能要求每份片段都记录全册');
 const missing=clone(parts);missing[0].narrativeReadings=[];
 assert.ok(reviews.narrativeReviewErrors(missing,rows,manifest).some(e=>e.includes('缺少叙事覆盖 p1')));
 const mismatched=clone(parts);mismatched[0].narrativeReadings[0].observedTakeaway=textB;
 assert.ok(reviews.narrativeReviewErrors(mismatched,rows,manifest).some(e=>e.includes('对不上')));
 const repeated=[coverage('p1',textA),coverage('p2',textA)],sameRows=clone(rows);sameRows[1].focus.takeawayText=textA;
 assert.ok(reviews.narrativeReviewErrors(repeated,sameRows,manifest).some(e=>e.includes('几乎相同')),'拆分 coverage 不能绕过同一审查者的重复收束检查');
 const whitespaceName=clone(repeated);whitespaceName[1].reviewer+=' ';
 assert.ok(reviews.narrativeReviewErrors(whitespaceName,sameRows,manifest).some(e=>e.includes('几乎相同')),'身份首尾空格不能拆散同一审查者而绕过跨页检查');

 for(const pair of [['p1','p2'],['p1','p2',''],['p1','p2','   '],['p1','p1','有意重复'],['p1','unknown','有意重复']]){
  const invalid=clone(repeated);invalid[0].repetitionBasis=[pair];const errors=reviews.narrativeReviewErrors(invalid,sameRows,manifest);
  assert.ok(errors.some(e=>e.includes('非空重复理由'))&&errors.some(e=>e.includes('几乎相同')),'无效引用或空理由不能放行重复收束');
 }
 const explained=clone(repeated);explained[0].repetitionBasis=[['p1','p2','合成夹具：两页并排对照相同结论的适用边界。']];
 assert.deepEqual(reviews.narrativeReviewErrors(explained,sameRows,manifest),[],'同一身份跨片段的有效理由应保留');

 assert.deepEqual(reviews.narrativeReviewErrors([...parts,clone(parts[0])],rows,manifest),[],'HTML/PDF 或继承片段重复引用同一观察无需伪造差异');
 const split=[{...clone(parts[0]),evidence:[{id:'html:p1'}]},{...clone(parts[0]),evidence:[{id:'pdf:p1'}]}];
 split[1].narrativeReadings[0].observedTakeaway+='。';
 assert.deepEqual(reviews.narrativeReviewErrors(split,rows,manifest),[],'同页双媒介观察的标点差异不是重复页错误');
 const conflict=clone(split);conflict[1].narrativeReadings[0].observedTakeaway=textB;
 assert.ok(reviews.narrativeReviewErrors(conflict,rows,manifest).some(e=>e.includes('对不上')),'每一份观察仍须与真实收束句相符');

 const empty=clone(parts);empty[0].narrativeReadings[0].observedTakeaway='';empty[1].narrativeReadings[0].observedTakeaway='';
 assert.equal(reviews.narrativeReviewErrors(empty,rows,manifest).filter(e=>e.includes('至少6字')).length,2,'须保留每个页面的具体错误，不能只返回首条');
}
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-render-review-'));
 let browser;
 try{
  const base=compositionReview(root);narrativePartitions();narrativeReuse(path.join(root,'narrative'),base);
  browser=await require('playwright').chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage();
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}.slide{display:none;position:relative;width:1280px;height:720px}.slide.active{display:block}[data-module]{position:absolute;left:20px;top:30px;width:400px;height:300px}.shifted{left:40px!important}@media print{.slide{display:block}[data-module]{top:50px}}</style><section class="slide"><div data-module="main" class="shifted">第一页面偏移</div></section><section class="slide active"><div data-module="main">第二页正确</div></section><script>document.addEventListener('keydown',e=>{const all=[...document.querySelectorAll('.slide')];let i=all.findIndex(s=>s.classList.contains('active'));if(e.key==='Home')i=0;else if(e.key==='ArrowRight')i=Math.min(i+1,all.length-1);else return;all.forEach((s,n)=>s.classList.toggle('active',n===i));});</script>`);
  const expected=[{slot:'main',title:'测试模块',box:{x:20,y:30,width:400,height:300}}];
  const hidden=await page.locator('.slide').first().evaluate(geometry.inspectModules,expected);
  assert.equal(hidden.status,'FAIL');assert.equal(hidden.errors[0].code,'M-UNMEASURABLE','隐藏页不能用 NaN 偏差通过');
  await probe.activate(page,0);
  const shifted=await page.locator('.slide').first().evaluate(geometry.inspectModules,expected);
  assert.ok(shifted.errors.some(e=>e.code==='M-GRID'&&e.delta.x===20));
  await probe.activate(page,1);assert.equal((await page.locator('.slide').nth(1).evaluate(geometry.inspectModules,expected)).status,'PASS');
  await page.emulateMedia({media:'print'});
  const printed=await page.locator('.slide').nth(1).evaluate(geometry.inspectModules,expected);
  assert.ok(printed.errors.some(e=>e.code==='M-GRID'&&e.delta.y===20),'仅打印网格变化须独立发现');
  console.log('PASS render/review regressions: hidden-page NaN, screen/print grid, bound composition inventory, partial/narrative coverage, snapshot reuse, fenced JSON aggregation');
 }finally{if(browser)await browser.close();fs.rmSync(root,{recursive:true,force:true});}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
