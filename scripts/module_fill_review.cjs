/* 逐模块审查合同。测量只标出待判断的位置，不能替审查者认定留白合理或生成 PASS。 */
'use strict';
const R=require('./execution_requirements.cjs');
const text=v=>typeof v==='string'&&!!v.trim();
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const excluded=new Set(['cover','back-cover','references','divider']);
const rect=(v,positive=false)=>object(v)&&['x','y','width','height'].every(k=>Number.isFinite(v[k]))&&(positive?v.width>0&&v.height>0:v.width>=0&&v.height>=0);
const coverage=(v,size)=>Number.isFinite(v)&&v>=0&&v<=1||v===null&&size===0;
const measured=v=>object(v)&&v.method==='measured-line-and-media-projections'&&rect(v.contentBounds)&&
 coverage(v.measuredVerticalCoverage,v.contentBounds.height)&&coverage(v.measuredHorizontalCoverage,v.contentBounds.width)&&
 v.baselineFillRatio===null&&Number.isFinite(v.maxGap)&&v.maxGap>0;
const bodyRows=audit=>(Array.isArray(audit?.rows)?audit.rows:[]).filter(r=>r&&!excluded.has(r.bookends?.role));
const pageId=row=>row.pageId||('page-'+row.page);
const regionKey=r=>JSON.stringify([r.pageId,r.medium,r.regionId]);
function inventory(audit){
 if(!R.moduleFill(audit?.taskContract))return [];
 return bodyRows(audit).flatMap(row=>[['html','moduleFill'],['pdf','printModuleFill']].flatMap(([medium,field])=>
  (Array.isArray(row[field]?.regions)?row[field].regions:[]).filter(object).map(region=>({
   ...region,pageId:pageId(row),page:row.page,medium,regionId:region.id
  }))));
}
function auditErrors(audit){
 if(!R.moduleFill(audit?.taskContract))return [];
 const errors=[],rows=Array.isArray(audit?.rows)?audit.rows:[],ids=new Set(),pages=new Set();
 const entries=(Array.isArray(audit.evidenceManifest?.entries)?audit.evidenceManifest.entries:[]).filter(object);
 if(!rows.length)errors.push('模块填充 audit 缺少逐页枚举');
 if(Number.isInteger(audit.pages)&&rows.length!==audit.pages)errors.push('模块填充 audit 页枚举不完整');
 for(const row of rows){
  if(!object(row)||!text(pageId(row))||!Number.isInteger(row.page)||row.page<1){errors.push('模块填充 audit 页身份无效');continue;}
  const pid=pageId(row);
  if(ids.has(pid)||pages.has(row.page))errors.push('模块填充 audit 页身份重复：'+pid);
  ids.add(pid);pages.add(row.page);
  for(const medium of ['html','pdf'])if(!entries.some(e=>e.pageId===pid&&e.medium===medium&&e.page===row.page))errors.push('模块填充 audit 页身份与 '+medium+' 证据不一致：'+pid);
  if(excluded.has(row.bookends?.role))continue;
  for(const [medium,field] of [['html','moduleFill'],['pdf','printModuleFill']]){
   const probe=row[field],key=pid+':'+medium;
   if(!object(probe)||probe.version!==1||!Array.isArray(probe.regions)||!probe.regions.length){errors.push(key+' 缺少当前模块填充测量');continue;}
   const seen=new Set();
   if(probe.regions.filter(r=>r?.kind==='body').length!==1)errors.push(key+' 须有且只有一个正文 body 区域');
   for(const region of probe.regions){
    if(!object(region)||!text(region.id)||!text(region.selector)||!['body','module','column'].includes(region.kind)){errors.push(key+' 区域身份无效');continue;}
    if(seen.has(region.id))errors.push(key+' 区域 ID 重复：'+region.id);seen.add(region.id);
    if(!rect(region.bounds,true)||!measured(region.measurements))errors.push(key+':'+region.id+' 缺少有效边界或实测占用率；不能冒充默认排版填充率');
    if(!Array.isArray(region.findings)||region.findings.some(f=>!object(f)||!['D1','D2','D3'].includes(f.ruleId)||!['x','y'].includes(f.axis)||!text(f.position)))errors.push(key+':'+region.id+' 检测记录无效');
    if(!Array.isArray(region.reserved)||region.reserved.some(r=>!object(r)||!text(r.selector)||typeof r.reason!=='string'))errors.push(key+':'+region.id+' 预留空白记录无效');
   }
   const byId=new Map(probe.regions.filter(object).map(r=>[r.id,r]));
   for(const region of probe.regions.filter(object)){
    if(region.kind==='body'&&region.parentId!==undefined||region.kind!=='body'&&(!text(region.parentId)||!seen.has(region.parentId)))errors.push(key+':'+region.id+' 父区域无效');
    const trail=new Set([region.id]);let ancestor=region.parentId;
    while(ancestor!==undefined&&byId.has(ancestor)){
     if(trail.has(ancestor)){errors.push(key+':'+region.id+' 区域层次存在循环');break;}
     trail.add(ancestor);ancestor=byId.get(ancestor).parentId;
    }
   }
  }
 }
 return errors;
}
function draft(audit){return {
 inventoryChecks:R.moduleFill(audit?.taskContract)?bodyRows(audit).map(row=>({pageId:pageId(row),basis:''})):[],
 observations:inventory(audit).map(region=>({pageId:region.pageId,regionId:region.regionId,medium:region.medium,
  selector:region.selector,observed:'',decision:'',whitespace:[],
  diagnostics:(Array.isArray(region.findings)?region.findings:[]).map((finding,index)=>({index,disposition:'not_reviewed',basis:''}))}))
};}
function validate(check,audit){
 if(!R.moduleFill(audit?.taskContract))return [];
 const errors=auditErrors(audit);if(errors.length)return errors;
 const expected=inventory(audit),known=new Map(expected.map(r=>[regionKey(r),r])),seen=new Set(),manualMedia=new Map();
 const bodyIds=new Set(bodyRows(audit).map(pageId)),inventories=Array.isArray(check?.inventoryChecks)?check.inventoryChecks:[],checked=new Set();
 if(!Array.isArray(check?.inventoryChecks))errors.push('module-fill 须逐正文页核对模块及栏位枚举');
 for(const item of inventories){
  if(!item||!bodyIds.has(item.pageId)||!text(item.basis)){errors.push('module-fill 枚举核对须引用正文页并填写实际核对依据');continue;}
  if(checked.has(item.pageId))errors.push('module-fill 枚举核对重复：'+item.pageId);checked.add(item.pageId);
 }
 for(const id of bodyIds)if(!checked.has(id))errors.push('module-fill 缺少 '+id+' 的模块及栏位完整性核对');
 if(!Array.isArray(check?.observations))errors.push('module-fill 须逐区域、逐媒介填写 observations');
 for(const observation of Array.isArray(check?.observations)?check.observations:[]){
  if(!object(observation)||!bodyIds.has(observation.pageId)||!['html','pdf'].includes(observation.medium)||!text(observation.regionId)){
   errors.push('module-fill 观察须绑定正文页、区域 ID 与 html/pdf 媒介');continue;
  }
  const key=regionKey(observation),region=known.get(key),label='module-fill '+observation.pageId+':'+observation.medium+':'+observation.regionId;
  if(seen.has(key))errors.push(label+' 观察重复');seen.add(key);
  if(!region&&!(observation.manual===true&&text(observation.selector)))errors.push(label+' 未知区域；手动补充须明确 manual:true 与 selector');
  if(observation.manual===true){const manualKey=JSON.stringify([observation.pageId,observation.regionId]);if(!manualMedia.has(manualKey))manualMedia.set(manualKey,new Set());manualMedia.get(manualKey).add(observation.medium);}
  if(region&&observation.manual===true)errors.push(label+' 手动补充不能替代自动枚举区域');
  if(region&&observation.selector!==undefined&&observation.selector!==region.selector)errors.push(label+' selector 与当前枚举不一致');
  if(!text(observation.observed)||!text(observation.decision))errors.push(label+' 须填写实际所见与修复/保留判断');
  const whitespace=Array.isArray(observation.whitespace)?observation.whitespace:[];
  if(!Array.isArray(observation.whitespace)||whitespace.some(w=>!object(w)||!text(w.position)||!text(w.function)||!text(w.basis)))errors.push(label+' 每块保留空白须记录位置、设计功能和依据；没有则用空数组');
  if(region?.reserved?.length&&!whitespace.length)errors.push(label+' 须核实预留空白的实际位置和设计功能');
  if(region?.reserved?.some(r=>!text(r.reason)))errors.push(label+' 预留空白声明缺少设计用途，须补全后重新检测');
  for(const reserved of region?.reserved||[])if(!whitespace.some(w=>w?.selector===reserved.selector&&text(w.position)&&text(w.function)&&text(w.basis)))errors.push(label+' 须按 selector 逐个核实预留空白：'+reserved.selector);
  const findings=Array.isArray(region?.findings)?region.findings:[],diagnostics=Array.isArray(observation.diagnostics)?observation.diagnostics:[],disposed=new Set();
  if(!Array.isArray(observation.diagnostics))errors.push(label+' 须逐项处置当前检测记录');
  for(const diagnostic of diagnostics){
   if(!object(diagnostic)||!Number.isInteger(diagnostic.index)||diagnostic.index<0||diagnostic.index>=findings.length){errors.push(label+' 引用了未知检测项');continue;}
   const finding=findings[diagnostic.index];
   if(disposed.has(diagnostic.index))errors.push(label+' 检测项处置重复：'+diagnostic.index);disposed.add(diagnostic.index);
   if(!['design-space','measurement-artifact'].includes(diagnostic.disposition)||!text(diagnostic.basis))errors.push(label+' 检测项须有具体处置依据；真实缺陷须修复并重新检测');
   if(finding.ruleId==='D3'&&diagnostic.disposition!=='measurement-artifact')errors.push(label+' D3 裁切/溢出不能以设计留白保留；须修复重跑或给出测量误报依据');
   if(diagnostic.disposition==='design-space'&&!whitespace.some(w=>w?.position===finding.position&&text(w.function)&&text(w.basis)))errors.push(label+' design-space 须为该位置写明空白的设计功能与依据');
  }
  for(let index=0;index<findings.length;index++)if(!disposed.has(index))errors.push(label+' 未处置检测项 '+index+'（'+findings[index].ruleId+'）');
 }
 for(const region of expected)if(!seen.has(regionKey(region)))errors.push('module-fill 缺少区域审查：'+region.pageId+':'+region.medium+':'+region.regionId);
 for(const [key,media] of manualMedia)if(!media.has('html')||!media.has('pdf'))errors.push('module-fill 手动补充区域须同时核对 HTML 和 PDF：'+key+'；布局不出现时也须记录实际所见与判断');
 return errors;
}
module.exports={inventory,auditErrors,draft,validate};
