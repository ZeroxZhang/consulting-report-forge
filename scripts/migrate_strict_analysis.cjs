/* 新目录迁移：原字节归档，新投影只有 incomplete 草稿，绝不搬运 ready 身份。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const contract=require('./report_contract.cjs'),projection=require('./analysis_projection.cjs');
function migrate(taskFile,outputDir){
  taskFile=fs.realpathSync(taskFile);const sourceDir=path.dirname(taskFile),destination=require('./snapshot_review.cjs').resolveOutput(outputDir);
  const task=contract.normalize(JSON.parse(fs.readFileSync(taskFile,'utf8')));
  if(task.version!==2)throw Error('仅接受 task2/schema3；更旧任务先完成既有内容迁移');
  for(const key of ['blueprint','pages','analysisReview'])if(task[key]?.sha256&&contract.fileHash(path.resolve(sourceDir,task[key].record))!==task[key].sha256)throw Error('原任务绑定摘要过期：'+key);
  if(fs.existsSync(destination))throw Error('拒绝覆盖已有迁移目录');
  const relative=path.relative(sourceDir,destination);
  if(!relative||!relative.startsWith('..'+path.sep)&&relative!=='..')throw Error('迁移目录必须在原任务目录之外');
  const blueprintFile=fs.realpathSync(path.resolve(sourceDir,task.blueprint?.record||''));
  const original=JSON.parse(fs.readFileSync(blueprintFile,'utf8'));
  if(original.schemaVersion!==3||original.analysisAlgorithm!==undefined)throw Error('须为旧 schema3 蓝图');
  const errors=require('./analysis_contract.cjs').validate(original,{task:contract.rebaseAnalysisTask(task,sourceDir,path.dirname(blueprintFile)),baseDir:path.dirname(blueprintFile),stage:'synthesis'});
  if(errors.length)throw Error('原蓝图无效：'+errors.join('；'));
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const lock=destination+'.lock';fs.mkdirSync(lock);
  let staging;
  try{
    staging=fs.mkdtempSync(path.join(path.dirname(destination),'.strict-migration-'));
    const write=(name,value)=>fs.writeFileSync(path.join(staging,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    const manifest=[];
    function preserve(source,target){
      const before=contract.fileHash(source),to=path.join(staging,target);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(source,to,fs.constants.COPYFILE_EXCL);
      if(contract.fileHash(to)!==before||contract.fileHash(source)!==before)throw Error('迁移过程中输入发生变化：'+source);
      manifest.push({source,target,sha256:before});
    }
    preserve(taskFile,'original/task.json');preserve(blueprintFile,'original/blueprint.json');
    for(const key of ['analysisReview','pages'])if(task[key]?.record)preserve(path.resolve(sourceDir,task[key].record),'original/'+key+'.json');
    const doc=structuredClone(original);doc.analysisAlgorithm='semantic-v2';
    for(const artifact of doc.artifacts){
      const target='artifacts/'+artifact.id+path.extname(artifact.path);
      preserve(path.resolve(path.dirname(blueprintFile),artifact.path),target);artifact.path=target;
    }
    const projected=projection.project(doc);
    const pending=doc.slides.filter(s=>s.exhibit!==undefined).map(s=>({slideId:s.id,status:'needs_mapping_review',reason:'未猜测单位、分母或证据身份；需确认展示值与登记指标/模型输出的关系',conservative:!projection.split(s.exhibit)}));
    const record={schemaVersion:2,status:'incomplete',analysisAlgorithm:'semantic-v2',analysisSha256:projection.digest(doc),analysisProjection:projected.projection,reviews:[],issues:[]};
    const next={...task,version:3,analysisAlgorithm:'semantic-v2',blueprint:{record:'blueprint.json'},pages:{record:'pages.json'},analysisReview:{record:'analysis-review.json',sha256:contract.hash(JSON.stringify(record,null,2)+'\n')}};
    delete next.analysisPreview;
    write('blueprint.json',doc);write('analysis-review.json',record);write('task.json',next);
    const pendingModels=doc.artifacts.filter(a=>a.kind==='output').map(a=>({artifactRef:a.id,status:'needs_portability_review',reason:'附件按原字节保留；代码内部路径与运行命令未自动重写，须在新目录复算并登记实际运行及血缘'}));
    write('migration.json',{version:1,status:'incomplete',from:{task:2,analysisReview:1},to:{task:3,analysisReview:2,finalReview:5},originalFiles:manifest,projectionWarnings:projected.warnings,pending,pendingModels,
      note:'原审查仅保留历史字节；新稿必须实际重审全部展示论断及全局综合。尚未编译、装配或完成新合同验收。'});
    // 发布前复核所有源文件，防止迁移中途源任务被其他作者改写。
    for(const item of manifest)if(contract.fileHash(item.source)!==item.sha256)throw Error('源文件发生变化：'+item.source);
    if(fs.existsSync(destination))throw Error('迁移目标被其他操作创建');
    fs.renameSync(staging,destination);staging=null;
    return {status:'incomplete',directory:destination,pendingSlides:pending.length,sourceFiles:manifest.length};
  }finally{if(staging)fs.rmSync(staging,{recursive:true,force:true});fs.rmdirSync(lock);}
}
if(require.main===module){try{if(process.argv.length!==4)throw Error('用法：node scripts/migrate_strict_analysis.cjs task.json 全新输出目录');console.log(JSON.stringify(migrate(...process.argv.slice(2)),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={migrate};
