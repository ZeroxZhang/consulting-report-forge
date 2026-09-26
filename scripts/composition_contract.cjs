/* 复合证据合同：一个页面围绕一个核心判断，证明它可以需要一个或多个展品。
   panels 用稳定键登记每件展品的任务、形式、数据、容量；relations 解释它们如何共同支持页结论；
   scaleGroups 记录跨图量尺约定。编译适配层由 panels 派生旧格式必需的 region.form / page.form /
   primary / selection / capacity，作者重复声明时必须一致，不静默择一。
   判定尽量放在纯函数里，浏览器侧只采事实。 */
'use strict';
const caps=require('./contract_capabilities.cjs');
const POLICY='evidence-composition-1';
const COMPOSITION_VERSION=1;
const RELATION_KINDS=Object.freeze(['compare','decompose','sequence','complement','overview-detail','boundary','other']);
const SCALE_MODES=Object.freeze(['shared','independent']);
const SCALE_CHECKS=Object.freeze(['auto','manual']);
const list=v=>Array.isArray(v)?v:[];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,min=1)=>typeof v==='string'&&v.trim().length>=min;
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v);
const panelId=v=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v);
const norm=v=>String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim();
const copy=v=>JSON.parse(JSON.stringify(v));
const formName=value=>value==='custom'?'svg.custom':value;

/* —— 读取入口 —— */
function compositionOf(slide){
  const ex=slide&&slide.exhibit;
  if(!object(ex)||ex.contract!=='semantic-exhibit-v1')return null;
  return object(ex.semantics)?ex.semantics.composition??null:null;
}
function hasComposition(slide){return compositionOf(slide)!=null;}
function isCompositionTask(task){return task?.policyVersions?.visual===POLICY;}

/* —— 策略一致性：组合标记与 task 策略必须成对出现 —— */
function policyErrors(task,{composition,stage='research'}={}={}){
  const errors=[];
  const visual=task?.policyVersions?.visual;
  if(composition&&visual!==POLICY)errors.push('semantics.composition 需要显式视觉策略 '+POLICY+'；当前 '
    +(visual?visual:'任务未声明 policyVersions.visual')+' 不支持复合证据。旧策略输入新的组合标记时须显式升级任务策略，不能把未知内容只纳入签名而跳过组合检查');
  if(!composition&&visual===POLICY&&stage==='ready')errors.push(POLICY+' 要求每页登记完整 panel 计划；缺少 semantics.composition 时不能退回「只查主图」');
  return errors;
}

