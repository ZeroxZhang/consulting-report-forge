/* 准备证据与未审草稿；推荐页不是免审范围，不填写通过或审查者身份。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {hash,stable,requiresIndependent}=require('./report_contract.cjs');
function warningGroups(audit){
  const groups=new Map();
  for(const warning of audit.warnings||[]){
    let identity={warning},medium='unspecified';
    const match=warning.match(/^第(\d+)页(打印)?视觉诊断：(.*)$/s);
    if(match)try{
      const item=JSON.parse(match[3]);
      if(item.selector){identity={page:Number(match[1]),code:item.code,selector:item.selector,pseudo:item.pseudo,sides:item.sides};medium=match[2]?'print':'html';}
    }catch{}
    const id=hash(stable(identity));
    if(!groups.has(id))groups.set(id,{id,identity,observations:[]});
    groups.get(id).observations.push({medium,warning});
  }
  return {auditSha256:hash(stable(audit)),groups:[...groups.values()]};
}
function expandDispositions(audit,decisions){
  const grouped=warningGroups(audit);
  if(decisions.auditSha256!==grouped.auditSha256)throw Error('告警处置对应旧版 audit');
  if(!Array.isArray(decisions.groups))throw Error('缺少分组处置');
  const known=new Map(grouped.groups.map(g=>[g.id,g])),seen=new Set(),out=[];
  for(const item of decisions.groups){
    if(!known.has(item.id)||seen.has(item.id))throw Error('未知或重复的诊断 ID');seen.add(item.id);
    if(!['accepted','fixed'].includes(item.status)||typeof item.note!=='string'||!item.note.trim())throw Error('须由审查者填写处置与具体依据');
    for(const {warning} of known.get(item.id).observations)out.push({warning,status:item.status,note:item.note});
  }
  return out;
}
function prepare({auditFile,outputDir}){
  const audit=JSON.parse(fs.readFileSync(auditFile,'utf8')),base=path.dirname(path.resolve(auditFile));
  const errors=require('./review_contract.cjs').auditErrors(audit,{auditDir:base});
  if(errors.length)throw Error('验收未通过，不能准备正式审查：'+errors.join('；'));
  const grouped=warningGroups(audit),diagnostics=require('./diagnostic_summary.cjs').summarize(audit);
  const entries=audit.evidenceManifest.entries.map(e=>({...e,path:path.resolve(base,e.path)}));
  const bodyRows=(audit.rows||[]).filter(row=>!['cover','back-cover','references'].includes(row.bookends?.role));
  const dense=[...bodyRows].sort((a,b)=>(b.textLength||0)-(a.textLength||0))[0];
  const detailed=[...bodyRows].sort((a,b)=>(b.exhibits||[]).reduce((n,e)=>n+(e.labels?.length||0),0)-(a.exhibits||[]).reduce((n,e)=>n+(e.labels?.length||0),0))[0];
  const ranked=(audit.rows||[]).map(row=>({page:row.page,reasons:[
    ...(row===dense?['正文文本量最大，密度风险需查看']:[]),
    ...(row===detailed?['展品标签量最大，标注风险需查看']:[]),
    ...(row.readingShadow?.observations?.length?['阅读影子检测发现']:[]),
    ...(row.visualPolicy?.warnings?.length?['视觉诊断待判断']:[]),
    ...(row.bookends?.role==='references'?['来源完整性']:[]),
    ...(row.charts?.length>1?['多个图表']:[])],evidence:entries.filter(e=>e.page===row.page)})).sort((a,b)=>b.reasons.length-a.reasons.length||a.page-b.page);
  const alternate=[...bodyRows].filter(r=>r.form!==dense?.form).sort((a,b)=>(b.textLength||0)-(a.textLength||0))[0];
  const referenceRisk=ranked.find(r=>(audit.rows||[]).some(row=>row.page===r.page&&row.bookends?.role==='references'));
  const priorityPages=[...new Set([ranked.find(r=>r.reasons.length)?.page,dense?.page,detailed?.page,alternate?.page,referenceRisk?.page,...ranked.map(r=>r.page)].filter(Boolean))].slice(0,3);
  const caps=require('./contract_capabilities.cjs').capabilities(audit.taskContract);
  const roles=requiresIndependent(audit)?['author','independent']:['author'];
  const write=(name,value)=>fs.writeFileSync(path.join(outputDir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  for(const role of roles)write(role+'.json',{schemaVersion:caps.finalReview,status:'incomplete',reviewer:'',independence:role,
    htmlSha256:audit.htmlArtifact.sha256,pdfSha256:audit.pdfArtifact.sha256,auditSha256:grouped.auditSha256,
    ...(caps.analysis?{analysisSha256:null}:{}),...(caps.strict?{analysisAlgorithm:caps.algorithm}:{}),coverage:[],
    checks:Object.fromEntries(['analysis','evidence','visual'].map(k=>[k,{status:'not_reviewed',basis:''}])),warningReview:[],issues:[]});
  write('diagnostics.json',diagnostics);write('warning-decisions.json',{auditSha256:grouped.auditSha256,groups:grouped.groups.map(g=>({...g,status:'not_reviewed',note:''}))});
  // 新策略：组合覆盖清单由合同派生，审查者填写实际所见，工具不生成 PASS。
  const composition=require('./composition_contract.cjs');
  const isComposition=composition.supportsComposition(audit.taskContract);
  const compositionChecklist=isComposition?(()=>{
    const list=[];
    for(const row of (audit.rows||[])){
      const pid=row.pageId||('page-'+row.page);
      for(const panelId of composition.panelIds({exhibit:row.composition?{contract:'semantic-exhibit-v1',semantics:{composition:row.composition}}:undefined}))list.push({slideId:pid,panelRef:pid+':'+panelId,reason:'逐 panel 核对实际形式、数据绑定、容量、来源与打印存在性'});
      for(const relId of composition.relationRefs({exhibit:row.composition?{contract:'semantic-exhibit-v1',semantics:{composition:row.composition}}:undefined}))list.push({slideId:pid,relationRef:pid+':'+relId,reason:'核对组合关系能否直接读出，是否共同支持页结论'});
    }
    return list;
  })():[];
  /* 新策略：叙事覆盖清单逐页预填"这一页声明了什么"，把"你看到的收束句是什么"留空给审查者。
     预填的只有待查对象，没有通过结论，也没有把蓝图声明当成已核实的页面事实。 */
  const narrativeCaps=(()=>{try{return require('./contract_capabilities.cjs').visualPolicy(audit.taskContract?.policyVersions?.visual);}catch(_){return null;}})();
  let narrativeChecklist=[],narrativeArc=null,narrativeDiagnostics=[];
  if(narrativeCaps&&narrativeCaps.narrative){
    try{
      const record=require('./review_contract.cjs').taskRecords(audit,{auditDir:base}).find(r=>r.key==='blueprint');
      const blueprint=JSON.parse(fs.readFileSync(record.path,'utf8'));
      narrativeArc=blueprint.deck?.arc||null;
      narrativeDiagnostics=require('./narrative_contract.cjs').diagnostics(blueprint,{task:audit.taskContract});
      const slideOf=id=>(blueprint.slides||[]).find(s=>s&&s.id===id)||{};
      narrativeChecklist=bodyRows.map(row=>{
        const id=row.pageId||('page-'+row.page),slide=slideOf(id);
        return {slideId:id,page:row.page,title:slide.title||row.title||'',adds:slide.adds||'',proves:slide.proves||'',
          observedTakeaway:'',arcFit:''};
      });
    }catch(error){narrativeChecklist=[{error:'叙事清单派生失败：'+error.message}];}
  }
  write('review-pack.json',{auditFile:path.resolve(auditFile),auditSha256:grouped.auditSha256,priorityPages:priorityPages,pages:ranked,evidence:entries,
    ...(compositionChecklist.length?{compositionChecklist}:{}),
    ...(narrativeChecklist.length?{narrativeArc,narrativeChecklist,...(narrativeDiagnostics.length?{narrativeDiagnostics}:{})}:{}),
    note:'优先查看风险页，正式验收仍须覆盖全部 HTML/PDF；草稿没有审查身份或通过结论。'
      +(compositionChecklist.length?' 组合覆盖清单由合同派生，逐项填写实际所见。':'')
      +(narrativeChecklist.length?' 叙事清单只预填了本页声明的推动点，observedTakeaway 须填你在页面上实际读到的收束句，不是把声明抄一遍。':'')});
  return {status:'prepared',directory:outputDir,priorityPages:priorityPages,drafts:roles.map(r=>r+'.json'),warningGroups:grouped.groups.length,warningObservations:(audit.warnings||[]).length};
}
module.exports={prepare,warningGroups,expandDispositions};
