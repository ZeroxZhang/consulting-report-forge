/* 持久执行账本：人工声明与实时证据分开；读取绝不改写进度或代签。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('./report_contract.cjs'),R=require('./execution_requirements.cjs'),store=require('./task_store.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),bytes=v=>JSON.stringify(v,null,2)+'\n';
const fail=m=>{throw Error(m);},nonempty=v=>typeof v==='string'&&!!v.trim();
function create(task,rootTask='task.json') {return {schemaVersion:1,id:task.executionPlan.id,revision:0,scopeRevision:0,state:'draft',rootTask,requirements:R.fixed(task).map(r=>({...r,mandatory:true})),items:R.items(task),productionRefs:{},decisions:[],appliedOperations:[],updatedAt:new Date().toISOString()};}
function validate(plan,task){
 if(plan.schemaVersion!==1||plan.id!==task.executionPlan?.id||!Number.isInteger(plan.revision)||plan.revision<0||!Number.isInteger(plan.scopeRevision)||!['draft','active'].includes(plan.state)||!nonempty(plan.rootTask))fail('执行计划身份、版本或状态无效');
 if(plan.state==='active'&&(!plan.intake||['goal','scope','deliverables','constraints','approach','nextStep'].some(k=>!nonempty(plan.intake[k]))||!Array.isArray(plan.intake.openQuestions)))fail('激活计划缺少完整需求与路线记录');
 if(!Array.isArray(plan.requirements)||!Array.isArray(plan.items)||!Array.isArray(plan.appliedOperations)||!Array.isArray(plan.decisions)||!plan.productionRefs)fail('执行计划结构缺失');
 if(new Set(plan.requirements.map(r=>r.id)).size!==plan.requirements.length||plan.requirements.some(r=>!nonempty(r.id)||!nonempty(r.text)||r.mandatory!==true))fail('要求目录缺少唯一身份或强制声明');
 for(const r of R.fixed(task)){const hits=plan.requirements.filter(x=>x.id===r.id);if(hits.length!==1||hits[0].text!==r.text||hits[0].mandatory!==true)fail('固定要求不可删除、改写或豁免：'+r.id);}
 const ids=new Set();for(const i of plan.items){if(!/^[\w-]+$/.test(i.id||'')||ids.has(i.id)||!nonempty(i.title)||!Array.isArray(i.dependsOn)||!Array.isArray(i.requirementRefs))fail('任务身份/依赖无效');ids.add(i.id);
  if(i.source){if(i.state!==undefined||i.evidenceRefs!==undefined||i.attempt!==undefined)fail('来源任务不能有第二份可写状态：'+i.id);}
  else if(!['pending','in_progress','submitted','done','blocked','cancelled'].includes(i.state)||!Array.isArray(i.evidenceRefs)||!['planning','visual','production','delivery','files'].includes(i.criterion))fail('人工任务状态或验收标准无效：'+i.id);
  if(i.requirementRefs.some(id=>!plan.requirements.some(r=>r.id===id)))fail('未知要求引用');
 }
 for(const fixed of R.items(task)){const item=plan.items.find(x=>x.id===fixed.id);if(!item)fail('缺少固定任务：'+fixed.id);for(const k of ['title','phase','source','criterion','dependsOn','requirementRefs'])if(C.stable(item[k])!==C.stable(fixed[k]))fail('固定任务定义不可改写：'+fixed.id+'.'+k);if(item.state==='cancelled')fail('固定任务不可取消：'+fixed.id);}
 const active=new Set(),seen=new Set();function visit(i){if(active.has(i.id))fail('任务依赖循环：'+i.id);if(seen.has(i.id))return;active.add(i.id);for(const d of i.dependsOn){const dep=plan.items.find(x=>x.id===d);if(!dep)fail('缺失依赖：'+d);visit(dep);}active.delete(i.id);seen.add(i.id);}plan.items.forEach(visit);
 return plan;
}
function locate(task,base){if(!R.enabled(task))fail('任务尚未启用执行计划');C.normalize(task);const file=fs.realpathSync(path.resolve(base,task.executionPlan.record)),plan=validate(read(file),task),dir=path.dirname(file),rootFile=fs.realpathSync(path.resolve(dir,plan.rootTask)),rootTask=C.normalize(read(rootFile));if(rootTask.executionPlan?.id!==plan.id||store.canonical(path.resolve(path.dirname(rootFile),rootTask.executionPlan.record))!==store.canonical(file))fail('计划与根任务绑定不一致');return {task:rootTask,taskFile:rootFile,file,dir,plan,root:path.join(dir,'.forge')};}
function load(taskFile){return locate(C.normalize(read(taskFile)),path.dirname(path.resolve(taskFile)));}
function ref(ctx,file){file=path.resolve(file);return {record:path.relative(ctx.dir,file),sha256:C.fileHash(file)};}
function resolve(ctx,r){if(!r?.record||!r.sha256)fail('缺少产物引用及摘要');const f=path.resolve(ctx.dir,r.record);if(C.fileHash(f)!==r.sha256)fail('引用字节已变化：'+r.record);return f;}
function inputs(ctx,item={}){
 const task=structuredClone(ctx.task);delete task.pages;delete task.executionPlan;
 for(const key of ['blueprint','analysisReview'])if(task[key]?.record){const file=path.resolve(path.dirname(ctx.taskFile),task[key].record);task[key]={sha256:fs.existsSync(file)?C.fileHash(file):null};}
 let scoped=null;if(item.pageRefs?.length){const doc=read(path.resolve(path.dirname(ctx.taskFile),ctx.task.blueprint.record));scoped=doc.slides.filter(s=>item.pageRefs.includes(s.id));if(scoped.length!==item.pageRefs.length)fail('委派页范围不存在');/* 分析和公共配置仍共享，局部作用域只限制交付责任。 */}
 const files=(item.inputRefs||[]).map(r=>({record:r,sha256:C.fileHash(path.resolve(ctx.dir,r))}));
 return C.hash(C.stable({task,scopeRevision:ctx.plan.scopeRevision,scoped,files}));
}
function blueprint(ctx){const f=path.resolve(path.dirname(ctx.taskFile),ctx.task.blueprint.record);return {doc:read(f),baseDir:path.dirname(f),task:C.readAnalysisTask(ctx.taskFile,f)};}
function production(ctx,key){const r=ctx.plan.productionRefs[key];if(!r)fail('尚无有效 '+key+' 产物');if(r.inputDigest!==inputs(ctx))fail(key+' 上游输入已变化');for(const v of [...Object.values(r.files),...(r.sourceInputs||[])])resolve(ctx,v);for(const [dep,digest]of Object.entries(r.dependencies||{})){if(ctx.plan.productionRefs[dep]?.identity!==digest)fail(key+' 上游产物已替换');production(ctx,dep);}return r;}
function currentReview(ctx){const qa=production(ctx,'qa'),agg=production(ctx,'aggregate'),auditFile=resolve(ctx,qa.files.audit),reviewFile=resolve(ctx,agg.files.review),audit=read(auditFile),review=read(reviewFile);const errors=require('./review_contract.cjs').validate(review,audit,{baseDir:path.dirname(reviewFile),auditDir:path.dirname(auditFile)});if(errors.length)fail(errors.join('；'));return {audit,review,auditFile,reviewFile};}
function sourceState(ctx,item){
 if(item.source==='analysis'){const b=blueprint(ctx),r=require('./deck_blueprint.cjs').validate(b.doc,{...b,stage:'synthesis'});if(r.errors.length)fail(r.errors.join('；'));}
 else if(item.source==='analysis-review'){const b=blueprint(ctx),errors=require('./analysis_review_contract.cjs').check(b.doc,b);if(errors.length)fail(errors.join('；'));}
 else if(item.source.startsWith('workItem:')){const b=blueprint(ctx),id=item.source.slice(9),w=(b.doc.analysis?.workItems||[]).find(x=>x.id===id);if(!w||!['complete','bounded'].includes(w.status))fail('分析工作项未完成：'+id);}
 else if(item.source==='acceptance'){const qa=production(ctx,'qa'),f=resolve(ctx,qa.files.audit),a=read(f),e=require('./review_contract.cjs').auditErrors(a,{auditDir:path.dirname(f)});if(e.length)fail(e.join('；'));if(a.unitsCheck?.status!=='PASS')fail('尚无通过的排印检查');}
 else if(['final-review',...R.fixed(ctx.task).map(r=>r.id)].includes(item.source))currentReview(ctx);
 else if(item.source==='package'){const p=production(ctx,'package');require('./execution_receipt.cjs').validate(ctx,resolve(ctx,p.files.receipt));}
 else if(item.source==='archive'){const a=production(ctx,'archive');require('./execution_archive.cjs').verify(path.dirname(resolve(ctx,a.files.manifest)));}
 else fail('未知任务来源：'+item.source);
 return 'done';
}
function verifyEvidence(ctx,item,e){
 const f=resolve(ctx,e),v=read(f);if(e.inputDigest!==inputs(ctx,item))fail('任务输入已变化');
 if(v.kind!==item.criterion||!nonempty(v.reviewer)||!nonempty(v.basis)||!Array.isArray(v.files)||!v.files.length)fail('验收记录缺少类型、审查者、判断依据或实际文件');
 const local=path.dirname(f);for(const r of v.files){if(!nonempty(r.record)||C.fileHash(path.resolve(local,r.record))!==r.sha256)fail('验收文件缺失或变化');}
 if(item.requirementRefs.some(id=>!(v.requirementRefs||[]).includes(id)))fail('验收记录未分别覆盖固定要求');
 if(item.criterion==='planning'&&(!Array.isArray(v.alternatives)||!v.alternatives.length||v.alternatives.some(a=>!nonempty(a.pageId)||!nonempty(a.considered)||!nonempty(a.decision))))fail('规划须记录逐页候选与取舍；不能仅写已检查');
 if(item.criterion==='planning'){
  const bp=path.resolve(path.dirname(ctx.taskFile),ctx.task.blueprint.record),ids=read(bp).slides.map(s=>s.id);
  if(!v.files.some(r=>store.canonical(path.resolve(local,r.record))===store.canonical(bp))||ids.some(id=>!v.alternatives.some(a=>a.pageId===id)))fail('规划观察须引用当前蓝图并逐页说明候选与取舍');
  if(R.moduleFill(ctx.task)&&item.requirementRefs.includes('module-fill')){
   const pages=read(bp).slides.filter(s=>require('./content_contract.cjs').CONTENT_ROLES.has(s.pageRole)).map(s=>s.id),plans=v.modulePlans;
   if(!Array.isArray(plans)||plans.length!==pages.length||new Set(plans.map(p=>p?.pageId)).size!==plans.length||plans.some(p=>!pages.includes(p?.pageId)||!Array.isArray(p.regions)||!p.regions.length||new Set(p.regions.map(r=>r?.id)).size!==p.regions.length||p.regions.some(r=>!r||['id','content','layout','whitespace'].some(k=>!nonempty(r[k])))))fail('模块填充规划须逐正文页列出每个模块/栏的身份、内容量、布局及留白用途');
  }
 }
 if(item.criterion==='visual'){
  if(!v.audit?.record||C.fileHash(path.resolve(local,v.audit.record))!==v.audit.sha256)fail('代表页观察须绑定本次渲染 audit');
  const af=path.resolve(local,v.audit.record),a=read(af),ab=path.dirname(af),assembled=production(ctx,'assemble');
  if(a.geometryStatus!=='PASS'||a.htmlArtifact?.sha256!==assembled.files.html.sha256||C.fileHash(path.resolve(ab,a.htmlArtifact.path))!==a.htmlArtifact.sha256)fail('代表页不是当前装配产物');
  const images=[...(a.rows||[]).map(r=>r.screenshot),...(a.evidenceManifest?.entries||[]).map(r=>r.path)].filter(Boolean).map(f=>store.canonical(path.resolve(ab,f)));
  if(!v.files.some(r=>images.includes(store.canonical(path.resolve(local,r.record)))))fail('代表页图像未出现在所绑定的渲染 audit');
  if(R.moduleFill(ctx.task)){
   const fileRefs=new Set(v.files.map(r=>store.canonical(path.resolve(local,r.record)))),rows=(a.rows||[]).filter(r=>!['cover','references','back-cover','divider'].includes(r.bookends?.role)&&r.screenshot&&fileRefs.has(store.canonical(path.resolve(ab,r.screenshot)))),observations=v.moduleObservations;
   const expected=rows.flatMap(r=>(r.moduleFill?.regions||[]).map(g=>({pageId:r.pageId||('page-'+r.page),regionId:g.id})));
   if(!rows.length||rows.some(r=>r.moduleFill?.version!==1||!r.moduleFill.regions?.length)||!Array.isArray(observations)||new Set(observations.map(o=>o?.pageId+'\0'+o?.regionId)).size!==observations.length||expected.some(e=>!observations.some(o=>o?.pageId===e.pageId&&o.regionId===e.regionId))||observations.some(o=>{
    if(!o||!nonempty(o.regionId)||!nonempty(o.observed)||!nonempty(o.decision))return true;
    const known=expected.some(e=>e.pageId===o.pageId&&e.regionId===o.regionId);
    return known?o.manual===true:!(o.manual===true&&nonempty(o.selector)&&rows.some(r=>(r.pageId||('page-'+r.page))===o.pageId));
   }))fail('代表页填充检查须引用实际正文截图，并逐一记录所看页每个模块/栏的所见和处置；补录区域须有 manual:true 与 selector');
  }
 }
 if(item.criterion==='visual'&&!v.files.some(r=>/\.(png|jpg|jpeg|webp|pdf)$/i.test(r.record)))fail('代表页验收须引用实际图像或 PDF');
 if(item.criterion==='production'&&!v.files.some(r=>/\.html?$/i.test(r.record)))fail('制作验收须引用实际 HTML');
 if(item.criterion==='delivery'&&(!nonempty(v.destination)||!nonempty(v.deliveredAt)))fail('交付须记录实际目标与时间');
 return v;
}
function effective(ctx,{resume=false}={}){
 const memo=new Map();function state(i){if(memo.has(i.id))return memo.get(i.id);let status=i.state||'pending',reason;
 try{if(i.attempt&&i.state==='in_progress'&&(i.attempt.inputDigest!==inputs(ctx,i)||i.attempt.scopeRevision!==ctx.plan.scopeRevision))fail('运行任务输入已变化，须重新分派');if(i.source)status=sourceState(ctx,i);else if(['done','submitted'].includes(status)){if(!i.evidenceRefs.length)fail('缺少完成证据');i.evidenceRefs.forEach(e=>verifyEvidence(ctx,i,e));}else if(status==='in_progress'&&resume){status='status_unknown';reason='仅知道曾启动；须核实进程或委派结果，不推断仍在运行';}
 if(['done','submitted'].includes(status)){const deps=i.dependsOn.map(id=>state(ctx.plan.items.find(x=>x.id===id)));if(deps.some(d=>d.status!=='done'))fail('前置任务尚未完成或已失效');}
 }catch(e){status=i.source?'pending':'needs_revalidation';reason=e.message;}
 const value={id:i.id,title:i.title,phase:i.phase,status,...(reason||i.reason?{reason:reason||i.reason}:{}),...(i.attempt?{attempt:i.attempt}:{}),requirementRefs:i.requirementRefs,dependsOn:i.dependsOn};memo.set(i.id,value);return value;}
 return ctx.plan.items.map(state);
}
function status(taskFile,{resume=false}={}){const ctx=load(taskFile);let analysisWorkItems=[],gaps=[];try{const b=blueprint(ctx);analysisWorkItems=b.doc.analysis?.workItems||[];gaps=b.doc.analysis?.gaps||[];}catch{}const items=effective(ctx,{resume}),ready=items.filter(i=>['pending','needs_revalidation'].includes(i.status)&&i.dependsOn.every(id=>items.find(x=>x.id===id)?.status==='done'));return {version:1,readOnly:true,planId:ctx.plan.id,revision:ctx.plan.revision,scopeRevision:ctx.plan.scopeRevision,state:ctx.plan.state,progress:{total:items.length,done:items.filter(i=>i.status==='done').length,remaining:items.filter(i=>!['done','cancelled'].includes(i.status)).length},intake:ctx.plan.intake||null,decisions:ctx.plan.decisions,analysisWorkItems,gaps,requirements:ctx.plan.requirements,items,productionRefs:ctx.plan.productionRefs,readyQueue:ready.map(i=>i.id),submitted:items.filter(i=>i.status==='submitted').map(i=>i.id),blockers:items.filter(i=>['blocked','needs_revalidation','status_unknown'].includes(i.status)),status:ctx.plan.state==='active'&&items.every(i=>['done','cancelled'].includes(i.status))?'CHECKED':'ACTION_REQUIRED',next:ctx.plan.state==='draft'?{action:'确认需求与路线后激活计划；补齐 intake、未决问题和下一步'}:{taskId:ready[0]?.id||null,action:ready.length?'处理 readyQueue 中的任务；来源任务在权威文件完成后自动反映':'核实提交、阻塞或未知运行状态'},recovery:{rootTask:ctx.taskFile,planFile:ctx.file,...(fs.existsSync(path.join(ctx.dir,'restore-provenance.json'))?{workingFileMap:path.join(ctx.dir,'restore-provenance.json')}:{}),rule:'只读取明确引用；缺失证据保持未完成，不自动补签'}};}
function commit(ctx,plan,operation){validate(plan,ctx.task);const history=path.join(ctx.root,'execution-history');fs.mkdirSync(history,{recursive:true});const old=bytes(ctx.plan),oldFile=path.join(history,ctx.plan.revision+'-'+C.hash(old)+'.json');if(!fs.existsSync(oldFile))fs.writeFileSync(oldFile,old,{flag:'wx'});plan.revision=ctx.plan.revision+1;plan.updatedAt=new Date().toISOString();plan.appliedOperations.push(operation);store.atomic(ctx.file,bytes(plan));return {status:'updated',planId:plan.id,revision:plan.revision,operationId:operation.id};}
function update(taskFile,request,context){const initial=load(taskFile);return store.locked(initial.root,'plan-update',()=>{
 const ctx=load(taskFile),digest=C.hash(C.stable(request)),prior=ctx.plan.appliedOperations.find(x=>x.id===request.operationId);if(prior){if(prior.digest!==digest)fail('operationId 已用于不同请求');return {status:'already-applied',planId:ctx.plan.id,revision:prior.revision};}
 if(!nonempty(request.operationId)||request.expectedRevision!==ctx.plan.revision||!Array.isArray(request.ops)||!request.ops.length)fail('更新须提供唯一 operationId、当前 expectedRevision 和 ops');
 const plan=structuredClone(ctx.plan),work={...ctx,plan};for(const op of request.ops){let item=plan.items.find(i=>i.id===op.id);
  if(op.action==='activate'){if(plan.state!=='draft')fail('计划已激活');if(!op.intake||['goal','scope','deliverables','constraints','approach','nextStep'].some(k=>!nonempty(op.intake[k]))||!Array.isArray(op.intake.openQuestions))fail('激活须明确目标、范围、交付、约束、路线、下一步与未决问题');plan.intake=op.intake;plan.state='active';continue;}
  if(op.action==='requirement'){if(!nonempty(op.id)||!nonempty(op.text)||!nonempty(op.sourceQuote)||plan.requirements.some(r=>r.id===op.id))fail('要求须唯一 ID、原文和来源');plan.requirements.push({id:op.id,text:op.text,sourceQuote:op.sourceQuote,mandatory:true});continue;}
  if(op.action==='add'){if(item)fail('任务 ID 已存在');const v=op.item;if(!v||!nonempty(v.completionCriteria))fail('新任务须明确完成标准');plan.items.push({...v,id:op.id,dependsOn:v.dependsOn||[],requirementRefs:v.requirementRefs||[],...(v.source?{}:{state:'pending',evidenceRefs:[]})});continue;}
  if(op.action==='scope'){if(!nonempty(op.reason))fail('范围变化须记录原因');plan.scopeRevision++;plan.decisions.push({kind:'scope',reason:op.reason,at:new Date().toISOString()});continue;}
  if(op.action==='decision'){if(!nonempty(op.text))fail('决策不能为空');plan.decisions.push({text:op.text,at:new Date().toISOString()});continue;}
  if(!item||item.source)fail('任务不存在或由权威来源推导，不能写状态：'+op.id);
  if(['start','delegate'].includes(op.action)){if(item.state!=='pending')fail('仅 pending 任务可启动；先 reopen 并说明原因');delete item.reason;if(plan.state!=='active')fail('先激活计划');if(effective(work).find(i=>i.id===item.id).dependsOn.some(id=>effective(work).find(i=>i.id===id).status!=='done'))fail('前置任务未完成');if(op.action==='delegate'&&!nonempty(op.owner))fail('委派须指定负责人');if(item.attempt)(item.attemptHistory??=[]).push(item.attempt);item.state='in_progress';item.evidenceRefs=[];item.attempt={id:crypto.randomUUID(),owner:op.owner||'main',scopeRevision:plan.scopeRevision,inputDigest:inputs(work,item),state:'running',startedAt:new Date().toISOString(),requirementRefs:item.requirementRefs,completionCriteria:item.completionCriteria||item.title};}
  else if(op.action==='submit'){if(item.state!=='in_progress'||op.attemptId!==item.attempt?.id||item.attempt.scopeRevision!==plan.scopeRevision||item.attempt.inputDigest!==inputs(work,item))fail('迟到、过期或未匹配当前 attempt 的结果不能提交');const e={...ref(work,path.resolve(ctx.dir,op.evidence)),inputDigest:inputs(work,item)};verifyEvidence(work,item,e);item.evidenceRefs=[e];item.state='submitted';item.attempt.state='submitted';}
  else if(op.action==='accept'){if(item.state!=='submitted'||effective(work).find(i=>i.id===item.id).status!=='submitted'||!nonempty(op.reviewer)||!nonempty(op.basis))fail('接收须核对有效提交并填写审查者及依据');item.state='done';item.acceptance={reviewer:op.reviewer,basis:op.basis,at:new Date().toISOString()};item.attempt.state='accepted';}
  else if(['block','reopen','cancel'].includes(op.action)){if(!nonempty(op.reason))fail('状态变化须记录原因');if(op.action==='cancel'&&(R.items(ctx.task).some(i=>i.id===item.id)||item.requirementRefs.length))fail('固定/要求关联任务不能取消');if(item.attempt){(item.attemptHistory??=[]).push({...item.attempt,state:'superseded'});delete item.attempt;}item.state={block:'blocked',reopen:'pending',cancel:'cancelled'}[op.action];item.reason=op.reason;item.evidenceRefs=[];}
  else fail('未知计划操作：'+op.action);
 }
 return commit(ctx,plan,{id:request.operationId,digest,revision:plan.revision+1});
 },context);}
