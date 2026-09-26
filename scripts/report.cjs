/* 统一入口复用生产合同；产物写入独立运行目录，成功后原子发布索引，绝不覆写作者配置或审查。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const contract=require('./report_contract.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function stateRoot(taskFile){
  let dir=path.dirname(fs.realpathSync(taskFile));
  for(let current=dir;path.dirname(current)!==current;current=path.dirname(current))if(path.basename(current)==='.forge'&&path.relative(current,dir).startsWith('runs'+path.sep))return current;
  return path.join(dir,'.forge');
}
async function transaction(taskFile,operation,work){
  taskFile=fs.realpathSync(taskFile);
  const root=stateRoot(taskFile),lock=path.join(root,'lock');
  fs.mkdirSync(root,{recursive:true});
  try{fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')throw Error('任务正被操作或上次中断留下锁；确认进程已退出后运行 recover-lock。');throw e;}
  let run;
  try{
    write(path.join(lock,'owner.json'),{pid:process.pid,host:os.hostname(),operation,startedAt:new Date().toISOString()});
    run=path.join(root,'runs',Date.now()+'-'+crypto.randomUUID());fs.mkdirSync(run,{recursive:true});
    const startedAt=new Date().toISOString();
    const result=await work(run);
    const record={operation,taskFile,startedAt,finishedAt:new Date().toISOString(),status:'published',result};
    write(path.join(run,'result.json'),record);
    const pending=path.join(root,operation+'-'+crypto.randomUUID()+'.tmp');
    try{write(pending,{record:path.join(run,'result.json')});fs.renameSync(pending,path.join(root,'latest-'+operation+'.json'));}
    finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
    return {...record,directory:run};
  }catch(e){if(run)write(path.join(run,'failure.json'),{operation,status:'failed',message:e.message,finishedAt:new Date().toISOString()});throw e;}
  finally{fs.rmSync(lock,{recursive:true,force:true});}
}
function recover(taskFile){
  const lock=path.join(stateRoot(taskFile),'lock');
  const owner=read(path.join(lock,'owner.json'));
  if(owner.host!==os.hostname()||!Number.isInteger(owner.pid)||owner.pid<1)throw Error('锁身份无法核实，不能自动恢复');
  try{process.kill(owner.pid,0);throw Error('锁持有进程仍在运行');}catch(e){if(e.code!=='ESRCH')throw e;}
  fs.rmSync(lock,{recursive:true});return {status:'recovered',previousOwner:owner};
}
function initialize(directory,{strict=true}={}){
  directory=path.resolve(directory);if(fs.existsSync(directory))throw Error('新任务目录已存在，拒绝重置');
  fs.mkdirSync(path.dirname(directory),{recursive:true});
  const staging=fs.mkdtempSync(directory+'.init-');
  try{
    const task=read(path.join(__dirname,'../templates/task.json'));
    if(strict)Object.assign(task,{version:3,analysisAlgorithm:'semantic-v2'});
    else{task.version=2;delete task.analysisAlgorithm;delete task.policyVersions;delete task.referenceIds;}
    write(path.join(staging,'task.json'),contract.normalize(task));
    const blueprint=read(path.join(__dirname,'../templates/research-blueprint.json'));
    if(strict)blueprint.analysisAlgorithm='semantic-v2';
    else delete blueprint.analysisAlgorithm;
    write(path.join(staging,'deck-blueprint.json'),blueprint);
    write(path.join(staging,'intake.json'),{status:'incomplete',note:'先补齐问题、证据和综合；尚未生成页面或审查结论。'});
    fs.renameSync(staging,directory);
    return {status:'created',directory,taskFile:path.join(directory,'task.json'),strict};
  }catch(e){fs.rmSync(staging,{recursive:true,force:true});throw e;}
}
function options(args,allowed){
  const out={};for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!args[i]?.startsWith('--')||!allowed.includes(key)||!args[i+1]||args[i+1].startsWith('--')||out[key]!==undefined)throw Error('未知、缺值或重复参数：'+args[i]);out[key]=args[i+1];}return out;
}
async function run(args){
  const [command,taskFile,...rest]=args;
  if(!taskFile)throw Error('用法：report.cjs init <新目录> [--contract legacy|strict]；或 status|next|compile|assemble|qa|review-pack|reuse|aggregate|snapshot|package <task.json> [选项]');
  if(['status','next'].includes(command))return require('./report_status.cjs').run(args);
  if(command==='init'){const o=options(rest,['contract']);if(o.contract&&!['legacy','strict'].includes(o.contract))throw Error('contract 仅支持 legacy/strict');return initialize(taskFile,{strict:o.contract!=='legacy'});}
  if(command==='recover-lock'){if(rest.length)throw Error('recover-lock 不接受额外参数');return recover(taskFile);}
  const specs={compile:['preview'],assemble:['pages','css','title'],qa:['html','tier','pages'],'review-pack':['audit'],dispositions:['audit','decisions','review'],reuse:['audit','snapshot'],aggregate:['audit','reviews'],snapshot:['audit','review'],package:['audit','review','name']};
  if(!specs[command])throw Error('未知操作：'+command);
  const o=options(rest,specs[command]),task=contract.normalize(read(taskFile)),base=path.dirname(path.resolve(taskFile));
  const need=key=>{if(!o[key])throw Error('缺少 --'+key);return path.resolve(o[key]);};
  return transaction(taskFile,command,async dir=>{
    if(command==='compile'){
      if(o.preview!==undefined&&!['true','false'].includes(o.preview))throw Error('preview 须为 true/false');
      if(!task.blueprint?.record)throw Error('task 缺少 blueprint.record');
      const blueprint=path.resolve(base,task.blueprint.record),output=path.join(dir,'pages.json');
      const result=require('./compile_blueprint.cjs').run([blueprint,output,'--task',path.resolve(taskFile),'--snippets',path.join(dir,'content-snippets.html'),...(o.preview==='true'?['--preview']:[])]);
      const derived=structuredClone(task);
      for(const key of ['blueprint','analysisReview'])if(derived[key]?.record)derived[key]={...derived[key],record:path.resolve(base,derived[key].record)};
      derived.pages={record:output,sha256:contract.fileHash(output)};
      write(path.join(dir,'task.json'),derived);
      return {...result,taskFile:path.join(dir,'task.json')};
    }
    if(command==='assemble')return require('./assemble_deck.cjs').assemble({pagesFile:need('pages'),outputFile:path.join(dir,'deck.html'),contractFile:path.resolve(taskFile),...(o.css?{cssFile:need('css')}:{}),...(o.title?{title:o.title}:{})});
    if(command==='qa'){
      const htmlTask=contract.read(fs.readFileSync(need('html'),'utf8'));
      if(contract.stable(htmlTask)!==contract.stable(contract.load(taskFile,need('html'))))throw Error('HTML 与指定 task 不匹配');
      const auditDir=path.join(dir,'qa'),cmd=[path.join(__dirname,'qa_deck.cjs'),need('html'),auditDir,'--tier',o.tier||'acceptance',...(o.pages?['--pages',o.pages]:[])];
      const result=spawnSync(process.execPath,cmd,{encoding:'utf8',maxBuffer:20*1024*1024});
      fs.writeFileSync(path.join(dir,'command.log'),(result.stdout||'')+(result.stderr||''));
      if(result.error||result.status!==0)throw Error('QA 未通过，详情保留于 '+path.join(dir,'command.log'));
      return {auditFile:path.join(auditDir,'audit.json')};
    }
    const auditFile=need('audit'),audit=read(auditFile),auditDir=path.dirname(auditFile);
    const html=path.resolve(auditDir,audit.htmlArtifact?.path||'');
    if(contract.stable(contract.load(taskFile,html))!==contract.stable(contract.normalize(audit.taskContract)))throw Error('audit 与指定 task 不匹配');
    if(command==='dispositions'){
      const inputReview=need('review'),review=read(inputReview),reviewBase=path.dirname(inputReview);
      for(const link of [review.priorReview,...(review.coverage||[]).map(c=>c.inheritedFrom)].filter(Boolean))for(const key of ['audit','review'])if(link[key]?.path)link[key].path=path.relative(dir,path.resolve(reviewBase,link[key].path));
      if(review.auditSha256!==contract.hash(contract.stable(audit)))throw Error('审查对应旧版 audit');
      review.warningReview=require('./review_pack.cjs').expandDispositions(audit,read(need('decisions')));
      write(path.join(dir,'review.json'),review);return {reviewFile:path.join(dir,'review.json'),status:review.status};
    }
    if(command==='review-pack')return require('./review_pack.cjs').prepare({auditFile,outputDir:dir});
    if(command==='reuse')return require('./prepare_review_reuse.cjs').prepareReuse({auditFile,snapshotDir:need('snapshot'),outputDir:path.join(dir,'reuse')});
    if(command==='snapshot')return require('./snapshot_review.cjs').snapshotReview({auditFile,reviewFile:need('review'),outputDir:path.join(dir,'snapshot')});
    if(command==='aggregate'){
      const files=JSON.parse(o.reviews||'null');if(!Array.isArray(files)||!files.length||files.some(f=>typeof f!=='string'))throw Error('--reviews 须为审查文件路径 JSON 数组');
      const review=require('./aggregate_reviews.cjs').aggregate(audit,files.map(read),{baseDir:dir,auditDir,inputDirs:files.map(f=>path.dirname(path.resolve(f)))});
      write(path.join(dir,'review.json'),review);
      if(review.status!=='complete')throw Error('聚合审查未完成，保留 review.json 中的错误；未更新有效产物索引');
      return {reviewFile:path.join(dir,'review.json')};
    }
    return require('./package_delivery.cjs').packageDelivery({htmlFile:path.resolve(auditDir,audit.htmlArtifact.path),pdfFile:path.resolve(auditDir,audit.pdfArtifact.path),outputDir:path.join(dir,'delivery'),baseName:o.name||'report',auditFile,reviewFile:need('review')});
  });
}
if(require.main===module)run(process.argv.slice(2)).then(result=>{console.log(JSON.stringify(result,null,2));if(result.status==='ACTION_REQUIRED')process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run,transaction,initialize,recover};
