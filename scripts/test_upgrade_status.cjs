'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture,task}=require('../tests/fixtures/analysis_fixture.cjs');
const status=require('./report_status.cjs'),fonts=require('./browser_font_audit.cjs'),summary=require('./diagnostic_summary.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forge-status-'));
const write=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value));
const snapshot=()=>Object.fromEntries(fs.readdirSync(dir).map(name=>[name,{bytes:fs.readFileSync(path.join(dir,name)).toString('base64'),mtime:fs.statSync(path.join(dir,name)).mtimeMs}]));
try{
  const doc=fixture(),config={...task,blueprint:{record:'blueprint.json'},pages:{record:'pages.json'}};
  write('blueprint.json',doc);write('task.json',config);
  const before=snapshot(),result=status.inspect(path.join(dir,'task.json'));
  assert.equal(result.next.stage,'analysis-review');
  assert.match(result.limitations[0],/未覆盖/);
  assert.deepEqual(snapshot(),before,'只读状态不得写入任务或缓存');
  const pages=require('./content_contract.cjs').compile(doc,{task,baseDir:dir,preview:true});write('pages.json',pages);
  assert.ok(status.inspect(path.join(dir,'task.json')).stages.find(s=>s.name==='pages').errors.some(e=>e.includes('预览')));
  write('review.json',{schemaVersion:1,analysisSha256:'0'.repeat(64),reviews:[],issues:[]});
  config.analysisReview={record:'review.json',sha256:require('./report_contract.cjs').fileHash(path.join(dir,'review.json'))};write('task.json',config);
  assert.ok(status.inspect(path.join(dir,'task.json')).stages.find(s=>s.name==='analysis-review').errors.some(e=>e.includes('旧版本')));
  write('audit.json',{geometryStatus:'PASS',errors:[],rows:[],pages:1});
  const invalid=status.inspect(path.join(dir,'task.json'),{auditFile:path.join(dir,'audit.json'),reviewFile:path.join(dir,'review.json')});
  assert.equal(invalid.stages.find(s=>s.name==='acceptance').status,'ACTION_REQUIRED');
  assert.equal(invalid.stages.find(s=>s.name==='final-review').status,'ACTION_REQUIRED');
  write('task.json',{...config,version:3});assert.equal(status.inspect(path.join(dir,'task.json')).next.stage,'task');
  assert.throws(()=>status.run(['status',path.join(dir,'task.json'),'--bad','x']),/未知/);
  assert.throws(()=>status.run(['next',path.join(dir,'task.json'),'--audit']),/缺值/);
  assert.equal(status.run(['next',path.join(dir,'task.json')]).readOnly,true);
  fs.writeFileSync(path.join(dir,'task.json'),'{');assert.equal(status.inspect(path.join(dir,'task.json')).next.stage,'task');
}finally{fs.rmSync(dir,{recursive:true,force:true});}

const node={family:'Expected',role:'body',style:'normal',weight:400};
const expected={expected:'Expected',allowed:['Expected Platform'],weightOK:true};
assert.deepEqual(fonts.classify(node,[{familyName:'Expected Platform',isCustomFont:true}],expected),[]);
const custom=fonts.classify({...node,family:'Numeric'},[{familyName:'Numeric Platform',isCustomFont:true}],expected);
assert.deepEqual(custom.map(d=>d.code),['F-ROLE-FAMILY','F-CUSTOM-ROLE']);
assert.ok(!fonts.describe({unexpected:[{...node,reasons:custom.map(d=>d.message)}]}).includes('系统回退'));
assert.ok(fonts.classify(node,[{familyName:'Arial',isCustomFont:false}],expected).some(d=>d.code==='F-SYSTEM-FALLBACK'));
assert.ok(fonts.classify(node,[],expected).some(d=>d.code==='F-NO-GLYPH-EVIDENCE'));
assert.ok(fonts.classify({...node,weight:900},[],{...expected,weightOK:false}).some(d=>d.code==='F-WEIGHT'));
// 穷举原来的拒绝条件，分类不能放宽任何字体允许范围。
for(const family of ['Expected','Other'])for(const isCustomFont of [false,true])for(const platform of ['Expected Platform','Other'])for(const weightOK of [false,true])for(const style of ['normal','italic']){
  const actual=fonts.classify({...node,family,style},[{familyName:platform,isCustomFont}],{...expected,weightOK});
  assert.equal(actual.length>0,family!=='Expected'||!isCustomFont||platform!=='Expected Platform'||!weightOK||style!=='normal');
}
const observation={code:'V-SOURCE-COLLISION',selector:'div > table',message:'冲突',bounds:{x:1,y:2,width:3,height:4}};
const audit={warnings:['旧 warning 原字节'],rows:[{page:1,screenshot:'page.png',visualPolicy:{warnings:[observation]},printVisualPolicy:{warnings:[{...observation,bounds:{...observation.bounds,y:8}}]}}]};
const original=JSON.stringify(audit),grouped=summary.summarize(audit);
assert.equal(grouped.issueCount,1);assert.equal(grouped.observationCount,2);
assert.deepEqual(grouped.issues[0].observations.map(o=>o.bounds.y),[2,8]);
assert.equal(JSON.stringify(audit),original);
audit.rows.push({...structuredClone(audit.rows[0]),page:2});assert.equal(summary.summarize(audit).issueCount,2,'不同页面不得归并');
audit.rows[0].printVisualPolicy.warnings[0].selector='other';assert.equal(summary.summarize(audit).issueCount,3,'不同对象不得归并');
audit.rows[0].readingShadow={observations:[{code:'R-TEXT-OVERLAP',selector:'a',otherSelector:'b'},{code:'R-TEXT-OVERLAP',selector:'a',otherSelector:'c'}]};
assert.equal(summary.summarize(audit).issueCount,5,'同一文字与不同邻接对象的碰撞不得归并');
console.log('PASS upgrade status: read-only, stale/missing/preview/invalid records, font classifications and unchanged rejection, per-medium diagnostics');
