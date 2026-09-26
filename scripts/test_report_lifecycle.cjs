'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const api=require('./report.cjs'),pack=require('./review_pack.cjs');
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forge-lifecycle-'));
 try{
  const directory=path.join(root,'task');await api.run(['init',directory]);
  const task=path.join(directory,'task.json'),before=fs.readFileSync(task);
  const current=JSON.parse(before),blueprint=JSON.parse(fs.readFileSync(path.join(directory,'deck-blueprint.json')));
  assert.equal(current.version,3);assert.equal(current.analysisAlgorithm,blueprint.analysisAlgorithm);
  assert.equal(current.policyVersions.visual,'structural-lines-1');
  assert.deepEqual(require('./analysis_contract.cjs').validate(blueprint,{task:current,stage:'research',baseDir:directory}),[]);
  const oldDir=path.join(root,'legacy');await api.run(['init',oldDir,'--contract','legacy']);
  const legacy=JSON.parse(fs.readFileSync(path.join(oldDir,'task.json'))),oldBlueprint=JSON.parse(fs.readFileSync(path.join(oldDir,'deck-blueprint.json')));
  assert.equal(legacy.version,2);assert.equal(legacy.analysisAlgorithm,undefined);assert.equal(legacy.policyVersions,undefined);assert.equal(oldBlueprint.analysisAlgorithm,undefined);
  assert.deepEqual(require('./analysis_contract.cjs').validate(oldBlueprint,{task:legacy,stage:'research',baseDir:oldDir}),[]);
  assert.throws(()=>api.initialize(directory),/拒绝/);
  await api.transaction(task,'test',async dir=>{fs.writeFileSync(path.join(dir,'good.txt'),'valid');return {ok:true};});
  const pointer=path.join(directory,'.forge/latest-test.json'),saved=fs.readFileSync(pointer);
  await assert.rejects(api.transaction(task,'test',async dir=>{fs.writeFileSync(path.join(dir,'partial.txt'),'partial');throw Error('模拟部分输出失败');}),/部分输出/);
  assert.deepEqual(fs.readFileSync(pointer),saved,'失败不能替换上一有效结果');assert.deepEqual(fs.readFileSync(task),before);
  await api.transaction(task,'concurrent',async dir=>{await assert.rejects(api.transaction(task,'other',async()=>({})),/锁/);const derived=path.join(dir,'task.json');fs.copyFileSync(task,derived);await assert.rejects(api.transaction(derived,'other',async()=>({})),/锁/);return {};});
  const lock=path.join(directory,'.forge/lock');fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,host:os.hostname()}));
  assert.throws(()=>api.recover(task),/仍在运行/);fs.rmSync(lock,{recursive:true});
  const dead=require('node:child_process').spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'});
  fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:Number(dead.stdout),host:os.hostname()}));
  assert.equal(api.recover(task).status,'recovered');
  const child=require('node:child_process').spawn(process.execPath,['-e',`const fs=require('fs');require(${JSON.stringify(require.resolve('./report.cjs'))}).transaction(process.argv[1],'test',async dir=>{fs.writeFileSync(require('path').join(dir,'partial.txt'),'unfinished');process.stdout.write('ready');await new Promise(()=>setInterval(()=>{},1000));});`,task],{stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('模拟中断进程未启动'));},5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});
  const ended=new Promise(resolve=>child.once('close',resolve));child.kill('SIGKILL');await ended;
  assert.deepEqual(fs.readFileSync(pointer),saved,'中断不能更新成功索引');assert.ok(fs.existsSync(lock));assert.equal(api.recover(task).status,'recovered');
  const item={code:'V-EMPTY-MODULE',selector:'div:nth-child(1)',message:'间隙',bounds:{x:0,y:1}};
  const audit={warnings:['第2页视觉诊断：'+JSON.stringify(item),'第2页打印视觉诊断：'+JSON.stringify({...item,bounds:{x:0,y:2}}),'普通告警']};
  const grouped=pack.warningGroups(audit);assert.equal(grouped.groups.length,2);
  const decisions={...grouped,groups:grouped.groups.map(g=>({...g,status:'accepted',note:'合成测试处置'}))};
  assert.equal(pack.expandDispositions(audit,decisions).length,3);
  assert.throws(()=>pack.expandDispositions({...audit,warnings:[]},decisions),/旧版/);
  assert.throws(()=>pack.expandDispositions(audit,{...decisions,groups:[{...decisions.groups[0],note:''}]}),/具体依据/);
  console.log('PASS lifecycle: no reset, atomic publication, failed output retention, lock exclusion, live-lock recovery rejection, grouped signed dispositions');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
