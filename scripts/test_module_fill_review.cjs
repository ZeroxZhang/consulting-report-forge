/* 仅验证审查合同的合成夹具，不代表真实报告已被人工查看或通过。 */
'use strict';
const assert=require('node:assert/strict');
const M=require('./module_fill_review.cjs'),Q=require('./execution_quality.cjs'),R=require('./execution_requirements.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const task={version:3,analysisAlgorithm:'semantic-v2',workMode:'editorial',complexity:'simple',majorConclusion:true,
 policyVersions:{...require('./contract_capabilities.cjs').DEFAULT_POLICIES,workflow:'execution-plan-2'},executionPlan:{id:'synthetic-fill',record:'execution-plan.json'}};
const region=(id,kind,parentId,findings=[])=>({id,selector:'.'+id,kind,...(parentId?{parentId}:{}),bounds:{x:0,y:0,width:500,height:300},
 measurements:{method:'measured-line-and-media-projections',contentBounds:{x:12,y:12,width:476,height:276},measuredVerticalCoverage:0.93,measuredHorizontalCoverage:0.8,baselineFillRatio:null,maxGap:48},findings,reserved:[]});
const probe={version:1,regions:[region('body','body'),region('panel','module','body'),
 region('left','column','panel',[{ruleId:'D1',axis:'y',position:'bottom',requiresReview:true}]),
 region('right','column','panel',[{ruleId:'D2',axis:'x',position:'right',requiresReview:true}])],limitation:'合成测量，仅用于合同测试'};
const audit={taskContract:task,pages:3,rows:[{page:1,pageId:'cover',bookends:{role:'cover'}},
 {page:2,pageId:'body-page',bookends:{role:'content'},moduleFill:clone(probe),printModuleFill:clone(probe)},
 {page:3,pageId:'refs',bookends:{role:'references'}}],evidenceManifest:{entries:['html','pdf'].flatMap(medium=>['cover','body-page','refs'].map((pageId,index)=>({id:medium+':'+pageId,pageId,page:index+1,medium})))}};