function assertGate(task,base,stage){if(!R.enabled(task))return;const ctx=locate(task,base);if(ctx.plan.state!=='active')fail('执行计划尚未激活');const all=effective(ctx);if(stage==='package')for(const r of ctx.plan.requirements)if(!ctx.plan.items.some(i=>i.requirementRefs.includes(r.id)))fail('用户要求尚未分配任务：'+r.id);const required=stage==='ready'?R.planning(task):stage==='acceptance'?[...R.planning(task),'representatives','production']:stage==='package'?all.filter(i=>!['package','archive','delivery'].includes(i.id)).map(i=>i.id):[];const bad=all.filter(i=>required.includes(i.id)&&!['done','cancelled'].includes(i.status));if(bad.length)fail('执行门禁 '+stage+' 未通过：'+bad.map(i=>i.id+' ('+i.status+')').join('、'));}
/* 记录接收不是对任意路径重新盖章：逐一核对生产者、输入与已登记依赖。 */
function validateProduction(ctx,record){
 if(record.status!=='published'||!record.taskFile||record.inputDigest!==inputs(ctx))fail('生产记录未成功发布或输入摘要已变化');
 const producer=load(record.taskFile);if(producer.plan.id!==ctx.plan.id||producer.file!==ctx.file)fail('生产者属于其他计划');
 const task=C.normalize(read(record.taskFile)),base=path.dirname(path.resolve(record.taskFile));
 const identity=t=>{const value={...t};for(const key of ['pages','blueprint','analysisReview','executionPlan','analysisPreview'])delete value[key];return C.stable(value);};
 if(identity(task)!==identity(ctx.task))fail('生产者任务配置不属于当前根任务');
 for(const key of ['blueprint','analysisReview']){const a=task[key],b=ctx.task[key];if(!!a!==!!b||a&&C.fileHash(path.resolve(base,a.record))!==C.fileHash(path.resolve(path.dirname(ctx.taskFile),b.record)))fail('生产者 '+key+' 与当前根输入不一致');}
 const result=record.result,op=record.operation;
 if(op==='compile'){
  const pages=read(result.output),derived=C.normalize(read(result.taskFile));if(derived.executionPlan?.id!==ctx.plan.id||identity(derived)!==identity(ctx.task)||C.fileHash(path.resolve(path.dirname(result.taskFile),derived.pages.record))!==C.fileHash(result.output))fail('派生 task 不属于本次编译');
  const b=blueprint(ctx),errors=require('./verify_blueprint_pages.cjs').verify(b.doc,pages,{task:b.task,baseDir:b.baseDir,preview:pages.preview===true});if(errors.length)fail(errors.join('；'));
 }else if(op==='assemble'){
  const compiled=production(ctx,'compile');if(!task.pages?.record||C.fileHash(path.resolve(base,task.pages.record))!==compiled.files.pages.sha256)fail('装配未使用当前编译产物');
  const embedded=C.read(fs.readFileSync(result.output,'utf8'));if(C.stable(embedded)!==C.stable(C.load(record.taskFile,result.output)))fail('装配 HTML 与生产者任务不匹配');
 }else if(op==='qa'){
  const assembled=production(ctx,'assemble'),audit=read(result.auditFile),errors=require('./review_contract.cjs').auditErrors(audit,{auditDir:path.dirname(result.auditFile)});if(errors.length)fail(errors.join('；'));
  if(audit.htmlArtifact.sha256!==assembled.files.html.sha256||audit.unitsCheck?.status!=='PASS')fail('验收不是当前装配/缺排印证据');
  const html=path.resolve(path.dirname(result.auditFile),audit.htmlArtifact.path);if(C.stable(C.load(record.taskFile,html))!==C.stable(audit.taskContract))fail('验收合同属于其他生产者');
 }else if(op==='aggregate'){
  const qa=production(ctx,'qa'),auditFile=resolve(ctx,qa.files.audit),errors=require('./review_contract.cjs').validate(read(result.reviewFile),read(auditFile),{baseDir:path.dirname(result.reviewFile),auditDir:path.dirname(auditFile)});if(errors.length)fail(errors.join('；'));
 }else if(op==='package'){
  const receipt=require('./execution_receipt.cjs').validate(ctx,result.receipt);if(C.fileHash(result.html)!==receipt.html.sha256||C.fileHash(result.pdf)!==receipt.pdf.sha256)fail('交付输出与收据不匹配');
 }else if(op==='archive'){
  const m=require('./execution_archive.cjs').verify(path.dirname(result.manifest)),pack=production(ctx,'package');if(m.status!=='complete'||m.planId!==ctx.plan.id||!m.files.some(f=>f.sha256===pack.files.receipt.sha256))fail('执行归档未包含当前交付收据');
 }
}

