'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {fixture,task}=require('../tests/fixtures/analysis_fixture.cjs'),compile=require('./compile_blueprint.cjs'),contract=require('./report_contract.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'analysis-integration-'));const write=(n,d)=>{const p=path.join(dir,n);fs.writeFileSync(p,JSON.stringify(d,null,2));return p;};
const d=fixture(),bp=write('blueprint.json',d),tf=write('task.json',{...task,pages:{record:'pages.json'},blueprint:{record:'blueprint.json'}}),pf=path.join(dir,'pages.json');
for(const flags of [['--stage','research'],['--stage','synthesis'],['--ready','--preview']]){
 const result=spawnSync(process.execPath,[path.join(__dirname,'deck_blueprint.cjs'),bp,'--task',tf,...flags],{encoding:'utf8'});
 assert.equal(result.status,0,`蓝图 CLI ${flags.join(' ')} 须通过：${result.stderr||result.stdout}`);
 assert.equal(JSON.parse(result.stdout).status,'PASS');
}
assert.doesNotThrow(()=>compile.run([bp,pf,'--task',tf,'--preview']),'新格式显式预览须可编译');
const preview=JSON.parse(fs.readFileSync(pf));assert.equal(preview.preview,true);assert.throws(()=>compile.run([bp,pf,'--task',tf]),/analysisReview/);
let c=contract.load(tf,path.join(dir,'deck.html'));assert.equal(c.analysisPreview,true);assert.deepEqual(contract.verifyPlan(c,dir,preview),[]);
assert.ok(contract.install('<html><head></head><body></body></html>',c).includes('deck-analysis-status'));
const tamper=structuredClone(preview);tamper.preview=false;assert.ok(contract.verifyPlan(c,dir,tamper).length);
assert.ok(contract.verifyPlan({...c,version:1},dir,preview).length,'不能换 task1 绕过');
const analysis=require('./analysis_contract.cjs');const ar={schemaVersion:1,analysisSha256:analysis.digest(d),reviews:[{reviewer:'fixture-author',instanceId:'fixture-instance',role:'author',conclusion:'ready',basis:'测试专用记录，不是真实验收。',coverage:{claimRefs:['revenue-change','next-year'],issueRefs:['revenue-issue'],optionRefs:[]}}],issues:[]};
const rf=write('analysis-review.json',ar);write('task.json',{...task,pages:{record:'pages.json'},blueprint:{record:'blueprint.json'},analysisReview:{record:'analysis-review.json',sha256:contract.fileHash(rf)}});
compile.run([bp,pf,'--task',tf]);const ready=JSON.parse(fs.readFileSync(pf));assert.equal(ready.preview,false);c=contract.load(tf,path.join(dir,'deck.html'));assert.deepEqual(contract.verifyPlan(c,dir,ready),[]);
const cliReady=spawnSync(process.execPath,[path.join(__dirname,'deck_blueprint.cjs'),bp,'--task',tf,'--ready'],{encoding:'utf8'});
assert.equal(cliReady.status,0,`正式蓝图 CLI 须通过：${cliReady.stderr||cliReady.stdout}`);
const finalReview=require('./review_contract.cjs');assert.ok(finalReview.validate({schemaVersion:3},{taskContract:c},{baseDir:dir}).some(e=>e.includes('schemaVersion:4')));
write('analysis-review.json',{...ar,analysisSha256:'0'.repeat(64)});assert.ok(contract.verifyPlan(c,dir,ready).length);
fs.rmSync(dir,{recursive:true,force:true});console.log('PASS analysis integration: CLI preview, task binding, anti-downgrade, review invalidation');
