/* 全册两项固定要求各自审查；结构校验只证明记录完整，不证明审美判断。 */
'use strict';
const R=require('./execution_requirements.cjs'),C=require('./report_contract.cjs');
const text=v=>typeof v==='string'&&!!v.trim();
function drafts(role){return R.FIXED.map(r=>({id:r.id,requirement:r.text,status:'not_reviewed',reviewer:'',independence:role,basis:'',evidenceIds:[],observations:[],repetitions:[]}));}
function validate(review,audit,{partial=false}={}){
 if(!R.enabled(audit?.taskContract))return [];
 const errors=[],checks=review.qualityChecks;
 if(checks===undefined&&partial)return [];
 if(!Array.isArray(checks))return ['固定要求缺少 qualityChecks，不能以其他 visual/checks 合并替代'];
 const roles=C.normalize(audit.taskContract).reviewPolicy==='independent'?['author','independent']:['author'],known=new Map((audit.evidenceManifest?.entries||[]).map(e=>[e.id,e])),seen=new Set();
 for(const check of checks){
  if(!check||!R.FIXED.some(r=>r.id===check.id)||!roles.includes(check.independence)||!text(check.reviewer)){errors.push('固定要求审查身份无效');continue;}
  const key=check.id+':'+check.independence;if(seen.has(key))errors.push('固定要求审查角色重复：'+key);seen.add(key);
  if(check.status!=='pass'||!text(check.basis))errors.push(key+' 未通过或缺少具体判断');
  if(!Array.isArray(check.evidenceIds)||new Set(check.evidenceIds).size!==check.evidenceIds.length||check.evidenceIds.some(id=>!known.has(id))||[...known.keys()].some(id=>!check.evidenceIds.includes(id)))errors.push(key+' 须引用当前整册 HTML/PDF 证据');
  if(!Array.isArray(check.observations)||!check.observations.length||check.observations.some(o=>!text(o.pageId)||!text(o.observed)||!text(o.considered)||!text(o.decision)||![...known.values()].some(e=>e.pageId===o.pageId)))errors.push(key+' 须记录实际所见、主动考虑的其他表达与取舍');
  const pageIds=[...new Set([...known.values()].map(e=>e.pageId))];if(pageIds.some(id=>!(check.observations||[]).some(o=>o.pageId===id)))errors.push(key+' 须逐页记录所见与取舍');
  if(!Array.isArray(check.repetitions)||check.repetitions.some(o=>!Array.isArray(o.pageIds)||o.pageIds.length<2||!text(o.reason)||o.pageIds.some(id=>![...known.values()].some(e=>e.pageId===id))))errors.push(key+' 重复组须列页与具体理由；没有重复使用空数组');
  const own=new Set((review.coverage||[]).filter(c=>c.reviewer===check.reviewer&&c.independence===check.independence).flatMap(c=>(c.evidence||[]).map(e=>e.id)));if((check.evidenceIds||[]).some(id=>!own.has(id)))errors.push(key+' 须由该审查者本人覆盖全部所引用的双媒介证据');
  if(!(review.coverage||[]).some(c=>c.reviewer===check.reviewer&&c.independence===check.independence))errors.push(key+' 审查者必须与实际覆盖记录一致');
 }
 if(!partial)for(const r of R.FIXED){for(const role of roles)if(!seen.has(r.id+':'+role))errors.push(r.id+' 缺少 '+role+' 整册审查');const list=checks.filter(c=>c.id===r.id);if(roles.length>1&&new Set(list.map(c=>c.reviewer)).size<2)errors.push(r.id+' 作者与独立审查者必须不同');}
 return errors;
}
module.exports={drafts,validate};
