'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture,task:legacyTask}=require('../tests/fixtures/analysis_fixture.cjs');
const analysis=require('./analysis_contract.cjs'),projection=require('./analysis_projection.cjs'),review=require('./analysis_review_contract.cjs'),contract=require('./report_contract.cjs');
const task={...legacyTask,version:3,analysisAlgorithm:'semantic-v2'},doc={...fixture(),analysisAlgorithm:'semantic-v2'};
const metric=doc.claims[0].metrics[0];
doc.slides[1].exhibit={contract:'semantic-exhibit-v1',semantics:{value:{$metric:metric.id},unit:metric.unit,denominator:'同口径',encoding:{one:'已核实'},lowerBound:false},style:{fontSize:18,x:1}};
doc.slides[1].aside=[{text:'有限结论'}];
const record={schemaVersion:2,status:'complete',analysisAlgorithm:'semantic-v2',analysisSha256:analysis.digest(doc,task),analysisProjection:projection.project(doc).projection,
 reviews:[{role:'author',reviewer:'fixture-author',instanceId:'fixture-only',conclusion:'ready',basis:'仅验证合同的合成测试；不是真实报告签署',coverage:{claimRefs:doc.claims.map(c=>c.id),issueRefs:['revenue-issue'],optionRefs:[],slideRefs:doc.slides.map(s=>s.id)}}],issues:[]};
