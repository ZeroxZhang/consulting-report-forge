'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {fixture,task}=require('../tests/fixtures/analysis_fixture.cjs'),analysis=require('./analysis_contract.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'analysis-review-'));const doc=fixture();fs.writeFileSync(path.join(dir,'input.csv'),'year,revenue\n2024,100\n2025,120\n');
const hash=require('./report_contract.cjs').fileHash;
doc.artifacts=[{id:'input-data',kind:'input',path:'input.csv',sha256:hash(path.join(dir,'input.csv')),dependsOn:[]}];doc.analysis.workItems[0].artifactRefs=['input-data'];
// 此文件内的通过记录仅是校验器夹具，绝非真实审查。
const record={schemaVersion:1,analysisSha256:analysis.digest(doc),reviews:[{reviewer:'test-author',instanceId:'test-instance-a',role:'author',conclusion:'ready',basis:'测试夹具：独立手算增长20%，利润未知。',coverage:{claimRefs:['revenue-change','next-year'],issueRefs:['revenue-issue'],optionRefs:[]}}],issues:[]};
assert.ok(fs.existsSync(path.join(__dirname,'analysis_review_contract.cjs')),'必须实现前置审查合同');
const review=require('./analysis_review_contract.cjs');
assert.deepEqual(review.validate(record,doc,{task,baseDir:dir}),[]);
assert.ok(review.validate(record,doc,{task:{...task,complexity:'complex'},baseDir:dir}).length);
const wrong=structuredClone(record);wrong.reviews[0].coverage.claimRefs=[];assert.ok(review.validate(wrong,doc,{task,baseDir:dir}).length);
const changed=structuredClone(doc);changed.slides[1].visual.primary='版面变化';assert.deepEqual(review.validate(record,changed,{task,baseDir:dir}),[]);
fs.writeFileSync(path.join(dir,'input.csv'),'year,revenue\n2024,100\n2025,120.01\n');assert.ok(review.validate(record,doc,{task,baseDir:dir}).some(e=>e.includes('附件')));
fs.writeFileSync(path.join(dir,'input.csv'),'year,revenue\n2024,100\n2025,120\n');
fs.writeFileSync(path.join(dir,'review.json'),JSON.stringify(record));const bound={...task,analysisReview:{record:'review.json',sha256:hash(path.join(dir,'review.json'))}};
assert.deepEqual(review.check(doc,{task:bound,baseDir:dir}),[]);
const major=structuredClone(record);major.reviews.push({...major.reviews[0],role:'independent'});assert.ok(review.validate(major,doc,{task:{...task,complexity:'complex'},baseDir:dir}).length,'同一实例不得自称独立');
const imports=require('./import_analysis_results.cjs');fs.writeFileSync(path.join(dir,'model.cjs'),'/* synthetic external calculation */');fs.writeFileSync(path.join(dir,'output.json'),'{"margin":2}');
const result={run:{id:'run-1',command:'node model.cjs',executedAt:'2026-09-23T00:00:00Z'},artifacts:[{id:'model-code',kind:'code',path:'model.cjs',sha256:hash(path.join(dir,'model.cjs')),dependsOn:['input-data']},{id:'model-result',kind:'output',path:'output.json',sha256:hash(path.join(dir,'output.json')),dependsOn:['model-code','input-data']}],claims:[{...structuredClone(doc.claims[0]),id:'imported-margin',statement:'合成结果{{metric:margin}}',metrics:[{id:'margin',unit:'万元',decimals:0,external:{artifactRef:'model-result',pointer:'/margin'}}],artifactRefs:['model-result']}]};
const next=imports.importResults(doc,result,{baseDir:dir,task});assert.equal(next.claims.at(-1).metrics[0].value,2);assert.equal(doc.claims.length,2);assert.throws(()=>imports.importResults(next,result,{baseDir:dir,task}),/重复/);
const missing=structuredClone(result);missing.artifacts[1].dependsOn=[];assert.throws(()=>imports.importResults(doc,missing,{baseDir:dir,task}),/血缘|输入/);

// 防止导入后 value 漂移，或只更新附件摘要却忘记重导入。
const tampered=structuredClone(next);tampered.claims.at(-1).metrics[0].value=999;
assert.ok(analysis.validate(tampered,{task,baseDir:dir,stage:'synthesis',preview:true}).some(e=>/导入值|输出数值/.test(e)),'导入值须持续与原输出一致');
assert.throws(()=>require('./content_contract.cjs').compile(tampered,{task,baseDir:dir,preview:true}),/导入值|输出数值/);
fs.writeFileSync(path.join(dir,'output.json'),'{"margin":3}');const stale=structuredClone(next);stale.artifacts.find(a=>a.id==='model-result').sha256=hash(path.join(dir,'output.json'));
assert.ok(analysis.validate(stale,{task,baseDir:dir,stage:'ready',preview:true}).some(e=>/导入值|输出数值/.test(e)));
fs.writeFileSync(path.join(dir,'output.json'),'{"margin":2}');
const incomplete=structuredClone(doc);incomplete.artifacts.push({id:'model-result',kind:'output',path:'output.json',sha256:hash(path.join(dir,'output.json')),dependsOn:[]});
assert.throws(()=>imports.importResults(incomplete,{...result,artifacts:[]},{baseDir:dir,task}),/血缘|输入|运行/,'旧 output 同样必须核对血缘');
const noRun=structuredClone(next);delete noRun.artifacts.find(a=>a.kind==='output').run;assert.ok(analysis.validate(noRun,{task,baseDir:dir,stage:'research'}).length);
const invalidPointer=structuredClone(next);invalidPointer.claims.at(-1).metrics[0].external.pointer='/missing';assert.ok(analysis.validate(invalidPointer,{task,baseDir:dir,stage:'synthesis'}).some(e=>/字段不存在/.test(e)));
fs.rmSync(dir,{recursive:true,force:true});console.log('PASS analysis review: scope, identity, artifacts, layout, bound file, imported lineage');
