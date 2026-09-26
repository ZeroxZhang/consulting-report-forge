/* 合成合同回归；所有审查身份均为测试夹具，不能用于真实报告交付。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const contract=require('./report_contract.cjs'),analysis=require('./analysis_contract.cjs'),projection=require('./analysis_projection.cjs');
async function main(){
 const referenceBlock=process.env.REFERENCE_BLOCK_TEST==='1';
 const out=path.resolve(__dirname,referenceBlock?'../renders/strict-reference-integration':'../renders/strict-integration');fs.mkdirSync(out,{recursive:true});
 const file=n=>path.join(out,n),write=(n,v)=>fs.writeFileSync(file(n),typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');
 const doc=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../tests/fixtures/upgrade-blueprint.json')));
 const body=doc.slides.filter(s=>require('./content_contract.cjs').CONTENT_ROLES.has(s.pageRole));
 doc.schemaVersion=3;doc.analysisAlgorithm='semantic-v2';delete doc.deck.governingThought;
 doc.claims=body.flatMap(s=>s.sourcePlan.claims);doc.artifacts=[];
 doc.analysis=structuredClone(require('../tests/fixtures/analysis_fixture.cjs').fixture().analysis);
 doc.analysis.workItems[0].outputClaimRefs=doc.claims.map(c=>c.id);doc.analysis.synthesis.answerClaimRefs=[doc.claims[0].id];
 for(const s of body){s.claimRefs=s.sourcePlan.claims.map(c=>c.id);s.metricRefs=s.sourcePlan.claims.flatMap(c=>(c.metrics||[]).map(m=>m.id));delete s.sourcePlan;
   if(s.visual.form==='custom')s.visual.form='svg.custom';
   s.visual.selection={relationship:'exact',reason:'合成对照用同一数值与具名条件检验内容绑定，不用于真实业务判断。'};
 }
 const task={version:3,analysisAlgorithm:'semantic-v2',workMode:'analytical',complexity:'simple',majorConclusion:false,kind:'fragment',mode:'reading',theme:'mckinsey',typography:'serif-report-bold',ratio:'16x9',blueprint:{record:'blueprint.json'},pages:{record:'pages.json'}};
 if(referenceBlock){task.policyVersions={...contract.normalize(task).policyVersions,references:'reference-block-1',visual:'structural-lines-1'};task.referenceIds=['S1','S2','S3','S4'];}
 const record={schemaVersion:2,status:'complete',analysisAlgorithm:'semantic-v2',analysisSha256:analysis.digest(doc,task),analysisProjection:projection.project(doc).projection,reviews:[{role:'author',reviewer:'synthetic-contract-fixture',instanceId:'synthetic-contract-fixture',basis:'合成校验器夹具，非真实分析审查',conclusion:'ready',coverage:{claimRefs:doc.claims.map(c=>c.id),issueRefs:['revenue-issue'],optionRefs:[],slideRefs:doc.slides.map(s=>s.id)}}],issues:[]};
 write('analysis-review.json',record);task.analysisReview={record:'analysis-review.json',sha256:contract.fileHash(file('analysis-review.json'))};write('task.json',task);write('blueprint.json',doc);
 require('./compile_blueprint.cjs').run([file('blueprint.json'),file('pages.json'),'--task',file('task.json')]);
 const pages=JSON.parse(fs.readFileSync(file('pages.json')));
 const fixture=require('./test_upgrade_render.cjs');write('pages.html',fixture.authorPages(pages.pages)+(referenceBlock?require('./bookends.cjs').referencesBlock({sources:task.referenceIds.map(id=>({id,title:'合成资料 '+id,url:'https://example.org/'+id})),pageSize:2}):''));write('pages.css',fixture.css);
 await require('./assemble_deck.cjs').assemble({pagesFile:file('pages.html'),outputFile:file('deck.html'),cssFile:file('pages.css'),contractFile:file('task.json'),title:'严格合同合成测试，不是真实报告'});
 const run=spawnSync(process.execPath,[path.join(__dirname,'qa_deck.cjs'),file('deck.html'),file('qa'),'--tier','acceptance'],{encoding:'utf8'});
 write('qa-command.log',run.stdout+run.stderr);assert.equal(run.status,0,run.stdout+run.stderr);
 const audit=JSON.parse(fs.readFileSync(file('qa/audit.json'))),reviews=require('./review_contract.cjs');
 const final={schemaVersion:5,status:'complete',analysisAlgorithm:'semantic-v2',analysisSha256:analysis.digest(doc,task),reviewer:'synthetic-contract-fixture',independence:'author',htmlSha256:audit.htmlArtifact.sha256,pdfSha256:audit.pdfArtifact.sha256,auditSha256:contract.hash(contract.stable(audit)),coverage:[{reviewer:'synthetic-contract-fixture',independence:'author',layers:reviews.layers,htmlPages:audit.rows.map(r=>r.page),pdfPages:audit.rows.map(r=>r.page),evidence:audit.evidenceManifest.entries.map(e=>({id:e.id}))}],checks:Object.fromEntries(['analysis','evidence','visual'].map(k=>[k,{status:'pass',basis:'合成合同测试数据，不是实际审稿结论'}])),warningReview:(audit.warnings||[]).map(warning=>({warning,status:'accepted',note:'合成测试告警处置，不可复用到真实报告'})),issues:[]};
 write('review-fixture.json',final);
 assert.deepEqual(reviews.validate(final,audit,{baseDir:out,auditDir:file('qa')}),[]);
 const aggregated=require('./aggregate_reviews.cjs').aggregate(audit,[final],{baseDir:out,auditDir:file('qa')});assert.equal(aggregated.status,'complete',JSON.stringify(aggregated.aggregationErrors));
 const packageArgs={htmlFile:file('deck.html'),pdfFile:audit.pdfArtifact.path,outputDir:file('fixture-delivery'),baseName:'synthetic-contract-test',auditFile:file('qa/audit.json'),reviewFile:file('review-fixture.json'),force:true};
 require('./package_delivery.cjs').packageDelivery(packageArgs);
 write('review-fixture.json',{...final,status:'incomplete'});assert.throws(()=>require('./package_delivery.cjs').packageDelivery(packageArgs),/未完成|complete|审查/);write('review-fixture.json',final);
 const snap=file('snapshot');if(fs.existsSync(snap))fs.rmSync(snap,{recursive:true,force:true});
 require('./snapshot_review.cjs').snapshotReview({auditFile:file('qa/audit.json'),reviewFile:file('review-fixture.json'),outputDir:snap});assert.equal(require('./snapshot_review.cjs').loadSnapshot(snap).review.schemaVersion,5);
 if(referenceBlock){
   assert.equal(audit.pages,5);assert.equal(audit.bookendsCheck.policy,'reference-block-1');assert.ok(audit.rows.filter(r=>r.bookends.role==='references').every(r=>r.referencesPrint.expected===2&&!r.referencesPrint.missing.length));
   write('print-missing-reference.html',fs.readFileSync(file('deck.html'),'utf8').replace('</head>','<style>@media print{[data-page-role="references"] .reference-item:last-child{visibility:hidden}}</style></head>'));
   const negative=spawnSync(process.execPath,[path.join(__dirname,'qa_deck.cjs'),file('print-missing-reference.html'),file('negative-reference-qa'),'--tier','acceptance'],{encoding:'utf8'});
   assert.notEqual(negative.status,0);assert.ok(JSON.parse(fs.readFileSync(file('negative-reference-qa/audit.json'))).errors.some(e=>e.includes('缺少完整参考条目')),'PDF 隐藏来源必须拦截');
   const entry=require('./report.cjs');
   for(const [command,args] of [['review-pack',[]],['aggregate',['--reviews',JSON.stringify([file('review-fixture.json')])]],['snapshot',['--review',file('review-fixture.json')]],['package',['--review',file('review-fixture.json')]]]){
     const result=await entry.run([command,file('task.json'),'--audit',file('qa/audit.json'),...args]);assert.equal(result.status,'published');
   }
 }
 const changed=structuredClone(doc);changed.slides.find(s=>s.proves).proves+='改变判断';write('blueprint.json',changed);
 assert.throws(()=>require('./compile_blueprint.cjs').run([file('blueprint.json'),file('pages.json'),'--task',file('task.json')]),/投影变化|旧版本/);write('blueprint.json',doc);
 write('result.json',{pass:true,synthetic:true,actualReview:false,contracts:'task3/analysis-review2/final-review5',checks:['compile','assemble','acceptance','aggregate','snapshot','package','incomplete rejected','changed assertion rejected']});
 console.log('PASS strict real-render pipeline (synthetic review fixtures only): '+file('result.json'));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