/* —— 结构校验 —— */
function validate(slide,{task,claims=[],sourceKeys=[],stage='research'}={}){
  const errors=[],bad=m=>errors.push(m);
  const composition=compositionOf(slide);
  if(composition===null||composition===undefined){
    if(task)errors.push(...policyErrors(task,{composition:false,stage}));
    return errors;
  }
  if(!object(composition)){bad((slide.id||'本页')+' exhibit.semantics.composition 须为对象');return errors;}
  const at=slide.id||'本页';
  if(composition.version!==COMPOSITION_VERSION)bad(at+' composition.version 只接受 '+COMPOSITION_VERSION+'，未知未来版本一律拒绝');
  for(const key of Object.keys(composition))if(!['version','anchorPanel','readingOrder','panels','relations','scaleGroups'].includes(key))bad(at+' composition 未登记字段：'+key);
  const panels=object(composition.panels)?composition.panels:null;
  if(!panels||!Object.keys(panels).length){bad(at+' composition.panels 须为非空对象，键是稳定 panel id');return [...errors,...(task?policyErrors(task,{composition:true,stage}):[])];}
  const ids=Object.keys(panels);
  for(const key of ids)if(!panelId(key))bad(at+' panel id 须为小写 kebab-case：'+key);

  // readingOrder：与 panels 键集合一致，顺序即阅读路径；DOM 重排不改身份。
  const order=list(composition.readingOrder);
  if(!order.length)bad(at+' composition.readingOrder 须列出全部 panel 的阅读顺序');
  else{
    if(new Set(order).size!==order.length)bad(at+' readingOrder 有重复 panel');
    for(const ref of order)if(!Object.hasOwn(panels,ref))bad(at+' readingOrder 引用未登记 panel：'+ref);
    for(const key of ids)if(!order.includes(key))bad(at+' readingOrder 缺少 panel：'+key);
  }
  // anchorPanel 只是阅读入口，不等于布局 primary；两者允许不同。
  if(!text(composition.anchorPanel)||!Object.hasOwn(panels,composition.anchorPanel))bad(at+' composition.anchorPanel 须指向已登记 panel（阅读入口，不等于布局 primary）');

  const claimIdSet=new Set(claims.map(c=>c&&c.id).filter(Boolean));
  const sourceKeySet=new Set(sourceKeys);
  for(const key of ids){
    const panel=panels[key],where=at+' panel '+key;
    if(!object(panel)){bad(where+' 须为对象');continue;}
    for(const field of Object.keys(panel))if(!['purpose','claimRefs','form','selection','capacity','data','waterfall','scaleGroup','semanticType','visual','sourceKeys','scale'].includes(field))bad(where+' 未登记字段：'+field);
    if(!text(panel.purpose,8))bad(where+' purpose 须说明至少8字：本展品让读者看出什么');
    try{require('../assets/deck-forms.js').get(formName(panel.form));}
    catch(e){bad(where+' form '+e.message);}
    // claimRefs 表示本展品承担的页内证明分工，必须是页主张子集；被签名不等于被审查。
    const refs=list(panel.claimRefs);
    if(!Array.isArray(panel.claimRefs)||!refs.length)bad(where+' claimRefs 须为非空数组：写明本展品承担的证明分工');
    else{
      if(new Set(refs).size!==refs.length)bad(where+' claimRefs 重复');
      for(const ref of refs)if(!claimIdSet.has(ref))bad(where+' claimRefs 未登记或不属于本页主张：'+ref);
    }
    if(panel.sourceKeys!==undefined){
      if(!Array.isArray(panel.sourceKeys))bad(where+' sourceKeys 须为数组');
      else for(const key2 of panel.sourceKeys)if(!sourceKeySet.has(key2))bad(where+' sourceKeys 未登记于 sourcePlan.keys：'+key2);
    }
    // 选型与容量：每个 panel 独立执行既有 form 合同，同形图各用各的计划。
    const formCheck=require('./form_contract.cjs').validate({form:formName(panel.form),selection:panel.selection,capacity:panel.capacity});
    errors.push(...formCheck.errors.map(e=>where+' '+e));
    if(panel.scaleGroup!==undefined&&(!object(composition.scaleGroups)||!Object.hasOwn(composition.scaleGroups,panel.scaleGroup)))bad(where+' scaleGroup 未登记：'+panel.scaleGroup);
    if(formName(panel.form)==='svg.custom'){
      if(!text(panel.visual))bad(where+' svg.custom 必须用 visual 声明实际表达');
      if(panel.semanticType!==undefined&&!require('./content_contract.cjs').SEMANTIC_TYPES.includes(panel.semanticType))bad(where+' semanticType 无效');
    }
    if(panel.data!==undefined&&!object(panel.data))bad(where+' data 须为对象');
    if(panel.waterfall!==undefined){
      if(!object(panel.waterfall)||!object(panel.waterfall.input))bad(where+' waterfall 须有 input:{items或records,config}');
      else for(const k of Object.keys(panel.waterfall))if(!['input','residualReason'].includes(k))bad(where+' waterfall.'+k+' 由内核派生，不能手填');
    }
  }

  // relations：多 panel 页面必须解释组合关系；单 panel 可为空。
  const relations=list(composition.relations);
  if(ids.length>1&&!relations.length)bad(at+' 多 panel 页面须用 relations 解释展品如何共同支持页结论');
  const relationIds=new Set();
  for(const [i,rel] of relations.entries()){
    const where=at+' relations['+i+']';
    if(!object(rel)){bad(where+' 须为对象');continue;}
    if(!id(rel.id)||relationIds.has(rel.id))bad(where+' id 须为唯一小写标识');else relationIds.add(rel.id);
    for(const field of Object.keys(rel))if(!['id','kind','panelRefs','reason'].includes(field))bad(where+' 未登记字段：'+field);
    if(!RELATION_KINDS.includes(rel.kind))bad(where+' kind 须为 '+RELATION_KINDS.join('/'));
    if(rel.kind==='other'&&!text(rel.reason,12))bad(where+' kind="other" 须写至少12字的自定义关系解释');
    const prefs=list(rel.panelRefs);
    if(!Array.isArray(rel.panelRefs)||prefs.length<2)bad(where+' panelRefs 须引用至少两个 panel');
    else{
      if(new Set(prefs).size!==prefs.length)bad(where+' panelRefs 重复');
      for(const ref of prefs)if(!Object.hasOwn(panels,ref))bad(where+' panelRefs 引用未登记 panel：'+ref);
    }
    if(!text(rel.reason,12))bad(where+' reason 须至少12字，说明这些展品为何必须一起看');
  }

  // 区域映射完整性：每个区域绑定一个 panel，每个 panel 至少被一个区域引用。
  const regions=list(slide.visual?.regions);
  if(!regions.length)bad(at+' 组合页面须声明 visual.regions 并逐项绑定 panelRef');
  const boundPanels=new Set();
  for(const [i,region] of regions.entries()){
    const where=at+' regions['+i+']';
    if(!object(region)){bad(where+' 须为对象');continue;}
    if(!text(region.panelRef)||!Object.hasOwn(panels,region.panelRef))bad(where+' panelRef 须指向已登记 panel');
    else boundPanels.add(region.panelRef);
    if(!text(region.slot)||!text(region.role))bad(where+' 须声明 slot 与 role');
    if(typeof region.span!=='number'||!Number.isFinite(region.span)||region.span<=0)bad(where+' span 须为正有限数');
  }
  for(const key of ids)if(!boundPanels.has(key))bad(at+' panel '+key+' 未被任何区域引用；每个 panel 对应一个审计根');
  const panelBindCount=new Map();
  for(const region of regions)if(object(region)&&text(region.panelRef))panelBindCount.set(region.panelRef,(panelBindCount.get(region.panelRef)||0)+1);
  for(const [ref,count] of panelBindCount)if(count>1)bad(at+' panel '+ref+' 被 '+count+' 个区域绑定；每个 panel 只对应一个审计根');

  // scaleGroups：有跨图比较时的量尺约定；不能只比较作者手写的两个标签。
  if(composition.scaleGroups!==undefined){
    if(!object(composition.scaleGroups))bad(at+' composition.scaleGroups 须为对象');
    else for(const [gid,group] of Object.entries(composition.scaleGroups)){
      const where=at+' scaleGroup '+gid;
      if(!id(gid)){bad(where+' id 须为小写标识');continue;}
      if(!object(group)){bad(where+' 须为对象');continue;}
      for(const field of Object.keys(group))if(!['panelRefs','mode','check','basis','domain','unit','scaleType'].includes(field))bad(where+' 未登记字段：'+field);
      const prefs=list(group.panelRefs);
      if(!Array.isArray(group.panelRefs)||prefs.length<2)bad(where+' panelRefs 须引用至少两个 panel');
      else for(const ref of prefs)if(!Object.hasOwn(panels,ref))bad(where+' panelRefs 引用未登记 panel：'+ref);
      if(!SCALE_MODES.includes(group.mode))bad(where+' mode 须为 '+SCALE_MODES.join('/'));
      if(!SCALE_CHECKS.includes(group.check))bad(where+' check 须为 '+SCALE_CHECKS.join('/'));
      if(!text(group.basis,12))bad(where+' basis 须至少12字：同口径可直接比大小，还是要逐轴查值');
      if(group.check==='auto'&&!object(group)&&false)bad(where+' 自动核查须提供可核对的尺度元数据');
      if(group.check==='manual')for(const k of ['domain','unit','scaleType'])if(group[k]!==undefined)bad(where+' 人工覆盖的量尺不写可自动核对的 '+k+'，避免把未测量写成通过');
    }
    for(const key of ids){
      const sg=panels[key].scaleGroup;
      if(sg!==undefined&&object(composition.scaleGroups[sg])&&!list(composition.scaleGroups[sg].panelRefs).includes(key))bad(at+' panel '+key+' 声明 scaleGroup '+sg+'，但该量尺的 panelRefs 未包含它');
    }
  }
  errors.push(...(task?policyErrors(task,{composition:true,stage}):[]));
  return [...new Set(errors)];
}

