/* 从指定文件只读推导状态，不扫描目录、不生成审查、不运行有副作用的 CLI。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const contract=require('./report_contract.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function inspect(taskFile,{auditFile,reviewFile}={}){
  taskFile=path.resolve(taskFile);
  const baseDir=path.dirname(taskFile),stages=[],limitations=[];
  const stage=(name,fn)=>{try{const errors=fn();stages.push({name,status:errors.length?'ACTION_REQUIRED':'VALID',errors});}catch(e){stages.push({name,status:'ACTION_REQUIRED',errors:[e.message]});}};
  let task,doc,blueprintFile,pages,audit;
  stage('task',()=>{task=contract.normalize(read(taskFile));return [];});
  if(!task)return finish();
  stage('blueprint',()=>{
    if(!task.blueprint?.record)return ['task 尚未绑定 blueprint.record'];
    blueprintFile=path.resolve(baseDir,task.blueprint.record);doc=read(blueprintFile);
    const options={task:contract.rebaseAnalysisTask(task,baseDir,path.dirname(blueprintFile)),baseDir:path.dirname(blueprintFile),stage:'synthesis'};
    const errors=require('./deck_blueprint.cjs').validate(doc,options).errors;
    if((doc.schemaVersion===3)!==(require('./contract_capabilities.cjs').capabilities(task).analysis))errors.push('schema3 与 task2/task3 必须配套，不能混用合同');
    if(task.blueprint.sha256&&contract.fileHash(blueprintFile)!==task.blueprint.sha256)errors.push('task.blueprint 摘要过期');
    return errors;
  });
  if(doc){
    if(doc.schemaVersion===3&&task.version===2)limitations.push('analysis-review1 未覆盖 slides.exhibit、标题及侧栏；VALID 仅表示现有合同有效。');
    if(task.version===3)limitations.push(...require('./analysis_projection.cjs').project(doc).warnings.map(w=>w.slideId+'：'+w.message));
    stage('analysis-review',()=>doc.schemaVersion===3?require('./analysis_review_contract.cjs').check(doc,{task:contract.rebaseAnalysisTask(task,baseDir,path.dirname(blueprintFile)),baseDir:path.dirname(blueprintFile)}):[]);
    stage('pages',()=>{
      if(!task.pages?.record)return ['task 尚未绑定 pages.record'];
      const file=path.resolve(baseDir,task.pages.record);pages=read(file);
      const errors=require('./verify_blueprint_pages.cjs').verify(doc,pages,{task:contract.rebaseAnalysisTask(task,baseDir,path.dirname(blueprintFile)),baseDir:path.dirname(blueprintFile),preview:pages.preview===true});
      if(task.pages.sha256&&contract.fileHash(file)!==task.pages.sha256)errors.push('task.pages 摘要过期');
      if(pages.preview)errors.push('pages 为预览，不能正式交付');
      return errors;
    });
  }
  stage('acceptance',()=>{
    if(!auditFile)return ['尚未提供 --audit；未检查最终 HTML/PDF'];
    auditFile=path.resolve(auditFile);audit=read(auditFile);
    const errors=require('./review_contract.cjs').auditErrors(audit,{auditDir:path.dirname(auditFile)});
    // 防止把另一份有效报告的 audit 当作当前任务的状态。
    if(audit.taskContract){
      const html=path.resolve(path.dirname(auditFile),audit.htmlArtifact?.path||'');
      const expected=contract.load(taskFile,html);
      if(contract.stable(expected)!==contract.stable(contract.normalize(audit.taskContract)))errors.push('audit 不属于当前 task 及绑定记录');
    }else errors.push('audit 无法绑定当前 task');
    return errors;
  });
  stage('final-review',()=>{
    if(!reviewFile)return ['尚未提供 --review；未检查实际审查记录'];
    if(!audit)return ['缺少可读取的 audit，不能核对最终审查'];
    return require('./review_contract.cjs').validate(read(reviewFile),audit,{baseDir:path.dirname(path.resolve(reviewFile)),auditDir:path.dirname(auditFile)});
  });
  return finish();
  function finish(){
    const first=stages.find(s=>s.status!=='VALID');
    const actions={task:'修正 task 合同及读取错误',blueprint:'先解决蓝图综合校验与绑定摘要问题','analysis-review':'实际重审变化分析及全局综合，再绑定前置审查；不能自动签署',pages:'用 compile_blueprint.cjs 重新编译并绑定 pages',acceptance:'完成装配，运行 qa_deck.cjs --tier acceptance，再提供 --audit','final-review':'实际查看双媒介证据，填写审查并提供 --review'};
    return {version:1,readOnly:true,taskFile,stages,status:first?'ACTION_REQUIRED':'CHECKED',next:first?{stage:first.name,action:actions[first.name]}:{action:'指定记录已核对；聚合审查和打包仍由既有生产门执行'},limitations,...(audit?{diagnostics:require('./diagnostic_summary.cjs').summarize(audit)}:{})};
  }
}
function run(args){
  const [command,taskFile,...rest]=args;
  if(!['status','next'].includes(command)||!taskFile)throw Error('用法：node scripts/report_status.cjs status|next task.json [--audit audit.json] [--review review.json]');
  const options={};
  for(let i=0;i<rest.length;i+=2){if(!['--audit','--review'].includes(rest[i])||!rest[i+1]||rest[i+1].startsWith('--'))throw Error('未知或缺值的选项：'+rest[i]);const key=rest[i]==='--audit'?'auditFile':'reviewFile';if(options[key])throw Error('重复选项：'+rest[i]);options[key]=rest[i+1];}
  const result=inspect(taskFile,options);return command==='next'?{readOnly:true,status:result.status,next:result.next}:result;
}
if(require.main===module){try{const result=run(process.argv.slice(2));console.log(JSON.stringify(result,null,2));if(result.status==='ACTION_REQUIRED')process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={inspect,run};
