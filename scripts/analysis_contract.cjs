/* 分阶段分析记录；只约束已登记的依赖，不替代研究与专业判断。 */
'use strict';
const content=require('./content_contract.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const list=v=>Array.isArray(v)?v:[];
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v);
const tokens=v=>[...String(v||'').matchAll(/\{\{metric:([a-z][a-z0-9-]*)\}\}/g)].map(m=>m[1]);
const claimsOf=doc=>list(doc.claims);
const fields=['statement','period','population','unit','denominator','calculation','inference','limitation'];
function metricOwners(doc){return new Map(claimsOf(doc).flatMap(c=>list(c.metrics).map(m=>[m.id,c.id])));}
function adopted(doc){
  const a=doc.analysis||{}, claims=new Map(claimsOf(doc).map(c=>[c.id,c])), issues=new Map(list(a.issues).map(i=>[i.id,i])), owners=metricOwners(doc);
  const metrics=new Map(claimsOf(doc).flatMap(c=>list(c.metrics).map(m=>[m.id,m])));
  const result={claimRefs:new Set(list(a.synthesis?.answerClaimRefs)),metricRefs:new Set(),workItemRefs:new Set(),issueRefs:new Set([...list(a.synthesis?.openIssueRefs),...list(a.issues).filter(i=>i.priority==='high').map(i=>i.id)]),optionRefs:new Set(list(a.synthesis?.optionRefs)),artifactRefs:new Set()};
  for(const s of list(doc.slides)){list(s.claimRefs).forEach(r=>result.claimRefs.add(r));list(s.metricRefs).forEach(r=>result.metricRefs.add(r));[s.title,s.proves].flatMap(tokens).forEach(r=>result.metricRefs.add(r));}
  let before;
  do{
    before=Object.values(result).reduce((n,s)=>n+s.size,0);
    // 已回答的父问题依赖其登记的子问题；开放或已收窄问题不强行展开。
    for(const i of list(a.issues))if(i.parentRef&&result.issueRefs.has(i.parentRef)&&issues.get(i.parentRef)?.disposition==='answered')result.issueRefs.add(i.id);
    // 已回答的问题必须完成其登记工作；有边界或仍开放的问题可保留未完成分支。
    for(const i of list(a.issues))if(result.issueRefs.has(i.id)&&i.disposition==='answered')list(i.workItemRefs).forEach(r=>result.workItemRefs.add(r));
    for(const ref of result.claimRefs){const c=claims.get(ref);if(!c)continue;list(c.metrics).forEach(m=>result.metricRefs.add(m.id));fields.flatMap(k=>tokens(c[k])).forEach(r=>result.metricRefs.add(r));list(c.artifactRefs).forEach(r=>result.artifactRefs.add(r));}
    for(const ref of result.metricRefs){const m=metrics.get(ref);if(owners.has(ref))result.claimRefs.add(owners.get(ref));list(m?.formula?.args).forEach(r=>result.metricRefs.add(r));}
    for(const w of list(a.workItems))if(list(w.outputClaimRefs).some(r=>result.claimRefs.has(r))||result.workItemRefs.has(w.id)){result.workItemRefs.add(w.id);list(w.inputClaimRefs).forEach(r=>result.claimRefs.add(r));list(w.outputClaimRefs).forEach(r=>result.claimRefs.add(r));list(w.issueRefs).forEach(r=>result.issueRefs.add(r));list(w.artifactRefs).forEach(r=>result.artifactRefs.add(r));}
    for(const o of list(a.options))if(result.optionRefs.has(o.id)){list(o.claimRefs).forEach(r=>result.claimRefs.add(r));list(o.metricRefs).forEach(r=>result.metricRefs.add(r));}
    for(const ar of list(doc.artifacts))if(result.artifactRefs.has(ar.id))list(ar.dependsOn).forEach(r=>result.artifactRefs.add(r));
  }while(before!==Object.values(result).reduce((n,s)=>n+s.size,0));
  return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,[...v].sort()]));
}
function digest(doc){
  // 页面布局不参与分析摘要；所有分析登记参与，以免未采用反证变化被隐去。
  return content.hash({analysis:doc.analysis,claims:doc.claims,sources:doc.sources,artifacts:list(doc.artifacts).map(({path:ignored,...a})=>a)});
}
function artifactErrors(doc,baseDir){return require('./analysis_artifacts.cjs').validate(doc,{baseDir,files:true});}
function materialize(doc){
  const d=copy(doc), cs=claimsOf(d), sources=d.sources||{};
  const allMetrics=content.evaluateMetrics({sourcePlan:{claims:cs}});
  const answers=new Set(list(d.analysis?.synthesis?.answerClaimRefs));
  d.schemaVersion=2;d.deck={...d.deck,governingThought:cs.filter(c=>answers.has(c.id)).map(c=>content.interpolateText(c.statement,allMetrics)).join(' ')};
  d.slides=list(d.slides).map(s=>content.CONTENT_ROLES.has(s.pageRole)?{...s,sourcePlan:{status:Object.keys(sources).length?'verified':'not_applicable',reason:'全部为已声明假设或建议',keys:Object.keys(sources),claims:copy(cs)}}:s);
  delete d.analysis;delete d.claims;delete d.artifacts;
  return d;
}
function validate(doc,{task,stage='research',baseDir,preview=false}={}){
  const errors=[],bad=m=>errors.push(m),a=doc.analysis;
  if(!['research','synthesis','ready'].includes(stage))bad('analysis stage 须为 research/synthesis/ready');
  if(!task||task.version!==2)bad('schema 3 须提供 task version 2');
  else{try{require('./report_contract.cjs').normalize(task);}catch(e){bad(e.message);}}
  if(!object(doc.deck)||!text(doc.deck.title)||!text(doc.deck.audience))bad('deck 须有 title/audience');
  if(doc.deck?.governingThought!==undefined)bad('schema 3 governingThought 由 synthesis.answerClaimRefs 派生，不得双写');
  if(!object(a)||!object(a.brief))return [...errors,'analysis.brief 缺失'];
  for(const k of ['question','scope','period','baseline','constraints','successCriteria'])if(!text(a.brief[k]))bad('analysis.brief.'+k+' 须为非空文本');
  if(!['diagnosis','decision','research'].includes(a.brief.purpose))bad('brief.purpose 须为 diagnosis/decision/research');
  for(const k of ['workMode','complexity','majorConclusion'])if(a[k]!==undefined||a.brief[k]!==undefined)bad(k+' 只在 task 中维护');
  for(const k of ['issues','gaps','workItems','options'])if(!Array.isArray(a[k]))bad('analysis.'+k+' 须为数组');
  if(!Array.isArray(doc.claims)||!object(doc.sources)||!Array.isArray(doc.artifacts)||!Array.isArray(doc.slides))bad('claims/artifacts/slides 须为数组，sources 须为对象');
  const collections={claimRefs:claimsOf(doc),issueRefs:list(a.issues),workItemRefs:list(a.workItems),optionRefs:list(a.options),artifactRefs:list(doc.artifacts)},ids=new Set();
  for(const [k,items] of Object.entries({...collections,gaps:list(a.gaps)}))for(const item of items){if(!object(item)||!id(item.id)||ids.has(item.id))bad(k+' id 须全局唯一小写标识');else ids.add(item.id);}
  for(const m of claimsOf(doc).flatMap(c=>list(c.metrics)))if(!object(m)||!id(m.id)||ids.has(m.id))bad('metric id 须全局唯一小写标识');else ids.add(m.id);
  if(errors.length)return errors;
  const maps=Object.fromEntries(Object.entries(collections).map(([k,items])=>[k,new Set(items.map(x=>x?.id))]));
  maps.metricRefs=new Set(claimsOf(doc).flatMap(c=>list(c.metrics).map(m=>m?.id)));
  const affectedTargetIds=new Set(Object.values(maps).flatMap(values=>[...values]));
  function refs(obj,key,type=key,required=true){if(!Array.isArray(obj?.[key])){if(required)bad((obj?.id||'analysis')+'.'+key+' 须为数组');return;}if(new Set(obj[key]).size!==obj[key].length)bad(key+' 引用重复');for(const ref of obj[key])if(!maps[type]?.has(ref))bad(key+' 未登记引用：'+ref);}
  for(const i of list(a.issues)){if(!text(i.question)||!['high','medium','low'].includes(i.priority)||!['open','answered','bounded','out_of_scope'].includes(i.disposition))bad('issue 问题/优先级/处置无效：'+i.id);refs(i,'workItemRefs');if(i.parentRef&&!maps.issueRefs.has(i.parentRef))bad('issue.parentRef 缺失');if(['bounded','out_of_scope'].includes(i.disposition)&&!text(i.basis))bad('issue 缩小范围须有 basis');}
  for(const w of list(a.workItems)){
    refs(w,'issueRefs');refs(w,'inputClaimRefs','claimRefs');refs(w,'outputClaimRefs','claimRefs');refs(w,'artifactRefs');
    if(!text(w.method)||!text(w.rationale)||!['planned','running','complete','bounded'].includes(w.status))bad('workItem 方法/依据/状态缺失：'+w.id);
    if(['complete','bounded'].includes(w.status)&&!text(w.counterEvidence))bad('workItem 完成须说明反证或未知：'+w.id);
    for(const h of list(w.hypotheses))if(!text(h.statement)||!['untested','supported','mixed','refuted','inconclusive'].includes(h.status)||(['supported','mixed','refuted'].includes(h.status)&&!text(h.basis)))bad('hypothesis 状态或依据无效：'+w.id);
  }
  const issuesById=new Map(list(a.issues).map(i=>[i.id,i])),workById=new Map(list(a.workItems).map(w=>[w.id,w]));
  for(const i of list(a.issues))for(const ref of list(i.workItemRefs))if(workById.has(ref)&&!list(workById.get(ref).issueRefs).includes(i.id))bad('issue/workItem 关联须双向一致：'+i.id+' → '+ref);
  for(const w of list(a.workItems))for(const ref of list(w.issueRefs))if(issuesById.has(ref)&&!list(issuesById.get(ref).workItemRefs).includes(w.id))bad('issue/workItem 关联须双向一致：'+ref+' ← '+w.id);
  for(const o of list(a.options)){refs(o,'claimRefs');refs(o,'metricRefs');for(const k of ['label','constraints','dependencies','validation'])if(!text(o[k]))bad('option.'+k+' 缺失');if(typeof o.baseline!=='boolean')bad('option.baseline 须为布尔');}
  const synth=a.synthesis||{};refs(synth,'answerClaimRefs','claimRefs');refs(synth,'openIssueRefs','issueRefs');refs(synth,'optionRefs','optionRefs',false);
  for(const ar of list(doc.artifacts)){if(!['input','code','model','output'].includes(ar.kind)||!text(ar.path)||!/^[a-f0-9]{64}$/.test(ar.sha256||''))bad('artifact 须有 kind/path/sha256：'+ar.id);refs(ar,'dependsOn','artifactRefs');}
  for(const c of claimsOf(doc))refs(c,'artifactRefs','artifactRefs',false);
  for(const [items,edges] of [[list(doc.artifacts),a=>list(a.dependsOn)],[list(a.issues),i=>i.parentRef?[i.parentRef]:[]]]){
    const map=new Map(items.map(i=>[i.id,i])),done=new Set(),visiting=new Set();
    function visit(ref){if(done.has(ref)||!map.has(ref))return;if(visiting.has(ref)){bad('依赖循环：'+ref);return;}visiting.add(ref);edges(map.get(ref)).forEach(visit);visiting.delete(ref);done.add(ref);}
    items.forEach(i=>visit(i.id));
  }

  errors.push(...require('./analysis_artifacts.cjs').validate(doc));
  const sourcePlan={status:Object.keys(doc.sources||{}).length?'verified':'not_applicable',keys:Object.keys(doc.sources||{}),claims:doc.claims};
  if(claimsOf(doc).length){errors.push(...require('./deck_blueprint.cjs').claimErrors(sourcePlan,'claims',false));errors.push(...content.validate({schemaVersion:2,sources:doc.sources,slides:[{pageRole:'analysis',title:'全局计算验证',proves:'全局计算验证',sourcePlan}]}));}
  if(errors.length)return [...new Set(errors)];
  const used=adopted(doc),usedSet=new Set(Object.values(used).flat());
  for(const g of list(a.gaps)){
    if(!text(g.description)||!['research','user','bounded'].includes(g.route)||!['task','branch','none'].includes(g.blockingScope)||!['open','researching','waiting_user','resolved','unavailable'].includes(g.status))bad('gap 定义无效：'+g.id);
    if(!Array.isArray(g.affectedRefs)||g.affectedRefs.some(r=>!affectedTargetIds.has(r)))bad('gap.affectedRefs 未登记：'+g.id);
    if(g.blockingScope==='branch'&&!list(g.affectedRefs).length)bad('branch gap 须声明 affectedRefs');
    if(g.status==='waiting_user'&&(g.route!=='user'||!text(g.request?.channel)||!text(g.request?.locator)))bad('waiting_user 须记录实际询问渠道和定位');
    if(g.status==='resolved'&&(!text(g.resolution?.basis)||!text(g.resolution?.locator)||(g.route==='user'&&!text(g.resolution?.answerLocator))))bad('resolved 须记录实际答案/证据，空回复不能完成');
    if(g.status==='unavailable'&&!text(g.resolution?.basis))bad('unavailable 须说明缺失影响');
    if(stage!=='research'&&g.status!=='resolved'&&(g.blockingScope==='task'||(g.blockingScope==='branch'&&g.affectedRefs?.some(r=>usedSet.has(r)))))bad('未解决缺口阻塞已采纳依赖：'+g.id+' ('+g.status+')');
  }
  if(stage!=='research'){
    if(!list(synth.answerClaimRefs).length||!text(synth.basis))bad('synthesis 须有回答主张与依据，未知可作为有边界回答');
    for(const c of claimsOf(doc))if(used.claimRefs.includes(c.id)&&c.verification==='pending')bad('采纳依赖仍 pending：'+c.id);
    for(const w of list(a.workItems))if(used.workItemRefs.includes(w.id)&&!['complete','bounded'].includes(w.status))bad('采纳工作未完成：'+w.id);
    for(const i of list(a.issues))if(used.issueRefs.includes(i.id)&&i.disposition==='open'&&!list(synth.openIssueRefs).includes(i.id))bad('已采纳问题未裁决：'+i.id);
    if(a.brief.purpose==='decision'&&task?.workMode!=='editorial'&&(!list(a.options).some(o=>o.baseline)||list(a.options).length<2||!list(a.options).some(o=>o.baseline&&list(synth.optionRefs).includes(o.id))||!list(a.options).some(o=>!o.baseline&&list(synth.optionRefs).includes(o.id))))bad('决策须比较现状与真实备选，并登记 synthesis.optionRefs');
    if(doc.artifacts.length&&!baseDir)bad('核对分析附件须提供 baseDir');
    if(baseDir)errors.push(...artifactErrors(doc,baseDir));
  }
  for(const s of list(doc.slides))if(content.CONTENT_ROLES.has(s.pageRole)){if(s.sourcePlan!==undefined)bad('schema 3 slide 不能双写 sourcePlan');refs(s,'claimRefs');refs(s,'metricRefs');if(!list(s.claimRefs).length)bad('正文须引用主张');if(stage==='ready')errors.push(...require('./form_contract.cjs').validate(s.visual).errors.map(e=>s.id+' '+e));}
  if(stage==='ready'&&!errors.length){
    try{errors.push(...require('./deck_blueprint.cjs').validate(materialize(doc),{ready:false}).errors);}catch(e){bad(e.message);}
    if(!preview&&task?.workMode!=='editorial')errors.push(...require('./analysis_review_contract.cjs').check(doc,{task,baseDir}));
  }
  return [...new Set(errors)];
}
function compile(doc,options={}){
  const errors=validate(doc,{...options,stage:'ready'});if(errors.length)throw Error('分析蓝图无效：'+errors.join('；'));
  const material=materialize(doc),result=content.compile(material),owners=metricOwners(doc);
  const slides=list(doc.slides).filter(s=>content.CONTENT_ROLES.has(s.pageRole));
  result.pages.forEach((p,i)=>{
    const s=slides[i],selected=new Set(s.claimRefs),metricIds=new Set(s.metricRefs);
    [s.title,s.proves].flatMap(tokens).forEach(r=>metricIds.add(r));
    let n;do{n=selected.size;for(const c of claimsOf(doc))if(selected.has(c.id))fields.flatMap(k=>tokens(c[k])).forEach(r=>metricIds.add(r));for(const r of metricIds)if(owners.has(r))selected.add(owners.get(r));}while(selected.size!==n);
    p.content.claims=p.content.claims.filter(c=>selected.has(c.id));p.content.metrics=p.content.metrics.filter(m=>metricIds.has(m.id));
    const keys=new Set(p.content.claims.flatMap(c=>c.sourceKeys));p.content.sources=p.content.sources.filter(s=>keys.has(s.key));p.contentHash=content.contentHash(p.content);
  });
  result.blueprintSha256=content.hash(doc);result.blueprintSchemaVersion=3;result.analysisSha256=digest(doc);result.preview=options.preview===true;return result;
}
module.exports={validate,adopted,digest,artifactErrors,materialize,compile};