/* —— 依赖提取：panel.claimRefs 必须进入统一依赖解析 —— */
function claimRefs(slide){
  const composition=compositionOf(slide);
  if(!composition)return [];
  const refs=new Set();
  for(const panel of Object.values(object(composition.panels)?composition.panels:{}))for(const ref of list(panel?.claimRefs))refs.add(ref);
  return [...refs].sort();
}
function metricRefs(slide){
  const composition=compositionOf(slide);
  if(!composition)return [];
  const refs=new Set();
  function walk(v){if(Array.isArray(v))v.forEach(walk);else if(object(v)){if(typeof v.$metric==='string')refs.add(v.$metric);Object.values(v).forEach(walk);}}
  for(const panel of Object.values(object(composition.panels)?composition.panels:{}))walk(panel?.data);
  return [...refs];
}
function relationRefs(slide){return list(compositionOf(slide)?.relations).map(r=>r&&r.id).filter(Boolean).sort();}
function panelIds(slide){return Object.keys(object(compositionOf(slide)?.panels)?compositionOf(slide).panels:{});}

/* —— 兼容投影：由 panels 派生旧格式必需字段；作者重复声明必须一致 —— */
function deriveVisual(slide,ratio='16x9'){
  const composition=compositionOf(slide);
  if(!composition)return slide.visual;
  const authored=slide.visual||{},panels=composition.panels||{};
  const regions=list(authored.regions);
  const conflict=(field,authoredValue,derivedValue,where)=>{
    if(authoredValue!==undefined&&norm(authoredValue)!==norm(derivedValue))throw Error(where+' '+field+' 冲突：作者写「'+norm(authoredValue)+'」，由 panel 派生为「'+norm(derivedValue)+'」；重复声明必须一致，不能择一覆盖');
  };
  const bound=regions.map((region,index)=>{
    const where=(slide.id||'本页')+' regions['+index+']';
    if(!object(region))throw Error(where+' 须为对象');
    const ref=region.panelRef;
    if(!text(ref)||!Object.hasOwn(panels,ref))throw Error(where+' panelRef 须指向已登记 panel');
    const panel=panels[ref];
    const form=formName(panel.form);
    conflict('form',region.form,form,where);
    const derived={...copy(region),panelRef:ref,form};
    const panelVisual=panel.visual!==undefined?norm(panel.visual):norm(panel.purpose);
    conflict('visual',region.visual,panelVisual,where);derived.visual=panelVisual;
    if(panel.semanticType!==undefined)derived.semanticType=panel.semanticType;
    return derived;
  });
  if(!bound.length)throw Error((slide.id||'本页')+' 组合页面须声明 visual.regions 并逐项绑定 panelRef');
  // 旧 page.form/primary/selection/capacity 始终从布局唯一 primary 区域所绑定的 panel 派生。
  const primaryRegions=bound.filter(r=>r.role==='primary');
  if(primaryRegions.length!==1)throw Error((slide.id||'本页')+' regions 必须恰好有一个 role="primary"，当前 '+primaryRegions.length+' 个；阅读入口 anchorPanel 与布局 primary 是两件事');
  const primaryPanel=panels[primaryRegions[0].panelRef];
  const derived={...copy(authored),regions:bound,form:formName(primaryPanel.form)};
  conflict('form',authored.form,derived.form,slide.id||'本页');
  if(primaryPanel.visual!==undefined){conflict('primary',authored.primary,primaryPanel.visual,slide.id||'本页');derived.primary=norm(primaryPanel.visual);}
  else if(authored.primary!==undefined)derived.primary=norm(authored.primary);
  else derived.primary=norm(primaryPanel.purpose);
  if(primaryPanel.selection!==undefined){
    if(authored.selection!==undefined&&JSON.stringify(sortKeys(authored.selection))!==JSON.stringify(sortKeys(copy(primaryPanel.selection))))throw Error((slide.id||'本页')+' selection 冲突：作者声明与主 panel 的 selection 不一致');
    derived.selection=copy(primaryPanel.selection);
  }else if(authored.selection!==undefined)derived.selection=copy(authored.selection);
  if(primaryPanel.capacity!==undefined){
    if(authored.capacity!==undefined&&JSON.stringify(sortKeys(authored.capacity))!==JSON.stringify(sortKeys(copy(primaryPanel.capacity))))throw Error((slide.id||'本页')+' capacity 冲突：作者声明与主 panel 的 capacity 不一致');
    derived.capacity=copy(primaryPanel.capacity);
  }else if(authored.capacity!==undefined)derived.capacity=copy(authored.capacity);
  if(primaryPanel.semanticType!==undefined)derived.semanticType=primaryPanel.semanticType;
  if(primaryPanel.waterfall!==undefined)derived.__panelWaterfall=copy(primaryPanel.waterfall);
  return derived;
}
function sortKeys(value){return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value;}

