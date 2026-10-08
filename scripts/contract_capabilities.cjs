/* 显式版本表与显式策略能力表；未知未来版本一律拒绝，不以 >= 推断语义。
   策略能力集中在此查询，散落的字符串相等判断会让换策略值后某项检查悄悄失效。 */
'use strict';
const versions=Object.freeze({
  1:Object.freeze({analysis:false,strict:false,analysisReview:null,finalReview:3,algorithm:null}),
  2:Object.freeze({analysis:true,strict:false,analysisReview:1,finalReview:4,algorithm:'legacy-v1'}),
  3:Object.freeze({analysis:true,strict:true,analysisReview:2,finalReview:5,algorithm:'semantic-v2'})
});
function capabilities(task){const version=task&&Object.hasOwn(task,'version')?task.version:1;if(!Number.isInteger(version)||!Object.hasOwn(versions,version))throw Error('不支持的任务合同版本：'+version);return versions[version];}

/* 视觉策略能力。每一项都必须包含前一项的全部检查，再加自己的新增项——
   narrative-focus-1 ⊃ evidence-composition-1 ⊃ structural-lines-1。换策略值不能让细线检查意外失效。
   waterfallScope 决定瀑布体检作用域：旧策略保持页面级冻结行为，新策略下沉到 panel。
   narrative/pageFocus/visualFocus 是 1.6.0 后半轮的能力：整册推进、单页只讲一件事、重点感实测。
   能力值一旦存在就不原地改语义——已经产出的 evidence-composition-1 报告保持原解释。 */
const VISUAL_POLICIES=Object.freeze({
  'legacy-1':Object.freeze({structuralLines:false,perPanel:false,composition:false,waterfallScope:'page',scaleGroups:false,panelIdentity:false,narrative:false,pageFocus:false,visualFocus:false}),
  'structural-lines-1':Object.freeze({structuralLines:true,perPanel:false,composition:false,waterfallScope:'page',scaleGroups:false,panelIdentity:false,narrative:false,pageFocus:false,visualFocus:false}),
  'evidence-composition-1':Object.freeze({structuralLines:true,perPanel:true,composition:true,waterfallScope:'panel',scaleGroups:true,panelIdentity:true,narrative:false,pageFocus:false,visualFocus:false}),
  'narrative-focus-1':Object.freeze({structuralLines:true,perPanel:true,composition:true,waterfallScope:'panel',scaleGroups:true,panelIdentity:true,narrative:true,pageFocus:true,visualFocus:true})
});
const REFERENCE_POLICIES=Object.freeze({
  'single-page-1':Object.freeze({referenceBlock:false}),
  'reference-block-1':Object.freeze({referenceBlock:true})
});
const READING_POLICIES=Object.freeze({'reading-shadow-1':Object.freeze({shadow:true})});
const ANALYSIS_POLICIES=Object.freeze({'semantic-v2':Object.freeze({strictProjection:true}),'legacy-v1':Object.freeze({strictProjection:false})});
const WORKFLOW_POLICIES=Object.freeze({'execution-plan-1':Object.freeze({persistentChecklist:true})});
const POLICY_SLOTS=Object.freeze(['analysis','reading','visual','references']);
const DEFAULT_POLICIES=Object.freeze({analysis:'semantic-v2',reading:'reading-shadow-1',visual:'legacy-1',references:'single-page-1'});

function visualPolicy(name){
  if(!Object.hasOwn(VISUAL_POLICIES,name))throw Error('未知视觉策略：'+name);
  return VISUAL_POLICIES[name];
}
function referencePolicy(name){
  if(!Object.hasOwn(REFERENCE_POLICIES,name))throw Error('未知参考资料策略：'+name);
  return REFERENCE_POLICIES[name];
}
function policy(slot,name){
  const tables={workflow:WORKFLOW_POLICIES,visual:VISUAL_POLICIES,references:REFERENCE_POLICIES,reading:READING_POLICIES,analysis:ANALYSIS_POLICIES};
  const table=tables[slot];
  if(!table)throw Error('未知策略槽位：'+slot);
  if(!Object.hasOwn(table,name))throw Error('不支持的'+({visual:'视觉',references:'参考资料',reading:'阅读',analysis:'分析'}[slot])+'策略：'+name);
  return table[name];
}
function can(slot,name,capability){
  const table=policy(slot,name);
  if(!Object.hasOwn(table,capability))throw Error('未登记的策略能力：'+slot+'.'+capability);
  return table[capability]===true||table[capability];
}
function visualNames(){return Object.keys(VISUAL_POLICIES);}
function referenceNames(){return Object.keys(REFERENCE_POLICIES);}

/* 策略组合校验：四项齐全、各槽位在册，其余槽位只接受唯一现行值。 */
function normalizePolicies(selected){
  if(!selected||typeof selected!=='object'||Array.isArray(selected))throw Error('不支持的严格合同 policyVersions');
  if(Object.keys(selected).some(k=>![...POLICY_SLOTS,'workflow'].includes(k))||Object.keys(selected).length!==(selected.workflow===undefined?4:5))throw Error('不支持的严格合同 policyVersions');
  for(const slot of POLICY_SLOTS)if(!Object.hasOwn(selected,slot)||typeof selected[slot]!=='string')throw Error('不支持的严格合同 policyVersions');
  if(Object.hasOwn(selected,'workflow')){if(typeof selected.workflow!=='string')throw Error('workflow 须为显式字符串策略');policy('workflow',selected.workflow);}
  policy('analysis',selected.analysis);
  policy('reading',selected.reading);
  policy('visual',selected.visual);
  policy('references',selected.references);
  if(selected.analysis!=='semantic-v2')throw Error('不支持的严格合同 policyVersions');
  if(selected.reading!=='reading-shadow-1')throw Error('不支持的严格合同 policyVersions');
  return {...selected};
}
module.exports={WORKFLOW_POLICIES,capabilities,VISUAL_POLICIES,REFERENCE_POLICIES,READING_POLICIES,ANALYSIS_POLICIES,POLICY_SLOTS,DEFAULT_POLICIES,
  visualPolicy,referencePolicy,policy,can,visualNames,referenceNames,normalizePolicies};
