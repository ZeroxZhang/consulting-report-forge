/* 所有任务写操作共用锁；内部上下文只在本进程传递，CLI 不提供绕锁开关。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const contexts=new WeakSet();
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function canonical(file){return fs.existsSync(file)?fs.realpathSync(file):path.join(fs.realpathSync(path.dirname(file)),path.basename(file));}
function rootForTask(file){
  file=fs.realpathSync(file);const task=read(file);
  if(task.executionPlan?.record&&fs.existsSync(path.resolve(path.dirname(file),task.executionPlan.record)))return path.join(path.dirname(canonical(path.resolve(path.dirname(file),task.executionPlan.record))),'.forge');
  const dir=path.dirname(file);
  for(let current=dir;path.dirname(current)!==current;current=path.dirname(current))if(path.basename(current)==='.forge'&&path.relative(current,dir).startsWith('runs'+path.sep))return current;
  if(task.executionPlan?.record)return path.join(path.dirname(canonical(path.resolve(path.dirname(file),task.executionPlan.record))),'.forge');
  return path.join(dir,'.forge');
}
function acquire(root,operation,context){
  fs.mkdirSync(root,{recursive:true});root=fs.realpathSync(root);
  if(context&&contexts.has(context)&&context.root===root)return {context,release(){}};
  const lock=path.join(root,'lock');
  try{fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')throw Error('任务正被操作或上次中断留下锁；确认进程已退出后运行 recover-lock。');throw e;}
  try{write(path.join(lock,'owner.json'),{pid:process.pid,host:os.hostname(),operation,startedAt:new Date().toISOString()});}
  catch(e){fs.rmSync(lock,{recursive:true,force:true});throw e;}
  const token={root};contexts.add(token);
  return {context:token,release(){contexts.delete(token);fs.rmSync(lock,{recursive:true,force:true});}};
}
function locked(root,operation,fn,context){const held=acquire(root,operation,context);try{return fn(held.context);}finally{held.release();}}
async function lockedAsync(root,operation,fn,context){const held=acquire(root,operation,context);try{return await fn(held.context);}finally{held.release();}}
function atomic(file,bytes){
  const pending=file+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(pending,bytes,{flag:'wx'});fs.renameSync(pending,file);}finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
}
async function transaction(taskFile,operation,work){
  taskFile=fs.realpathSync(taskFile);const root=rootForTask(taskFile);
  return lockedAsync(root,operation,async context=>{
    const run=path.join(root,'runs',Date.now()+'-'+crypto.randomUUID());fs.mkdirSync(run,{recursive:true});
    const startedAt=new Date().toISOString();let startingRevision;
    try{
      const enabled=read(taskFile).policyVersions?.workflow;
   if(enabled)startingRevision=require('./execution_plan.cjs').load(taskFile).plan.revision;
   const inputDigest=enabled?require('./execution_plan.cjs').inputs(require('./execution_plan.cjs').load(taskFile)):undefined;
   const result=await work(run,context);
      const record={operation,taskFile,startedAt,finishedAt:new Date().toISOString(),status:'published',...(inputDigest?{inputDigest}:{}),result};
      const recordFile=path.join(run,'result.json');write(recordFile,record);
      let execution;
      if(read(taskFile).policyVersions?.workflow)execution=require('./execution_plan.cjs').recordProduction(taskFile,recordFile,context);
      atomic(path.join(root,'latest-'+operation+'.json'),JSON.stringify({record:recordFile},null,2)+'\n');
      return {...record,directory:run,...(execution?{execution}:{})};
    }catch(e){let committedRevision;try{const revision=require('./execution_plan.cjs').load(taskFile).plan.revision;if(startingRevision!==undefined&&revision>startingRevision)committedRevision=revision;}catch{}if(committedRevision!==undefined)e.message+='；计划已提交至 revision '+committedRevision+'，请先 resume 核实，勿假定整个操作未发生';write(path.join(run,'failure.json'),{operation,status:'failed',message:e.message,...(committedRevision!==undefined?{committedRevision}:{}),finishedAt:new Date().toISOString()});throw e;}
  });
}
function recover(taskFile){
  const lock=path.join(rootForTask(taskFile),'lock'),owner=read(path.join(lock,'owner.json'));
  if(owner.host!==os.hostname()||!Number.isInteger(owner.pid)||owner.pid<1)throw Error('锁身份无法核实，不能自动恢复');
  try{process.kill(owner.pid,0);throw Error('锁持有进程仍在运行');}catch(e){if(e.code!=='ESRCH')throw e;}
  fs.rmSync(lock,{recursive:true});return {status:'recovered',previousOwner:owner};
}
module.exports={canonical,rootForTask,locked,lockedAsync,atomic,transaction,recover};