/* —— 期望图示清单：装配与探针共用，逐 panel 核实际形式/数据/容量/来源/打印存在性 —— */
function expectedPanels(page){
  const composition=page&&page.composition;
  if(!object(composition))return [];
  return Object.entries(object(composition.panels)?composition.panels:{}).map(([panelId,panel])=>({
    panelId,
    form:formName(panel.form),
    capacity:panel.capacity?copy(panel.capacity):undefined,
    claimRefs:list(panel.claimRefs),
    sourceKeys:list(panel.sourceKeys),
    scaleGroup:panel.scaleGroup,
    waterfall:panel.waterfall?copy(panel.waterfall):undefined,
    data:panel.data!==undefined?copy(panel.data):undefined
  }));
}
/* panel 审计根互不嵌套：元素只归属最近的 panel 根，父节点不能借后代图表凑形式或容量。 */
function ownershipErrors(items){
  const errors=[];
  for(const item of items||[]){
    const ancestors=list(item.ancestorPanelIds);
    if(ancestors.length)errors.push('panel '+item.panelId+' 嵌套于 '+ancestors.join('/')+' 的审计根内；panel 审计根互不嵌套，内容由最近的 panel 根唯一拥有');
    if(list(item.ownedPanels).length)errors.push('panel '+item.panelId+' 声明了多个顶层展品 '+list(item.ownedPanels).join('/')+'；须拆分登记或明确组合语义，不能悄悄漏检');
  }
  return errors;
}
/* 瀑布作用域：新策略逐 panel 体检；旧策略保持页面级 WF-MULTIPLE-AUDIT 冻结行为。 */
function waterfallScopes(slide,page){
  const composition=compositionOf(slide)||page&&page.composition;
  if(!object(composition))return [{scope:'page',panelId:null,waterfall:page&&page.waterfall}];
  const scopes=[];
  for(const [panelId,panel] of Object.entries(object(composition.panels)?composition.panels:{})){
    if(panel&&panel.waterfall!==undefined)scopes.push({scope:'panel',panelId,waterfall:copy(panel.waterfall)});
  }
  return scopes;
}
module.exports={POLICY,COMPOSITION_VERSION,RELATION_KINDS,SCALE_MODES,SCALE_CHECKS,
  compositionOf,hasComposition,isCompositionTask,policyErrors,validate,
  claimRefs,metricRefs,relationRefs,panelIds,deriveVisual,expectedPanels,ownershipErrors,waterfallScopes};
