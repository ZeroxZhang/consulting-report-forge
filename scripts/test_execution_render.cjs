/* 真实渲染 + 合成审查合同测试；不冒充实际报告交付。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const contract=require('./report_contract.cjs'),analysis=require('./analysis_contract.cjs'),projection=require('./analysis_projection.cjs');
const E=require('./execution_plan.cjs'),api=require('./report.cjs'),R=require('./execution_requirements.cjs');
async function main(){
 const out=path.resolve(__dirname,'../renders/execution-integration-'+Date.now());fs.mkdirSync(out,{recursive:true});
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
 if(false){task.policyVersions={...contract.normalize(task).policyVersions,references:'reference-block-1',visual:'structural-lines-1'};task.referenceIds=['S1','S2','S3','S4'];}
 const record={schemaVersion:2,status:'complete',analysisAlgorithm:'semantic-v2',analysisSha256:analysis.digest(doc,task),analysisProjection:projection.project(doc).projection,reviews:[{role:'author',reviewer:'synthetic-contract-fixture',instanceId:'synthetic-contract-fixture',basis:'合成校验器夹具，非真实分析审查',conclusion:'ready',coverage:{claimRefs:doc.claims.map(c=>c.id),issueRefs:['revenue-issue'],optionRefs:[],slideRefs:doc.slides.map(s=>s.id)}}],issues:[]};
 write('analysis-review.json',record);task.analysisReview={record:'analysis-review.json',sha256:contract.fileHash(file('analysis-review.json'))};write('task.json',task);write('blueprint.json',doc);

 task.policyVersions={...contract.normalize(task).policyVersions,workflow:'execution-plan-1'};task.executionPlan={id:require('node:crypto').randomUUID(),record:'execution-plan.json'};
 write('task.json',task);write('execution-plan.json',E.create(task));
 let seq=0;const plan=()=>JSON.parse(fs.readFileSync(file('execution-plan.json'))),update=ops=>E.update(file('task.json'),{expectedRevision:plan().revision,operationId:'fixture-'+(++seq),ops});
 const complete=(id,files,auditFile)=>{const item=plan().items.find(i=>i.id===id);update([{action:'start',id}]);const attempt=plan().items.find(i=>i.id===id).attempt;
  const record={...(auditFile?{audit:{record:path.relative(out,auditFile),sha256:contract.fileHash(auditFile)}}:{}),kind:item.criterion,reviewer:'synthetic-contract-fixture',basis:'合成状态合同，不是真实人工审查',requirementRefs:item.requirementRefs,alternatives:doc.slides.map(s=>({pageId:s.id,considered:'合成候选',decision:'测试取舍'})),files:files.map(f=>({record:path.relative(out,f),sha256:contract.fileHash(f)}))};write(id+'-evidence.json',record);
  update([{action:'submit',id,attemptId:attempt.id,evidence:id+'-evidence.json'},{action:'accept',id,reviewer:'synthetic-contract-main',basis:'合成主笔接收'}]);};
 assert.throws(()=>require('./compile_blueprint.cjs').run([file('blueprint.json'),file('pages.json'),'--task',file('task.json')]),/未激活/);
 update([{action:'activate',intake:{goal:'测试工作流',scope:'合成三页',deliverables:'HTML/PDF',constraints:'多样性必须存在',approach:'真实渲染合成审查',nextStep:'规划',openQuestions:[]}}]);
 complete('chart-plan',[file('blueprint.json')]);complete('layout-plan',[file('blueprint.json')]);
 const compiled=await api.run(['compile',file('task.json')]);const derived=compiled.result.taskFile,pages=JSON.parse(fs.readFileSync(compiled.result.output));
 assert.ok(!fs.existsSync(file('pages.json')),'原始 task 可保留尚不存在的 pages 位置');
 const fixture=require('./test_upgrade_render.cjs');write('pages.html',fixture.authorPages(pages.pages));write('pages.css',fixture.css);
 const assembled=await api.run(['assemble',derived,'--pages',file('pages.html'),'--css',file('pages.css')]),html=assembled.result.output;
 await assert.rejects(require('./qa_deck.cjs').run([html,file('blocked-qa'),'--tier','acceptance']),/门禁/);
 const smoke=await api.run(['qa',derived,'--html',html,'--tier','smoke']);const smokeAudit=JSON.parse(fs.readFileSync(smoke.result.auditFile));
 complete('representatives',[path.resolve(path.dirname(smoke.result.auditFile),smokeAudit.rows[0].screenshot)],smoke.result.auditFile);complete('production',[html]);
 const qa=await api.run(['qa',derived,'--html',html,'--tier','acceptance']),auditFile=qa.result.auditFile,audit=JSON.parse(fs.readFileSync(auditFile)),reviews=require('./review_contract.cjs');
 assert.equal(audit.unitsCheck.status,'PASS');assert.equal(E.status(file('task.json')).items.find(i=>i.id==='acceptance').status,'done');
 const final={schemaVersion:5,status:'complete',analysisAlgorithm:'semantic-v2',analysisSha256:analysis.digest(doc,task),reviewer:'synthetic-contract-fixture',independence:'author',htmlSha256:audit.htmlArtifact.sha256,pdfSha256:audit.pdfArtifact.sha256,auditSha256:contract.hash(contract.stable(audit)),coverage:[{reviewer:'synthetic-contract-fixture',independence:'author',layers:reviews.layers,htmlPages:audit.rows.map(r=>r.page),pdfPages:audit.rows.map(r=>r.page),evidence:audit.evidenceManifest.entries.map(e=>({id:e.id}))}],checks:Object.fromEntries(['analysis','evidence','visual'].map(k=>[k,{status:'pass',basis:'合成合同测试，非实际审查'}])),warningReview:(audit.warnings||[]).map(warning=>({warning,status:'accepted',note:'合成测试处置'})),issues:[]};
 assert.ok(reviews.validate(final,audit,{baseDir:out,auditDir:path.dirname(auditFile)}).some(e=>e.includes('qualityChecks')));
 final.qualityChecks=R.FIXED.map(r=>({id:r.id,status:'pass',reviewer:final.reviewer,independence:'author',basis:'合成全册审查合同，非真实判断',evidenceIds:audit.evidenceManifest.entries.map(e=>e.id),observations:audit.rows.map(s=>({pageId:s.pageId||('page-'+s.page),observed:'合成内容',considered:'合成其他形式',decision:'合成取舍'})),repetitions:[]}));write('review-fixture.json',final);
 const aggregated=await api.run(['aggregate',derived,'--audit',auditFile,'--reviews',JSON.stringify([file('review-fixture.json')])]);const reviewFile=aggregated.result.reviewFile;
 assert.equal(E.status(file('task.json')).items.find(i=>i.id==='chart-diversity').status,'done');
 const contentBefore=fs.readFileSync(file('pages.css'));fs.appendFileSync(file('pages.css'),'/* changed input */');assert.equal(E.status(file('task.json')).items.find(i=>i.id==='acceptance').status,'pending');fs.writeFileSync(file('pages.css'),contentBefore);
 const packaged=await api.run(['package',derived,'--audit',auditFile,'--review',reviewFile]);assert.equal(E.status(file('task.json')).items.find(i=>i.id==='package').status,'done');
 const receipt=JSON.parse(fs.readFileSync(packaged.result.receipt));assert.ok(plan().revision>receipt.revision);assert.equal(require('./execution_receipt.cjs').reconcile(file('task.json'),packaged.result.receipt).status,'already-applied');
 const archived=await api.run(['archive',file('task.json')]);assert.equal(E.status(file('task.json')).items.find(i=>i.id==='archive').status,'done');
 const reuse=require('./prepare_review_reuse.cjs').prepareReuse({auditFile,snapshotDir:path.join(archived.result.directory,'reviewed'),outputDir:file('reuse-check')});assert.deepEqual(reuse.requiresReview,[]);for(const draftFile of reuse.drafts){const draft=JSON.parse(fs.readFileSync(path.join(reuse.directory,draftFile)));assert.equal(draft.status,'incomplete');assert.ok(draft.qualityChecks.every(c=>c.status==='not_reviewed'));}
 const restored=require('./execution_archive.cjs').restore(archived.result.directory,file('restored'));assert.equal(require('./snapshot_review.cjs').loadSnapshot(path.join(path.dirname(restored.taskFile),'reviewed')).review.schemaVersion,5);
 const before=fs.readFileSync(file('execution-plan.json'));E.status(file('task.json'),{resume:true});assert.deepEqual(fs.readFileSync(file('execution-plan.json')),before);
 const changed=structuredClone(doc);changed.slides[0].title+='变化';write('blueprint.json',changed);assert.equal(E.status(file('task.json')).items.find(i=>i.id==='package').status,'pending');write('blueprint.json',doc);
 write('result.json',{pass:true,syntheticReview:true,actualReview:false,checks:['root-to-derived recovery','shared lock without QA deadlock','direct compile and QA gates','actual HTML/PDF units','fixed quality checks','package freeze receipt idempotency','portable complete archive','input invalidation'],html,auditFile,reviewFile,receipt:packaged.result.receipt});console.log('PASS execution real-render pipeline: '+file('result.json'));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
