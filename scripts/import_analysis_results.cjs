/* 从已运行的 JSON 输出映射指标；不执行外部脚本，不覆盖原蓝图。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const analysis=require('./analysis_contract.cjs');
const {pointer,outputErrors}=require('./analysis_artifacts.cjs');
function importResults(doc,result,{baseDir,task}={}){
  if(doc?.schemaVersion!==3||!Array.isArray(result?.claims)||!Array.isArray(result.artifacts)||!result.run?.id||!result.run.command||!Number.isFinite(Date.parse(result.run.executedAt)))throw Error('导入须有 schema3、claims、artifacts 和实际 run 记录');
  const next=structuredClone(doc),ids=new Set([...doc.claims,...doc.artifacts].map(x=>x.id));
  for(const x of [...result.claims,...result.artifacts]){if(ids.has(x.id))throw Error('导入 ID 重复：'+x.id);ids.add(x.id);}
  next.artifacts.push(...structuredClone(result.artifacts).map(a=>({...a,run:structuredClone(result.run)})));
  const ars=new Map(next.artifacts.map(a=>[a.id,a]));
  for(const raw of result.claims){
    const c=structuredClone(raw);c.artifactRefs=[...(c.artifactRefs||[])];
    for(const m of c.metrics||[]){
      if(!m.external||Object.hasOwn(m,'value')||m.formula)throw Error('导入指标须以 external 映射输出，不得手填 value/formula');
      const errors=outputErrors(ars,m.external.artifactRef);if(errors.length)throw Error(errors.join('；'));
      const a=ars.get(m.external.artifactRef);
      m.value=pointer(JSON.parse(fs.readFileSync(path.resolve(baseDir,a.path),'utf8')),m.external.pointer);if(typeof m.value!=='number'||!Number.isFinite(m.value))throw Error('输出指标不是有限数字');
      if(!c.artifactRefs.includes(a.id))c.artifactRefs.push(a.id);
    }
    next.claims.push(c);
  }
  const checked=[...analysis.validate(next,{task,stage:'research'}),...analysis.artifactErrors(next,baseDir)];if(checked.length)throw Error(checked.join('；'));return next;
}
function run(args){const [input,resultFile,output,taskFile]=args;if(!taskFile||args.length!==4)throw Error('用法：node scripts/import_analysis_results.cjs blueprint.json result-map.json new-blueprint.json task.json');if(fs.existsSync(output))throw Error('拒绝覆盖现有输出');const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));const next=importResults(read(input),read(resultFile),{baseDir:path.dirname(path.resolve(input)),task:read(taskFile)});fs.writeFileSync(output,JSON.stringify(next,null,2)+'\n',{flag:'wx'});return {status:'imported',output};}
if(require.main===module){try{console.log(JSON.stringify(run(process.argv.slice(2))));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={importResults,run};