const completed=()=>{
 const check=M.draft(audit);check.inventoryChecks.forEach(i=>i.basis='合成夹具：已逐一核对正文、面板和左右栏');
 check.observations.forEach(o=>{
  const region=M.inventory(audit).find(r=>r.pageId===o.pageId&&r.medium===o.medium&&r.regionId===o.regionId);
  o.observed='合成夹具：逐模块实际所见记录';o.decision='合成夹具：核对阅读顺序后保留';
  o.whitespace=region.findings.map(f=>({position:f.position,function:'合成夹具：与并排信息分组留出停顿',basis:'合成夹具：核对同排模块的阅读关系'}));
  o.diagnostics=region.findings.map((f,index)=>({index,disposition:'design-space',basis:'合成夹具：对应信息分组的留白'}));
 });return check;
};
const rejected=(mutate,pattern)=>{const check=completed(),current=clone(audit);mutate(check,current);const errors=M.validate(check,current);assert.ok(errors.some(e=>pattern.test(e)),JSON.stringify(errors));};
assert.deepEqual(M.auditErrors(audit),[]);
assert.equal(M.inventory(audit).length,8);
assert.deepEqual(new Set(M.inventory(audit).map(r=>r.medium)),new Set(['html','pdf']));
assert.deepEqual(M.validate(completed(),audit),[]);
assert.ok(M.validate(M.draft(audit),audit).length,'测量覆盖率高也不能自动生成审查通过');
rejected(c=>c.observations=c.observations.filter(o=>!(o.medium==='html'&&o.regionId==='right')),/缺少区域审查.*html:right/);
rejected(c=>c.observations=c.observations.filter(o=>o.medium!=='pdf'),/缺少区域审查.*pdf/);
rejected(c=>c.inventoryChecks=[],/完整性核对/);
rejected(c=>c.inventoryChecks.push(clone(c.inventoryChecks[0])),/枚举核对重复/);
rejected(c=>c.observations.find(o=>o.regionId==='left').diagnostics=[],/未处置检测项/);
rejected(c=>c.observations.find(o=>o.regionId==='left').whitespace=[],/design-space/);
rejected(c=>c.observations.find(o=>o.regionId==='left').whitespace[0].function='',/设计功能/);
rejected(c=>c.observations.find(o=>o.regionId==='left').diagnostics[0].disposition='fixed',/修复并重新检测/);
rejected(c=>c.observations.find(o=>o.regionId==='left').diagnostics[0].index=99,/未知检测项/);
rejected(c=>{const o=c.observations.find(o=>o.regionId==='left');o.diagnostics.push(clone(o.diagnostics[0]));},/处置重复/);
rejected(c=>c.observations[0].selector='.outdated',/selector/);
rejected(c=>c.observations[0].manual=true,/不能替代/);
rejected(c=>{const o=clone(c.observations[0]);o.regionId='unknown';c.observations.push(o);},/未知区域/);
rejected(c=>c.observations[0].pageId='cover',/正文页/);
rejected((c,a)=>a.rows[1].moduleFill.regions.push(clone(a.rows[1].moduleFill.regions[0])),/区域 ID 重复/);
rejected((c,a)=>a.rows[1].moduleFill.regions=a.rows[1].moduleFill.regions.filter(r=>r.kind!=='body'),/body 区域/);
rejected((c,a)=>a.rows[1].moduleFill.regions[1].kind='body',/只有一个/);
rejected((c,a)=>delete a.rows[1].moduleFill.regions[1].parentId,/父区域无效/);
rejected((c,a)=>a.rows[1].moduleFill.regions[1].parentId='left',/层次存在循环/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].measurements={},/实测占用率/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].measurements.method='baseline-fill-ratio',/实测占用率/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].measurements.baselineFillRatio=0.9,/不能冒充/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].measurements.contentBounds.height=-1,/实测占用率/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].measurements.measuredVerticalCoverage=1.1,/实测占用率/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].measurements.measuredVerticalCoverage=null,/实测占用率/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].measurements.maxGap=0,/实测占用率/);
rejected((c,a)=>delete a.rows[1].printModuleFill,/缺少当前模块填充测量/);
rejected((c,a)=>a.rows=[],/逐页枚举/);
rejected((c,a)=>a.rows[1].pageId='another-page',/证据不一致/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].reserved=[{selector:'.reserved',reason:''}],/预留空白声明缺少/);
rejected((c,a)=>a.rows[1].moduleFill.regions[0].reserved=[{selector:'.reserved',reason:'合成夹具：强调区'}],/预留空白的实际位置/);
rejected((c,a)=>a.rows[1].moduleFill.regions.find(r=>r.id==='left').findings[0].ruleId='D3',/D3 裁切/);
{
 const current=clone(audit),check=completed();current.rows[1].moduleFill.regions.find(r=>r.id==='left').findings[0].ruleId='D3';
 const d=check.observations.find(o=>o.regionId==='left'&&o.medium==='html').diagnostics[0];d.disposition='measurement-artifact';d.basis='合成夹具：测量包含字体墨迹外侧边界，截图确认内容完整';
 assert.deepEqual(M.validate(check,current),[],'明确误报的 D3 允许审查者记录依据');
 d.basis='';assert.ok(M.validate(check,current).length);
}
{
 const current=clone(audit),check=completed(),o=check.observations.find(o=>o.regionId==='body'&&o.medium==='html');
 current.rows[1].moduleFill.regions[0].reserved=[{selector:'.pause',reason:'合成夹具：阅读停顿'},{selector:'.focus',reason:'合成夹具：聚焦主结论'}];
 o.whitespace=[{selector:'.pause',position:'middle',function:'合成夹具：阅读停顿',basis:'合成夹具：上下是两个判断组'}];
 assert.ok(M.validate(check,current).some(e=>e.includes('逐个核实预留空白：.focus')));
 o.whitespace.push({selector:'.focus',position:'bottom',function:'合成夹具：主结论的停顿',basis:'合成夹具：金句与邻栏阅读顺序一致'});
 assert.deepEqual(M.validate(check,current),[]);
}
{
 const current=clone(audit),m=current.rows[1].moduleFill.regions[0].measurements;m.contentBounds.height=0;m.measuredVerticalCoverage=null;
 assert.deepEqual(M.auditErrors(current),[],'内容区零尺寸时可记录无法计算的该轴覆盖率');
}
{
 const check=completed(),manual={pageId:'body-page',medium:'html',regionId:'manual-note',manual:true,selector:'.panel .note',observed:'合成夹具：补查未被探针识别的注释子区',decision:'合成夹具：没有无功能的大块留白',whitespace:[],diagnostics:[]};check.observations.push(manual);
 assert.ok(M.validate(check,audit).some(e=>e.includes('同时核对 HTML 和 PDF')));
 check.observations.push({...manual,medium:'pdf',observed:'合成夹具：印刷版注释在面板下方，已检查其实际位置'});
 assert.deepEqual(M.validate(check,audit),[],'手动观察补充枚举，不取代自动区域');
}
const evidenceIds=audit.evidenceManifest.entries.map(e=>e.id);
const quality=role=>R.fixed(task).map(r=>({id:r.id,requirement:r.text,independence:role,reviewer:role,status:'pass',basis:'合成夹具：填写审查依据',evidenceIds,
 ...(r.id==='module-fill'?completed():{observations:['cover','body-page','refs'].map(pageId=>({pageId,observed:'合成所见',considered:'合适替代形式',decision:'合成选择依据'})),repetitions:[]})}));