assert.deepEqual(review.validate(record,doc,{task}),[]);
for(const [name,mutate] of [
 ['decimal',d=>{d.claims[0].metrics[0].value+=0.001;}],
 ['denominator',d=>{d.slides[1].exhibit.semantics.denominator='不同口径';}],
 ['heatmap',d=>{d.slides[1].exhibit.semantics.encoding.one='预测';}],
 ['lowerBound',d=>{d.slides[1].exhibit.semantics.lowerBound=true;}],
 ['title',d=>{d.slides[1].title+='变化';}],
 ['aside',d=>{d.slides[1].aside[0].text+='变化';}]
]){const changed=structuredClone(doc);mutate(changed);assert.notEqual(analysis.digest(changed,task),record.analysisSha256,name);assert.ok(review.validate(record,changed,{task}).some(e=>e.includes('分析投影变化：/')),name);}
const styled=structuredClone(doc);styled.slides[1].exhibit.style.fontSize=24;styled.slides[1].exhibit.style.x=10;
assert.equal(analysis.digest(styled,task),record.analysisSha256);
assert.deepEqual(review.validate(record,styled,{task}),[]);
const custom=structuredClone(doc);custom.slides[1].exhibit={value:1,x:1};const old=analysis.digest(custom,task);custom.slides[1].exhibit.x=2;assert.notEqual(analysis.digest(custom,task),old);assert.ok(projection.project(custom).warnings.length);
assert.throws(()=>analysis.digest(doc,legacyTask),/严格/);
assert.throws(()=>contract.normalize({...task,version:2}),/降级/);
assert.throws(()=>contract.normalize({...task,version:4}),/不支持/);
for(const version of [null,'2','3',2.5])assert.throws(()=>contract.normalize({...task,version}),/不支持/);
const Module=require('node:module'),oldReader=new Module(path.join(__dirname,'legacy-report-contract.cjs'),module);
oldReader.filename=path.join(__dirname,'legacy-report-contract.cjs');oldReader.paths=module.paths;
oldReader._compile(fs.readFileSync(path.join(__dirname,'../tests/fixtures/runtime-1.4.0-report-contract.cjs'),'utf8'),oldReader.filename);
assert.throws(()=>oldReader.exports.normalize(task),/不支持/,'1.4.0原读取器必须拒绝task3');
assert.deepEqual(oldReader.exports.normalize(legacyTask),contract.normalize(legacyTask),'旧任务归一化原样保留');
assert.ok(review.validate({...record,schemaVersion:1},doc,{task}).length);
assert.ok(review.validate({...record,status:'incomplete'},doc,{task}).length);
const noCoverage=structuredClone(record);noCoverage.reviews[0].coverage.slideRefs=[];assert.ok(review.validate(noCoverage,doc,{task}).some(e=>e.includes('展示论断')));
const invalid=structuredClone(doc);invalid.slides[1].exhibit.style.encoding='wrong';assert.ok(projection.validate(invalid).length);
const changed=structuredClone(doc);changed.slides[1].displayBindings=[{pointer:'/exhibit/semantics/value',metricRef:metric.id}];assert.deepEqual(projection.validate(changed),[]);
changed.slides[1].exhibit.semantics.value=999;assert.ok(projection.validate(changed).some(e=>e.includes('不一致')));
const compiled=require('./content_contract.cjs').compile(doc,{task,preview:true});assert.equal(compiled.analysisAlgorithm,'semantic-v2');assert.equal(compiled.pages[0].exhibit.semantics.value,metric.value);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'strict-analysis-'));
try{
 const bindingDoc=structuredClone(doc),dataFile=path.join(dir,'data.json');
 fs.writeFileSync(dataFile,JSON.stringify({value:metric.value,relation:'>',unit:'百万美元',missing:null}));
 bindingDoc.artifacts=[{id:'exhibit-input',kind:'input',path:'data.json',sha256:contract.fileHash(dataFile),dependsOn:[]}];
 bindingDoc.slides[1].exhibit={data:{value:metric.value,relation:'>',unit:'百万美元',missing:null}};
 bindingDoc.slides[1].exhibitBindings=Object.keys(bindingDoc.slides[1].exhibit.data).map(k=>({pointer:'/exhibit/data/'+k,artifactRef:'exhibit-input',sourcePointer:'/'+k}));
 const artifacts=require('./analysis_artifacts.cjs');
 assert.deepEqual(artifacts.validate(bindingDoc,{baseDir:dir,files:true}),[]);
 assert.ok(analysis.adopted(bindingDoc).artifactRefs.includes('exhibit-input'));
 for(const [key,value] of [['value',metric.value+0.00001],['relation','='],['unit','万美元'],['missing',0]]){
   const mutation=structuredClone(bindingDoc);mutation.slides[1].exhibit.data[key]=value;
   assert.ok(artifacts.validate(mutation,{baseDir:dir,files:true}).some(e=>e.includes('展品与附件不一致')),key);
 }
 const badBinding=structuredClone(bindingDoc);badBinding.slides[1].exhibitBindings[0].artifactRef='absent';
 assert.ok(artifacts.validate(badBinding).some(e=>e.includes('展品附件映射无效')));
 const original=path.join(dir,'original');fs.mkdirSync(original);
 const write=(name,value)=>fs.writeFileSync(path.join(original,name),JSON.stringify(value));
 write('blueprint.json',fixture());write('task.json',{...legacyTask,blueprint:{record:'blueprint.json'}});
 const before=contract.fileHash(path.join(original,'blueprint.json'));
 const target=path.join(dir,'new'),migrator=require('./migrate_strict_analysis.cjs');
 const migrated=migrator.migrate(path.join(original,'task.json'),target);assert.equal(migrated.status,'incomplete');
 assert.equal(contract.fileHash(path.join(original,'blueprint.json')),before);
 const t=JSON.parse(fs.readFileSync(path.join(target,'task.json'))),d=JSON.parse(fs.readFileSync(path.join(target,'blueprint.json')));
 assert.ok(review.check(d,{task:t,baseDir:target}).some(e=>e.includes('未完成')));
 assert.throws(()=>require('./content_contract.cjs').compile(d,{task:t,baseDir:target}),/未完成|缺少/);
 assert.throws(()=>migrator.migrate(path.join(original,'task.json'),target),/覆盖/);
 assert.throws(()=>migrator.migrate(path.join(original,'task.json'),path.join(original,'inside')),/之外/);
 fs.mkdirSync(path.join(dir,'locked.lock'));assert.throws(()=>migrator.migrate(path.join(original,'task.json'),path.join(dir,'locked')),/EEXIST/);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('PASS strict analysis: semantic mutation, exact diff, separated styles, conservative custom, references, anti-downgrade, review coverage, atomic draft migration');
