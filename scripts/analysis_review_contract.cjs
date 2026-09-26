/* 前置分析审查：绑定真实文件版本与审查覆盖，绝不生成通过结论。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const analysis=require('./analysis_contract.cjs'),contract=require('./report_contract.cjs');
const text=v=>typeof v==='string'&&v.trim();
function validate(record,doc,{task,baseDir}={}){
  const errors=[];
  const caps=require('./contract_capabilities.cjs').capabilities(task||{version:2});
  if(record?.schemaVersion!==caps.analysisReview)return ['analysis-review.schemaVersion 须为 '+caps.analysisReview];
  if(caps.strict){
    const projection=require('./analysis_projection.cjs');
    if(record.status!=='complete'||record.analysisAlgorithm!==caps.algorithm)errors.push('严格分析审查未完成或算法身份错误');
    if(!record.analysisProjection||contract.hash(contract.stable(record.analysisProjection))!==record.analysisSha256)errors.push('严格分析审查缺少与摘要一致的可审投影');
    if(record.analysisProjection)for(const change of projection.differences(record.analysisProjection,projection.project(doc).projection))errors.push('分析投影变化：'+change.pointer+' '+JSON.stringify({before:change.before,after:change.after}));
  }
  if(record.analysisSha256!==analysis.digest(doc,task))errors.push('分析审查对应旧版本：重新审查变化判断与全局综合');
  if(!baseDir&&doc.artifacts?.length)errors.push('核对分析附件须提供 baseDir');
  else errors.push(...analysis.artifactErrors(doc,baseDir));
  const used=analysis.adopted(doc),reviews=Array.isArray(record.reviews)?record.reviews:[];
  const roles=task?.complexity==='complex'||task?.majorConclusion?['author','independent']:['author'];
  const identities=new Map();
  for(const r of reviews){
    if(!text(r.reviewer)||!text(r.instanceId)||!['author','independent'].includes(r.role)||!text(r.basis)||!['ready','conditional'].includes(r.conclusion))errors.push('分析审查身份、依据或结论未就绪');
    for(const identity of [r.reviewer,r.instanceId]){if(identities.has(identity)&&identities.get(identity)!==r.role)errors.push('作者与独立审查实例重叠');identities.set(identity,r.role);}
    if(r.conclusion==='conditional'&&(!Array.isArray(r.limitationClaimRefs)||!r.limitationClaimRefs.length||r.limitationClaimRefs.some(id=>!used.claimRefs.includes(id))))errors.push('有条件通过须引用已采纳限制主张');
    if(caps.strict&&(!Array.isArray(r.coverage?.slideRefs)||r.coverage.slideRefs.some(id=>!doc.slides.some(s=>s.id===id))))errors.push('严格分析审查 coverage.slideRefs 无效');
    for(const k of ['claimRefs','issueRefs','optionRefs'])if(!Array.isArray(r.coverage?.[k])||r.coverage[k].some(id=>!({claimRefs:doc.claims,issueRefs:doc.analysis.issues,optionRefs:doc.analysis.options}[k]||[]).some(x=>x.id===id)))errors.push('分析审查 coverage.'+k+' 无效');
  }
  for(const role of roles){
    const relevant=reviews.filter(r=>r.role===role);if(!relevant.length)errors.push('缺少 '+role+' 分析审查');
    if(caps.strict)for(const slide of doc.slides)if(!relevant.some(r=>r.coverage?.slideRefs?.includes(slide.id)))errors.push(role+' 分析审查缺少展示论断 '+slide.id);
    for(const k of ['claimRefs','issueRefs','optionRefs'])for(const ref of used[k])if(!relevant.some(r=>r.coverage?.[k]?.includes(ref)))errors.push(role+' 分析审查缺少 '+ref);
  }
  if(!Array.isArray(record.issues))errors.push('分析审查须明确 issues');
  for(const i of record.issues||[])if(!text(i.description)||!['minor','major','blocking'].includes(i.severity)||!['open','resolved'].includes(i.status)||(i.severity!=='minor'&&i.status==='open')||(i.status==='resolved'&&!text(i.resolution)))errors.push('分析审查存在未解决问题或缺处置依据');
  return [...new Set(errors)];
}
function check(doc,{task,baseDir}={}){
  if(task?.workMode==='editorial')return [];
  const ref=task?.analysisReview;
  if(!ref?.record||!ref.sha256||!baseDir)return ['缺少绑定的 analysisReview.record/sha256 或其基准目录；只能显式 --preview'];
  try{const file=path.resolve(baseDir,ref.record);if(contract.fileHash(file)!==ref.sha256)return ['analysisReview 文件摘要变化'];return validate(JSON.parse(fs.readFileSync(file,'utf8')),doc,{task,baseDir});}
  catch(e){return ['analysisReview 无法核对：'+e.message];}
}
module.exports={validate,check};