const outputs={compile:{pages:'output',task:'taskFile'},assemble:{html:'output'},qa:{audit:'auditFile'},aggregate:{review:'reviewFile'},package:{html:'html',pdf:'pdf',receipt:'receipt'},archive:{manifest:'manifest'}};
function recordProduction(taskFile,recordFile,context){const initial=load(taskFile),record=read(recordFile),mapping=outputs[record.operation];if(!mapping)return null;return store.locked(initial.root,'production-record',()=>{const ctx=load(taskFile),plan=structuredClone(ctx.plan),files={};if(record.operation==='qa'&&read(record.result.auditFile).tier!=='acceptance')return null;if(record.operation==='package'&&plan.productionRefs.package?.files.receipt?.sha256===C.fileHash(record.result.receipt))return {status:'already-applied',revision:plan.revision};validateProduction(ctx,record);for(const [key,name]of Object.entries(mapping)){if(!record.result[name])fail('产物记录缺少 '+name);files[key]=ref(ctx,record.result[name]);}if(record.operation==='compile'&&read(resolve(ctx,files.pages)).preview)return null;
 const dependencies={};const before={assemble:['compile'],qa:['assemble'],aggregate:['qa'],package:['qa','aggregate'],archive:['package']}[record.operation]||[];for(const key of before)dependencies[key]=production(ctx,key).identity;
 const sourceInputs=(record.result.sourceInputs||[]).map(r=>{if(C.fileHash(r.record)!==r.sha256)fail('作者输入已变化');return ref(ctx,r.record);});const value={files,sourceInputs,inputDigest:inputs(ctx),dependencies,run:ref(ctx,recordFile)};value.identity=C.hash(C.stable(value));plan.productionRefs[record.operation]=value;
 const id='production:'+C.fileHash(recordFile);if(plan.appliedOperations.some(x=>x.id===id))return {status:'already-applied',revision:plan.revision};return commit(ctx,plan,{id,digest:value.identity,revision:plan.revision+1});},context);}
function restore(taskFile,historyFile,context){const task=C.normalize(read(taskFile));if(!R.enabled(task))fail('未启用执行计划');const file=path.resolve(path.dirname(path.resolve(taskFile)),task.executionPlan.record),dir=path.dirname(file);return store.locked(path.join(dir,'.forge'),'plan-restore',()=>{const previous=validate(read(historyFile),task);if(path.resolve(dir,previous.rootTask)!==path.resolve(taskFile))fail('历史记录根任务不符');let current;try{current=validate(read(file),task);}catch{}if(current?.revision>=previous.revision)fail('当前记录可读取且不旧于历史，须显式核实后重建');if(fs.existsSync(file))fs.copyFileSync(file,file+'.corrupt-'+crypto.randomUUID());store.atomic(file,bytes(previous));return {status:'restored',revision:previous.revision,warning:'历史快照仅恢复已记录状态；未记录的工作须重新核实'};},context);}
module.exports={create,validate,locate,load,ref,resolve,inputs,production,currentReview,effective,status,update,assertGate,recordProduction,restore};