const review=()=>({qualityChecks:[...quality('author'),...quality('independent')],coverage:['author','independent'].map(role=>({reviewer:role,independence:role,evidence:evidenceIds.map(id=>({id}))}))});
assert.deepEqual(Q.validate(review(),audit),[]);
{
 const value=review();value.qualityChecks=value.qualityChecks.filter(c=>c.id!=='module-fill');assert.ok(Q.validate(value,audit).some(e=>e.includes('module-fill 缺少')));
}
{
 const value=review();value.coverage[1].evidence=value.coverage[1].evidence.filter(e=>e.id!=='pdf:body-page');assert.ok(Q.validate(value,audit).some(e=>e.includes('module-fill:independent 须由该审查者本人')));
}
{
 const value=review();value.qualityChecks.find(c=>c.id==='module-fill').reviewer='other-reader';assert.ok(Q.validate(value,audit).some(e=>e.includes('module-fill:author 须由该审查者本人')));
}
{
 const legacy={...audit,taskContract:{...task,policyVersions:{...task.policyVersions,workflow:'execution-plan-1'}}};delete legacy.rows;
 const value=review();value.qualityChecks=value.qualityChecks.filter(c=>c.id!=='module-fill');
 assert.deepEqual(M.auditErrors(legacy),[]);assert.deepEqual(M.inventory(legacy),[]);assert.deepEqual(Q.validate(value,legacy),[]);
 const oldDraft=R.FIXED.map(r=>({id:r.id,requirement:r.text,status:'not_reviewed',reviewer:'',independence:'author',basis:'',evidenceIds:[],observations:[],repetitions:[]}));
 assert.deepEqual(Q.drafts('author',legacy.taskContract,legacy),oldDraft);assert.deepEqual(Q.drafts('author'),oldDraft);
}
const drafts=Q.drafts('author',task,audit),fill=drafts.find(c=>c.id==='module-fill');
assert.equal(fill.status,'not_reviewed');assert.equal(fill.observations.length,8);assert.equal(fill.repetitions,undefined);assert.ok(fill.observations.every(o=>o.observed===''&&o.decision===''));
assert.deepEqual(Q.drafts('author',task).find(c=>c.id==='module-fill').observations,[]);
console.log('PASS module fill review: complete region/media inventory, diagnostic disposition, reserved whitespace, manual additions, personal evidence, immutable legacy behavior');
